// ══════════════════════════════════════════════════════════
// sw_rkw_meldungen.js – Service Worker v26
// v26: Bibliotheken von cdn.jsdelivr.net (Supabase, Excel, JSZip) und die Google-Schriften
//      werden jetzt vom Service Worker zwischengespeichert: online immer frisch vom Netz
//      (Network-first), offline aus dem SW-Cache. Bisher kamen sie offline nur aus dem normalen
//      Browser-Cache, den iOS bei Speichermangel leeren kann — dann wäre die App offline beim
//      Laden hängen geblieben. Supabase-Daten/Anmeldung (supabase.co) werden weiterhin NIE gecacht.
//      Zusätzlich werden die Bibliotheken schon beim Installieren vorab geladen.
// v25: Neuer Cache-Name erzwingt vollständige Cache-Invalidierung (iOS hing an alter Version).
// v24: Cache-Buster-Parameter an Netzwerkanfragen für HTML-Dateien (iOS-PWA-Workaround).
// v23: {cache:'no-store'} gegen iOS HTTP-Cache.
// v22: Network-first für alle .html-Dateien.
// ══════════════════════════════════════════════════════════
const CACHE = 'rkw-v26';
const FILES = ['./', './manifest.json', './icon-192.png'];

// Daten & Anmeldung: niemals cachen
const NIEMALS_CACHEN = ['supabase.co'];
// Bibliotheken & Schriften: online frisch, offline aus dem Cache
const BIBLIOTHEKEN = ['cdn.jsdelivr.net', 'cdn.sheetjs.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const BIBLIOTHEKEN_VORAB = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
];

// Opake Antworten (Skripte ohne CORS-Attribut) haben status 0 — trotzdem gültig und cachebar
const cachebar = resp => resp && (resp.ok || resp.type === 'opaque');

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(async c => {
      await c.addAll(FILES);
      // Bibliotheken einzeln vorab laden — ein Fehlschlag darf die Installation nicht abbrechen
      await Promise.all(BIBLIOTHEKEN_VORAB.map(url =>
        fetch(url, { mode: 'no-cors' })
          .then(resp => { if(cachebar(resp)) return c.put(url, resp); })
          .catch(() => {})
      ));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(k => { if(k !== CACHE) { console.log('[SW v26] Lösche alten Cache:', k); return caches.delete(k); } })
    )).then(() => {
      console.log('[SW v26] Aktiv');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  if(NIEMALS_CACHEN.some(d => url.hostname.includes(d))) return;

  // Bibliotheken & Schriften: Network-first, offline aus dem Cache
  if(BIBLIOTHEKEN.some(d => url.hostname.includes(d))) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          if(cachebar(resp)) { const clone = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)); }
          return resp;
        })
        .catch(() => caches.match(e.request, { ignoreVary: true }))
    );
    return;
  }

  // HTML: Network-first mit Cache-Buster + no-store, offline aus dem Cache
  if(url.pathname === '/' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')) {
    const bustUrl = url.href + (url.search ? '&' : '?') + '_swbust=' + Date.now();
    e.respondWith(
      fetch(bustUrl, { cache: 'no-store' })
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return resp;
        })
        .catch(() => caches.match(e.request, { ignoreSearch: true }))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

self.addEventListener('message', e => {
  if(e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('push', e => {
  if('setAppBadge' in navigator) navigator.setAppBadge(1).catch(() => {});
  let title = '📋 Neue Meldung', body = 'Tippe zum Öffnen', tag = 'rkw-meldung';
  if(e.data) {
    try { const d = e.data.json(); title = d.title || title; body = d.body || body; tag = d.tag || tag; }
    catch { body = e.data.text() || body; }
  }
  e.waitUntil(self.registration.showNotification(title, {
    body, icon: './icon-192.png', badge: './icon-192.png', tag,
    renotify: true, vibrate: [200, 100, 200], data: { url: self.registration.scope },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || self.registration.scope;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for(const client of list) {
        if(client.url.startsWith(self.registration.scope) && 'focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});

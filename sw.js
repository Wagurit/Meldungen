// ══════════════════════════════════════════════════════════
// sw_rkw_meldungen.js — RKW Meldungen & Angebote PWA
// ══════════════════════════════════════════════════════════
// Strategie:
//   • Navigation / HTML  → NETWORK-FIRST: neue index.html kommt automatisch an,
//     KEIN SW-Bump mehr nötig für index.html-Änderungen. Offline → Cache-Fallback.
//     (bewusst OHNE cache:'no-store' - siehe Hinweis unten)
//   • Übrige GET-Requests → STALE-WHILE-REVALIDATE (schnell aus Cache, Update im Hintergrund).
//   • Supabase-API-Calls (POST/PATCH/DELETE/WSS) werden NIEMALS abgefangen.
//
// v23-HINWEIS: cache:'no-store' beim Navigations-Fetch wieder entfernt.
// War als Extra-Absicherung gedacht, hat aber in Safari/WebKit zu Problemen
// beim Laden neuer Versionen geführt (dokumentierte WebKit-Eigenheiten rund
// um Fetch-Cache-Optionen in Service-Worker-Kontexten). Lagerchemie läuft seit
// Version 28 nachweislich gut mit dem einfachen fetch(req) - jetzt angeglichen.
//
// WICHTIG: In der App muss die Registrierung updateViaCache:'none' setzen
// (macht index.html bereits), damit auch der SW selbst frisch geprüft wird.
//
// Bei jeder inhaltlichen SW-Änderung NUR die VERSION hochzählen.
// activate löscht dann automatisch alle alten Caches (auch die des Vorgänger-SW).
// ══════════════════════════════════════════════════════════
const VERSION  = 'v23';
const CACHE    = 'rkw-meldungen-' + VERSION;
const PRECACHE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  // Baseline für Erst-Offline. Kein skipWaiting: das Update-Banner der App steuert den Wechsel.
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .catch(() => {}) // Fehler beim Precache sind nicht kritisch
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Alle alten Caches löschen (andere VERSION oder anderer Cache-Name)
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Banner-Button (applyUpdate) schickt SKIP_WAITING → wartenden SW aktivieren.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  // Legacy-Format (ältere SW-Versionen schickten reinen String)
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ── Push Notifications ──
// Wird von der Supabase Edge Function push-notify ausgelöst
self.addEventListener('push', event => {
  let data = { title: 'Neue Meldung', body: 'Es gibt eine neue Meldung.' };
  if (event.data) {
    try { data = event.data.json(); } catch (e) { data.body = event.data.text(); }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'RKW Meldungen', {
      body:    data.body  || '',
      icon:    './icon-192.png',
      badge:   './icon-192.png',
      tag:     'rkw-meldung',           // gleicher Tag = Benachrichtigungen stapeln sich nicht
      renotify: true,
      data:    data.url || './'
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Schon offenes Fenster fokussieren statt neues öffnen
      for (const client of list) {
        if (client.url.includes('wagurit.github.io/Meldungen') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ── Hilfsfunktion: ist der Request eine HTML-Navigation? ──
function istNavigation(req) {
  return req.mode === 'navigate' ||
    (req.method === 'GET' && (req.headers.get('accept') || '').includes('text/html'));
}

// ── Fetch-Handler ──
self.addEventListener('fetch', event => {
  const req = event.request;

  // POST/PATCH/DELETE/alles was kein GET ist → nie abfangen (Supabase, Push-Sub, etc.)
  if (req.method !== 'GET') return;

  // Supabase-API und externe CDN-Requests nie cachen
  const url = req.url;
  if (
    url.includes('supabase.co') ||
    url.includes('cdn.jsdelivr.net') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com')
  ) return;

  // ── HTML / Navigation: NETWORK-FIRST ──
  if (istNavigation(req)) {
    event.respondWith((async () => {
      try {
        const netRes = await fetch(req);
        const cache  = await caches.open(CACHE);
        cache.put('./index.html', netRes.clone()); // Offline-Fallback frisch halten
        return netRes;
      } catch (e) {
        // Nur wenn wirklich offline → aus Cache
        return (await caches.match(req)) ||
               (await caches.match('./index.html')) ||
               (await caches.match('./')) ||
               Response.error();
      }
    })());
    return;
  }

  // ── Sonstige GETs (Icons, Manifest, …): STALE-WHILE-REVALIDATE ──
  event.respondWith((async () => {
    const cache  = await caches.open(CACHE);
    const cached = await cache.match(req);
    const netFetch = fetch(req).then(res => {
      if (res && res.status === 200) cache.put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || netFetch;
  })());
});

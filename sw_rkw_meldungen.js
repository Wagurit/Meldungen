// ══════════════════════════════════════════════════════════
// sw_rkw_meldungen.js – Service Worker v25
// v25: Neuer Cache-Name 'rkw-v25' erzwingt vollständige Cache-Invalidierung auf allen
//      Geräten — insbesondere iOS-PWAs, die hartnäckig an 'rkw-v24' mit einer alten
//      index.html festgehalten haben (sichtbar als Versionsnummer v99 statt 2.x).
//      Der alte Cache 'rkw-v24' wird beim Aktivieren automatisch gelöscht.
// v24: Cache-Buster-Parameter an Netzwerkanfragen für HTML-Dateien (iOS-PWA-Workaround).
// v23: {cache:'no-store'} als erste Absicherung gegen iOS HTTP-Cache.
// v22: Network-first für alle .html-Dateien.
// v21: Supabase/CDN nie cachen.
// ══════════════════════════════════════════════════════════
const CACHE = 'rkw-v25';
const FILES = ['./', './manifest.json', './icon-192.png'];

const NIEMALS_CACHEN = ['supabase.co', 'cdn.jsdelivr.net', 'cdn.sheetjs.com'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      console.log('[SW v25] Gefundene Caches:', keys);
      return Promise.all(
        keys.map(k => {
          if(k !== CACHE) {
            console.log('[SW v25] Lösche alten Cache:', k);
            return caches.delete(k);
          }
        })
      );
    }).then(() => {
      console.log('[SW v25] Aktiv – alle alten Caches gelöscht');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  if(NIEMALS_CACHEN.some(domain => url.hostname.includes(domain))) {
    return;
  }

  if(url.pathname === '/' || url.pathname.endsWith('.html')) {
    // Cache-Buster + no-store: beide Absicherungen zusammen gegen iOS-Cache-Eigensinn
    const bustUrl = url.href + (url.search ? '&' : '?') + '_swbust=' + Date.now();
    e.respondWith(
      fetch(bustUrl, { cache: 'no-store' })
        .then(resp => {
          // Unter Original-URL (ohne Buster) cachen als Offline-Fallback
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return resp;
        })
        .catch(() => caches.match(e.request))
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
  if('setAppBadge' in navigator) {
    navigator.setAppBadge(1).catch(() => {});
  }
  let title = '📋 Neue Meldung';
  let body = 'Tippe zum Öffnen';
  let tag = 'rkw-meldung';
  if(e.data) {
    try {
      const data = e.data.json();
      title = data.title || title;
      body = data.body || body;
      tag = data.tag || tag;
    } catch {
      body = e.data.text() || body;
    }
  }
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag,
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: self.registration.scope },
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || self.registration.scope;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for(const client of list) {
        if(client.url.startsWith(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

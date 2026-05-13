// ══════════════════════════════════════════════════════════
// sw_rkw_meldungen.js – Service Worker v20
// Löscht ALLE alten Caches beim Aktivieren aggressiv
// ══════════════════════════════════════════════════════════

const CACHE = 'rkw-v20';
const FILES = ['./', './index.html', './manifest.json', './icon-192.png'];

// ── INSTALL – sofort übernehmen ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES))
  );
  // Sofort aktivieren ohne auf alte Clients zu warten
  self.skipWaiting();
});

// ── ACTIVATE – ALLE alten Caches aggressiv löschen ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      console.log('[SW v20] Gefundene Caches:', keys);
      return Promise.all(
        keys.map(k => {
          // Jeden Cache löschen der nicht der aktuelle ist
          if(k !== CACHE) {
            console.log('[SW v20] Lösche alten Cache:', k);
            return caches.delete(k);
          }
        })
      );
    }).then(() => {
      console.log('[SW v20] Aktiv – alle alten Caches gelöscht');
      // Alle offenen Clients sofort übernehmen
      return self.clients.claim();
    })
  );
});

// ── FETCH – Network-first für HTML, Cache-first für Assets ──
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  
  const url = new URL(e.request.url);
  
  // Für index.html immer Network-first damit neue Version sofort kommt
  if(url.pathname === '/' || url.pathname.endsWith('index.html')) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          // Neue Version im Cache speichern
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return resp;
        })
        .catch(() => caches.match(e.request)) // Fallback auf Cache wenn offline
    );
    return;
  }
  
  // Für alles andere: Cache-first
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

// ── SKIP WAITING (vom Update-Banner) ──
self.addEventListener('message', e => {
  if(e.data === 'SKIP_WAITING') self.skipWaiting();
});

// ── PUSH – Notification anzeigen ──
self.addEventListener('push', e => {
  if('setAppBadge' in navigator) {
    navigator.setAppBadge(1).catch(() => {});
  }

  let title = '📋 Neue Meldung';
  let body  = 'Tippe zum Öffnen';
  let tag   = 'rkw-meldung';

  if(e.data) {
    try {
      const data = e.data.json();
      title = data.title || title;
      body  = data.body  || body;
      tag   = data.tag   || tag;
    } catch {
      body = e.data.text() || body;
    }
  }

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:     './icon-192.png',
      badge:    './icon-192.png',
      tag,
      renotify: true,
      vibrate:  [200, 100, 200],
      data:     { url: self.registration.scope },
    })
  );
});

// ── NOTIFICATIONCLICK ──
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

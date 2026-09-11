// ══════════════════════════════════════════════════════════
// sw_rkw_meldungen.js – Service Worker v23
// v23-FIX (iOS): Safari cacht auf einer tieferen Ebene als der
//          Service-Worker-eigene Cache — dem normalen HTTP-Cache des
//          Browsers. Ein einfaches fetch() kann dort trotzdem eine
//          alte, zwischengespeicherte Antwort zurückbekommen, OHNE
//          überhaupt neu nachzufragen. Das war vermutlich der Grund,
//          warum PC schon aktuell war, iOS aber hinterherhing.
//          Fix: {cache:'no-store'} erzwingt bei JEDER Netzwerkanfrage
//          fürs HTML, dass iOS den HTTP-eigenen Cache komplett
//          umgeht und wirklich frisch vom Server holt.
// v22: Network-first greift bei jeder .html-Datei (nicht nur "index.html").
// v21: Supabase- und CDN-Requests laufen immer live vom Netz (nie gecacht).
// Rest unverändert zu v20 (inkl. Push-Support).
// ══════════════════════════════════════════════════════════
const CACHE = 'rkw-v23';
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
      console.log('[SW v23] Gefundene Caches:', keys);
      return Promise.all(
        keys.map(k => {
          if(k !== CACHE) {
            console.log('[SW v23] Lösche alten Cache:', k);
            return caches.delete(k);
          }
        })
      );
    }).then(() => {
      console.log('[SW v23] Aktiv – alle alten Caches gelöscht');
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

  // Network-first für JEDE .html-Datei + Root — mit no-store gegen iOS' eigenen HTTP-Cache
  if(url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return resp;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Für alles andere (CSS/JS/Icons): Cache-first
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

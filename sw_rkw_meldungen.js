// ══════════════════════════════════════════════════════════
// sw_rkw_meldungen.js – Service Worker v24
// v24-FIX (iOS Homescreen-PWA): Bei als Homescreen-Icon installierten PWAs ist iOS/WebKit
//          bekanntermaßen unzuverlässig darin, {cache:'no-store'} bei fetch() wirklich zu
//          respektieren — in einem normalen Safari-Tab klappt es meist, im "installierten"
//          Modus (eigener WKWebView-Prozess) kann iOS trotzdem eine alte Antwort ausliefern.
//          Zusätzlicher Fix: An die Netzwerk-Anfrage selbst wird ein Cache-Buster-Parameter
//          (?_swbust=Zeitstempel) angehängt. Das macht jede Anfrage zu einer für iOS komplett
//          NEUEN, nie zuvor gesehenen URL — die kann unmöglich in irgendeinem Cache stecken,
//          unabhängig davon, ob {cache:'no-store'} beachtet wird oder nicht.
// v23: {cache:'no-store'} als erste Absicherung (bleibt zusätzlich bestehen).
// v22: Network-first greift bei jeder .html-Datei (nicht nur "index.html").
// v21: Supabase- und CDN-Requests laufen immer live vom Netz (nie gecacht).
// Rest unverändert (inkl. Push-Support).
// ══════════════════════════════════════════════════════════
const CACHE = 'rkw-v24';
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
      console.log('[SW v24] Gefundene Caches:', keys);
      return Promise.all(
        keys.map(k => {
          if(k !== CACHE) {
            console.log('[SW v24] Lösche alten Cache:', k);
            return caches.delete(k);
          }
        })
      );
    }).then(() => {
      console.log('[SW v24] Aktiv – alle alten Caches gelöscht');
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
    // Cache-Buster an die tatsächliche Netzwerk-Anfrage anhängen (v24) — macht jede Anfrage
    // zu einer nie zuvor gesehenen URL, zusätzlich zu {cache:'no-store'}
    const bustUrl = url.href + (url.search ? '&' : '?') + '_swbust=' + Date.now();
    e.respondWith(
      fetch(bustUrl, { cache: 'no-store' })
        .then(resp => {
          // Im Cache unter der ORIGINAL-URL (ohne Buster) ablegen, damit ein Offline-Fallback
          // (catch unten) die Anfrage später wiederfindet
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

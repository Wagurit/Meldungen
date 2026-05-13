// ══════════════════════════════════════════════════════════
// sw_rkw_meldungen.js – Service Worker v2
// Push-Empfang mit Payload-Auswertung (Firma + Text)
// ══════════════════════════════════════════════════════════

const CACHE = 'rkw-v18';
const FILES = ['./', './index.html', './manifest.json', './icon-192.png'];

// ── INSTALL ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES))
  );
  self.skipWaiting();
});

// ── ACTIVATE ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── FETCH (Cache-First für App-Shell) ──
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

// ── SKIP WAITING ──
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

// ══════════════════════════════════════════════════════════
// PUSH – Payload auslesen und Notification anzeigen
// ══════════════════════════════════════════════════════════
self.addEventListener('push', e => {
  // Badge setzen (genaue Zahl setzt updB() wenn App geöffnet wird)
  if ('setAppBadge' in navigator) {
    navigator.setAppBadge(1).catch(() => {});
  }

  // Payload aus web-push lesen (JSON)
  let title = '📋 Neue Meldung';
  let body  = 'Tippe zum Öffnen';
  let tag   = 'rkw-meldung';

  if (e.data) {
    try {
      const data = e.data.json();
      title = data.title || title;
      body  = data.body  || body;
      tag   = data.tag   || tag;
    } catch {
      // Fallback falls kein JSON
      body = e.data.text() || body;
    }
  }

  const options = {
    body,
    icon:      './icon-192.png',
    badge:     './icon-192.png',
    tag,
    renotify:  true,
    vibrate:   [200, 100, 200],
    data:      { url: self.registration.scope },
  };

  e.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ══════════════════════════════════════════════════════════
// NOTIFICATIONCLICK – App öffnen oder fokussieren
// ══════════════════════════════════════════════════════════
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || self.registration.scope;

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

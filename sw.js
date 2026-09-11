// ═══════════════════════════════════════════════════════════════════
// sw_rkw_meldungen.js — Service Worker für RKW Meldungen & Angebote (BTB)
//
// Folgt demselben Standard wie bei Familienbank (Zinslernapp) und Lagerchemie:
// - CACHE_NAME versioniert als 'meldungen-vXX', bei größeren SW-Änderungen hochzählen
// - install/activate/fetch-Handler
// - Network-First mit Cache-Fallback fürs App-Shell (HTML/CSS/JS)
// - Supabase- und CDN-Requests werden NIE gecacht — immer live vom Netz,
//   sonst gäbe es veraltete Daten oder veraltete Bibliotheksversionen
// - Update-Banner mit "Jetzt aktualisieren" im HTML löst SKIP_WAITING per
//   postMessage aus, der SW übernimmt erst dann die Kontrolle
// ═══════════════════════════════════════════════════════════════════

const CACHE_NAME = 'meldungen-v1';

// Domains, die NIE über den Service-Worker-Cache laufen — immer live vom Netz.
// Supabase: sonst könnten veraltete Daten/Auth-Antworten ausgeliefert werden.
// CDNs: sonst könnte eine alte Bibliotheksversion hängen bleiben.
const NIEMALS_CACHEN = [
  'supabase.co',
  'cdn.jsdelivr.net',
  'cdn.sheetjs.com'
];

self.addEventListener('install', () => {
  // Bewusst kein self.skipWaiting() hier — die App zeigt bei verfügbarem
  // Update ein Banner an, erst ein Klick darauf löst SKIP_WAITING unten aus
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Nur GET behandeln — POST/PUT/PATCH (z.B. Supabase-Schreibzugriffe) unangetastet lassen
  if (req.method !== 'GET') return;

  // Supabase- und CDN-Requests komplett am Service Worker vorbeilassen
  const url = req.url;
  if (NIEMALS_CACHEN.some((domain) => url.includes(domain))) return;

  // Network-First mit Cache-Fallback für alles andere (App-Shell: HTML/CSS/JS/Icons)
  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(() => caches.match(req))
  );
});

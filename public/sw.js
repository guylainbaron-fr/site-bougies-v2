const CACHE_NAME = 'jf-aniuta-v2026'; // Nouvelle version
const ASSETS = [
  '/',           // Accueil
  '/style.css',  // Ton CSS principal
  '/manifest.json'
  // On retire /script.js car il est vide/supprimé
];

// Installation
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // On utilise .addAll mais on peut aussi être plus prudent avec des fichiers individuels
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activation et nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Stratégie : Réseau d'abord, secours sur le cache sinon
self.addEventListener('fetch', (event) => {
  // On n'intercepte pas les requêtes Brevo ou externes
  if (!event.request.url.startsWith(self.location.origin)) {
    return; 
  }

  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
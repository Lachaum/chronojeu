/*
 * ChronoJeu — service worker
 * ---------------------------------------------------------------------------
 * Met l'application entière en cache pour qu'elle fonctionne sans connexion.
 * Une fois la page visitée une première fois, ChronoJeu marche en avion, à la
 * cave, ou chez un ami sans wifi.
 *
 * Après avoir modifié un fichier, incrémentez CACHE_VERSION : c'est ce qui
 * force les téléphones à récupérer la nouvelle version.
 * ---------------------------------------------------------------------------
 */
'use strict';

var CACHE_VERSION = 'chronojeu-v1';

var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/engine.js',
  './js/audio.js',
  './js/storage.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE_VERSION ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  // Navigation : on sert la page d'accueil depuis le cache si le réseau manque.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  // Le reste : cache d'abord, puis rafraîchissement discret en arrière-plan.
  event.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});

const CACHE_NAME = 'plannke-shell-v40';
const LOCAL_ASSETS = [
  './',
  './index.html',
  './src/styles/styles.css',
  './vendor/bootstrap.min.css',
  './vendor/bootstrap.bundle.min.js',
  './vendor/phosphor-icons.css',
  './vendor/xlsx.full.min.js',
  './vendor/chart.umd.min.js',
  './vendor/echarts.min.js',
  './src/core/storage.js',
  './src/app/app-ui.js',
  './src/app/app-runtime.js',
  './src/app/app-shell.js',
  './src/app/app-boot.js',
  './src/app/app-navigation.js',
  './src/app/app-transactions.js',
  './src/app/app-movements.js',
  './src/app/app-dashboard.js',
  './src/app/app-projection.js',
  './src/app/app-entities.js',
  './src/app/app-settings.js',
  './src/app/app-planning.js',
  './src/app/app-data.js',
  './src/app/storage-adapter.js',
  './src/app/storage-ui.js',
  './src/styles/storage-ui.css',
  './src/app/safe-renderers.js',
  './src/app/app-presentation.js',
  './src/styles/app-presentation.css',
  './src/app/app-presentation-desktop.js',
  './src/styles/app-presentation-desktop.css',
  './src/styles/app-presentation-dashboard.css',
  './src/styles/app-presentation-movements.css',
  './src/styles/app-presentation-planning.css',
  './src/styles/app-presentation-accounts.css',
  './src/styles/app-presentation-forms.css',
  './src/styles/app-presentation-states.css',
  './src/core/product-core.js',
  './src/app/insights.js',
  './src/styles/product.css',
  './manifest.webmanifest',
  './assets/icons/plannke-icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(LOCAL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});

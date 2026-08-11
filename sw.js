const CACHE_NAME = 'plannke-shell-v37';
const LOCAL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './vendor/bootstrap.min.css',
  './vendor/bootstrap.bundle.min.js',
  './vendor/phosphor-icons.css',
  './vendor/xlsx.full.min.js',
  './vendor/chart.umd.min.js',
  './vendor/echarts.min.js',
  './storage.js',
  './app-ui.js',
  './app-runtime.js',
  './app-shell.js',
  './app-boot.js',
  './app-navigation.js',
  './app-transactions.js',
  './app-movements.js',
  './app-dashboard.js',
  './app-projection.js',
  './app-entities.js',
  './app-settings.js',
  './app-planning.js',
  './app-data.js',
  './storage-adapter.js',
  './storage-ui.js',
  './storage-ui.css',
  './safe-renderers.js',
  './app-presentation.js',
  './app-presentation.css',
  './app-presentation-desktop.js',
  './app-presentation-desktop.css',
  './app-presentation-dashboard.css',
  './app-presentation-movements.css',
  './app-presentation-planning.css',
  './app-presentation-accounts.css',
  './app-presentation-forms.css',
  './app-presentation-states.css',
  './product-core.js',
  './product.js',
  './insights.js',
  './product.css',
  './manifest.webmanifest',
  './plannke-icon.svg'
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

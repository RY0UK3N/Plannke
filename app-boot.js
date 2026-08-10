/* Plannke canonical application boot and persistence readiness. */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.PlannkeBoot = api;

    if (typeof document !== 'undefined') {
        const start = () => api.startApplication();
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
        else start();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    function waitForStorageReady(api) {
        if (!api) return Promise.resolve(null);
        return Promise.resolve(api.ready).then(() => api);
    }

    function hasCanonicalStyles() {
        if (typeof document === 'undefined') return false;
        return !!document.querySelector('link[href="product.css"], link[href$="/product.css"]');
    }

    function loadStorageAdapter() {
        if (!root || typeof document === 'undefined') return Promise.resolve(root?.PlannkeStorage || null);
        if (root.PlannkeStorage) return waitForStorageReady(root.PlannkeStorage);

        const existing = document.querySelector('script[data-plannke-storage-adapter]');
        if (existing) {
            return new Promise((resolve, reject) => {
                if (root.PlannkeStorage) {
                    waitForStorageReady(root.PlannkeStorage).then(resolve, reject);
                    return;
                }
                existing.addEventListener('load', () => waitForStorageReady(root.PlannkeStorage).then(resolve, reject), { once: true });
                existing.addEventListener('error', () => reject(new Error('Falha ao carregar StorageAdapter.')), { once: true });
            });
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'storage-adapter.js';
            script.async = false;
            script.dataset.plannkeStorageAdapter = 'true';
            script.addEventListener('load', () => waitForStorageReady(root.PlannkeStorage).then(resolve, reject), { once: true });
            script.addEventListener('error', () => reject(new Error('Falha ao carregar StorageAdapter.')), { once: true });
            document.head.appendChild(script);
        });
    }

    function loadStorageUiAssets() {
        if (typeof document === 'undefined') return;
        if (!hasCanonicalStyles() && !document.querySelector('link[data-plannke-storage-ui]')) {
            const stylesheet = document.createElement('link');
            stylesheet.rel = 'stylesheet';
            stylesheet.href = 'storage-ui.css';
            stylesheet.dataset.plannkeStorageUi = 'true';
            document.head.appendChild(stylesheet);
        }
        if (!document.querySelector('script[data-plannke-storage-ui]')) {
            const script = document.createElement('script');
            script.src = 'storage-ui.js';
            script.async = false;
            script.dataset.plannkeStorageUi = 'true';
            document.body.appendChild(script);
        }
    }

    const applicationInit = root?.initApp;
    const storageReady = loadStorageAdapter();
    storageReady.then(loadStorageUiAssets).catch(error => {
        console.error('Interface de persistência indisponível.', error);
    });

    let applicationStarted = false;
    function startApplication() {
        if (applicationStarted || typeof applicationInit !== 'function') return Promise.resolve();
        applicationStarted = true;
        return storageReady
            .catch(error => {
                console.error('StorageAdapter indisponível; iniciando com o cache em memória.', error);
                return null;
            })
            .then(() => applicationInit.call(root));
    }

    return {
        storageReady,
        waitForStorageReady,
        loadStorageAdapter,
        loadStorageUiAssets,
        startApplication
    };
});

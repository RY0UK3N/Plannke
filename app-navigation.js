/* Plannke canonical desktop navigation and keyboard shortcuts. */
(function (root) {
    'use strict';

    let navigationBound = false;
    let shortcutsBound = false;

    function loadDataActions() {
        if (root.PlannkeDataActions) return Promise.resolve(root.PlannkeDataActions);
        if (typeof document === 'undefined') return Promise.resolve(null);

        const existing = document.querySelector('script[data-plannke-data-actions]');
        if (existing) {
            return new Promise((resolve, reject) => {
                if (root.PlannkeDataActions) return resolve(root.PlannkeDataActions);
                existing.addEventListener('load', () => resolve(root.PlannkeDataActions || null), { once: true });
                existing.addEventListener('error', () => reject(new Error('Falha ao carregar ações de dados.')), { once: true });
            });
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'app-data.js';
            script.async = false;
            script.dataset.plannkeDataActions = 'true';
            script.addEventListener('load', () => resolve(root.PlannkeDataActions || null), { once: true });
            script.addEventListener('error', () => reject(new Error('Falha ao carregar ações de dados.')), { once: true });
            document.body.appendChild(script);
        });
    }

    const dataActionsReady = loadDataActions();
    root.PlannkeDataReady = dataActionsReady;

    // Retire the old app.js actions immediately. Even if the canonical module is
    // still downloading, a very early click waits for it instead of reaching the
    // old Memory Card/localStorage implementation.
    ['confirmClearData', 'exportToExcel'].forEach(action => {
        root[action] = (...args) => dataActionsReady
            .then(api => api?.[action]?.(...args))
            .catch(error => console.error(`Falha ao executar ${action}:`, error));
    });

    function setActiveNavigation(target) {
        document.querySelectorAll('.revamp-nav-item[data-target]').forEach(button => {
            const active = button.dataset.target === target;
            button.classList.toggle('active', active);
            button.setAttribute('aria-current', active ? 'page' : 'false');
        });
    }

    function setupNavigation() {
        if (navigationBound) return;
        navigationBound = true;
        document.addEventListener('click', event => {
            const item = event.target.closest?.('.revamp-nav-item[data-target]');
            if (!item) return;
            event.preventDefault();
            navigateTo(item.dataset.target);
        });
    }

    function navigateTo(target) {
        const view = document.getElementById(`${target}-view`);
        if (!view) return;

        const leaving = document.querySelector('.content-view:not(.hidden)')?.id?.replace('-view', '');
        if (leaving === 'movimentacao' && target !== 'movimentacao' && typeof _fluxoChart !== 'undefined' && _fluxoChart) {
            _fluxoChart.dispose();
            _fluxoChart = null;
        }

        document.querySelectorAll('.content-view').forEach(candidate => {
            candidate.classList.toggle('hidden', candidate !== view);
        });
        setActiveNavigation(target);

        if (typeof root.renderAll === 'function') root.renderAll();
        if (target === 'projecao' && typeof root.renderProjection === 'function' && typeof root.getData === 'function') {
            root.renderProjection(root.getData());
        }
    }

    function setupKeyboardShortcuts() {
        if (shortcutsBound) return;
        shortcutsBound = true;
        document.addEventListener('keydown', event => {
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

            const modalOpen = document.querySelector('.modal.show');
            const offcanvasOpen = document.querySelector('.offcanvas.show');

            if (event.key === 'Escape') {
                if (modalOpen) root.bootstrap?.Modal?.getInstance(modalOpen)?.hide();
                else if (offcanvasOpen) root.bootstrap?.Offcanvas?.getInstance(offcanvasOpen)?.hide();
                return;
            }
            if (event.key === '?' && !modalOpen && !offcanvasOpen) {
                const shortcuts = document.getElementById('shortcutsModal');
                if (shortcuts) root.bootstrap?.Modal?.getOrCreateInstance(shortcuts)?.show();
                return;
            }
            if (modalOpen || offcanvasOpen) return;

            const key = event.key.toLowerCase();
            if (key === 'n') {
                event.preventDefault();
                root.openTxModal?.(null);
            } else if (key === 'd') {
                event.preventDefault();
                navigateTo('dashboard');
            } else if (key === 'l') {
                event.preventDefault();
                navigateTo('movimentacao');
            } else if (key === 'c') {
                event.preventDefault();
                navigateTo('accounts');
            } else if (key === 'b') {
                event.preventDefault();
                navigateTo('backup');
            } else if (event.key === ',') {
                event.preventDefault();
                root.openSettingsPanel?.();
            } else if (event.key === '/') {
                event.preventDefault();
                navigateTo('movimentacao');
                window.setTimeout(() => document.getElementById('tx-search')?.focus(), 150);
            }
        });
    }

    root.setupNavigation = setupNavigation;
    root.setupKeyboardShortcuts = setupKeyboardShortcuts;
    root._navigateTo = navigateTo;
    root.PlannkeNavigation = {
        setupNavigation,
        setupKeyboardShortcuts,
        navigateTo,
        setActiveNavigation,
        loadDataActions
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);

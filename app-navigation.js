/* Plannke canonical desktop navigation and keyboard shortcuts. */
(function (root) {
    'use strict';

    let navigationBound = false;
    let shortcutsBound = false;

    function loadTransactionActions() {
        if (root.PlannkeTransactions) return Promise.resolve(root.PlannkeTransactions);
        if (typeof document === 'undefined') return Promise.resolve(null);

        const existing = document.querySelector('script[data-plannke-transactions]');
        if (existing) {
            return new Promise((resolve, reject) => {
                if (root.PlannkeTransactions) return resolve(root.PlannkeTransactions);
                existing.addEventListener('load', () => resolve(root.PlannkeTransactions || null), { once: true });
                existing.addEventListener('error', () => reject(new Error('Falha ao carregar ações de movimentações.')), { once: true });
            });
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'app-transactions.js';
            script.async = false;
            script.dataset.plannkeTransactions = 'true';
            script.addEventListener('load', () => resolve(root.PlannkeTransactions || null), { once: true });
            script.addEventListener('error', () => reject(new Error('Falha ao carregar ações de movimentações.')), { once: true });
            document.body.appendChild(script);
        });
    }

    function loadDashboardRuntime() {
        if (root.PlannkeDashboard) return Promise.resolve(root.PlannkeDashboard);
        if (typeof document === 'undefined') return Promise.resolve(null);

        const existing = document.querySelector('script[data-plannke-dashboard]');
        if (existing) {
            return new Promise((resolve, reject) => {
                if (root.PlannkeDashboard) return resolve(root.PlannkeDashboard);
                existing.addEventListener('load', () => resolve(root.PlannkeDashboard || null), { once: true });
                existing.addEventListener('error', () => reject(new Error('Falha ao carregar runtime do dashboard.')), { once: true });
            });
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'app-dashboard.js';
            script.async = false;
            script.dataset.plannkeDashboard = 'true';
            script.addEventListener('load', () => resolve(root.PlannkeDashboard || null), { once: true });
            script.addEventListener('error', () => reject(new Error('Falha ao carregar runtime do dashboard.')), { once: true });
            document.body.appendChild(script);
        });
    }

    function waitForCanonicalRenderers() {
        if (root.PlannkeSafeRenderers) return Promise.resolve(root.PlannkeSafeRenderers);
        if (typeof document === 'undefined') return Promise.resolve(null);

        return new Promise((resolve, reject) => {
            const verify = () => {
                if (root.PlannkeSafeRenderers) resolve(root.PlannkeSafeRenderers);
                else reject(new Error('Renderizadores canônicos não inicializaram.'));
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', verify, { once: true });
            } else {
                Promise.resolve().then(verify);
            }
        });
    }

    const transactionsReady = loadTransactionActions();
    const dashboardReady = loadDashboardRuntime();
    const renderersReady = waitForCanonicalRenderers();
    root.PlannkeTransactionsReady = transactionsReady;
    root.PlannkeDashboardReady = dashboardReady;
    root.PlannkeRenderersReady = renderersReady;

    const transactionActions = [
        'openTxModal',
        'toggleInstallmentField',
        'updateInstallmentHelper',
        'dupTx',
        'edTx',
        'delTx'
    ];

    transactionActions.forEach(action => {
        root[action] = (...args) => transactionsReady
            .then(api => {
                if (!api?.[action]) throw new Error(`Ação canônica de movimentações indisponível: ${action}`);
                return api[action](...args);
            })
            .catch(error => console.error(`Falha ao executar ${action}:`, error));
    });

    const legacyInitApp = root.initApp;
    if (typeof legacyInitApp === 'function') {
        root.initApp = (...args) => Promise.all([transactionsReady, dashboardReady, renderersReady])
            .then(([transactions, dashboard, renderers]) => {
                if (!transactions) throw new Error('Módulo canônico de movimentações não inicializou.');
                if (!dashboard) throw new Error('Runtime canônico do dashboard não inicializou.');
                if (!renderers) throw new Error('Renderizadores canônicos não inicializaram.');
                return legacyInitApp.apply(root, args);
            });
    }

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
        loadTransactionActions,
        loadDashboardRuntime,
        waitForCanonicalRenderers,
        loadDataActions
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);

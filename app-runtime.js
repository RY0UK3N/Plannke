/* Plannke canonical application orchestration. */
(function (root) {
    'use strict';

    function refreshOpenDetail() {
        if (typeof document === 'undefined' || !root._detailContext?.id) return;
        const modalElement = document.getElementById('entityDetailModal');
        if (!modalElement?.classList.contains('show')) return;

        if (root._detailContext.type === 'account') {
            root.viewAccountStatement?.(root._detailContext.id, true);
            return;
        }
        root.viewCardInvoice?.(root._detailContext.id, root._detailContext.period, true);
    }

    function renderAll() {
        const data = root.getData?.();
        if (!data) return;
        root.renderTransactions?.(data);
        root.renderDashboard?.(data);
        root.renderAccounts?.(data);
        root.renderCards?.(data);
        root.renderMovimentacao?.(data);
        root.renderProjection?.(data);
        root._populateMovFilters?.(data);
        root.renderSettingsView?.();
        refreshOpenDetail();
    }

    function initApp() {
        root.setupNavigation?.();
        root.setupModalEvents?.();
        root.setupForms?.();
        root.setupCurrencyInput?.();
        root.setupKeyboardShortcuts?.();
        root.applyTheme?.(root.getSettings?.().theme || 'dark');
        renderAll();
        root._navigateTo?.('dashboard');
    }

    const api = { initApp, renderAll, refreshOpenDetail };
    root.initApp = initApp;
    root.renderAll = renderAll;
    root.PlannkeRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

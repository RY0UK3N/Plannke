(function (root, factory) {
    if (typeof document !== 'undefined' && document.currentScript) {
        document.currentScript.dataset.plannkeProduct = 'static-shell';
    }

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
                existing.addEventListener('load', () => {
                    waitForStorageReady(root.PlannkeStorage).then(resolve, reject);
                }, { once: true });
                existing.addEventListener('error', () => reject(new Error('Falha ao carregar StorageAdapter.')), { once: true });
            });
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'storage-adapter.js';
            script.async = false;
            script.dataset.plannkeStorageAdapter = 'true';
            script.addEventListener('load', () => {
                waitForStorageReady(root.PlannkeStorage).then(resolve, reject);
            }, { once: true });
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

    const api = factory(root);
    api.storageReady = storageReady;
    api.waitForStorageReady = waitForStorageReady;
    api.loadStorageAdapter = loadStorageAdapter;
    api.loadStorageUiAssets = loadStorageUiAssets;
    api.startApplication = startApplication;
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.PlannkeUIBridge = api;

    if (typeof document !== 'undefined') {
        api.primeCanonicalShell();
        api.loadRevampAssets();

        const start = () => {
            api.init();
            startApplication();
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
        else start();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const EVENT_ATTRS = ['onclick', 'onchange', 'oninput'];
    const DATA_ATTRS = {
        onclick: 'data-plannke-onclick',
        onchange: 'data-plannke-onchange',
        oninput: 'data-plannke-oninput'
    };

    const CANONICAL_PAGES = [
        ['dashboard', 'ph-house', 'Início'],
        ['movimentacao', 'ph-arrows-left-right', 'Movimentações'],
        ['projecao', 'ph-target', 'Planejamento'],
        ['accounts', 'ph-wallet', 'Contas e cartões'],
        ['backup', 'ph-database', 'Dados']
    ];

    // Temporary vocabulary for inline handlers that still live inside the
    // remaining workspace markup/renderers. This set shrinks as UI modules
    // move to explicit addEventListener bindings.
    const ALLOWED_CALLS = new Set([
        'openSettingsPanel', 'openBudgetManager', 'openCategoryManager',
        'filterDashboardToTransactions', 'changeMonth', 'setMovViewMode',
        'renderMovimentacao', 'clearTxSearch', 'openModal', 'openTxModal',
        'exportToExcel', 'switchCatTabModal', 'addCustomCategoryModal',
        'toggleTheme', 'switchCatTab', 'addCustomCategory', 'confirmClearData',
        'toggleInstallmentField', 'updateInstallmentHelper',
        'deleteCategoryModal', 'openColorPicker', 'deleteCategory',
        'selectCatColor', 'handleBudgetInput', 'saveBudgetEntry',
        'dupTx', 'edTx', 'delTx', 'edAcc', 'delAcc', 'viewAccountStatement',
        'edCard', 'delCard', 'handlePayFatura', 'viewCardInvoice'
    ]);

    function make(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function icon(name) {
        return make('i', `ph ${name}`);
    }

    function canonicalStylesPresent() {
        if (typeof document === 'undefined') return false;
        return !!document.querySelector('link[href="product.css"], link[href$="/product.css"]');
    }

    function primeCanonicalShell() {
        if (typeof document === 'undefined' || !document.body) return null;

        const existing = document.getElementById('revamp-shell');
        if (existing) {
            document.body.classList.add('plannke-revamp');
            document.body.dataset.revampVersion = '2';
            document.body.dataset.plannkeCanonical = 'desktop';
            return existing;
        }

        const main = document.querySelector('body > main');
        if (!main || !main.parentNode) return null;

        const shell = make('div', 'revamp-shell');
        shell.id = 'revamp-shell';

        const sidebar = make('aside', 'revamp-sidebar');
        sidebar.id = 'revamp-sidebar';

        const brand = make('div', 'revamp-brand');
        const brandCopy = make('div', 'revamp-brand-copy');
        brandCopy.append(make('strong', '', 'Plannke'), make('span', '', 'Central financeira'));
        brand.append(make('div', 'revamp-brand-mark', 'P'), brandCopy);

        const nav = make('nav', 'revamp-nav');
        nav.setAttribute('aria-label', 'Navegação principal');
        CANONICAL_PAGES.forEach(([target, iconName, label], index) => {
            const button = make('button', `revamp-nav-item${index === 0 ? ' active' : ''}`);
            button.type = 'button';
            button.dataset.target = target;
            button.setAttribute('aria-label', label);
            button.setAttribute('aria-current', index === 0 ? 'page' : 'false');
            button.append(icon(iconName), make('span', 'revamp-nav-label', label));
            nav.appendChild(button);
        });

        const spacer = make('div', 'revamp-sidebar-spacer');
        const localStatus = make('div', 'revamp-local-status');
        localStatus.title = 'As alterações são salvas automaticamente neste dispositivo.';
        localStatus.append(icon('ph-shield-check'), make('span', '', 'Salvo localmente'));

        const settings = make('button', 'revamp-settings');
        settings.type = 'button';
        settings.dataset.plannkeOnclick = 'openSettingsPanel()';
        settings.setAttribute('aria-label', 'Configurações');
        settings.append(icon('ph-gear'), make('span', '', 'Configurações'));
        sidebar.append(brand, nav, spacer, localStatus, settings);

        const content = make('div', 'revamp-content');
        content.id = 'revamp-content';
        const topbar = make('header', 'revamp-topbar');
        topbar.id = 'revamp-topbar';

        const topbarCopy = make('div', 'revamp-topbar-copy');
        const eyebrow = make('span', 'revamp-page-eyebrow', 'Visão financeira');
        eyebrow.id = 'revamp-page-eyebrow';
        const title = make('h1', 'revamp-page-title', 'Seu dinheiro, com contexto');
        title.id = 'revamp-page-title';
        const subtitle = make('p', 'revamp-page-subtitle', 'Saldo, compromissos e próximos passos em uma única visão.');
        subtitle.id = 'revamp-page-subtitle';
        topbarCopy.append(eyebrow, title, subtitle);

        const actions = make('div', 'revamp-topbar-actions');
        const add = make('button', 'revamp-primary-action');
        add.type = 'button';
        add.dataset.plannkeOnclick = 'openTxModal(null)';
        add.append(icon('ph-plus'), make('span', '', 'Nova movimentação'));
        actions.appendChild(add);
        topbar.append(topbarCopy, actions);

        const parent = main.parentNode;
        parent.insertBefore(shell, main);
        shell.append(sidebar, content);
        content.append(topbar, main);

        document.body.classList.add('plannke-revamp');
        document.body.dataset.revampVersion = '2';
        document.body.dataset.plannkeCanonical = 'desktop';
        return shell;
    }

    function splitArgs(source) {
        const out = [];
        let current = '';
        let quote = null;
        let escaped = false;
        let depth = 0;
        for (const ch of String(source || '')) {
            if (escaped) { current += ch; escaped = false; continue; }
            if (ch === '\\') { current += ch; escaped = true; continue; }
            if (quote) {
                current += ch;
                if (ch === quote) quote = null;
                continue;
            }
            if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
            if (ch === '(' || ch === '[' || ch === '{') depth++;
            if (ch === ')' || ch === ']' || ch === '}') depth--;
            if (ch === ',' && depth === 0) { out.push(current.trim()); current = ''; continue; }
            current += ch;
        }
        if (current.trim()) out.push(current.trim());
        return out;
    }

    function decodeQuoted(token) {
        const quote = token[0];
        const body = token.slice(1, -1);
        return body
            .replace(new RegExp('\\\\' + quote, 'g'), quote)
            .replace(/\\\\n/g, '\n')
            .replace(/\\\\r/g, '\r')
            .replace(/\\\\t/g, '\t')
            .replace(/\\\\\\\\/g, '\\');
    }

    function parseArg(token, element, event) {
        const value = String(token || '').trim();
        if (!value) return undefined;
        if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) return decodeQuoted(value);
        if (value === 'null') return null;
        if (value === 'true') return true;
        if (value === 'false') return false;
        if (value === 'this') return element;
        if (value === 'event') return event;
        if (value === 'this.value') return element?.value;
        if (value === 'this.dataset.rawValue || this.value') return element?.dataset?.rawValue || element?.value;
        if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
        throw new Error(`Argumento inline não permitido: ${value}`);
    }

    function normalizeCode(code) {
        return String(code || '').replace(/\s+/g, ' ').trim();
    }

    function specialKind(code) {
        const value = normalizeCode(code);
        if (/^this\.showPicker\(\);?$/.test(value)) return 'show-picker';
        if (/^window\._detailContext\?\.onPeriodChange\(this\.value\);?$/.test(value)) return 'detail-period';
        if (/^bootstrap\.Modal\.getOrCreateInstance\(document\.getElementById\(['"]shortcutsModal['"]\)\)\.show\(\);?$/.test(value)) return 'shortcuts';
        return null;
    }

    function parseCall(code) {
        const cleaned = normalizeCode(code).replace(/;\s*return false;?$/, '').replace(/;$/, '');
        const match = cleaned.match(/^([A-Za-z_$][\w$]*)\((.*)\)$/);
        if (!match || !ALLOWED_CALLS.has(match[1])) return null;
        return { name: match[1], args: splitArgs(match[2]) };
    }

    function canHandle(code) {
        return !!specialKind(code) || !!parseCall(code);
    }

    function dispatch(code, element, event) {
        const kind = specialKind(code);
        if (kind === 'show-picker') {
            if (typeof element?.showPicker === 'function') element.showPicker();
            return true;
        }
        if (kind === 'detail-period') {
            root._detailContext?.onPeriodChange?.(element?.value);
            return true;
        }
        if (kind === 'shortcuts') {
            const modal = document.getElementById('shortcutsModal');
            if (modal && root.bootstrap?.Modal) root.bootstrap.Modal.getOrCreateInstance(modal).show();
            return true;
        }

        const call = parseCall(code);
        if (!call) return false;
        const fn = root[call.name];
        if (typeof fn !== 'function') return false;
        const args = call.args.map(arg => parseArg(arg, element, event));
        fn(...args);
        return true;
    }

    function migrateElement(element) {
        if (!element || element.nodeType !== 1) return;
        EVENT_ATTRS.forEach(attr => {
            const code = element.getAttribute(attr);
            if (!code) return;
            const dataAttr = DATA_ATTRS[attr];
            if (!element.hasAttribute(dataAttr)) element.setAttribute(dataAttr, code);
            element.removeAttribute(attr);
        });
        element.querySelectorAll?.('[onclick],[onchange],[oninput]').forEach(migrateElement);
    }

    function handleDelegated(event, sourceAttr) {
        let element = event.target;
        while (element && element !== document) {
            if (element.nodeType === 1 && element.hasAttribute(sourceAttr)) {
                const code = element.getAttribute(sourceAttr);
                try {
                    if (dispatch(code, element, event)) {
                        if (event.type === 'click' && element.matches('a[href="#"]')) event.preventDefault();
                    } else {
                        console.warn('Handler de compatibilidade não reconhecido pelo Plannke:', code);
                    }
                } catch (error) {
                    console.error('Falha ao executar ação da interface:', error);
                }
                return;
            }
            element = element.parentElement;
        }
    }

    function loadDesktopAssets() {
        if (typeof document === 'undefined') return;
        if (!canonicalStylesPresent() && !document.querySelector('link[data-plannke-desktop-style]')) {
            const desktopStyle = document.createElement('link');
            desktopStyle.rel = 'stylesheet';
            desktopStyle.href = 'revamp-desktop.css';
            desktopStyle.dataset.plannkeDesktopStyle = 'true';
            document.head.appendChild(desktopStyle);
        }
        if (!document.querySelector('script[data-plannke-desktop]')) {
            const desktopScript = document.createElement('script');
            desktopScript.src = 'revamp-desktop.js';
            desktopScript.async = false;
            desktopScript.dataset.plannkeDesktop = 'true';
            document.body.appendChild(desktopScript);
        }
    }

    function loadRevampAssets() {
        if (typeof document === 'undefined') return;
        if (!canonicalStylesPresent() && !document.querySelector('link[data-plannke-revamp]')) {
            const stylesheet = document.createElement('link');
            stylesheet.rel = 'stylesheet';
            stylesheet.href = 'revamp.css';
            stylesheet.dataset.plannkeRevamp = 'desktop';
            document.head.appendChild(stylesheet);
        }

        let script = document.querySelector('script[data-plannke-revamp]');
        if (script) {
            if (root.PlannkeRevamp) loadDesktopAssets();
            else script.addEventListener('load', loadDesktopAssets, { once: true });
            return;
        }

        script = document.createElement('script');
        script.src = 'revamp.js';
        script.async = false;
        script.dataset.plannkeRevamp = 'desktop';
        script.addEventListener('load', loadDesktopAssets, { once: true });
        document.body.appendChild(script);
    }

    let initialized = false;
    function init() {
        if (initialized || typeof document === 'undefined') return;
        initialized = true;
        primeCanonicalShell();
        migrateElement(document.documentElement);

        document.addEventListener('click', event => handleDelegated(event, DATA_ATTRS.onclick));
        document.addEventListener('change', event => handleDelegated(event, DATA_ATTRS.onchange));
        document.addEventListener('input', event => handleDelegated(event, DATA_ATTRS.oninput));

        const observer = new MutationObserver(records => {
            records.forEach(record => record.addedNodes.forEach(node => migrateElement(node)));
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    return {
        ALLOWED_CALLS,
        splitArgs,
        parseCall,
        canHandle,
        dispatch,
        migrateElement,
        primeCanonicalShell,
        loadDesktopAssets,
        loadRevampAssets,
        init
    };
});
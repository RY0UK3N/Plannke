(function (root, factory) {
    if (typeof document !== 'undefined' && document.currentScript) {
        document.currentScript.dataset.plannkeProduct = 'static-shell';
    }
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.PlannkeUIBridge = api;
    if (typeof document !== 'undefined') {
        const start = () => api.init();
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

    const ALLOWED_CALLS = new Set([
        'openSettingsPanel', 'openBudgetManager', 'openCategoryManager',
        'filterDashboardToTransactions', 'changeMonth', 'setMovViewMode',
        'renderMovimentacao', 'clearTxSearch', 'openModal', 'openTxModal',
        'exportToExcel', 'switchCatTabModal', 'addCustomCategoryModal',
        'toggleTheme', 'switchCatTab', 'addCustomCategory', 'confirmClearData',
        'mobileNav', 'toggleInstallmentField', 'updateInstallmentHelper',
        'importFromExcel', 'deleteCategoryModal', 'openColorPicker',
        'deleteCategory', 'selectCatColor', 'handleBudgetInput', 'saveBudgetEntry',
        'dupTx', 'edTx', 'delTx', 'edAcc', 'delAcc', 'viewAccountStatement',
        'edCard', 'delCard', 'handlePayFatura', 'viewCardInvoice'
    ]);

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
        const c = normalizeCode(code);
        if (/^document\.getElementById\(['"]excelUpload['"]\)\.click\(\);?$/.test(c)) return 'open-excel';
        if (/^this\.showPicker\(\);?$/.test(c)) return 'show-picker';
        if (/^window\._detailContext\?\.onPeriodChange\(this\.value\);?$/.test(c)) return 'detail-period';
        if (/^bootstrap\.Modal\.getOrCreateInstance\(document\.getElementById\(['"]shortcutsModal['"]\)\)\.show\(\);?$/.test(c)) return 'shortcuts';
        if (/^exportToExcel\(\);\s*bootstrap\.Modal\.getInstance\(document\.getElementById\(['"]backupReminderModal['"]\)\)\.hide\(\);?$/.test(c)) return 'backup-and-hide';
        return null;
    }

    function parseCall(code) {
        const cleaned = normalizeCode(code).replace(/;\s*return false;?$/, '').replace(/;$/, '');
        const match = cleaned.match(/^([A-Za-z_$][\w$]*)\((.*)\)$/);
        if (!match || !ALLOWED_CALLS.has(match[1])) return null;
        return { name: match[1], args: splitArgs(match[2]) };
    }

    function canHandle(code) {
        if (specialKind(code)) return true;
        return !!parseCall(code);
    }

    function dispatch(code, element, event) {
        const kind = specialKind(code);
        if (kind === 'open-excel') { document.getElementById('excelUpload')?.click(); return true; }
        if (kind === 'show-picker') { if (typeof element?.showPicker === 'function') element.showPicker(); return true; }
        if (kind === 'detail-period') { root._detailContext?.onPeriodChange?.(element?.value); return true; }
        if (kind === 'shortcuts') {
            const modal = document.getElementById('shortcutsModal');
            if (modal && root.bootstrap?.Modal) root.bootstrap.Modal.getOrCreateInstance(modal).show();
            return true;
        }
        if (kind === 'backup-and-hide') {
            root.exportToExcel?.();
            const modal = document.getElementById('backupReminderModal');
            if (modal && root.bootstrap?.Modal) root.bootstrap.Modal.getInstance(modal)?.hide();
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
                        console.warn('Handler legado não reconhecido pelo Plannke UI bridge:', code);
                    }
                } catch (error) {
                    console.error('Falha ao executar ação da interface:', error);
                }
                return;
            }
            element = element.parentElement;
        }
    }

    function loadRevampAssets() {
        if (typeof document === 'undefined') return;
        if (!document.querySelector('link[data-plannke-revamp]')) {
            const stylesheet = document.createElement('link');
            stylesheet.rel = 'stylesheet';
            stylesheet.href = 'revamp.css';
            stylesheet.dataset.plannkeRevamp = 'desktop';
            document.head.appendChild(stylesheet);
        }
        if (!document.querySelector('link[data-plannke-desktop-style]')) {
            const desktopStyle = document.createElement('link');
            desktopStyle.rel = 'stylesheet';
            desktopStyle.href = 'revamp-desktop.css';
            desktopStyle.dataset.plannkeDesktopStyle = 'true';
            document.head.appendChild(desktopStyle);
        }
        if (!document.querySelector('script[data-plannke-revamp]')) {
            const script = document.createElement('script');
            script.src = 'revamp.js';
            script.defer = true;
            script.dataset.plannkeRevamp = 'desktop';
            document.body.appendChild(script);
        }
        if (!document.querySelector('script[data-plannke-desktop]')) {
            const desktopScript = document.createElement('script');
            desktopScript.src = 'revamp-desktop.js';
            desktopScript.defer = true;
            desktopScript.dataset.plannkeDesktop = 'true';
            document.body.appendChild(desktopScript);
        }
    }

    let initialized = false;
    function init() {
        if (initialized || typeof document === 'undefined') return;
        initialized = true;
        migrateElement(document.documentElement);

        document.addEventListener('click', event => handleDelegated(event, DATA_ATTRS.onclick));
        document.addEventListener('change', event => handleDelegated(event, DATA_ATTRS.onchange));
        document.addEventListener('input', event => handleDelegated(event, DATA_ATTRS.oninput));

        const observer = new MutationObserver(records => {
            records.forEach(record => record.addedNodes.forEach(node => migrateElement(node)));
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        loadRevampAssets();
    }

    return { ALLOWED_CALLS, splitArgs, parseCall, canHandle, dispatch, migrateElement, loadRevampAssets, init };
});

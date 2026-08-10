/* Plannke canonical compatibility action router. */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.PlannkeActions = api;

    if (typeof document !== 'undefined') {
        const start = () => api.init();
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
        else start();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const DATA_ATTRS = {
        onclick: 'data-plannke-onclick',
        onchange: 'data-plannke-onchange',
        oninput: 'data-plannke-oninput'
    };

    // Temporary compatibility vocabulary for static data-plannke actions.
    // This shrinks as each workspace moves to explicit addEventListener bindings.
    const ALLOWED_CALLS = new Set([
        'confirmClearData',
        'deleteCategoryModal', 'openColorPicker', 'deleteCategory',
        'selectCatColor', 'handleBudgetInput', 'saveBudgetEntry',
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
        const value = normalizeCode(code);

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

        const call = parseCall(code);
        if (!call) return false;
        const fn = root[call.name];
        if (typeof fn !== 'function') return false;
        const args = call.args.map(arg => parseArg(arg, element, event));
        fn(...args);
        return true;
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
                        console.warn('Ação de compatibilidade não reconhecida pelo Plannke:', code);
                    }
                } catch (error) {
                    console.error('Falha ao executar ação da interface:', error);
                }
                return;
            }
            element = element.parentElement;
        }
    }

    let initialized = false;
    function init() {
        if (initialized || typeof document === 'undefined') return;
        initialized = true;
        document.addEventListener('click', event => handleDelegated(event, DATA_ATTRS.onclick));
        document.addEventListener('change', event => handleDelegated(event, DATA_ATTRS.onchange));
        document.addEventListener('input', event => handleDelegated(event, DATA_ATTRS.oninput));
    }

    return {
        ALLOWED_CALLS,
        splitArgs,
        parseCall,
        canHandle,
        dispatch,
        init
    };
});

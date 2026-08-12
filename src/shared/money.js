(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.PlannkeMoney = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const MONEY_SCHEMA_VERSION = 3;

    function error(code, message, path = '') {
        const value = new Error(path ? `${message} (${path})` : message);
        value.code = code;
        value.path = path;
        return value;
    }

    function assertCents(value, path = 'money') {
        if (!Number.isSafeInteger(value)) throw error('INVALID_MONEY_VALUE', 'Valor monetário deve ser um inteiro seguro em centavos.', path);
        return value;
    }

    function reaisToCents(value, path = 'money') {
        const amount = Number(value);
        if (!Number.isFinite(amount)) throw error('INVALID_MONEY_VALUE', 'Valor monetário inválido.', path);
        const cents = Math.round((amount + Math.sign(amount || 1) * Number.EPSILON) * 100);
        return assertCents(cents, path);
    }

    function centsToReais(value) {
        return assertCents(Number(value || 0)) / 100;
    }

    function parseMoneyInput(value) {
        if (typeof value === 'number') return reaisToCents(value, 'input');
        let source = String(value ?? '').trim().replace(/R\$/gi, '').replace(/\s/g, '');
        if (!source) return 0;
        if (source.includes(',') && source.includes('.')) source = source.replace(/\./g, '').replace(',', '.');
        else if (source.includes(',')) source = source.replace(',', '.');
        return reaisToCents(source, 'input');
    }

    function formatMoney(value, locale = 'pt-BR', currency = 'BRL') {
        return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(centsToReais(value));
    }

    function addMoney(...values) {
        return assertCents(values.reduce((sum, value) => sum + assertCents(value), 0));
    }

    function subtractMoney(value, ...values) {
        return assertCents(values.reduce((result, item) => result - assertCents(item), assertCents(value)));
    }

    function allocateMoney(total, parts) {
        const cents = assertCents(total, 'total');
        const count = Number(parts);
        if (!Number.isSafeInteger(count) || count <= 0) throw error('INVALID_ALLOCATION', 'Quantidade de parcelas inválida.', 'parts');
        const sign = cents < 0 ? -1 : 1;
        const absolute = Math.abs(cents);
        const base = Math.floor(absolute / count);
        const remainder = absolute % count;
        return Array.from({ length: count }, (_, index) => sign * (base + (index < remainder ? 1 : 0)));
    }

    function convertField(target, key, path, legacy) {
        if (!target || !Object.prototype.hasOwnProperty.call(target, key) || target[key] == null) return;
        target[key] = legacy ? reaisToCents(target[key], path) : assertCents(Number(target[key]), path);
    }

    function convertPlanning(planning, prefix, legacy) {
        (planning?.goals || []).forEach((item, index) => {
            convertField(item, 'targetAmount', `${prefix}.goals[${index}].targetAmount`, legacy);
            convertField(item, 'currentAmount', `${prefix}.goals[${index}].currentAmount`, legacy);
        });
        (planning?.reserves || []).forEach((item, index) => convertField(item, 'amount', `${prefix}.reserves[${index}].amount`, legacy));
        (planning?.recurringRules || []).forEach((item, index) => convertField(item, 'amount', `${prefix}.recurringRules[${index}].amount`, legacy));
    }

    function migrateDataToCents(input) {
        if (!input || typeof input !== 'object') throw error('INVALID_SCHEMA', 'Estrutura de dados inválida.');
        const data = typeof structuredClone === 'function' ? structuredClone(input) : JSON.parse(JSON.stringify(input));
        const version = Number(data.schemaVersion || data.settings?.schemaVersion || 2);
        if (version > MONEY_SCHEMA_VERSION) throw error('UNSUPPORTED_SCHEMA_VERSION', 'Versão de dados mais recente que esta aplicação.');
        const legacy = version < MONEY_SCHEMA_VERSION;

        (data.accounts || []).forEach((item, index) => {
            convertField(item, 'balance', `accounts[${index}].balance`, legacy);
            convertField(item, 'openingBalance', `accounts[${index}].openingBalance`, legacy);
        });
        (data.cards || []).forEach((item, index) => convertField(item, 'limit', `cards[${index}].limit`, legacy));
        (data.transactions || []).forEach((item, index) => convertField(item, 'amount', `transactions[${index}].amount`, legacy));
        (data.cardBillings || []).forEach((item, index) => convertField(item, 'paidAmount', `cardBillings[${index}].paidAmount`, legacy));
        Object.entries(data.settings?.budgets || {}).forEach(([key]) => convertField(data.settings.budgets, key, `settings.budgets.${key}`, legacy));
        convertPlanning(data.planning, 'planning', legacy);
        const state = data.settings?.productState;
        Object.keys(state?.openingBalances || {}).forEach(key => convertField(state.openingBalances, key, `settings.productState.openingBalances.${key}`, legacy));
        convertPlanning(state?.planning, 'settings.productState.planning', legacy);

        data.schemaVersion = MONEY_SCHEMA_VERSION;
        if (!data.settings || typeof data.settings !== 'object') data.settings = {};
        data.settings.schemaVersion = MONEY_SCHEMA_VERSION;
        return { data, fromVersion: version, toVersion: MONEY_SCHEMA_VERSION, changed: legacy };
    }

    return {
        MONEY_SCHEMA_VERSION,
        assertCents,
        reaisToCents,
        centsToReais,
        parseMoneyInput,
        formatMoney,
        addMoney,
        subtractMoney,
        allocateMoney,
        migrateDataToCents
    };
});

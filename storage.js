/**
 * Plannke — storage.js
 * Copyright (c) 2026 Marcos Luciano Tagliari Junior
 * Licensed under the MIT License — see LICENSE for details.
 */

/* ============================================================
   STORAGE.JS — Memory Card Engine
   Dados vivem no Excel (.xlsx). sessionStorage mantém a sessão;
   app.js espelha a sessão no localStorage como autosave.
   ============================================================ */

const DB_KEY = 'planner_session_cache';
const DATA_SCHEMA_VERSION = 2;

const defaultData = {
    schemaVersion: DATA_SCHEMA_VERSION,
    accounts: [],
    cards: [],
    transactions: [],
    cardBillings: [],
    settings: {
        schemaVersion: DATA_SCHEMA_VERSION,
        theme: 'dark',
        categories: null,
        budgets: {},
        categoryColors: {}
    }
};

/* ---------- Date helpers ---------- */
function todayLocal() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function localMonth() {
    return todayLocal().slice(0, 7);
}

function daysInMonth(year, month1Based) {
    return new Date(year, month1Based, 0).getDate();
}

function makeClampedDate(year, month1Based, day) {
    const safeDay = Math.min(Math.max(parseInt(day, 10) || 1, 1), daysInMonth(year, month1Based));
    return `${year}-${String(month1Based).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function addMonthsClamped(dateStr, offset) {
    const match = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return dateStr;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const absoluteMonth = year * 12 + (month - 1) + Number(offset || 0);
    const targetYear = Math.floor(absoluteMonth / 12);
    const targetMonth = ((absoluteMonth % 12) + 12) % 12 + 1;
    return makeClampedDate(targetYear, targetMonth, day);
}

function normalizeDateString(value, fallback = '') {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }

    if (typeof value === 'number' && Number.isFinite(value) && globalThis.XLSX?.SSF?.parse_date_code) {
        const parsed = globalThis.XLSX.SSF.parse_date_code(value);
        if (parsed?.y && parsed?.m && parsed?.d) return makeClampedDate(parsed.y, parsed.m, parsed.d);
    }

    const str = String(value ?? '').trim();
    let match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (match) {
        const y = Number(match[1]);
        const m = Number(match[2]);
        const d = Number(match[3]);
        if (m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m)) return makeClampedDate(y, m, d);
        return fallback;
    }

    match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
        const d = Number(match[1]);
        const m = Number(match[2]);
        const y = Number(match[3]);
        if (m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m)) return makeClampedDate(y, m, d);
    }

    return fallback;
}

/* ---------- Input hardening ---------- */
/**
 * Dados do usuário aparecem em vários templates HTML legados, inclusive
 * atributos onclick. Enquanto a UI não migra integralmente para DOM APIs,
 * neutralizamos metacaracteres na fronteira de dados sem remover o conteúdo.
 */
function sanitizePlainText(value, maxLength = 300) {
    return String(value ?? '')
        .normalize('NFC')
        .replace(/[\u0000-\u001F\u007F\u2028\u2029]+/g, ' ')
        .replace(/&/g, '＆')
        .replace(/</g, '‹')
        .replace(/>/g, '›')
        .replace(/"/g, '”')
        .replace(/'/g, '’')
        .replace(/\\/g, '＼')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

function sanitizeIdentifier(value, fallback = '') {
    const safe = String(value ?? '')
        .trim()
        .replace(/[^A-Za-z0-9_.:-]/g, '_')
        .slice(0, 128);
    return safe || fallback;
}

function sanitizeColor(value, fallback = '#475569') {
    const str = String(value ?? '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(str) ? str.toLowerCase() : fallback;
}

function finiteNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function clampDay(value, fallback = 1) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 31) : fallback;
}

function _uniqueSafeId(rawId, used, prefix) {
    const base = sanitizeIdentifier(rawId, `${prefix}_${Math.random().toString(36).slice(2, 10)}`);
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) candidate = `${base.slice(0, 118)}_${suffix++}`;
    used.add(candidate);
    return candidate;
}

function normalizeSettings(rawSettings) {
    const raw = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
    const settings = {
        ...raw,
        schemaVersion: DATA_SCHEMA_VERSION,
        theme: raw.theme === 'light' ? 'light' : 'dark',
        categories: null,
        budgets: {},
        categoryColors: {}
    };

    if (raw.categories && typeof raw.categories === 'object') {
        const income = Array.isArray(raw.categories.income)
            ? [...new Set(raw.categories.income.map(c => sanitizePlainText(c, 100)).filter(Boolean))]
            : [];
        const expense = {};
        if (raw.categories.expense && typeof raw.categories.expense === 'object') {
            Object.entries(raw.categories.expense).forEach(([group, list]) => {
                const safeGroup = sanitizePlainText(group, 100);
                if (!safeGroup || !Array.isArray(list)) return;
                expense[safeGroup] = [...new Set(list.map(c => sanitizePlainText(c, 100)).filter(Boolean))];
            });
        }
        settings.categories = { income, expense };
    }

    if (raw.budgets && typeof raw.budgets === 'object') {
        Object.entries(raw.budgets).forEach(([category, value]) => {
            const safeCategory = sanitizePlainText(category, 100);
            const amount = finiteNumber(value, 0);
            if (safeCategory && amount > 0) settings.budgets[safeCategory] = amount;
        });
    }

    if (raw.categoryColors && typeof raw.categoryColors === 'object') {
        Object.entries(raw.categoryColors).forEach(([category, color]) => {
            const safeCategory = sanitizePlainText(category, 100);
            if (safeCategory) settings.categoryColors[safeCategory] = sanitizeColor(color);
        });
    }

    return settings;
}

function normalizeData(input) {
    const raw = input && typeof input === 'object' ? input : {};
    const entityIds = new Set();
    const transactionIds = new Set();
    const entityMap = new Map();
    const txMap = new Map();

    const accounts = (Array.isArray(raw.accounts) ? raw.accounts : []).map((account, index) => {
        const oldId = String(account?.id ?? '');
        const id = _uniqueSafeId(oldId, entityIds, `acc${index + 1}`);
        entityMap.set(oldId, id);
        return {
            ...account,
            id,
            name: sanitizePlainText(account?.name, 120),
            balance: finiteNumber(account?.balance, 0)
        };
    });

    const cards = (Array.isArray(raw.cards) ? raw.cards : []).map((card, index) => {
        const oldId = String(card?.id ?? '');
        const id = _uniqueSafeId(oldId, entityIds, `card${index + 1}`);
        entityMap.set(oldId, id);
        return {
            ...card,
            id,
            name: sanitizePlainText(card?.name, 120),
            limit: Math.max(finiteNumber(card?.limit, 0), 0),
            closingDay: clampDay(card?.closingDay, 1),
            dueDay: clampDay(card?.dueDay, 1)
        };
    });

    const rawTransactions = Array.isArray(raw.transactions) ? raw.transactions : [];
    const transactions = rawTransactions.map((tx, index) => {
        const oldId = String(tx?.id ?? '');
        const id = _uniqueSafeId(oldId, transactionIds, `tx${index + 1}`);
        txMap.set(oldId, id);
        const type = ['income', 'expense', 'transfer'].includes(tx?.type) ? tx.type : 'expense';
        const date = normalizeDateString(tx?.date, '');
        return {
            ...tx,
            id,
            type,
            description: sanitizePlainText(tx?.description, 300),
            category: sanitizePlainText(tx?.category || 'Sem Categoria', 100),
            amount: Math.abs(finiteNumber(tx?.amount, 0)),
            date,
            accountId: entityMap.get(String(tx?.accountId ?? '')) || sanitizeIdentifier(tx?.accountId),
            destinationId: tx?.destinationId
                ? (entityMap.get(String(tx.destinationId)) || sanitizeIdentifier(tx.destinationId))
                : null,
            currentInstallment: Math.max(parseInt(tx?.currentInstallment, 10) || 1, 1),
            totalInstallments: Math.max(parseInt(tx?.totalInstallments, 10) || 1, 1),
            groupId: tx?.groupId ? sanitizeIdentifier(tx.groupId) : null,
            recurring: !!tx?.recurring,
            billingCardId: tx?.billingCardId
                ? (entityMap.get(String(tx.billingCardId)) || sanitizeIdentifier(tx.billingCardId))
                : undefined,
            billingPeriod: /^\d{4}-(0[1-9]|1[0-2])$/.test(String(tx?.billingPeriod || '')) ? String(tx.billingPeriod) : undefined
        };
    }).filter(tx => tx.date && tx.amount > 0);

    const cardBillings = (Array.isArray(raw.cardBillings) ? raw.cardBillings : []).map(billing => {
        const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(billing?.period || '')) ? String(billing.period) : '';
        return {
            ...billing,
            cardId: entityMap.get(String(billing?.cardId ?? '')) || sanitizeIdentifier(billing?.cardId),
            period,
            isPaid: !!billing?.isPaid,
            paidAmount: Math.max(finiteNumber(billing?.paidAmount, 0), 0),
            paidAt: billing?.paidAt ? normalizeDateString(billing.paidAt, null) : null,
            fromAccountId: billing?.fromAccountId
                ? (entityMap.get(String(billing.fromAccountId)) || sanitizeIdentifier(billing.fromAccountId))
                : null,
            paymentTransactionId: billing?.paymentTransactionId
                ? (txMap.get(String(billing.paymentTransactionId)) || sanitizeIdentifier(billing.paymentTransactionId))
                : null
        };
    }).filter(b => b.cardId && b.period);

    return {
        ...raw,
        schemaVersion: DATA_SCHEMA_VERSION,
        accounts,
        cards,
        transactions,
        cardBillings,
        settings: normalizeSettings(raw.settings)
    };
}

/* ---------- Core ---------- */
function getData() {
    const raw = sessionStorage.getItem(DB_KEY);
    if (!raw) return structuredClone(defaultData);

    try {
        return normalizeData(JSON.parse(raw));
    } catch (error) {
        console.error('Cache de sessão inválido:', error);
        return structuredClone(defaultData);
    }
}

function _markDataDirty() {
    try {
        if (typeof _backupDone !== 'undefined') _backupDone = false;
    } catch (_) {}

    try {
        if (typeof globalThis.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
            globalThis.dispatchEvent(new CustomEvent('plannke:data-changed'));
        }
    } catch (_) {}
}

function saveData(data) {
    const normalized = normalizeData(data);
    sessionStorage.setItem(DB_KEY, JSON.stringify(normalized));
    _markDataDirty();
    return normalized;
}

/* Garante que settings sempre existe com valores padrão */
function getSettings() {
    return getData().settings;
}

function saveSettings(settings) {
    const data = getData();
    data.settings = settings;
    saveData(data);
}

function generateId() {
    if (globalThis.crypto?.randomUUID) return `_${globalThis.crypto.randomUUID()}`;
    return '_' + Math.random().toString(36).slice(2, 11);
}

/* ---------- Accounts ---------- */
function saveAccount(id, name, balance) {
    const data = getData();
    const parsed = finiteNumber(balance, 0);
    if (id) {
        const item = data.accounts.find(a => a.id === id);
        if (item) { item.name = sanitizePlainText(name, 120); item.balance = parsed; }
    } else {
        data.accounts.push({ id: generateId(), name: sanitizePlainText(name, 120), balance: parsed });
    }
    saveData(data);
}

function deleteAccount(id) {
    const data = getData();
    data.accounts = data.accounts.filter(a => a.id !== id);
    saveData(data);
}

/* ---------- Cards ---------- */
function saveCard(id, name, limit, closingDay, dueDay) {
    const data = getData();
    if (id) {
        const item = data.cards.find(c => c.id === id);
        if (item) {
            item.name = sanitizePlainText(name, 120);
            item.limit = Math.max(finiteNumber(limit, 0), 0);
            item.closingDay = clampDay(closingDay, 1);
            item.dueDay = clampDay(dueDay, 1);
        }
    } else {
        data.cards.push({
            id: generateId(),
            name: sanitizePlainText(name, 120),
            limit: Math.max(finiteNumber(limit, 0), 0),
            closingDay: clampDay(closingDay, 1),
            dueDay: clampDay(dueDay, 1)
        });
    }
    saveData(data);
}

function deleteCard(id) {
    const data = getData();
    data.cards = data.cards.filter(c => c.id !== id);
    data.cardBillings = (data.cardBillings || []).filter(b => b.cardId !== id);
    saveData(data);
}

/* ---------- Credit Card Billing Helpers ---------- */
function getBillingPeriod(dateStr, closingDay) {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (d > closingDay) return `${y}-${String(m).padStart(2, '0')}`;
    const dt = new Date(y, m - 2, 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function getCardBilling(data, cardId, period) {
    const card = data.cards.find(c => c.id === cardId);
    if (!card) return null;

    const txs = data.transactions.filter(t => {
        if (t.accountId !== cardId || t.type !== 'expense') return false;
        return getBillingPeriod(t.date, card.closingDay) === period;
    });

    const total = txs.reduce((s, t) => s + Number(t.amount || 0), 0);
    const [y, m] = period.split('-').map(Number);
    let dueYear = y;
    let dueMonth = m + 1;
    if (dueMonth > 12) { dueMonth = 1; dueYear += 1; }
    const dueDate = makeClampedDate(dueYear, dueMonth, card.dueDay);

    const billing = (data.cardBillings || []).find(b => b.cardId === cardId && b.period === period);
    return {
        period,
        total,
        transactions: txs,
        isPaid: billing?.isPaid || false,
        dueDate,
        paidAt: billing?.paidAt || null,
        paidAmount: billing?.paidAmount ?? null,
        fromAccountId: billing?.fromAccountId ?? null,
        paymentTransactionId: billing?.paymentTransactionId ?? null
    };
}

function payCardBilling(cardId, period, fromAccountId, amount) {
    const data = getData();
    if (!data.cardBillings) data.cardBillings = [];

    const existing = data.cardBillings.find(b => b.cardId === cardId && b.period === period);
    if (existing?.isPaid) return null;

    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return null;

    const today = todayLocal();
    const paymentTransactionId = generateId();

    if (existing) {
        existing.isPaid = true;
        existing.paidAt = today;
        existing.paidAmount = parsedAmount;
        existing.fromAccountId = fromAccountId;
        existing.paymentTransactionId = paymentTransactionId;
    } else {
        data.cardBillings.push({
            cardId, period, isPaid: true, paidAt: today,
            paidAmount: parsedAmount, fromAccountId, paymentTransactionId
        });
    }

    const card = data.cards.find(c => c.id === cardId);
    const [y, mon] = period.split('-').map(Number);
    data.transactions.push({
        id: paymentTransactionId,
        type: 'transfer',
        description: sanitizePlainText(`Pagamento fatura ${card?.name || ''} ${MONTH_LABELS[mon - 1]}/${y}`, 300),
        category: 'Pagamento de Fatura',
        amount: parsedAmount,
        date: today,
        accountId: fromAccountId,
        destinationId: cardId,
        currentInstallment: 1,
        totalInstallments: 1,
        groupId: null,
        recurring: false,
        billingCardId: cardId,
        billingPeriod: period
    });

    applyTransactionBalances(data, 'transfer', parsedAmount, fromAccountId, cardId);
    saveData(data);
    return paymentTransactionId;
}

function getAllCardBillings(data, cardId) {
    const card = data.cards.find(c => c.id === cardId);
    if (!card) return [];

    const periodsSet = new Set();
    data.transactions.forEach(t => {
        if (t.accountId === cardId && t.type === 'expense') periodsSet.add(getBillingPeriod(t.date, card.closingDay));
    });
    periodsSet.add(getBillingPeriod(todayLocal(), card.closingDay));

    return Array.from(periodsSet).sort().reverse().map(p => getCardBilling(data, cardId, p));
}

function getOutstandingCardBalance(data, cardId) {
    const card = data.cards.find(c => c.id === cardId);
    if (!card) return 0;

    return data.transactions
        .filter(t => t.accountId === cardId && t.type === 'expense')
        .filter(t => {
            const period = getBillingPeriod(t.date, card.closingDay);
            const billing = (data.cardBillings || []).find(b => b.cardId === cardId && b.period === period);
            return !billing?.isPaid;
        })
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
}

/* ---------- Balance helpers ---------- */
function _adjustBalances(data, type, amount, accountId, destinationId, sign) {
    const parsedAmount = Number(amount || 0);
    const isCardAccount = data.cards.some(c => c.id === accountId);
    const isCardDest = data.cards.some(c => c.id === destinationId);

    if (!isCardAccount) {
        const acc = data.accounts.find(a => a.id === accountId);
        if (acc) {
            if (type === 'income') acc.balance += sign * parsedAmount;
            if (type === 'expense') acc.balance -= sign * parsedAmount;
            if (type === 'transfer') acc.balance -= sign * parsedAmount;
        }
    }

    if (type === 'transfer' && destinationId && !isCardDest) {
        const dest = data.accounts.find(a => a.id === destinationId);
        if (dest) dest.balance += sign * parsedAmount;
    }
}

function revertTransactionBalances(data, tx) {
    if (!tx) return;
    _adjustBalances(data, tx.type, tx.amount, tx.accountId, tx.destinationId, -1);
}

function applyTransactionBalances(data, type, amount, accountId, destinationId) {
    _adjustBalances(data, type, amount, accountId, destinationId, 1);
}

function _unlinkBillingPayment(data, tx) {
    if (!tx || tx.type !== 'transfer') return;

    const billing = (data.cardBillings || []).find(b =>
        b.paymentTransactionId === tx.id ||
        (tx.billingCardId && tx.billingPeriod && b.cardId === tx.billingCardId && b.period === tx.billingPeriod)
    );
    if (!billing) return;

    billing.isPaid = false;
    billing.paidAt = null;
    billing.paidAmount = null;
    billing.fromAccountId = null;
    billing.paymentTransactionId = null;
}

/* ---------- Transactions ---------- */
function saveTransaction(id, type, description, amount, date, accountId, category, currentInstallment, totalInstallments, groupId, destinationId, recurring) {
    const data = getData();
    const parsed = Math.abs(parseFloat(amount));
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Valor de transação inválido.');

    let safeDate = normalizeDateString(date, '');
    if (!safeDate) throw new Error('Data de transação inválida.');

    const installmentNo = Math.max(parseInt(currentInstallment, 10) || 1, 1);
    const installmentsTotal = Math.max(parseInt(totalInstallments, 10) || 1, 1);
    const safeGroupId = groupId ? sanitizeIdentifier(groupId) : null;

    // A UI antiga usa Date#setMonth, que transforma 31/jan + 1 mês em março.
    // O primeiro lançamento do grupo é a âncora; os demais são recalculados aqui.
    if (!id && safeGroupId && installmentNo > 1) {
        const anchor = data.transactions.find(t => t.groupId === safeGroupId && t.currentInstallment === 1);
        if (anchor) safeDate = addMonthsClamped(anchor.date, installmentNo - 1);
    }

    if (id) {
        const old = data.transactions.find(t => t.id === id);
        if (old) {
            revertTransactionBalances(data, old);
            _unlinkBillingPayment(data, old);
            Object.assign(old, {
                type: ['income', 'expense', 'transfer'].includes(type) ? type : 'expense',
                description: sanitizePlainText(description, 300),
                amount: parsed,
                date: safeDate,
                accountId: sanitizeIdentifier(accountId),
                category: sanitizePlainText(category || 'Sem Categoria', 100),
                destinationId: destinationId ? sanitizeIdentifier(destinationId) : null,
                recurring: !!recurring
            });
        }
    } else {
        data.transactions.push({
            id: generateId(),
            type: ['income', 'expense', 'transfer'].includes(type) ? type : 'expense',
            description: sanitizePlainText(description, 300),
            amount: parsed,
            date: safeDate,
            accountId: sanitizeIdentifier(accountId),
            category: sanitizePlainText(category || 'Sem Categoria', 100),
            currentInstallment: installmentNo,
            totalInstallments: installmentsTotal,
            groupId: safeGroupId,
            destinationId: destinationId ? sanitizeIdentifier(destinationId) : null,
            recurring: !!recurring
        });
    }

    applyTransactionBalances(data, type, parsed, accountId, destinationId);
    saveData(data);
}

function deleteTransaction(id) {
    const data = getData();
    const tx = data.transactions.find(t => t.id === id);
    if (tx) {
        revertTransactionBalances(data, tx);
        _unlinkBillingPayment(data, tx);
    }
    data.transactions = data.transactions.filter(t => t.id !== id);
    saveData(data);
}

function deleteInstallmentGroup(groupId) {
    const data = getData();
    data.transactions
        .filter(t => t.groupId === groupId)
        .forEach(tx => {
            revertTransactionBalances(data, tx);
            _unlinkBillingPayment(data, tx);
        });
    data.transactions = data.transactions.filter(t => t.groupId !== groupId);
    saveData(data);
}

/* ---------- Hardened Excel import ---------- */
function _parseMoneyValue(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    let str = String(value ?? '').trim().replace(/\s/g, '').replace(/^R\$/i, '');
    if (!str) return 0;

    if (str.includes(',') && str.includes('.')) {
        if (str.lastIndexOf(',') > str.lastIndexOf('.')) str = str.replace(/\./g, '').replace(',', '.');
        else str = str.replace(/,/g, '');
    } else if (str.includes(',')) {
        str = str.replace(',', '.');
    }
    const num = Number(str);
    return Number.isFinite(num) ? num : 0;
}

function _stableOfflineId(parts) {
    const text = parts.join('|');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `_offline_${(hash >>> 0).toString(36)}`;
}

function _relinkBillingPayments(data) {
    (data.cardBillings || []).forEach(billing => {
        if (!billing.isPaid || billing.paymentTransactionId) return;
        const match = data.transactions.find(tx =>
            tx.type === 'transfer' &&
            tx.accountId === billing.fromAccountId &&
            tx.destinationId === billing.cardId &&
            Math.abs(Number(tx.amount || 0) - Number(billing.paidAmount || 0)) < 0.005 &&
            (!billing.paidAt || tx.date === billing.paidAt)
        );
        if (!match) return;
        billing.paymentTransactionId = match.id;
        match.billingCardId = billing.cardId;
        match.billingPeriod = billing.period;
    });
}

function hardenedImportFromExcel(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    if (typeof XLSX === 'undefined') { alert('Aguarde a biblioteca carregar.'); return; }

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
            const sheetTx = wb.Sheets['Transacoes'] || wb.Sheets['Transações'] || null;
            const sheetAcc = wb.Sheets['Contas'] || null;
            const sheetCard = wb.Sheets['Cartoes'] || wb.Sheets['Cartões'] || null;
            const sheetBill = wb.Sheets['FaturasCartao'] || null;
            const sheetConfig = wb.Sheets['Configuracoes'] || null;
            const sheetEntry = wb.Sheets['✏️ Nova Transação'] || null;

            if (!sheetTx && !sheetAcc && !sheetCard) {
                alert('Arquivo inválido! Use um backup gerado por este app.');
                event.target.value = '';
                return;
            }

            const rawTx = sheetTx ? XLSX.utils.sheet_to_json(sheetTx, { defval: '' }) : [];
            const rawAcc = sheetAcc ? XLSX.utils.sheet_to_json(sheetAcc, { defval: '' }) : [];
            const rawCard = sheetCard ? XLSX.utils.sheet_to_json(sheetCard, { defval: '' }) : [];
            const rawBill = sheetBill ? XLSX.utils.sheet_to_json(sheetBill, { defval: '' }) : [];

            const transactions = rawTx.map(r => ({
                id: r['ID'] || generateId(),
                type: r['Tipo'] === 'Entrada' ? 'income' : (r['Tipo'] === 'Gasto' ? 'expense' : 'transfer'),
                description: r['Descrição'] || r['Descricao'] || '',
                category: r['Categoria'] || 'Outros',
                amount: Math.abs(_parseMoneyValue(r['Valor'])),
                date: normalizeDateString(r['Data'], ''),
                recurring: String(r['Recorrente'] || '').toLowerCase() === 'sim',
                accountId: r['ContaID'] || '',
                destinationId: r['DestinoID'] || null,
                currentInstallment: parseInt(r['Parcela Atual'], 10) || 1,
                totalInstallments: parseInt(r['Total Parcelas'], 10) || 1,
                groupId: r['GrupoID'] || null
            })).filter(t => t.date && t.amount > 0);

            const accounts = rawAcc.map(r => ({
                id: r['ID'] || generateId(),
                name: r['Nome'] || '',
                balance: finiteNumber(_parseMoneyValue(r['Saldo']), 0)
            }));

            const cards = rawCard.map(r => ({
                id: r['ID'] || generateId(),
                name: r['Nome'] || '',
                limit: Math.max(_parseMoneyValue(r['Limite']), 0),
                closingDay: clampDay(r['Fechamento'], 1),
                dueDay: clampDay(r['Vencimento'], 1)
            }));

            const cardBillings = rawBill.map(r => ({
                cardId: r['CartaoID'] || '',
                period: String(r['Periodo'] || ''),
                isPaid: r['Pago'] === 'Sim',
                paidAmount: Math.max(_parseMoneyValue(r['ValorPago']), 0),
                paidAt: r['DataPagamento'] ? normalizeDateString(r['DataPagamento'], null) : null,
                fromAccountId: r['ContaDebitoID'] || null
            }));

            let settings = null;
            if (sheetConfig) {
                try {
                    const rawConf = XLSX.utils.sheet_to_json(sheetConfig, { defval: '' });
                    if (rawConf[0]?.['Configuracoes']) settings = JSON.parse(rawConf[0]['Configuracoes']);
                } catch (_) {}
            }

            const offlineEntries = [];
            let skippedOffline = 0;
            if (sheetEntry) {
                try {
                    const rawEntry = XLSX.utils.sheet_to_json(sheetEntry, { defval: '' });
                    rawEntry.forEach((r, index) => {
                        const tipo = String(r['Tipo *'] || '').trim();
                        const description = String(r['Descrição *'] || '').trim();
                        const amount = Math.abs(_parseMoneyValue(r['Valor *']));
                        const date = normalizeDateString(r['Data *'], '');
                        const accountId = String(r['ContaID *'] || '').trim();
                        if (!tipo || !description || !amount || !date || !accountId) return;

                        const type = tipo === 'Entrada' ? 'income' : tipo === 'Gasto' ? 'expense' : tipo === 'Transferência' ? 'transfer' : null;
                        const destinationId = String(r['DestinoID'] || r['DestinoID *'] || '').trim() || null;
                        if (!type || (type === 'transfer' && !destinationId)) {
                            skippedOffline++;
                            return;
                        }

                        const id = _stableOfflineId([index, type, description, amount, date, accountId, destinationId || '']);
                        offlineEntries.push({
                            id,
                            type,
                            description,
                            category: String(r['Categoria *'] || (type === 'transfer' ? 'Transferência' : 'Outros')).trim(),
                            amount,
                            date,
                            recurring: String(r['Recorrente'] || '').toLowerCase() === 'sim',
                            accountId,
                            destinationId,
                            currentInstallment: 1,
                            totalInstallments: 1,
                            groupId: null
                        });
                    });
                } catch (_) {}
            }

            const existingIds = new Set(transactions.map(t => String(t.id)));
            const newOffline = offlineEntries.filter(t => !existingIds.has(String(t.id)));

            if (!confirm(`Importar ${transactions.length + newOffline.length} transações, ${accounts.length} contas e ${cards.length} cartões?\n\nDados atuais serão substituídos.`)) {
                event.target.value = '';
                return;
            }

            const importData = {
                schemaVersion: DATA_SCHEMA_VERSION,
                transactions: [...transactions, ...newOffline],
                accounts,
                cards,
                cardBillings,
                settings: settings || structuredClone(defaultData.settings)
            };

            // Os saldos da aba Contas já incluem as transações técnicas existentes.
            // Apenas lançamentos novos da aba ✏️ precisam alterar o saldo importado.
            newOffline.forEach(tx => applyTransactionBalances(importData, tx.type, tx.amount, tx.accountId, tx.destinationId));
            _relinkBillingPayments(importData);

            const normalized = saveData(importData);
            try { localStorage.setItem('planner_autosave', JSON.stringify(normalized)); } catch (_) {}

            if (normalized.settings?.theme && typeof applyTheme === 'function') applyTheme(normalized.settings.theme);
            try { _currentMonth = null; } catch (_) {}
            try { _backupDone = true; } catch (_) {}

            const welcomeModalEl = document.getElementById('welcomeModal');
            const welcomeModal = welcomeModalEl ? bootstrap.Modal.getInstance(welcomeModalEl) : null;
            if (welcomeModal) welcomeModal.hide();

            if (typeof renderAll === 'function') renderAll();
            if (typeof showToast === 'function') {
                const warning = skippedOffline ? ` (${skippedOffline} linha(s) offline inválida(s) ignorada(s))` : '';
                showToast(`Memory Card carregado!${warning}`, skippedOffline ? 'info' : 'success');
            }
        } catch (err) {
            console.error(err);
            alert('Erro ao carregar o arquivo. Verifique se é um backup válido.');
        }
        event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}

/* ---------- Pre-init browser hardening hooks ---------- */
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        // app.js já foi avaliado neste ponto, mas seu listener de init foi
        // registrado depois deste. Substituímos o importador antes da UI iniciar.
        if (typeof window !== 'undefined' && typeof window.importFromExcel === 'function') {
            window.importFromExcel = hardenedImportFromExcel;
        }

        // Corrige somente a data automática gerada pela UI quando UTC já virou
        // o dia seguinte. Datas escolhidas manualmente pelo usuário não são tocadas.
        const modal = document.getElementById('transactionModal');
        modal?.addEventListener('show.bs.modal', () => {
            const input = document.getElementById('tx-date');
            const txId = document.getElementById('tx-id')?.value;
            if (!input || txId) return;
            const utcToday = new Date().toISOString().slice(0, 10);
            const localToday = todayLocal();
            if (utcToday !== localToday && input.value === utcToday) input.value = localToday;
        });
    });
}

/* ---------- Formatters ---------- */
const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

function formatPeriod(periodStr) {
    const [y, m] = periodStr.split('-').map(Number);
    return `${MONTH_LABELS[m - 1]}/${y}`;
}

/* ---------- General-audience product layer loader ---------- */
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        if (document.querySelector('script[data-plannke-product]')) return;
        const load = src => new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.dataset.plannkeProduct = src;
            script.onload = resolve;
            script.onerror = reject;
            document.body.appendChild(script);
        });
        load('product-core.js')
            .then(() => load('product.js'))
            .catch(error => console.error('Falha ao carregar camada de produto do Plannke:', error));
    }, { once: true });
}

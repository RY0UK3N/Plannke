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

/* ---------- Core ---------- */
function getData() {
    const raw = sessionStorage.getItem(DB_KEY);
    if (!raw) return structuredClone(defaultData);

    try {
        const data = JSON.parse(raw);
        if (!data.settings) data.settings = structuredClone(defaultData.settings);
        if (!Array.isArray(data.accounts)) data.accounts = [];
        if (!Array.isArray(data.cards)) data.cards = [];
        if (!Array.isArray(data.transactions)) data.transactions = [];
        if (!Array.isArray(data.cardBillings)) data.cardBillings = [];
        data.schemaVersion = DATA_SCHEMA_VERSION;
        return data;
    } catch (error) {
        console.error('Cache de sessão inválido:', error);
        return structuredClone(defaultData);
    }
}

function saveData(data) {
    data.schemaVersion = DATA_SCHEMA_VERSION;
    sessionStorage.setItem(DB_KEY, JSON.stringify(data));
}

/* Garante que settings sempre existe com valores padrão */
function getSettings() {
    const data = getData();
    if (!data.settings) data.settings = structuredClone(defaultData.settings);
    return data.settings;
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
    const parsed = parseFloat(balance);
    if (id) {
        const item = data.accounts.find(a => a.id === id);
        if (item) { item.name = name; item.balance = parsed; }
    } else {
        data.accounts.push({ id: generateId(), name, balance: parsed });
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
            item.name = name;
            item.limit = parseFloat(limit);
            item.closingDay = parseInt(closingDay, 10);
            item.dueDay = parseInt(dueDay, 10);
        }
    } else {
        data.cards.push({
            id: generateId(),
            name,
            limit: parseFloat(limit),
            closingDay: parseInt(closingDay, 10),
            dueDay: parseInt(dueDay, 10)
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
/**
 * Retorna o período de fatura para uma data de transação dado o dia de fechamento.
 * Retorna string "YYYY-MM" do mês de referência da fatura.
 */
function getBillingPeriod(dateStr, closingDay) {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (d > closingDay) {
        return `${y}-${String(m).padStart(2, '0')}`;
    }

    const dt = new Date(y, m - 2, 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Calcula a fatura de um cartão para um período (YYYY-MM).
 * Retorna { period, total, transactions[], isPaid, dueDate, ... }
 */
function getCardBilling(data, cardId, period) {
    const card = data.cards.find(c => c.id === cardId);
    if (!card) return null;

    const txs = data.transactions.filter(t => {
        if (t.accountId !== cardId || t.type !== 'expense') return false;
        return getBillingPeriod(t.date, card.closingDay) === period;
    });

    const total = txs.reduce((s, t) => s + Number(t.amount || 0), 0);
    const [y, m] = period.split('-').map(Number);

    // O período YYYY-MM vence no mês seguinte. Clamp evita datas impossíveis
    // como 31/02, que o Date normalizaria silenciosamente para março.
    let dueYear = y;
    let dueMonth = m + 1;
    if (dueMonth > 12) {
        dueMonth = 1;
        dueYear += 1;
    }
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

/**
 * Marca uma fatura como paga e vincula o pagamento à transferência criada.
 * Retorna o id da transação de pagamento ou null se a fatura já estava paga.
 */
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
            cardId,
            period,
            isPaid: true,
            paidAt: today,
            paidAmount: parsedAmount,
            fromAccountId,
            paymentTransactionId
        });
    }

    const card = data.cards.find(c => c.id === cardId);
    const [y, mon] = period.split('-').map(Number);
    data.transactions.push({
        id: paymentTransactionId,
        type: 'transfer',
        description: `Pagamento fatura ${card?.name || ''} ${MONTH_LABELS[mon - 1]}/${y}`,
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

    // Uma transferência para cartão debita a conta de origem exatamente uma vez.
    applyTransactionBalances(data, 'transfer', parsedAmount, fromAccountId, cardId);

    saveData(data);
    return paymentTransactionId;
}

/**
 * Retorna todas as faturas de um cartão agrupadas por período, incluindo período atual.
 */
function getAllCardBillings(data, cardId) {
    const card = data.cards.find(c => c.id === cardId);
    if (!card) return [];

    const periodsSet = new Set();
    data.transactions.forEach(t => {
        if (t.accountId === cardId && t.type === 'expense') {
            periodsSet.add(getBillingPeriod(t.date, card.closingDay));
        }
    });

    periodsSet.add(getBillingPeriod(todayLocal(), card.closingDay));

    return Array.from(periodsSet)
        .sort()
        .reverse()
        .map(p => getCardBilling(data, cardId, p));
}

/** Total ainda comprometido no cartão por compras não pertencentes a faturas pagas. */
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
/**
 * Applies or reverts balance changes for a transaction.
 * Transferência conta -> cartão debita a origem apenas uma vez.
 */
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
    const parsed = parseFloat(amount);

    if (id) {
        const old = data.transactions.find(t => t.id === id);
        if (old) {
            revertTransactionBalances(data, old);
            _unlinkBillingPayment(data, old);
            Object.assign(old, {
                type,
                description,
                amount: parsed,
                date,
                accountId,
                category: category || 'Sem Categoria',
                destinationId: destinationId || null,
                recurring: !!recurring
            });
        }
    } else {
        data.transactions.push({
            id: generateId(),
            type,
            description,
            amount: parsed,
            date,
            accountId,
            category: category || 'Sem Categoria',
            currentInstallment: currentInstallment || 1,
            totalInstallments: totalInstallments || 1,
            groupId: groupId || null,
            destinationId: destinationId || null,
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

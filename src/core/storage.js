/**
 * Plannke — finance core compatibility surface
 *
 * This file intentionally contains no durable persistence. It owns the data
 * model and financial operations still used by the current UI. StorageAdapter
 * is the only persistence boundary and will be replaced by SQLite in Tauri.
 */

const DATA_SCHEMA_VERSION = 3;
const Money = globalThis.PlannkeMoney;
if (!Money) throw new Error('PlannkeMoney deve ser carregado antes do núcleo financeiro.');

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

function cloneData(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

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
    const absoluteMonth = Number(match[1]) * 12 + Number(match[2]) - 1 + Number(offset || 0);
    const year = Math.floor(absoluteMonth / 12);
    const month = ((absoluteMonth % 12) + 12) % 12 + 1;
    return makeClampedDate(year, month, Number(match[3]));
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
        return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m) ? makeClampedDate(y, m, d) : fallback;
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

/* ---------- Model normalization ---------- */
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
    const safe = String(value ?? '').trim().replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 128);
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

function financialError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
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
                if (safeGroup && Array.isArray(list)) expense[safeGroup] = [...new Set(list.map(c => sanitizePlainText(c, 100)).filter(Boolean))];
            });
        }
        settings.categories = { income, expense };
    }
    if (raw.budgets && typeof raw.budgets === 'object') {
        Object.entries(raw.budgets).forEach(([category, value]) => {
            const safeCategory = sanitizePlainText(category, 100);
            const amount = Number(value);
            if (!Number.isSafeInteger(amount)) throw financialError('INVALID_MONEY_VALUE', `Orçamento inválido para ${safeCategory}.`);
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
    const source = input && typeof input === 'object' ? input : {};
    const raw = Money.migrateDataToCents(source).data;
    const entityIds = new Set();
    const transactionIds = new Set();
    const entityMap = new Map();
    const txMap = new Map();

    const accounts = (Array.isArray(raw.accounts) ? raw.accounts : []).map((account, index) => {
        const oldId = String(account?.id ?? '');
        const id = _uniqueSafeId(oldId, entityIds, `acc${index + 1}`);
        entityMap.set(oldId, id);
        return { ...account, id, name: sanitizePlainText(account?.name, 120), balance: Money.assertCents(Number(account?.balance || 0), `accounts[${index}].balance`), status: account?.status === 'archived' ? 'archived' : 'active' };
    });

    const cards = (Array.isArray(raw.cards) ? raw.cards : []).map((card, index) => {
        const oldId = String(card?.id ?? '');
        const id = _uniqueSafeId(oldId, entityIds, `card${index + 1}`);
        entityMap.set(oldId, id);
        return {
            ...card,
            id,
            name: sanitizePlainText(card?.name, 120),
            limit: Math.max(Money.assertCents(Number(card?.limit || 0), `cards[${index}].limit`), 0),
            closingDay: clampDay(card?.closingDay, 1),
            dueDay: clampDay(card?.dueDay, 1),
            status: card?.status === 'archived' ? 'archived' : 'active'
        };
    });

    const transactions = (Array.isArray(raw.transactions) ? raw.transactions : []).map((tx, index) => {
        const oldId = String(tx?.id ?? '');
        const id = _uniqueSafeId(oldId, transactionIds, `tx${index + 1}`);
        txMap.set(oldId, id);
        return {
            ...tx,
            id,
            type: ['income', 'expense', 'transfer'].includes(tx?.type) ? tx.type : 'expense',
            description: sanitizePlainText(tx?.description, 300),
            category: sanitizePlainText(tx?.category || 'Sem Categoria', 100),
            amount: Math.abs(Money.assertCents(Number(tx?.amount || 0), `transactions[${index}].amount`)),
            date: normalizeDateString(tx?.date, ''),
            accountId: entityMap.get(String(tx?.accountId ?? '')) || sanitizeIdentifier(tx?.accountId),
            destinationId: tx?.destinationId ? (entityMap.get(String(tx.destinationId)) || sanitizeIdentifier(tx.destinationId)) : null,
            currentInstallment: Math.max(parseInt(tx?.currentInstallment, 10) || 1, 1),
            totalInstallments: Math.max(parseInt(tx?.totalInstallments, 10) || 1, 1),
            groupId: tx?.groupId ? sanitizeIdentifier(tx.groupId) : null,
            recurring: !!tx?.recurring,
            billingCardId: tx?.billingCardId ? (entityMap.get(String(tx.billingCardId)) || sanitizeIdentifier(tx.billingCardId)) : undefined,
            billingPeriod: /^\d{4}-(0[1-9]|1[0-2])$/.test(String(tx?.billingPeriod || '')) ? String(tx.billingPeriod) : undefined
        };
    }).filter(tx => tx.date && tx.amount > 0);

    const cardBillings = (Array.isArray(raw.cardBillings) ? raw.cardBillings : []).map(billing => ({
        ...billing,
        cardId: entityMap.get(String(billing?.cardId ?? '')) || sanitizeIdentifier(billing?.cardId),
        period: /^\d{4}-(0[1-9]|1[0-2])$/.test(String(billing?.period || '')) ? String(billing.period) : '',
        isPaid: !!billing?.isPaid,
        paidAmount: billing?.paidAmount == null ? null : Math.max(Money.assertCents(Number(billing.paidAmount), 'cardBillings.paidAmount'), 0),
        paidAt: billing?.paidAt ? normalizeDateString(billing.paidAt, null) : null,
        fromAccountId: billing?.fromAccountId ? (entityMap.get(String(billing.fromAccountId)) || sanitizeIdentifier(billing.fromAccountId)) : null,
        paymentTransactionId: billing?.paymentTransactionId ? (txMap.get(String(billing.paymentTransactionId)) || sanitizeIdentifier(billing.paymentTransactionId)) : null
    })).filter(billing => billing.cardId && billing.period);

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

/* ---------- In-memory fallback ----------
   Used only before StorageAdapter takes ownership during boot. */
let _fallbackData = normalizeData(defaultData);

function getData() {
    return cloneData(_fallbackData);
}

function _markDataDirty() {
    try {
        if (typeof globalThis.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
            globalThis.dispatchEvent(new CustomEvent('plannke:data-changed'));
        }
    } catch (_) {}
}

function saveData(data) {
    _fallbackData = normalizeData(data);
    _markDataDirty();
    return cloneData(_fallbackData);
}

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
    const parsed = Money.assertCents(Number(balance || 0), 'account.balance');
    if (id) {
        const item = data.accounts.find(account => account.id === id);
        if (item) {
            const currentBalance = Money.assertCents(Number(item.balance || 0), 'account.balance');
            const openingBalance = Number.isSafeInteger(Number(item.openingBalance)) ? Number(item.openingBalance) : currentBalance;
            item.name = sanitizePlainText(name, 120);
            item.openingBalance = openingBalance + (parsed - currentBalance);
            item.balance = parsed;
        }
    } else {
        data.accounts.push({ id: generateId(), name: sanitizePlainText(name, 120), openingBalance: parsed, balance: parsed });
    }
    saveData(data);
}

function deleteAccount(id) {
    const data = getData();
    const account = data.accounts.find(item => item.id === id);
    if (!account) throw financialError('ACCOUNT_NOT_FOUND', 'Conta não encontrada.');
    const hasHistory = data.transactions.some(tx => tx.accountId === id || tx.destinationId === id)
        || (data.cardBillings || []).some(billing => billing.fromAccountId === id);
    if (hasHistory) account.status = 'archived';
    else data.accounts = data.accounts.filter(item => item.id !== id);
    saveData(data);
    return hasHistory ? 'archived' : 'deleted';
}

/* ---------- Cards ---------- */
function saveCard(id, name, limit, closingDay, dueDay) {
    const data = getData();
    if (id) {
        const item = data.cards.find(card => card.id === id);
        if (item) {
            item.name = sanitizePlainText(name, 120);
            item.limit = Math.max(Money.assertCents(Number(limit || 0), 'card.limit'), 0);
            item.closingDay = clampDay(closingDay, 1);
            item.dueDay = clampDay(dueDay, 1);
        }
    } else {
        data.cards.push({
            id: generateId(),
            name: sanitizePlainText(name, 120),
            limit: Math.max(Money.assertCents(Number(limit || 0), 'card.limit'), 0),
            closingDay: clampDay(closingDay, 1),
            dueDay: clampDay(dueDay, 1)
        });
    }
    saveData(data);
}

function deleteCard(id) {
    const data = getData();
    const card = data.cards.find(item => item.id === id);
    if (!card) throw financialError('CARD_NOT_FOUND', 'Cartão não encontrado.');
    const hasHistory = data.transactions.some(tx => tx.accountId === id || tx.destinationId === id || tx.billingCardId === id)
        || (data.cardBillings || []).some(billing => billing.cardId === id);
    if (hasHistory) card.status = 'archived';
    else data.cards = data.cards.filter(item => item.id !== id);
    saveData(data);
    return hasHistory ? 'archived' : 'deleted';
}

/* ---------- Credit-card billing ---------- */
function getBillingPeriod(dateStr, closingDay) {
    const [year, month, day] = String(dateStr || '').split('-').map(Number);
    if (!year || !month || !day) return '';
    if (day > closingDay) return `${year}-${String(month).padStart(2, '0')}`;
    const date = new Date(year, month - 2, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getCardBilling(data, cardId, period) {
    const card = data.cards.find(item => item.id === cardId);
    if (!card) return null;
    const transactions = data.transactions.filter(tx => tx.accountId === cardId && tx.type === 'expense' && getBillingPeriod(tx.date, card.closingDay) === period);
    const total = transactions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const [year, month] = period.split('-').map(Number);
    const dueBase = new Date(year, month, 1);
    const dueDate = makeClampedDate(dueBase.getFullYear(), dueBase.getMonth() + 1, card.dueDay);
    const billing = (data.cardBillings || []).find(item => item.cardId === cardId && item.period === period);
    return {
        period,
        total,
        transactions,
        isPaid: billing?.isPaid || false,
        dueDate,
        paidAt: billing?.paidAt || null,
        paidAmount: billing?.paidAmount ?? null,
        fromAccountId: billing?.fromAccountId ?? null,
        paymentTransactionId: billing?.paymentTransactionId ?? null
    };
}

function getAllCardBillings(data, cardId) {
    const card = data.cards.find(item => item.id === cardId);
    if (!card) return [];
    const periods = new Set();
    data.transactions.forEach(tx => {
        if (tx.accountId === cardId && tx.type === 'expense') periods.add(getBillingPeriod(tx.date, card.closingDay));
    });
    periods.add(getBillingPeriod(todayLocal(), card.closingDay));
    return [...periods].filter(Boolean).sort().reverse().map(period => getCardBilling(data, cardId, period));
}

function getOutstandingCardBalance(data, cardId) {
    const card = data.cards.find(item => item.id === cardId);
    if (!card) return 0;
    return data.transactions
        .filter(tx => tx.accountId === cardId && tx.type === 'expense')
        .filter(tx => {
            const period = getBillingPeriod(tx.date, card.closingDay);
            return !(data.cardBillings || []).find(billing => billing.cardId === cardId && billing.period === period)?.isPaid;
        })
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
}

/* ---------- Balance helpers ---------- */
function _adjustBalances(data, type, amount, accountId, destinationId, sign) {
    const parsedAmount = Money.assertCents(Number(amount || 0), 'transaction.amount');
    const isCardAccount = data.cards.some(card => card.id === accountId);
    const isCardDestination = data.cards.some(card => card.id === destinationId);
    if (!isCardAccount) {
        const account = data.accounts.find(item => item.id === accountId);
        if (account) {
            if (type === 'income') account.balance += sign * parsedAmount;
            if (type === 'expense' || type === 'transfer') account.balance -= sign * parsedAmount;
        }
    }
    if (type === 'transfer' && destinationId && !isCardDestination) {
        const destination = data.accounts.find(item => item.id === destinationId);
        if (destination) destination.balance += sign * parsedAmount;
    }
}

function revertTransactionBalances(data, tx) {
    if (tx) _adjustBalances(data, tx.type, tx.amount, tx.accountId, tx.destinationId, -1);
}

function applyTransactionBalances(data, type, amount, accountId, destinationId) {
    _adjustBalances(data, type, amount, accountId, destinationId, 1);
}

function _validateTransactionReferences(data, type, accountId, destinationId) {
    const source = [...data.accounts, ...data.cards].find(item => item.id === accountId);
    if (!source) throw financialError('ACCOUNT_NOT_FOUND', 'Conta ou cartão de origem não encontrado.');
    if (source.status === 'archived') throw financialError('ENTITY_ARCHIVED', 'Entidade financeira arquivada não aceita novos lançamentos.');
    if (type !== 'transfer') return;
    const destination = [...data.accounts, ...data.cards].find(item => item.id === destinationId);
    if (!destination) throw financialError('ACCOUNT_NOT_FOUND', 'Conta ou cartão de destino não encontrado.');
    if (destination.status === 'archived') throw financialError('ENTITY_ARCHIVED', 'Entidade financeira arquivada não aceita novos lançamentos.');
    if (destination.id === source.id) throw financialError('INVALID_TRANSFER', 'Origem e destino da transferência devem ser diferentes.');
}

function _unlinkBillingPayment(data, tx) {
    if (!tx || tx.type !== 'transfer') return;
    const billing = (data.cardBillings || []).find(item => item.paymentTransactionId === tx.id || (tx.billingCardId && tx.billingPeriod && item.cardId === tx.billingCardId && item.period === tx.billingPeriod));
    if (!billing) return;
    billing.isPaid = false;
    billing.paidAt = null;
    billing.paidAmount = null;
    billing.fromAccountId = null;
    billing.paymentTransactionId = null;
}

function payCardBilling(cardId, period, fromAccountId, amount) {
    const data = getData();
    if (!Array.isArray(data.cardBillings)) data.cardBillings = [];
    const account = data.accounts.find(item => item.id === fromAccountId);
    if (!account) throw financialError('ACCOUNT_NOT_FOUND', 'Conta de origem não encontrada.');
    if (account.status === 'archived') throw financialError('ACCOUNT_ARCHIVED', 'Conta de origem está arquivada.');
    const card = data.cards.find(item => item.id === cardId);
    if (!card) throw financialError('CARD_NOT_FOUND', 'Cartão não encontrado.');
    if (card.status === 'archived') throw financialError('CARD_ARCHIVED', 'Cartão está arquivado.');
    const existing = data.cardBillings.find(billing => billing.cardId === cardId && billing.period === period);
    if (existing?.isPaid) throw financialError('BILLING_ALREADY_PAID', 'Fatura já foi paga.');
    const parsedAmount = Number(amount);
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) throw financialError('INVALID_AMOUNT', 'Valor de pagamento inválido.');
    const currentBilling = getCardBilling(data, cardId, period);
    if (!currentBilling || !currentBilling.transactions.length || currentBilling.total <= 0) {
        throw financialError('BILLING_NOT_FOUND', 'Fatura não encontrada.');
    }
    if (parsedAmount !== currentBilling.total) {
        throw financialError('INVALID_AMOUNT', 'O pagamento deve corresponder ao valor integral da fatura.');
    }
    const today = todayLocal();
    const paymentTransactionId = generateId();
    const payment = existing || { cardId, period };
    Object.assign(payment, {
        isPaid: true,
        paidAt: today,
        paidAmount: parsedAmount,
        fromAccountId,
        paymentTransactionId
    });
    if (!existing) data.cardBillings.push(payment);
    const [year, month] = period.split('-').map(Number);
    data.transactions.push({
        id: paymentTransactionId,
        type: 'transfer',
        description: sanitizePlainText(`Pagamento fatura ${card?.name || ''} ${MONTH_LABELS[month - 1]}/${year}`, 300),
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

/* ---------- Transactions ---------- */
function saveTransaction(id, type, description, amount, date, accountId, category, currentInstallment, totalInstallments, groupId, destinationId, recurring) {
    const data = getData();
    const parsed = Math.abs(Number(amount));
    if (!Number.isSafeInteger(parsed) || parsed <= 0) throw financialError('INVALID_AMOUNT', 'Valor de transação inválido.');
    let safeDate = normalizeDateString(date, '');
    if (!safeDate) throw new Error('Data de transação inválida.');
    const installmentNo = Math.max(parseInt(currentInstallment, 10) || 1, 1);
    const installmentsTotal = Math.max(parseInt(totalInstallments, 10) || 1, 1);
    const safeGroupId = groupId ? sanitizeIdentifier(groupId) : null;
    if (!id && safeGroupId && installmentNo > 1) {
        const anchor = data.transactions.find(tx => tx.groupId === safeGroupId && tx.currentInstallment === 1);
        if (anchor) safeDate = addMonthsClamped(anchor.date, installmentNo - 1);
    }
    const safeType = ['income', 'expense', 'transfer'].includes(type) ? type : 'expense';
    _validateTransactionReferences(data, safeType, accountId, destinationId);
    if (id) {
        const existing = data.transactions.find(tx => tx.id === id);
        if (!existing) throw financialError('TRANSACTION_NOT_FOUND', 'Transação não encontrada.');
        revertTransactionBalances(data, existing);
        _unlinkBillingPayment(data, existing);
        Object.assign(existing, {
                type: safeType,
                description: sanitizePlainText(description, 300),
                amount: parsed,
                date: safeDate,
                accountId: sanitizeIdentifier(accountId),
                category: sanitizePlainText(category || 'Sem Categoria', 100),
                destinationId: destinationId ? sanitizeIdentifier(destinationId) : null,
                recurring: !!recurring
        });
    } else {
        data.transactions.push({
            id: generateId(),
            type: safeType,
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
    applyTransactionBalances(data, safeType, parsed, accountId, destinationId);
    saveData(data);
}

function deleteTransaction(id) {
    const data = getData();
    const tx = data.transactions.find(item => item.id === id);
    if (tx) {
        revertTransactionBalances(data, tx);
        _unlinkBillingPayment(data, tx);
    }
    data.transactions = data.transactions.filter(item => item.id !== id);
    saveData(data);
}

function deleteInstallmentGroup(groupId) {
    const data = getData();
    data.transactions.filter(tx => tx.groupId === groupId).forEach(tx => {
        revertTransactionBalances(data, tx);
        _unlinkBillingPayment(data, tx);
    });
    data.transactions = data.transactions.filter(tx => tx.groupId !== groupId);
    saveData(data);
}

/* ---------- Formatters ---------- */
const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function formatCurrency(value) {
    return Money.formatMoney(Number(value || 0));
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = String(dateStr).split('-');
    return `${day}/${month}/${year}`;
}

function formatPeriod(periodStr) {
    const [year, month] = String(periodStr).split('-').map(Number);
    return `${MONTH_LABELS[month - 1]}/${year}`;
}

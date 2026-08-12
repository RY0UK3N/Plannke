const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(rootDir, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(rootDir, file), content);

function replaceOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`missing migration anchor: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`duplicate migration anchor: ${label}`);
  return source.slice(0, first) + to + source.slice(first + from.length);
}

function normalizeHousehold(data) {
    if (!data || typeof data !== 'object') return { enabled: false, members: [] };
    if (!data.settings || typeof data.settings !== 'object') data.settings = {};
    const raw = data.settings.household && typeof data.settings.household === 'object' ? data.settings.household : {};
    const ids = new Set();
    const members = (Array.isArray(raw.members) ? raw.members : []).map((member, index) => {
        let id = safeId(member?.id, `member${index + 1}`);
        while (ids.has(id)) id = safeId('', 'member');
        ids.add(id);
        return { id, name: cleanText(member?.name || `Pessoa ${index + 1}`, 80) };
    }).filter(member => member.name);
    data.settings.household = { enabled: !!raw.enabled || members.length > 0, members };
    return data.settings.household;
}

function sharedTransactionMeta(data) {
    if (!data.settings || typeof data.settings !== 'object') data.settings = {};
    if (!data.settings.sharedTransactionMeta || typeof data.settings.sharedTransactionMeta !== 'object') data.settings.sharedTransactionMeta = {};
    return data.settings.sharedTransactionMeta;
}

function restoreSharedTransactionMeta(data) {
    const meta = sharedTransactionMeta(data);
    let changed = false;
    (data.transactions || []).forEach(tx => {
        const saved = meta[tx.id];
        if (!saved || typeof saved !== 'object') return;
        if (!tx.paidByMemberId && saved.paidByMemberId) {
            tx.paidByMemberId = saved.paidByMemberId;
            changed = true;
        }
        if ((!Array.isArray(tx.sharedWithMemberIds) || !tx.sharedWithMemberIds.length) && Array.isArray(saved.sharedWithMemberIds)) {
            tx.sharedWithMemberIds = saved.sharedWithMemberIds.slice(0, 12);
            changed = true;
        }
    });
    return changed;
}

function snapshotSharedTransactionMeta(data) {
    if (!data.settings || typeof data.settings !== 'object') data.settings = {};
    const meta = {};
    (data.transactions || []).forEach(tx => {
        const shared = Array.isArray(tx.sharedWithMemberIds) ? tx.sharedWithMemberIds.slice(0, 12) : [];
        if (!tx.paidByMemberId && !shared.length) return;
        meta[tx.id] = { paidByMemberId: tx.paidByMemberId || null, sharedWithMemberIds: shared };
    });
    data.settings.sharedTransactionMeta = meta;
    normalizeHousehold(data);
    return data;
}

function recurringRuleSignature(rule) {
    return [
        rule?.type,
        cleanText(rule?.description, 160).toLowerCase(),
        cleanText(rule?.category, 100).toLowerCase(),
        toNumber(rule?.amount, 0).toFixed(2),
        rule?.accountId || ''
    ].join('|');
}

function migrateLegacyRecurring(data) {
    const planning = sanitizePlanning(ensurePlanning(data));
    const signatures = new Set(planning.recurringRules.map(recurringRuleSignature));
    let changed = false;
    (data.transactions || []).forEach(tx => {
        if (!tx.recurring || tx.type === 'transfer') return;
        const rule = {
            id: safeId('', 'rule'),
            type: tx.type,
            description: tx.description,
            category: tx.category || 'Outros',
            amount: toNumber(tx.amount, 0),
            dayOfMonth: Number(String(tx.date || '').slice(8, 10)) || 1,
            accountId: tx.accountId,
            startDate: tx.date,
            endDate: '',
            active: true
        };
        const signature = recurringRuleSignature(rule);
        if (!signatures.has(signature)) {
            planning.recurringRules.push(rule);
            signatures.add(signature);
        }
        tx.recurring = false;
        changed = true;
    });
    if (changed) data.planning = sanitizePlanning(planning);
    return changed;
}

function applyCategoryRulesToGenericTransactions(data) {
    const planning = sanitizePlanning(ensurePlanning(data));
    let changed = false;
    (data.transactions || []).forEach(tx => {
        if (tx.type === 'transfer' || !['Outros', 'Sem Categoria', '', null, undefined].includes(tx.category)) return;
        const next = applyCategoryRules(tx.description, tx.category || 'Outros', planning.categoryRules);
        if (next && next !== tx.category) {
            tx.category = next;
            changed = true;
        }
    });
    return changed;
}

function prepareProductData(data, today = localDateString()) {
    if (!data || typeof data !== 'object') return { data, changed: false };
    ensurePlanning(data);
    normalizeHousehold(data);
    const sharedChanged = restoreSharedTransactionMeta(data);
    const recurringChanged = migrateLegacyRecurring(data);
    const categoryChanged = applyCategoryRulesToGenericTransactions(data);
    const ledger = migrateLedger(data, today);
    data.planning = sanitizePlanning(data.planning);
    snapshotSharedTransactionMeta(data);
    return { data, changed: !!(sharedChanged || recurringChanged || categoryChanged || ledger.changed) };
}

function cleanProductText(value, max = 160) {
    const core = root.PlannkeCore;
    return core?.cleanText ? core.cleanText(value, max) : String(value ?? '').trim().slice(0, max);
}

function getHouseholdMembers() {
    const data = root.getData();
    const core = root.PlannkeCore;
    if (core?.normalizeHousehold) return core.normalizeHousehold(data).members || [];
    return Array.isArray(data.settings?.household?.members) ? data.settings.household.members : [];
}

function ensureTransactionMetadataFields() {
    if (typeof document === 'undefined' || byId('tx-status')) return;
    const dateGroup = byId('tx-date')?.closest('.mb-3');
    if (!dateGroup) return;

    const box = document.createElement('div');
    box.className = 'product-tx-extra';

    const row = document.createElement('div');
    row.className = 'row g-2 mb-3';

    const statusCol = document.createElement('div');
    statusCol.className = 'col-12 col-sm-5';
    const statusLabel = document.createElement('label');
    statusLabel.className = 'form-label text-muted small fw-semibold text-uppercase';
    statusLabel.textContent = 'Situação';
    const status = document.createElement('select');
    status.id = 'tx-status';
    status.className = 'form-select';
    appendOption(status, 'auto', 'Automático pela data');
    appendOption(status, 'completed', 'Realizada');
    appendOption(status, 'planned', 'Prevista');
    statusCol.append(statusLabel, status);

    const tagsCol = document.createElement('div');
    tagsCol.className = 'col-12 col-sm-7';
    const tagsLabel = document.createElement('label');
    tagsLabel.className = 'form-label text-muted small fw-semibold text-uppercase';
    tagsLabel.textContent = 'Tags';
    const tags = document.createElement('input');
    tags.id = 'tx-tags';
    tags.className = 'form-control';
    tags.placeholder = 'viagem, trabalho, férias';
    tags.autocomplete = 'off';
    tagsCol.append(tagsLabel, tags);
    row.append(statusCol, tagsCol);

    const details = document.createElement('details');
    details.id = 'tx-sharing-details';
    details.className = 'product-sharing-details mb-3';
    const summary = document.createElement('summary');
    const usersIcon = document.createElement('i');
    usersIcon.className = 'ph ph-users-three me-1';
    summary.append(usersIcon, document.createTextNode('Dividir este gasto'));

    const sharingRow = document.createElement('div');
    sharingRow.className = 'row g-2 mt-1';
    const paidCol = document.createElement('div');
    paidCol.className = 'col-12 col-sm-5';
    const paidLabel = document.createElement('label');
    paidLabel.className = 'form-label small text-muted';
    paidLabel.textContent = 'Pago por';
    const paid = document.createElement('select');
    paid.id = 'tx-paid-by';
    paid.className = 'form-select';
    paidCol.append(paidLabel, paid);

    const sharedCol = document.createElement('div');
    sharedCol.className = 'col-12 col-sm-7';
    const sharedLabel = document.createElement('label');
    sharedLabel.className = 'form-label small text-muted';
    sharedLabel.textContent = 'Dividir igualmente com';
    const shared = document.createElement('select');
    shared.id = 'tx-shared-with';
    shared.className = 'form-select';
    shared.multiple = true;
    shared.size = 3;
    sharedCol.append(sharedLabel, shared);
    sharingRow.append(paidCol, sharedCol);
    details.append(summary, sharingRow);

    box.append(row, details);
    dateGroup.after(box);
}

function refreshTransactionMemberFields(transaction = null, mode = 'new') {
    ensureTransactionMetadataFields();
    const paid = byId('tx-paid-by');
    const shared = byId('tx-shared-with');
    if (!paid || !shared) return;
    const members = getHouseholdMembers();
    paid.replaceChildren();
    shared.replaceChildren();
    appendOption(paid, '', 'Só eu / não dividir');
    members.forEach(member => {
        appendOption(paid, member.id, member.name);
        appendOption(shared, member.id, member.name);
    });
    const details = byId('tx-sharing-details');
    details?.classList.toggle('d-none', members.length < 2);
    if (mode === 'edit' && transaction) {
        paid.value = transaction.paidByMemberId || '';
        const selected = new Set(Array.isArray(transaction.sharedWithMemberIds) ? transaction.sharedWithMemberIds : []);
        [...shared.options].forEach(option => { option.selected = selected.has(option.value); });
    } else {
        paid.value = '';
        [...shared.options].forEach(option => { option.selected = false; });
    }
}

function resetTransactionMetadataFields() {
    ensureTransactionMetadataFields();
    if (byId('tx-status')) byId('tx-status').value = 'auto';
    if (byId('tx-tags')) byId('tx-tags').value = '';
    refreshTransactionMemberFields();
}

function populateTransactionMetadataFields(transaction, mode) {
    ensureTransactionMetadataFields();
    if (byId('tx-status')) byId('tx-status').value = mode === 'edit' ? (transaction?.status || 'auto') : 'auto';
    if (byId('tx-tags')) byId('tx-tags').value = Array.isArray(transaction?.tags) ? transaction.tags.join(', ') : '';
    refreshTransactionMemberFields(transaction, mode);
}

function applyCategorySuggestion() {
    const description = byId('tx-desc')?.value || '';
    const select = byId('tx-category');
    const core = root.PlannkeCore;
    if (!description || !select || !core?.applyCategoryRules) return;
    const data = root.getData();
    const planning = core.ensurePlanning(data);
    const suggested = core.applyCategoryRules(description, select.value || 'Outros', planning.categoryRules);
    if ([...select.options].some(option => option.value === suggested)) select.value = suggested;
}

function readTransactionMetadata() {
    ensureTransactionMetadataFields();
    return {
        status: byId('tx-status')?.value || 'auto',
        tags: String(byId('tx-tags')?.value || '').split(',').map(tag => cleanProductText(tag, 40)).filter(Boolean).slice(0, 10),
        paidByMemberId: byId('tx-paid-by')?.value || null,
        sharedWithMemberIds: [...(byId('tx-shared-with')?.selectedOptions || [])].map(option => option.value).filter(Boolean).slice(0, 12)
    };
}

function findSavedTransaction(data, args) {
    const [id, type, description, amount, , accountId, , currentInstallment, , groupId] = args;
    if (id) return data.transactions.find(transaction => transaction.id === id) || null;
    const core = root.PlannkeCore;
    const safeDescription = core?.cleanText ? core.cleanText(description, 300) : String(description || '').trim();
    return [...data.transactions].reverse().find(transaction =>
        transaction.type === type && transaction.description === safeDescription &&
        Math.abs(Number(transaction.amount) - Number(amount)) < 0.005 && transaction.accountId === accountId &&
        (!groupId || transaction.groupId === groupId) &&
        (!currentInstallment || Number(transaction.currentInstallment) === Number(currentInstallment))
    ) || null;
}

function applySavedTransactionMetadata(args, metadata) {
    const data = root.getData();
    const transaction = findSavedTransaction(data, args);
    if (!transaction) return;
    const core = root.PlannkeCore;
    const today = core?.localDateString ? core.localDateString() : todayLocal();
    transaction.status = ['completed', 'planned'].includes(metadata.status)
        ? metadata.status
        : (String(transaction.date || '') > today ? 'planned' : 'completed');
    transaction.tags = metadata.tags.slice(0, 10);
    transaction.paidByMemberId = metadata.paidByMemberId;
    transaction.sharedWithMemberIds = metadata.sharedWithMemberIds.slice(0, 12);
    if (args[11] && args[1] !== 'transfer') core?.migrateLegacyRecurring?.(data);
    root.saveData(data);
}

// --- ProductCore: move data-only product preparation into the domain core.
let core = read('product-core.js');
const coreHelpers = [
  normalizeHousehold,
  sharedTransactionMeta,
  restoreSharedTransactionMeta,
  snapshotSharedTransactionMeta,
  recurringRuleSignature,
  migrateLegacyRecurring,
  applyCategoryRulesToGenericTransactions,
  prepareProductData
].map(fn => `    ${fn.toString().replace(/\n/g, '\n    ')}`).join('\n\n');
core = replaceOnce(core, '    return {\n', `${coreHelpers}\n\n    return {\n`, 'product core return');
core = replaceOnce(
  core,
  '        ensurePlanning,\n        sanitizePlanning,\n',
  '        ensurePlanning,\n        sanitizePlanning,\n        normalizeHousehold,\n        sharedTransactionMeta,\n        restoreSharedTransactionMeta,\n        snapshotSharedTransactionMeta,\n        recurringRuleSignature,\n        migrateLegacyRecurring,\n        applyCategoryRulesToGenericTransactions,\n        prepareProductData,\n',
  'product core exports'
);
write('product-core.js', core);

// --- StorageAdapter: make the persistence boundary run domain preparation.
let adapter = read('storage-adapter.js');
adapter = replaceOnce(
  adapter,
  "    function normalize(value) {\n        if (typeof root.normalizeData === 'function') return root.normalizeData(value);\n        return value && typeof value === 'object' ? clone(value) : null;\n    }\n",
  "    function normalize(value) {\n        const normalized = typeof root.normalizeData === 'function'\n            ? root.normalizeData(value)\n            : (value && typeof value === 'object' ? clone(value) : null);\n        if (!normalized) return null;\n        const prepare = root.PlannkeCore?.prepareProductData;\n        if (typeof prepare !== 'function') return normalized;\n        const prepared = prepare(normalized);\n        return prepared?.data || normalized;\n    }\n",
  'storage adapter normalize'
);
write('storage-adapter.js', adapter);

// --- Load pure domain core before app-boot starts StorageAdapter.
let index = read('index.html');
index = replaceOnce(index, '    <script src="storage.js"></script>\n', '    <script src="storage.js"></script>\n    <script src="product-core.js"></script>\n', 'early product core');
index = replaceOnce(index, '    <script src="safe-renderers.js"></script>\n    <script src="product-core.js"></script>\n', '    <script src="safe-renderers.js"></script>\n', 'old product core position');
write('index.html', index);

// --- Finance core: account edits own opening-balance semantics directly.
let storage = read('storage.js');
storage = replaceOnce(
  storage,
  "function saveAccount(id, name, balance) {\n    const data = getData();\n    const parsed = finiteNumber(balance, 0);\n    if (id) {\n        const item = data.accounts.find(account => account.id === id);\n        if (item) { item.name = sanitizePlainText(name, 120); item.balance = parsed; }\n    } else {\n        data.accounts.push({ id: generateId(), name: sanitizePlainText(name, 120), balance: parsed });\n    }\n    saveData(data);\n}\n",
  "function saveAccount(id, name, balance) {\n    const data = getData();\n    const parsed = finiteNumber(balance, 0);\n    if (id) {\n        const item = data.accounts.find(account => account.id === id);\n        if (item) {\n            const currentBalance = finiteNumber(item.balance, 0);\n            const openingBalance = Number.isFinite(Number(item.openingBalance)) ? finiteNumber(item.openingBalance, currentBalance) : currentBalance;\n            item.name = sanitizePlainText(name, 120);\n            item.openingBalance = openingBalance + (parsed - currentBalance);\n            item.balance = parsed;\n        }\n    } else {\n        data.accounts.push({ id: generateId(), name: sanitizePlainText(name, 120), openingBalance: parsed, balance: parsed });\n    }\n    saveData(data);\n}\n",
  'saveAccount opening balance'
);
write('storage.js', storage);

// --- Transactions: canonical UI owns status/tags/sharing and post-save metadata.
let transactions = read('app-transactions.js');
const txHelpers = [
  cleanProductText,
  getHouseholdMembers,
  ensureTransactionMetadataFields,
  refreshTransactionMemberFields,
  resetTransactionMetadataFields,
  populateTransactionMetadataFields,
  applyCategorySuggestion,
  readTransactionMetadata,
  findSavedTransaction,
  applySavedTransactionMetadata
].map(fn => `    ${fn.toString().replace(/\n/g, '\n    ')}`).join('\n\n');
transactions = replaceOnce(transactions, '    function populateEntitySelect(select, data, selectedValue = \'\') {\n', `${txHelpers}\n\n    function populateEntitySelect(select, data, selectedValue = '') {\n`, 'transaction metadata helpers');
transactions = replaceOnce(
  transactions,
  "        const type = checked.value;\n",
  "        const type = checked.value;\n        ensureTransactionMetadataFields();\n",
  'metadata fields before transaction type UI'
);
transactions = replaceOnce(
  transactions,
  "        populateAccountDropdowns();\n        if (byId('tx-date')) byId('tx-date').value = todayLocal();\n",
  "        populateAccountDropdowns();\n        resetTransactionMetadataFields();\n        if (byId('tx-date')) byId('tx-date').value = todayLocal();\n",
  'new transaction metadata reset'
);
transactions = replaceOnce(
  transactions,
  "        root.clearFormError?.();\n    }\n\n    function bindTransactionControls() {\n",
  "        resetTransactionMetadataFields();\n        root.clearFormError?.();\n    }\n\n    function bindTransactionControls() {\n",
  'modal metadata reset'
);
transactions = replaceOnce(
  transactions,
  "        controlsBound = true;\n\n        ['type-income', 'type-expense', 'type-transfer', 'tx-is-installment', 'tx-account'].forEach(id => {\n",
  "        controlsBound = true;\n        ensureTransactionMetadataFields();\n        refreshTransactionMemberFields();\n\n        ['type-income', 'type-expense', 'type-transfer', 'tx-is-installment', 'tx-account'].forEach(id => {\n",
  'bind metadata fields'
);
transactions = replaceOnce(
  transactions,
  "        byId('tx-date')?.addEventListener('click', event => {\n            try { event.currentTarget?.showPicker?.(); } catch (_) {}\n        });\n",
  "        byId('tx-date')?.addEventListener('click', event => {\n            try { event.currentTarget?.showPicker?.(); } catch (_) {}\n        });\n        byId('tx-desc')?.addEventListener('blur', applyCategorySuggestion);\n",
  'category suggestion listener'
);
transactions = replaceOnce(
  transactions,
  "        byId('transactionModal')?.addEventListener('hidden.bs.modal', resetTransactionModal);\n",
  "        byId('transactionModal')?.addEventListener('show.bs.modal', () => refreshTransactionMemberFields());\n        byId('transactionModal')?.addEventListener('hidden.bs.modal', resetTransactionModal);\n",
  'transaction modal member refresh'
);
transactions = replaceOnce(
  transactions,
  "        try {\n            if (id) {\n",
  "        const metadata = readTransactionMetadata();\n        const persistTransaction = (...args) => {\n            root.saveTransaction(...args);\n            applySavedTransactionMetadata(args, metadata);\n        };\n\n        try {\n            if (id) {\n",
  'transaction metadata persistence helper'
);
const saveCalls = (transactions.match(/root\.saveTransaction\(/g) || []).length;
if (saveCalls !== 4) throw new Error(`expected 4 root.saveTransaction calls after helper insertion, found ${saveCalls}`);
// Keep the one call inside persistTransaction; replace the remaining three form calls.
let firstSave = transactions.indexOf('root.saveTransaction(');
let cursor = firstSave + 'root.saveTransaction('.length;
for (let i = 0; i < 3; i++) {
  const next = transactions.indexOf('root.saveTransaction(', cursor);
  if (next < 0) throw new Error('missing transaction save call for canonical metadata');
  transactions = transactions.slice(0, next) + 'persistTransaction(' + transactions.slice(next + 'root.saveTransaction('.length);
  cursor = next + 'persistTransaction('.length;
}
transactions = replaceOnce(
  transactions,
  "        if (byId('tx-is-recurring')) byId('tx-is-recurring').checked = !!transaction.recurring;\n        if (byId('tx-modal-title')) byId('tx-modal-title').textContent = mode === 'edit' ? 'Editar Transação' : 'Duplicar Transação';\n",
  "        if (byId('tx-is-recurring')) byId('tx-is-recurring').checked = !!transaction.recurring;\n        populateTransactionMetadataFields(transaction, mode);\n        if (byId('tx-modal-title')) byId('tx-modal-title').textContent = mode === 'edit' ? 'Editar Transação' : 'Duplicar Transação';\n",
  'edit duplicate metadata population'
);
transactions = replaceOnce(
  transactions,
  "        saveTransactionForm,\n        buildInstallmentDates,\n",
  "        saveTransactionForm,\n        ensureTransactionMetadataFields,\n        refreshTransactionMemberFields,\n        readTransactionMetadata,\n        applySavedTransactionMetadata,\n        buildInstallmentDates,\n",
  'transaction metadata API exports'
);
write('app-transactions.js', transactions);

// --- Product compatibility layer loses all ledger/transaction ownership.
let product = read('product.js');
const removeStart = product.indexOf('\n    function householdData(data) {');
const removeEnd = product.indexOf('\n    function patchRenderers() {', removeStart);
if (removeStart < 0 || removeEnd < 0) throw new Error('product ledger/transaction block not found');
product = product.slice(0, removeStart) + '\n\n' + product.slice(removeEnd);
product = replaceOnce(
  product,
  "        if(initialized)return;initialized=true;installLedgerHooks();injectTransactionFields();patchRenderers();maybeShowOnboarding();try{renderAll();}catch(err){console.warn('Atualização visual do produto:',err);}\n",
  "        if(initialized)return;initialized=true;patchRenderers();maybeShowOnboarding();try{renderAll();}catch(err){console.warn('Atualização visual do produto:',err);}\n",
  'product init after ledger retirement'
);
write('product.js', product);

// --- Historical contracts follow the new ownership/load order.
let security = read('tests/security-shell.test.js');
security = replaceOnce(
  security,
  "  assert.ok(index.indexOf('app-boot.js') < index.indexOf('safe-renderers.js'));\n  assert.ok(index.indexOf('safe-renderers.js') < index.indexOf('product-core.js'));\n  assert.ok(index.indexOf('product-core.js') < index.indexOf('product.js'));\n",
  "  assert.ok(index.indexOf('storage.js') < index.indexOf('product-core.js'));\n  assert.ok(index.indexOf('product-core.js') < index.indexOf('app-boot.js'));\n  assert.ok(index.indexOf('app-boot.js') < index.indexOf('safe-renderers.js'));\n  assert.ok(index.indexOf('safe-renderers.js') < index.indexOf('product.js'));\n",
  'security shell core load order'
);
write('tests/security-shell.test.js', security);

let navRetirement = read('tests/product-navigation-retirement.test.js');
navRetirement = replaceOnce(
  navRetirement,
  "  assert.match(product, /installLedgerHooks\\(\\);injectTransactionFields\\(\\);patchRenderers\\(\\);maybeShowOnboarding\\(\\);/);\n",
  "  assert.match(product, /patchRenderers\\(\\);maybeShowOnboarding\\(\\);/);\n  assert.doesNotMatch(product, /installLedgerHooks\\(\\)|injectTransactionFields\\(\\)/);\n",
  'product init after ledger cut'
);
write('tests/product-navigation-retirement.test.js', navRetirement);

const regression = `const test = require('node:test');\nconst assert = require('node:assert/strict');\nconst fs = require('node:fs');\nconst path = require('node:path');\n\nconst root = path.resolve(__dirname, '..');\nconst index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');\nconst product = fs.readFileSync(path.join(root, 'product.js'), 'utf8');\nconst coreSource = fs.readFileSync(path.join(root, 'product-core.js'), 'utf8');\nconst adapter = fs.readFileSync(path.join(root, 'storage-adapter.js'), 'utf8');\nconst storage = fs.readFileSync(path.join(root, 'storage.js'), 'utf8');\nconst transactions = fs.readFileSync(path.join(root, 'app-transactions.js'), 'utf8');\nconst core = require('../product-core.js');\n\ntest('product core loads before StorageAdapter boot and owns product data preparation', () => {\n  assert.ok(index.indexOf('product-core.js') < index.indexOf('app-boot.js'));\n  assert.match(coreSource, /function prepareProductData\\(/);\n  assert.match(coreSource, /function normalizeHousehold\\(/);\n  assert.match(coreSource, /function migrateLegacyRecurring\\(/);\n  assert.match(coreSource, /function snapshotSharedTransactionMeta\\(/);\n  assert.match(adapter, /root\\.PlannkeCore\\?\\.prepareProductData/);\n});\n\ntest('canonical finance core owns opening balance changes without product wrappers', () => {\n  assert.match(storage, /item\\.openingBalance = openingBalance \\+ \\(parsed - currentBalance\\)/);\n  assert.match(storage, /openingBalance: parsed, balance: parsed/);\n  assert.doesNotMatch(product, /function installLedgerHooks\\(|__productWrapped|globalThis\\.saveAccount =|globalThis\\.saveTransaction =/);\n});\n\ntest('canonical transaction runtime owns status tags and household sharing with DOM APIs', () => {\n  ['tx-status', 'tx-tags', 'tx-paid-by', 'tx-shared-with'].forEach(id => assert.ok(transactions.includes(id), 'missing ' + id));\n  assert.match(transactions, /function ensureTransactionMetadataFields\\(/);\n  assert.match(transactions, /function applySavedTransactionMetadata\\(/);\n  assert.match(transactions, /replaceChildren\\(\\)/);\n  assert.doesNotMatch(transactions, /\\.innerHTML\\s*=/);\n  assert.doesNotMatch(product, /tx-status|tx-tags|tx-paid-by|tx-shared-with|function injectTransactionFields\\(/);\n});\n\ntest('product data preparation migrates recurring items and preserves sharing metadata', () => {\n  const data = {\n    accounts: [{ id: 'a', name: 'Conta', balance: 100, openingBalance: 100 }],\n    cards: [], cardBillings: [],\n    transactions: [{ id: 't', type: 'expense', description: 'Academia', category: 'Outros', amount: 20, date: '2026-08-10', accountId: 'a', recurring: true, paidByMemberId: 'm1', sharedWithMemberIds: ['m2'] }],\n    settings: { household: { members: [{ id: 'm1', name: 'A' }, { id: 'm2', name: 'B' }] } },\n    planning: { goals: [], reserves: [], recurringRules: [], categoryRules: [], onboardingComplete: false }\n  };\n  const result = core.prepareProductData(data, '2026-08-12');\n  assert.equal(result.data.transactions[0].recurring, false);\n  assert.equal(result.data.planning.recurringRules.length, 1);\n  assert.deepEqual(result.data.settings.sharedTransactionMeta.t, { paidByMemberId: 'm1', sharedWithMemberIds: ['m2'] });\n  assert.equal(result.data.accounts[0].balance, 80);\n});\n\ntest('one-time product ledger migration artifacts are not shipped', () => {\n  assert.equal(fs.existsSync(path.join(root, 'scripts', 'promote-product-ledger-once.js')), false);\n  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'promote-product-ledger-once.yml')), false);\n});\n`;
write('tests/product-ledger-retirement.test.js', regression);

fs.rmSync(path.join(rootDir, 'scripts', 'promote-product-ledger-once.js'));
fs.rmSync(path.join(rootDir, '.github', 'workflows', 'promote-product-ledger-once.yml'));
console.log('[product ledger] domain preparation moved to ProductCore/StorageAdapter and transaction metadata moved to app-transactions');

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const transactionsPath = path.join(root, 'app-transactions.js');
const actionsPath = path.join(root, 'app-actions.js');
const workflowPath = path.join(root, '.github', 'workflows', 'bind-transaction-controls-once.yml');
const selfPath = __filename;

function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing exact marker for ${label}`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Multiple exact markers for ${label}`);
  return source.replace(before, after);
}

let html = fs.readFileSync(htmlPath, 'utf8');
[
  'type-income', 'type-expense', 'type-transfer'
].forEach(id => {
  html = replaceExact(
    html,
    `id="${id}" value="${id.replace('type-', '')}" autocomplete="off" data-plannke-onchange="toggleInstallmentField()"`,
    `id="${id}" value="${id.replace('type-', '')}" autocomplete="off"`,
    `${id} change action`
  );
});
html = replaceExact(
  html,
  `<button type="button" class="btn-manage-cats" data-plannke-onclick="openCategoryManager()" title="Gerenciar categorias">`,
  `<button type="button" class="btn-manage-cats" id="tx-manage-categories" title="Gerenciar categorias">`,
  'transaction category manager'
);
html = replaceExact(
  html,
  `id="tx-is-installment" data-plannke-onchange="toggleInstallmentField()"`,
  `id="tx-is-installment"`,
  'installment toggle action'
);
html = replaceExact(
  html,
  `id="tx-installments" class="form-control" min="2" max="120" value="2" data-plannke-oninput="updateInstallmentHelper()"`,
  `id="tx-installments" class="form-control" min="2" max="120" value="2"`,
  'installment count action'
);
html = replaceExact(
  html,
  `id="tx-date" class="form-control" required data-plannke-onclick="this.showPicker()"`,
  `id="tx-date" class="form-control" required`,
  'transaction date picker action'
);
html = replaceExact(
  html,
  `id="tx-account" class="form-select" required data-plannke-onchange="toggleInstallmentField()"`,
  `id="tx-account" class="form-select" required`,
  'transaction account action'
);

const txStart = html.indexOf('<div class="modal fade" id="transactionModal"');
const txEnd = html.indexOf('<div class="modal fade" id="accountModal"', txStart);
if (txStart < 0 || txEnd < 0) throw new Error('Transaction modal markers missing after migration.');
if (/data-plannke-(?:onclick|onchange|oninput)=/.test(html.slice(txStart, txEnd))) {
  throw new Error('Compatibility action survived transaction modal migration.');
}
fs.writeFileSync(htmlPath, html);

let transactions = fs.readFileSync(transactionsPath, 'utf8');
transactions = replaceExact(
  transactions,
  `    let formsBound = false;\n    let modalEventsBound = false;\n`,
  `    let formsBound = false;\n    let modalEventsBound = false;\n    let controlsBound = false;\n`,
  'transaction control state'
);
const binder = `    function bindTransactionControls() {\n        if (controlsBound || typeof document === 'undefined') return;\n        controlsBound = true;\n\n        ['type-income', 'type-expense', 'type-transfer', 'tx-is-installment', 'tx-account'].forEach(id => {\n            byId(id)?.addEventListener('change', toggleInstallmentField);\n        });\n        byId('tx-installments')?.addEventListener('input', updateInstallmentHelper);\n        byId('tx-manage-categories')?.addEventListener('click', () => root.openCategoryManager?.());\n        byId('tx-date')?.addEventListener('click', event => {\n            try { event.currentTarget?.showPicker?.(); } catch (_) {}\n        });\n    }\n\n`;
transactions = replaceExact(
  transactions,
  `    function setupModalEvents() {\n`,
  `${binder}    function setupModalEvents() {\n`,
  'transaction control binder'
);
transactions = replaceExact(
  transactions,
  `        setupModalEvents,\n        openTxModal,\n`,
  `        setupModalEvents,\n        bindTransactionControls,\n        openTxModal,\n`,
  'transaction control API'
);
transactions = replaceExact(
  transactions,
  `    root.PlannkeTransactions = api;\n`,
  `    root.PlannkeTransactions = api;\n    bindTransactionControls();\n`,
  'transaction control boot binding'
);
fs.writeFileSync(transactionsPath, transactions);

let actions = fs.readFileSync(actionsPath, 'utf8');
actions = replaceExact(
  actions,
  `        'openCategoryManager',\n        'switchCatTabModal', 'addCustomCategoryModal',\n        'toggleTheme', 'switchCatTab', 'addCustomCategory', 'confirmClearData',\n        'toggleInstallmentField', 'updateInstallmentHelper',\n`,
  `        'switchCatTabModal', 'addCustomCategoryModal',\n        'toggleTheme', 'switchCatTab', 'addCustomCategory', 'confirmClearData',\n`,
  'transaction compatibility allowlist'
);
actions = replaceExact(actions, `        if (/^this\\.showPicker\\(\\);?$/.test(value)) return 'show-picker';\n`, '', 'show-picker special kind');
actions = replaceExact(
  actions,
  `        if (kind === 'show-picker') {\n            if (typeof element?.showPicker === 'function') element.showPicker();\n            return true;\n        }\n`,
  '',
  'show-picker dispatch'
);
if (/show-picker|this\\\.showPicker/.test(actions)) throw new Error('show-picker compatibility survived app-actions.js');
fs.writeFileSync(actionsPath, actions);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}
console.log('Bound transaction form controls explicitly and retired their compatibility routes.');

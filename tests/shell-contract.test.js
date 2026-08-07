const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function idsIn(html) {
  return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
}

const ids = idsIn(index);

const CORE_IDS = [
  'dashboard-view', 'movimentacao-view', 'projecao-view', 'accounts-view', 'backup-view',
  'total-balance', 'total-income', 'total-expense', 'quick-accounts-list', 'summaryChart',
  'monthlyComparisonChart', 'recent-transactions', 'upcoming-expenses', 'budget-list',
  'tx-filter', 'tx-filter-category', 'tx-filter-account', 'tx-search', 'tx-search-clear',
  'tx-result-count', 'all-transactions-body', 'all-transactions-mobile', 'sankeyChart',
  'projectionChart', 'projection-summary-list', 'accounts-grid', 'cards-grid', 'toast-container',
  'transactionModal', 'transactionForm', 'tx-id', 'tx-desc', 'tx-category', 'tx-amount',
  'tx-date', 'tx-account', 'tx-destination', 'tx-fields-wrapper', 'tx-is-installment',
  'tx-is-recurring', 'tx-installments', 'accountModal', 'accountForm', 'acc-id', 'acc-name',
  'acc-balance', 'cardModal', 'cardForm', 'card-id', 'card-name', 'card-limit', 'card-closing',
  'card-due', 'welcomeModal', 'entityDetailModal', 'detail-period-select', 'detail-tx-list',
  'detail-pay-acc-select', 'detail-pay-btn', 'categoryModal', 'budgetModal', 'settingsOffcanvas',
  'deleteConfirmModal', 'delete-confirm-btn', 'shortcutsModal', 'excelUpload', 'mobile-tab-bar'
];

test('application shell preserves every core element required by the runtime', () => {
  const missing = CORE_IDS.filter(id => !ids.has(id));
  assert.deepEqual(missing, []);
});

test('core IDs are unique in the application shell', () => {
  const all = [...index.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const duplicates = [...new Set(all.filter((id, i) => all.indexOf(id) !== i))];
  assert.deepEqual(duplicates, []);
});

test('all five primary views remain addressable by data-target navigation', () => {
  ['dashboard', 'movimentacao', 'projecao', 'accounts', 'backup'].forEach(target => {
    assert.match(index, new RegExp(`data-target="${target}"`));
    assert.ok(ids.has(`${target}-view`));
  });
});

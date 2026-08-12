const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const transactions = fs.readFileSync(path.join(root, 'src', 'app', 'app-transactions.js'), 'utf8');

function transactionMarkup() {
  const start = html.indexOf('<div class="modal fade" id="transactionModal"');
  const end = html.indexOf('<div class="modal fade" id="accountModal"', start);
  assert.ok(start >= 0 && end > start, 'transaction modal markers must exist');
  return html.slice(start, end);
}

test('transaction form static controls have no compatibility attributes', () => {
  const markup = transactionMarkup();
  assert.doesNotMatch(markup, /data-plannke-(?:onclick|onchange|oninput)=/);
  assert.match(markup, /id="tx-manage-categories"/);
});

test('app-transactions binds its static controls exactly once', () => {
  assert.match(transactions, /let controlsBound = false/);
  assert.match(transactions, /function bindTransactionControls\(/);
  assert.match(transactions, /if \(controlsBound \|\| typeof document === 'undefined'\) return/);
  assert.match(transactions, /\['type-income', 'type-expense', 'type-transfer', 'tx-is-installment', 'tx-account'\]/);
  assert.match(transactions, /addEventListener\('change', toggleInstallmentField\)/);
  assert.match(transactions, /byId\('tx-installments'\)\?\.addEventListener\('input', updateInstallmentHelper\)/);
  assert.match(transactions, /byId\('tx-manage-categories'\)\?\.addEventListener\('click', \(\) => root\.openCategoryManager\?\.\(\)\)/);
  assert.match(transactions, /byId\('tx-date'\)\?\.addEventListener\('click', event =>/);
  assert.match(transactions, /event\.currentTarget\?\.showPicker/);
  assert.match(transactions, /root\.PlannkeTransactions = api;\s*bindTransactionControls\(\)/);
});

test('transaction controls no longer depend on compatibility routing', () => {
  assert.equal(fs.existsSync(path.join(root, 'app-actions.js')), false);
});

test('one-time transaction control binding artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'bind-transaction-controls-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'bind-transaction-controls-once.yml')), false);
});

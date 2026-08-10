const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'app-navigation.js'), 'utf8');
const transactions = fs.readFileSync(path.join(root, 'app-transactions.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

test('transaction runtime is required before the legacy app boot executes', () => {
  assert.match(navigation, /function loadTransactionActions\(/);
  assert.match(navigation, /script\.src = 'app-transactions\.js'/);
  assert.match(navigation, /root\.PlannkeTransactionsReady = transactionsReady/);
  assert.match(navigation, /const legacyInitApp = root\.initApp/);
  assert.match(navigation, /transactionsReady[\s\S]*Módulo canônico de movimentações não inicializou/);
  assert.match(navigation, /transactionsReady[\s\S]*legacyInitApp\.apply\(root, args\)/);
  assert.doesNotMatch(navigation, /usando runtime legado/i);
  assert.match(app, /setupForms\(\)/);
  assert.match(app, /setupModalEvents\(\)/);
});

test('early transaction actions wait for the canonical module instead of reaching app.js', () => {
  ['openTxModal', 'toggleInstallmentField', 'updateInstallmentHelper', 'dupTx', 'edTx', 'delTx']
    .forEach(name => assert.match(navigation, new RegExp(`'${name}'`)));
  assert.match(navigation, /transactionActions\.forEach\(action =>/);
  assert.match(navigation, /api\?\.\[action\]/);
  assert.match(navigation, /Ação canônica de movimentações indisponível/);
});

test('canonical transaction module owns transaction form and CRUD globals', () => {
  [
    'setupForms',
    'setupModalEvents',
    'openTxModal',
    'toggleInstallmentField',
    'updateInstallmentHelper',
    'dupTx',
    'edTx',
    'delTx'
  ].forEach(name => assert.match(transactions, new RegExp(`root\\.${name} = ${name}`)));
  assert.match(transactions, /root\.PlannkeTransactions = api/);
  assert.match(transactions, /root\.saveTransaction\(/);
  assert.match(transactions, /root\.deleteTransaction\(id\)/);
});

test('transaction runtime no longer binds account or card forms and detail modal', () => {
  assert.doesNotMatch(transactions, /accountForm|cardForm|saveAccount\(|saveCard\(|entityDetailModal/);
  assert.match(transactions, /transactionForm/);
  assert.match(transactions, /transactionModal/);
});

test('installment schedule clamps month-end dates instead of rolling into later months', () => {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(transactions, sandbox, { filename: 'app-transactions.js' });

  const leapYear = Array.from(sandbox.PlannkeTransactions.buildInstallmentDates('2024-01-31', 3));
  const commonYear = Array.from(sandbox.PlannkeTransactions.buildInstallmentDates('2025-01-31', 3));
  const thirtyDayMonth = Array.from(sandbox.PlannkeTransactions.buildInstallmentDates('2025-03-31', 3));

  assert.deepEqual(leapYear, ['2024-01-31', '2024-02-29', '2024-03-31']);
  assert.deepEqual(commonYear, ['2025-01-31', '2025-02-28', '2025-03-31']);
  assert.deepEqual(thirtyDayMonth, ['2025-03-31', '2025-04-30', '2025-05-31']);
  assert.match(transactions, /root\.addMonthsClamped/);
  assert.doesNotMatch(transactions, /\.setMonth\(/);
});

test('transaction form renders user-controlled names with DOM APIs', () => {
  assert.match(transactions, /option\.textContent = label/);
  assert.match(transactions, /select\.replaceChildren\(\)/);
  assert.match(transactions, /group\.label = groupName/);
  assert.doesNotMatch(transactions, /\.innerHTML\s*=/);
  assert.doesNotMatch(transactions, /\.outerHTML\s*=/);
  assert.doesNotMatch(transactions, /insertAdjacentHTML\s*\(/);
  assert.doesNotMatch(transactions, /\beval\s*\(|new\s+Function\s*\(/);
});

test('transaction module stays available offline and is syntax-checked in CI', () => {
  assert.match(sw, /'\.\/app-transactions\.js'/);
  assert.match(pkg, /node --check app-transactions\.js/);
});

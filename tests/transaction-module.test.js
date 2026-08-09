const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'app-navigation.js'), 'utf8');
const transactions = fs.readFileSync(path.join(root, 'app-transactions.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

test('transaction runtime is loaded before the legacy app boot executes', () => {
  assert.match(navigation, /function loadTransactionActions\(/);
  assert.match(navigation, /script\.src = 'app-transactions\.js'/);
  assert.match(navigation, /root\.PlannkeTransactionsReady = transactionsReady/);
  assert.match(navigation, /const legacyInitApp = root\.initApp/);
  assert.match(navigation, /transactionsReady[\s\S]*legacyInitApp\.apply\(root, args\)/);
  assert.match(app, /setupForms\(\)/);
  assert.match(app, /setupModalEvents\(\)/);
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

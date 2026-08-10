const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const navigation = fs.readFileSync(path.join(root, 'app-navigation.js'), 'utf8');
const transactions = fs.readFileSync(path.join(root, 'app-transactions.js'), 'utf8');
const entities = fs.readFileSync(path.join(root, 'app-entities.js'), 'utf8');
const renderers = fs.readFileSync(path.join(root, 'safe-renderers.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

test('canonical account and card runtime is required before app boot', () => {
  assert.match(navigation, /function loadEntityRuntime\(/);
  assert.match(navigation, /script\.src = 'app-entities\.js'/);
  assert.match(navigation, /root\.PlannkeEntitiesReady = entitiesReady/);
  assert.match(navigation, /Promise\.all\(\[transactionsReady, dashboardReady, entitiesReady, settingsReady, planningReady, renderersReady\]\)/);
  assert.match(navigation, /Runtime canônico de contas e cartões não inicializou/);
});

test('entity forms and modal lifecycle are bound by the entity runtime before legacy init', () => {
  assert.match(navigation, /entities\.setupModalEvents\?\.\(\);/);
  assert.match(navigation, /entities\.setupForms\?\.\(\);/);
  assert.ok(navigation.indexOf('entities.setupForms?.();') < navigation.indexOf('legacyInitApp.apply(root, args)'));
  assert.match(entities, /accountForm/);
  assert.match(entities, /cardForm/);
  assert.match(entities, /saveAccount\(/);
  assert.match(entities, /saveCard\(/);
  assert.doesNotMatch(transactions, /accountForm|cardForm|saveAccount\(|saveCard\(|entityDetailModal/);
});

test('early entity actions wait for the canonical module', () => {
  [
    'viewAccountStatement',
    'viewCardInvoice',
    'handlePayFatura',
    'edAcc',
    'edCard',
    'delAcc',
    'delCard'
  ].forEach(name => assert.match(navigation, new RegExp(`'${name}'`)));
  assert.match(navigation, /entityActions\.forEach\(action =>/);
  assert.match(navigation, /Ação canônica de contas\/cartões indisponível/);
});

test('statement and invoice details render user data with DOM APIs', () => {
  assert.match(entities, /function viewAccountStatement\(/);
  assert.match(entities, /function viewCardInvoice\(/);
  assert.match(entities, /node\.textContent = String\(label \?\? ''\)/);
  assert.match(entities, /list\.replaceChildren\(\)/);
  assert.match(entities, /root\._renderTxItem\?\.\(list, transaction, data\)/);
  assert.doesNotMatch(entities, /\.innerHTML\s*=/);
  assert.doesNotMatch(entities, /\.outerHTML\s*=/);
  assert.doesNotMatch(entities, /insertAdjacentHTML\s*\(/);
  assert.doesNotMatch(entities, /\beval\s*\(|new\s+Function\s*\(/);
});

test('invoice payment controls reset when moving from paid to pending billing', () => {
  assert.match(entities, /select\.disabled = false;[\s\S]*select\.replaceChildren\(option\('', 'Debitar de\.\.\.'\)\)/);
  assert.match(entities, /if \(billing\.isPaid\)[\s\S]*select\.disabled = true/);
  assert.match(entities, /replaceButton\(byId\('detail-pay-btn'\)\)/);
});

test('safe account and card cards delegate actions to the canonical entity globals', () => {
  assert.match(renderers, /root\.edAcc\?\.\(acc\.id\)/);
  assert.match(renderers, /root\.viewAccountStatement\?\.\(acc\.id\)/);
  assert.match(renderers, /root\.edCard\?\.\(cardData\.id\)/);
  assert.match(renderers, /root\.viewCardInvoice\?\.\(cardData\.id\)/);
  assert.match(renderers, /root\.handlePayFatura\?\.\(cardData\.id/);
});

test('entity runtime is syntax-checked and available offline', () => {
  assert.match(pkg, /node --check app-entities\.js/);
  assert.match(sw, /'\.\/app-entities\.js'/);
});

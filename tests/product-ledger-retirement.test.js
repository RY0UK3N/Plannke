const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const coreSource = fs.readFileSync(path.join(root, 'src', 'core', 'product-core.js'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'src', 'app', 'storage-adapter.js'), 'utf8');
const storage = fs.readFileSync(path.join(root, 'src', 'core', 'storage.js'), 'utf8');
const transactions = fs.readFileSync(path.join(root, 'src', 'app', 'app-transactions.js'), 'utf8');
const core = require('../src/core/product-core.js');

test('product core loads before StorageAdapter boot and owns product data preparation', () => {
  assert.ok(index.indexOf('product-core.js') < index.indexOf('app-boot.js'));
  assert.match(coreSource, /function prepareProductData\(/);
  assert.match(coreSource, /function normalizeHousehold\(/);
  assert.match(coreSource, /function migrateLegacyRecurring\(/);
  assert.match(coreSource, /function snapshotSharedTransactionMeta\(/);
  assert.match(adapter, /root\.PlannkeCore\?\.prepareProductData/);
});

test('StorageAdapter is the only runtime consumer of product data preparation', () => {
  assert.match(adapter, /root\.PlannkeCore\?\.prepareProductData/);
  assert.doesNotMatch(transactions, /prepareProductData/);
});

test('canonical finance core owns opening balance changes without product wrappers', () => {
  assert.match(storage, /item\.openingBalance = openingBalance \+ \(parsed - currentBalance\)/);
  assert.match(storage, /openingBalance: parsed, balance: parsed/);
});

test('canonical transaction runtime owns status tags and household sharing with DOM APIs', () => {
  ['tx-status', 'tx-tags', 'tx-paid-by', 'tx-shared-with'].forEach(id => assert.ok(transactions.includes(id), 'missing ' + id));
  assert.match(transactions, /function ensureTransactionMetadataFields\(/);
  assert.match(transactions, /function applySavedTransactionMetadata\(/);
  assert.match(transactions, /replaceChildren\(\)/);
  assert.doesNotMatch(transactions, /\.innerHTML\s*=/);
});

test('product data preparation migrates recurring items and preserves sharing metadata', () => {
  const data = {
    accounts: [{ id: 'a', name: 'Conta', balance: 100, openingBalance: 100 }],
    cards: [], cardBillings: [],
    transactions: [{ id: 't', type: 'expense', description: 'Academia', category: 'Outros', amount: 20, date: '2026-08-10', accountId: 'a', recurring: true, paidByMemberId: 'm1', sharedWithMemberIds: ['m2'] }],
    settings: { household: { members: [{ id: 'm1', name: 'A' }, { id: 'm2', name: 'B' }] } },
    planning: { goals: [], reserves: [], recurringRules: [], categoryRules: [], onboardingComplete: false }
  };
  const result = core.prepareProductData(data, '2026-08-12');
  assert.equal(result.data.transactions[0].recurring, false);
  assert.equal(result.data.planning.recurringRules.length, 1);
  assert.deepEqual(result.data.settings.sharedTransactionMeta.t, { paidByMemberId: 'm1', sharedWithMemberIds: ['m2'] });
  assert.equal(result.data.accounts[0].balance, 80);
});

test('one-time product ledger migration artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'promote-product-ledger-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'promote-product-ledger-once.yml')), false);
});

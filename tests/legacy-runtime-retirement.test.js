const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const product = fs.readFileSync(path.join(root, 'product.js'), 'utf8');
const planning = fs.readFileSync(path.join(root, 'app-planning.js'), 'utf8');
const productUiLogic = fs.readFileSync(path.join(root, 'tests', 'product-ui-logic.test.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const entities = fs.readFileSync(path.join(root, 'app-entities.js'), 'utf8');
const transactions = fs.readFileSync(path.join(root, 'app-transactions.js'), 'utf8');

test('product layer no longer owns the planning projection runtime', () => {
  assert.doesNotMatch(product, /const originalProjection = globalThis\.renderProjection/);
  assert.doesNotMatch(product, /function renderPlanningHub\(/);
  assert.doesNotMatch(product, /function attachPlanningEvents\(/);
  assert.doesNotMatch(product, /function householdBalances\(/);
  assert.match(planning, /function canonicalRenderProjection\(/);
  assert.match(planning, /function renderPlanningHub\(/);
});

test('product public surface no longer exports the retired household planning helper', () => {
  assert.match(product, /globalThis\.PlannkeProduct=\{init,searchTransactions\};/);
  assert.doesNotMatch(product, /PlannkeProduct=\{[^}]*householdBalances/);
  assert.doesNotMatch(productUiLogic, /PlannkeProduct\.householdBalances/);
  assert.match(planning, /householdBalances,/);
});

test('one-time cleanup automation is not shipped with the branch', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-product-planning-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-product-planning-once.yml')), false);
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-app-entity-details-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-entity-details-once.yml')), false);
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-app-form-crud-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-form-crud-once.yml')), false);
});

test('app monolith no longer owns account statement or card invoice details', () => {
  assert.doesNotMatch(app, /VALORES DE DETALHE \(Extratos \/ Faturas\)/);
  assert.doesNotMatch(app, /function viewAccountStatement\(/);
  assert.doesNotMatch(app, /function viewCardInvoice\(/);
  assert.match(entities, /function viewAccountStatement\(/);
  assert.match(entities, /function viewCardInvoice\(/);
  assert.match(entities, /root\._detailContext = \{/);
});

test('app monolith no longer owns transaction/entity forms or CRUD actions', () => {
  [
    'setupQuickAdd', 'openTxModal', 'setupModalEvents', '_populateAccountDropdowns',
    'toggleInstallmentField', 'updateInstallmentHelper', 'setupForms',
    'edAcc', 'edCard', 'dupTx', 'edTx', 'delTx', 'delAcc', 'delCard'
  ].forEach(name => assert.doesNotMatch(app, new RegExp('function\\s+' + name.replace('_', '\\_') + '\\s*\\(')));

  ['openTxModal', 'setupModalEvents', 'toggleInstallmentField', 'updateInstallmentHelper', 'setupForms', 'dupTx', 'edTx', 'delTx']
    .forEach(name => assert.match(transactions, new RegExp('function\\s+' + name + '\\s*\\(')));
  ['setupModalEvents', 'setupForms', 'edAcc', 'edCard', 'delAcc', 'delCard']
    .forEach(name => assert.match(entities, new RegExp('function\\s+' + name + '\\s*\\(')));

  assert.match(app, /function _showDeleteConfirm\(/);
  assert.match(app, /function openModal\(/);
  assert.match(app, /function closeModal\(/);
});

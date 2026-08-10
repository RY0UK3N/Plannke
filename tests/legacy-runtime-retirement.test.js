const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const product = fs.readFileSync(path.join(root, 'product.js'), 'utf8');
const planning = fs.readFileSync(path.join(root, 'app-planning.js'), 'utf8');
const productUiLogic = fs.readFileSync(path.join(root, 'tests', 'product-ui-logic.test.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'app-navigation.js'), 'utf8');
const entities = fs.readFileSync(path.join(root, 'app-entities.js'), 'utf8');
const transactions = fs.readFileSync(path.join(root, 'app-transactions.js'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'app-settings.js'), 'utf8');
const appData = fs.readFileSync(path.join(root, 'app-data.js'), 'utf8');
const renderers = fs.readFileSync(path.join(root, 'safe-renderers.js'), 'utf8');

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
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-app-settings-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-settings-once.yml')), false);
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

test('legacy init only reaches form hooks after canonical modules are ready', () => {
  assert.match(app, /function initApp\(\)[\s\S]*setupModalEvents\(\);[\s\S]*setupForms\(\);/);
  assert.match(navigation, /Promise\.all\(\[transactionsReady, dashboardReady, entitiesReady, settingsReady, planningReady, renderersReady\]\)/);
  assert.match(navigation, /entities\.setupModalEvents\?\.\(\);/);
  assert.match(navigation, /entities\.setupForms\?\.\(\);/);
  assert.ok(navigation.indexOf('entities.setupForms?.();') < navigation.indexOf('legacyInitApp.apply(root, args)'));
  assert.match(transactions, /root\.setupModalEvents = setupModalEvents/);
  assert.match(transactions, /root\.setupForms = setupForms/);
});

test('app monolith no longer owns settings categories or budgets', () => {
  [
    '_loadCategories', '_saveCategories', '_loadBudgets', '_saveBudgets', '_getCatColor', '_setCatColor', '_getAllExpenseCats',
    'openCategoryManager', 'switchCatTabModal', 'addCustomCategoryModal', 'deleteCategoryModal', 'switchCatTab',
    'renderCategoryManager', 'openColorPicker', 'selectCatColor', 'addCustomCategory', 'deleteCategory',
    'applyTheme', 'toggleTheme', 'openSettingsPanel', 'confirmClearData', 'renderSettingsView',
    'openBudgetManager', 'renderBudgetManager', 'handleBudgetInput', 'saveBudgetEntry', 'renderBudgets'
  ].forEach(name => assert.doesNotMatch(app, new RegExp('function\\s+' + name.replace('_', '\\_') + '\\s*\\(')));

  assert.match(settings, /root\._loadCategories = loadCategories/);
  assert.match(settings, /root\._loadBudgets = loadBudgets/);
  assert.match(settings, /root\._getCatColor = getCategoryColor/);
  assert.match(settings, /root\.applyTheme = applyTheme/);
  assert.match(settings, /root\.openSettingsPanel = openSettingsPanel/);
  assert.match(settings, /root\.openBudgetManager = openBudgetManager/);
  assert.match(settings, /root\.handleBudgetInput = handleBudgetInput/);
  assert.match(settings, /root\.saveBudgetEntry = saveBudgetEntry/);
  assert.match(appData, /root\.confirmClearData = confirmClearData/);
  assert.match(renderers, /root\.renderBudgets = safeRenderBudgets/);
  assert.match(renderers, /root\.renderBudgetManager = safeRenderBudgetManager/);
});

test('legacy init and render bridge resolve settings globals from canonical runtime', () => {
  assert.match(app, /function initApp\(\)[\s\S]*applyTheme\(getSettings\(\)\.theme \|\| 'dark'\);/);
  assert.match(app, /function renderAll\(\)[\s\S]*renderSettingsView\(\);/);
  assert.match(navigation, /root\.PlannkeSettingsReady = settingsReady/);
  assert.ok(navigation.indexOf("if (!settings) throw new Error('Runtime canônico de configurações não inicializou.');") < navigation.indexOf('legacyInitApp.apply(root, args)'));
  assert.match(settings, /root\.applyTheme = applyTheme/);
  assert.match(settings, /root\.renderSettingsView = renderSettingsView/);
});

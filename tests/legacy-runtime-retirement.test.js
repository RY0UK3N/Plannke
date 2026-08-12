const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const planning = fs.readFileSync(path.join(root, 'src', 'app', 'app-planning.js'), 'utf8');
const movementSearch = fs.readFileSync(path.join(root, 'tests', 'movement-search.test.js'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'src', 'app', 'app-runtime.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'src', 'app', 'app-ui.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'src', 'app', 'app-navigation.js'), 'utf8');
const entities = fs.readFileSync(path.join(root, 'src', 'app', 'app-entities.js'), 'utf8');
const transactions = fs.readFileSync(path.join(root, 'src', 'app', 'app-transactions.js'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'src', 'app', 'app-settings.js'), 'utf8');
const appData = fs.readFileSync(path.join(root, 'src', 'app', 'app-data.js'), 'utf8');
const renderers = fs.readFileSync(path.join(root, 'src', 'app', 'safe-renderers.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'src', 'app', 'app-dashboard.js'), 'utf8');
const movements = fs.readFileSync(path.join(root, 'src', 'app', 'app-movements.js'), 'utf8');
const projection = fs.readFileSync(path.join(root, 'src', 'app', 'app-projection.js'), 'utf8');

test('legacy app monolith is physically retired', () => {
  assert.equal(fs.existsSync(path.join(root, 'app.js')), false);
  assert.match(runtime, /root\.PlannkeRuntime = api/);
  assert.match(ui, /root\.PlannkeUI = api/);
});

test('retired product layer cannot own planning projection runtime', () => {
  assert.match(planning, /function canonicalRenderProjection\(/);
  assert.match(planning, /function renderPlanningHub\(/);
  assert.doesNotMatch(movementSearch, /PlannkeProduct\.householdBalances/);
  assert.match(planning, /householdBalances,/);
});

test('one-time cleanup automations are not shipped with the branch', () => {
  [
    'retire-product-planning-once', 'retire-app-entity-details-once', 'retire-app-form-crud-once',
    'retire-app-settings-once', 'retire-app-renderers-once', 'retire-app-movements-once',
    'retire-app-excel-once', 'retire-app-projection-once'
  ].forEach(name => {
    assert.equal(fs.existsSync(path.join(root, 'scripts', `${name}.js`)), false);
    assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', `${name}.yml`)), false);
  });
});

test('account statement and card invoice ownership is canonical', () => {
  assert.match(entities, /function viewAccountStatement\(/);
  assert.match(entities, /function viewCardInvoice\(/);
  assert.match(entities, /root\._detailContext = \{/);
  assert.doesNotMatch(runtime, /function viewAccountStatement\(|function viewCardInvoice\(/);
});

test('transaction and entity forms own their CRUD while shared modal utilities stay in app-ui', () => {
  ['openTxModal', 'setupModalEvents', 'toggleInstallmentField', 'updateInstallmentHelper', 'setupForms', 'dupTx', 'edTx', 'delTx']
    .forEach(name => assert.match(transactions, new RegExp('function\\s+' + name + '\\s*\\(')));
  ['setupModalEvents', 'setupForms', 'edAcc', 'edCard', 'delAcc', 'delCard']
    .forEach(name => assert.match(entities, new RegExp('function\\s+' + name + '\\s*\\(')));
  assert.match(ui, /function showDeleteConfirm\(/);
  assert.match(ui, /function openModal\(/);
  assert.match(ui, /function closeModal\(/);
  assert.match(runtime, /root\.setupModalEvents\?\.\(\);[\s\S]*root\.setupForms\?\.\(\);/);
  assert.ok(navigation.indexOf('entities.setupForms?.();') < navigation.indexOf('legacyInitApp.apply(root, args)'));
});

test('settings and budgets are owned by canonical settings/data/rendering modules', () => {
  assert.match(settings, /root\._loadCategories = loadCategories/);
  assert.match(settings, /root\._loadBudgets = loadBudgets/);
  assert.match(settings, /root\._getCatColor = getCategoryColor/);
  assert.match(settings, /root\.applyTheme = applyTheme/);
  assert.match(settings, /root\.openSettingsPanel = openSettingsPanel/);
  assert.match(settings, /root\.openBudgetManager = openBudgetManager/);
  assert.match(appData, /root\.confirmClearData = confirmClearData/);
  assert.match(renderers, /root\.renderBudgets = safeRenderBudgets/);
  assert.match(renderers, /root\.renderBudgetManager = safeRenderBudgetManager/);
  assert.match(runtime, /root\.applyTheme\?\.\(root\.getSettings\?\.\(\)\.theme \|\| 'dark'\)/);
  assert.match(runtime, /root\.renderSettingsView\?\.\(\)/);
});

test('dashboard and data-heavy renderers have explicit canonical owners', () => {
  assert.match(dashboard, /root\.renderChart = renderChart/);
  assert.match(dashboard, /root\.renderComparisonChart = renderComparisonChart/);
  assert.match(renderers, /root\._renderTxItem = safeRenderTxItem/);
  assert.match(renderers, /root\.renderTransactions = safeRenderTransactions/);
  assert.match(renderers, /root\.renderDashboard = safeRenderDashboard/);
  assert.match(renderers, /root\.renderAccounts = safeRenderAccounts/);
  assert.match(renderers, /root\.renderCards = safeRenderCards/);
  assert.match(entities, /root\.handlePayFatura = handlePayFatura/);
  assert.match(runtime, /root\.renderTransactions\?\.\(data\);[\s\S]*root\.renderDashboard\?\.\(data\);[\s\S]*root\.renderAccounts\?\.\(data\);[\s\S]*root\.renderCards\?\.\(data\);/);
  assert.match(navigation, /root\.PlannkeRenderersReady = renderersReady/);
});

test('Excel is report-only and no canonical UI/runtime reintroduces Memory Card parsing', () => {
  assert.match(appData, /root\.exportToExcel = exportToExcel/);
  assert.match(appData, /Plannke_Relatorio_/);
  assert.doesNotMatch(appData, /importFromExcel|FileReader|Memory Card|_backupDone/);
  assert.doesNotMatch(runtime, /XLSX|FileReader|Memory Card|_backupDone/);
  assert.doesNotMatch(ui, /XLSX|FileReader|Memory Card|_backupDone/);
  assert.match(navigation, /\['confirmClearData', 'exportToExcel'\]/);
});

test('movement state charts and actions are owned by app-movements', () => {
  assert.match(movements, /root\._populateMovFilters = populateMovementFilters/);
  assert.match(movements, /root\.renderMonthTabs = renderMonthTabs/);
  assert.match(movements, /root\.renderMovimentacao = renderMovimentacao/);
  assert.match(movements, /root\.renderSankey = renderSankey/);
  assert.match(movements, /root\.renderSunburst = renderSunburst/);
  assert.match(movements, /root\.changeMonth = changeMonth/);
  assert.match(movements, /root\.clearTxSearch = clearTxSearch/);
  assert.match(runtime, /root\.renderMovimentacao\?\.\(data\);[\s\S]*root\._populateMovFilters\?\.\(data\);/);
  assert.match(navigation, /root\.PlannkeMovementsReady = movementsReady/);
});

test('projection model chart and summary are owned by app-projection and composed by planning', () => {
  assert.match(projection, /function buildProjectionModel\(/);
  assert.match(projection, /function renderProjection\(data, options = \{\}\)/);
  assert.match(projection, /function renderSummary\(/);
  assert.match(projection, /root\.PlannkeProjection = api/);
  assert.match(planning, /root\.PlannkeProjection\?\.renderProjection\?\.\(/);
  assert.match(runtime, /root\.renderProjection\?\.\(data\);/);
  assert.match(navigation, /root\.PlannkeProjectionReady = projectionReady/);
  assert.match(navigation, /root\.PlannkePlanningReady = planningReady/);
});

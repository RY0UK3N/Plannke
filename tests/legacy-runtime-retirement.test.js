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
const dashboard = fs.readFileSync(path.join(root, 'app-dashboard.js'), 'utf8');
const movements = fs.readFileSync(path.join(root, 'app-movements.js'), 'utf8');
const projection = fs.readFileSync(path.join(root, 'app-projection.js'), 'utf8');

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
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-app-renderers-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-renderers-once.yml')), false);
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-app-movements-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-movements-once.yml')), false);
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-app-excel-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-excel-once.yml')), false);
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-app-projection-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-projection-once.yml')), false);
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
  assert.match(navigation, /Promise\.all\(\[transactionsReady, dashboardReady, entitiesReady, settingsReady, projectionReady, planningReady, movementsReady, renderersReady\]\)/);
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

test('app monolith no longer owns canonical dashboard transaction or entity renderers', () => {
  ['renderComparisonChart', 'renderDashboard', '_renderTxItem', 'renderTransactions', 'renderAccounts', 'renderCards', 'handlePayFatura', 'renderChart']
    .forEach(name => assert.doesNotMatch(app, new RegExp('function\\s+' + name.replace('_', '\\_') + '\\s*\\(')));

  assert.match(dashboard, /root\.renderChart = renderChart/);
  assert.match(dashboard, /root\.renderComparisonChart = renderComparisonChart/);
  assert.match(renderers, /root\._renderTxItem = safeRenderTxItem/);
  assert.match(renderers, /root\.renderTransactions = safeRenderTransactions/);
  assert.match(renderers, /root\.renderDashboard = safeRenderDashboard/);
  assert.match(renderers, /root\.renderAccounts = safeRenderAccounts/);
  assert.match(renderers, /root\.renderCards = safeRenderCards/);
  assert.match(entities, /root\.handlePayFatura = handlePayFatura/);

  assert.doesNotMatch(app, /const COLOR_MAP = new Proxy/);
  assert.doesNotMatch(app, /function renderMovimentacao\(/);
  assert.doesNotMatch(app, /function renderSankey\(/);
  assert.doesNotMatch(app, /function renderSunburst\(/);
  assert.match(movements, /root\.renderMovimentacao = renderMovimentacao/);
  assert.match(movements, /root\.renderSankey = renderSankey/);
  assert.match(movements, /root\.renderSunburst = renderSunburst/);
  assert.doesNotMatch(app, /function renderProjection\(/);
  assert.match(projection, /function renderProjection\(data, options = \{\}\)/);
  assert.match(planning, /root\.PlannkeProjection\?\.renderProjection\?\.\(/);
});

test('renderAll reaches data-heavy surfaces only after canonical renderers are ready', () => {
  assert.match(app, /function renderAll\(\)[\s\S]*renderTransactions\(data\);[\s\S]*renderDashboard\(data\);[\s\S]*renderAccounts\(data\);[\s\S]*renderCards\(data\);/);
  assert.match(navigation, /root\.PlannkeRenderersReady = renderersReady/);
  assert.ok(navigation.indexOf("if (!renderers) throw new Error('Renderizadores canônicos não inicializaram.');") < navigation.indexOf('legacyInitApp.apply(root, args)'));
  assert.match(renderers, /root\.renderTransactions = safeRenderTransactions/);
  assert.match(renderers, /root\.renderDashboard = safeRenderDashboard/);
  assert.match(renderers, /root\.renderAccounts = safeRenderAccounts/);
  assert.match(renderers, /root\.renderCards = safeRenderCards/);
});

test('app monolith no longer owns Excel or Memory Card runtime', () => {
  assert.doesNotMatch(app, /EXCEL — Memory Card/);
  assert.doesNotMatch(app, /function exportToExcel\(/);
  assert.doesNotMatch(app, /function importFromExcel\(/);
  assert.doesNotMatch(app, /\bFileReader\b/);
  assert.doesNotMatch(app, /_backupDone/);
  assert.doesNotMatch(app, /Planner_MemoryCard_/);

  assert.match(appData, /root\.exportToExcel = exportToExcel/);
  assert.match(appData, /Plannke_Relatorio_/);
  assert.doesNotMatch(appData, /importFromExcel|FileReader|Memory Card|_backupDone/);
  assert.match(navigation, /\['confirmClearData', 'exportToExcel'\]/);
});

test('app monolith no longer owns movement state filters or charts', () => {
  ['clearTxSearch', '_populateMovFilters', 'filterDashboardToTransactions', 'renderMonthTabs', 'setMovViewMode', 'renderMovimentacao', 'renderSankey', 'renderSunburst', 'updateMonthNavigator', 'changeMonth']
    .forEach(name => assert.doesNotMatch(app, new RegExp('function\\s+' + name.replace('_', '\\_') + '\\s*\\(')));
  assert.doesNotMatch(app, /_currentMonth|_fluxoChart|_movViewMode|const COLOR_MAP = new Proxy/);

  assert.match(movements, /root\._populateMovFilters = populateMovementFilters/);
  assert.match(movements, /root\.renderMonthTabs = renderMonthTabs/);
  assert.match(movements, /root\.renderMovimentacao = renderMovimentacao/);
  assert.match(movements, /root\.renderSankey = renderSankey/);
  assert.match(movements, /root\.renderSunburst = renderSunburst/);
  assert.match(movements, /root\.changeMonth = changeMonth/);
  assert.match(movements, /root\.clearTxSearch = clearTxSearch/);
  assert.doesNotMatch(app, /function renderProjection\(/);
  assert.match(projection, /function renderProjection\(data, options = \{\}\)/);
  assert.match(planning, /root\.PlannkeProjection\?\.renderProjection\?\.\(/);
});

test('legacy renderAll reaches movement globals only after canonical movement runtime is ready', () => {
  assert.match(app, /function renderAll\(\)[\s\S]*renderMovimentacao\(data\);[\s\S]*_populateMovFilters\(data\);/);
  assert.match(navigation, /root\.PlannkeMovementsReady = movementsReady/);
  assert.ok(navigation.indexOf("if (!movements) throw new Error('Runtime canônico de Movimentações não inicializou.');") < navigation.indexOf('legacyInitApp.apply(root, args)'));
});

test('app monolith no longer owns projection model chart or summary', () => {
  assert.doesNotMatch(app, /function renderProjection\(/);
  assert.doesNotMatch(app, /_projectionChart|projectionChart/);
  assert.doesNotMatch(app, /projection-summary-list|projectionChart/);

  assert.match(projection, /function buildProjectionModel\(/);
  assert.match(projection, /function renderProjection\(data, options = \{\}\)/);
  assert.match(projection, /function renderSummary\(/);
  assert.match(projection, /root\.PlannkeProjection = api/);
  assert.match(planning, /root\.PlannkeProjection\?\.renderProjection\?\.\(/);
});

test('legacy renderAll reaches projection only after canonical projection and planning runtimes are ready', () => {
  assert.match(app, /function renderAll\(\)[\s\S]*renderProjection\(data\);/);
  assert.match(navigation, /root\.PlannkeProjectionReady = projectionReady/);
  assert.match(navigation, /root\.PlannkePlanningReady = planningReady/);
  assert.ok(navigation.indexOf("if (!projection) throw new Error('Runtime canônico de Projeção não inicializou.');") < navigation.indexOf('legacyInitApp.apply(root, args)'));
});

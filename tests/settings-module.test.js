const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const navigation = fs.readFileSync(path.join(root, 'app-navigation.js'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'app-settings.js'), 'utf8');
const transactions = fs.readFileSync(path.join(root, 'app-transactions.js'), 'utf8');
const renderers = fs.readFileSync(path.join(root, 'safe-renderers.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

test('canonical settings runtime is required before app boot', () => {
  assert.match(navigation, /function loadSettingsRuntime\(/);
  assert.match(navigation, /script\.src = 'app-settings\.js'/);
  assert.match(navigation, /root\.PlannkeSettingsReady = settingsReady/);
  assert.match(navigation, /Promise\.all\(\[transactionsReady, dashboardReady, entitiesReady, settingsReady, planningReady, movementsReady, renderersReady\]\)/);
  assert.match(navigation, /Runtime canônico de configurações não inicializou/);
});

test('early settings actions wait for the canonical module', () => {
  [
    'openSettingsPanel', 'openBudgetManager', 'openCategoryManager', 'toggleTheme',
    'switchCatTabModal', 'addCustomCategoryModal', 'deleteCategoryModal',
    'switchCatTab', 'addCustomCategory', 'deleteCategory', 'openColorPicker',
    'selectCatColor', 'handleBudgetInput', 'saveBudgetEntry'
  ].forEach(name => assert.match(navigation, new RegExp(`'${name}'`)));
  assert.match(navigation, /settingsActions\.forEach\(action =>/);
  assert.match(navigation, /Ação canônica de configurações indisponível/);
});

test('settings runtime owns category and budget data helpers used by other modules', () => {
  assert.match(settings, /root\._loadCategories = loadCategories/);
  assert.match(settings, /root\._loadBudgets = loadBudgets/);
  assert.match(settings, /root\._getCatColor = getCategoryColor/);
  assert.match(settings, /root\._getAllExpenseCats = getAllExpenseCategories/);
  assert.match(transactions, /root\._loadCategories\?\.\(\)/);
  assert.match(renderers, /_loadBudgets\(\)/);
  assert.match(renderers, /_getCatColor\(/);
  assert.match(renderers, /_getAllExpenseCats\(\)/);
});

test('category color and settings UI render with DOM APIs only', () => {
  assert.match(settings, /list\.replaceChildren\(\)/);
  assert.match(settings, /content\.replaceChildren\(\)/);
  assert.match(settings, /node\.textContent = String\(text\)/);
  assert.match(settings, /button\.addEventListener\('click'/);
  assert.doesNotMatch(settings, /\.innerHTML\s*=/);
  assert.doesNotMatch(settings, /\.outerHTML\s*=/);
  assert.doesNotMatch(settings, /insertAdjacentHTML\s*\(/);
  assert.doesNotMatch(settings, /\beval\s*\(|new\s+Function\s*\(/);
});

test('theme runtime updates dashboard charts and visible movement visualization', () => {
  assert.match(settings, /root\.PlannkeDashboard\?\.refreshTheme\?\.\(\)/);
  assert.match(settings, /document\.documentElement\.setAttribute\('data-bs-theme'/);
  assert.match(settings, /root\.renderMovimentacao\?\.\(root\.getData\?\.\(\)\)/);
  assert.match(settings, /root\.applyTheme = applyTheme/);
  assert.match(settings, /root\.toggleTheme = toggleTheme/);
});

test('settings runtime is syntax-checked and available offline', () => {
  assert.match(pkg, /node --check app-settings\.js/);
  assert.match(sw, /'\.\/app-settings\.js'/);
});

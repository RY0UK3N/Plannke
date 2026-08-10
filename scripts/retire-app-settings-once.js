const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'app.js');
const testPath = path.join(root, 'tests', 'legacy-runtime-retirement.test.js');
const workflowPath = path.join(root, '.github', 'workflows', 'retire-app-settings-once.yml');
const selfPath = __filename;

let app = fs.readFileSync(appPath, 'utf8');

function removeRange(startMarker, endMarker, label) {
  const start = app.indexOf(startMarker);
  const end = app.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(`Could not locate ${label}`);
  if (app.indexOf(startMarker, start + startMarker.length) >= 0) throw new Error(`Multiple ${label} start markers found`);
  app = app.slice(0, start) + app.slice(end);
}

removeRange(
  '/* ============================================================\n   CATEGORIAS — Sistema customizável (persiste em data.settings)\n   ============================================================ */',
  '/* ============================================================\n   FEEDBACK\n   ============================================================ */',
  'legacy category settings block'
);

removeRange(
  '/* ============================================================\n   CONFIGURAÇÕES\n   ============================================================ */',
  '/* ============================================================\n   COMPARATIVO MENSAL — últimos 6 meses\n   ============================================================ */',
  'legacy settings and budget block'
);

[
  'const DEFAULT_CATEGS_INCOME',
  'const DEFAULT_CATEGS_EXPENSE',
  'const CAT_COLOR_PALETTE',
  'const DEFAULT_CAT_COLORS',
  'function _loadCategories(',
  'function _saveCategories(',
  'function _loadBudgets(',
  'function _saveBudgets(',
  'function _getCatColor(',
  'function _setCatColor(',
  'function _getAllExpenseCats(',
  'function _buildCategoryOptions(',
  'function openCategoryManager(',
  'function switchCatTabModal(',
  'function addCustomCategoryModal(',
  'function deleteCategoryModal(',
  'function switchCatTab(',
  'function renderCategoryManager(',
  'function openColorPicker(',
  'function selectCatColor(',
  'function addCustomCategory(',
  'function deleteCategory(',
  'function applyTheme(',
  'function toggleTheme(',
  'function openSettingsPanel(',
  'function confirmClearData(',
  'function renderSettingsView(',
  'function openBudgetManager(',
  'function renderBudgetManager(',
  'function handleBudgetInput(',
  'function saveBudgetEntry(',
  'function renderBudgets('
].forEach(marker => {
  if (app.includes(marker)) throw new Error(`Retired app settings marker survived: ${marker}`);
});

if (!app.includes('function showToast(')) throw new Error('Feedback utilities must remain');
if (!app.includes('function renderAll(')) throw new Error('renderAll bridge must remain for later retirement');
fs.writeFileSync(appPath, app);

let test = fs.readFileSync(testPath, 'utf8');
const transactionsDecl = "const transactions = fs.readFileSync(path.join(root, 'app-transactions.js'), 'utf8');";
if (!test.includes("const settings = fs.readFileSync(path.join(root, 'app-settings.js'), 'utf8');")) {
  if (!test.includes(transactionsDecl)) throw new Error('Retirement test transaction declaration marker not found');
  test = test.replace(
    transactionsDecl,
    `${transactionsDecl}\nconst settings = fs.readFileSync(path.join(root, 'app-settings.js'), 'utf8');\nconst appData = fs.readFileSync(path.join(root, 'app-data.js'), 'utf8');\nconst renderers = fs.readFileSync(path.join(root, 'safe-renderers.js'), 'utf8');`
  );
}

const ownershipTest = `\ntest('app monolith no longer owns settings categories or budgets', () => {\n  [\n    '_loadCategories', '_saveCategories', '_loadBudgets', '_saveBudgets', '_getCatColor', '_setCatColor', '_getAllExpenseCats',\n    'openCategoryManager', 'switchCatTabModal', 'addCustomCategoryModal', 'deleteCategoryModal', 'switchCatTab',\n    'renderCategoryManager', 'openColorPicker', 'selectCatColor', 'addCustomCategory', 'deleteCategory',\n    'applyTheme', 'toggleTheme', 'openSettingsPanel', 'confirmClearData', 'renderSettingsView',\n    'openBudgetManager', 'renderBudgetManager', 'handleBudgetInput', 'saveBudgetEntry', 'renderBudgets'\n  ].forEach(name => assert.doesNotMatch(app, new RegExp('function\\\\s+' + name.replace('_', '\\\\_') + '\\\\s*\\\\(')));\n\n  assert.match(settings, /root\\._loadCategories = loadCategories/);\n  assert.match(settings, /root\\._loadBudgets = loadBudgets/);\n  assert.match(settings, /root\\._getCatColor = getCategoryColor/);\n  assert.match(settings, /root\\.applyTheme = applyTheme/);\n  assert.match(settings, /root\\.openSettingsPanel = openSettingsPanel/);\n  assert.match(settings, /root\\.openBudgetManager = openBudgetManager/);\n  assert.match(settings, /root\\.handleBudgetInput = handleBudgetInput/);\n  assert.match(settings, /root\\.saveBudgetEntry = saveBudgetEntry/);\n  assert.match(appData, /root\\.confirmClearData = confirmClearData/);\n  assert.match(renderers, /root\\.renderBudgets = safeRenderBudgets/);\n  assert.match(renderers, /root\\.renderBudgetManager = safeRenderBudgetManager/);\n});\n`;
if (!test.includes("test('app monolith no longer owns settings categories or budgets'")) {
  test = `${test.trimEnd()}\n${ownershipTest}`;
}

const artifactNeedle = "  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-form-crud-once.yml')), false);";
if (test.includes(artifactNeedle) && !test.includes('retire-app-settings-once.js')) {
  test = test.replace(artifactNeedle, `${artifactNeedle}\n  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-app-settings-once.js')), false);\n  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-settings-once.yml')), false);`);
}
fs.writeFileSync(testPath, test);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

console.log('Retired legacy app settings, categories and budget runtime.');

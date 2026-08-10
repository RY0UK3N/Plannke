const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const movements = fs.readFileSync(path.join(root, 'app-movements.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'app-navigation.js'), 'utf8');
const renderers = fs.readFileSync(path.join(root, 'safe-renderers.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

function runtime() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(movements, sandbox, { filename: 'app-movements.js' });
  return sandbox.PlannkeMovements;
}

test('canonical movements runtime is required before legacy init', () => {
  assert.match(navigation, /function loadMovementRuntime\(/);
  assert.match(navigation, /script\.src = 'app-movements\.js'/);
  assert.match(navigation, /root\.PlannkeMovementsReady = movementsReady/);
  assert.match(navigation, /Promise\.all\(\[transactionsReady, dashboardReady, entitiesReady, settingsReady, projectionReady, planningReady, movementsReady, renderersReady\]\)/);
  assert.match(navigation, /Runtime canônico de Movimentações não inicializou/);
  assert.match(navigation, /root\.PlannkeMovements\?\.disposeChart\?\.\(\)/);
});

test('movement filters render account category and card names with DOM APIs', () => {
  assert.match(movements, /categorySelect\.replaceChildren\(\)/);
  assert.match(movements, /accountSelect\.replaceChildren\(\)/);
  assert.match(movements, /option\.textContent = label/);
  assert.match(movements, /document\.createElement\('optgroup'\)/);
  assert.doesNotMatch(movements, /\.innerHTML\s*=/);
  assert.doesNotMatch(movements, /insertAdjacentHTML\s*\(/);
});

test('Sankey model aggregates monthly income and expenses by category', () => {
  const api = runtime();
  const model = api.buildSankeyModel({ transactions: [
    { date: '2026-08-01', type: 'income', category: 'Salário', amount: 1000 },
    { date: '2026-08-02', type: 'income', category: 'Salário', amount: 200 },
    { date: '2026-08-03', type: 'expense', category: 'Casa', amount: 300 },
    { date: '2026-07-03', type: 'expense', category: 'Casa', amount: 999 }
  ] }, '2026-08');
  assert.equal(model.empty, false);
  assert.deepEqual(JSON.parse(JSON.stringify(model.links)), [
    { source: 'Salário', target: 'Budget', value: 1200 },
    { source: 'Budget', target: 'Casa', value: 300 }
  ]);
});

test('Sunburst model preserves descriptions as data and calculates monthly total', () => {
  const api = runtime();
  const model = api.buildSunburstModel({ transactions: [
    { date: '2026-08-03', type: 'expense', category: 'Casa', description: '<img onerror=alert(1)>', amount: 120 },
    { date: '2026-08-04', type: 'expense', category: 'Casa', description: 'Energia', amount: 80 }
  ] }, '2026-08');
  assert.equal(model.totalExpense, 200);
  assert.equal(model.categories[0].items[0].name, '<img onerror=alert(1)>');
  assert.equal(model.categories[0].total, 200);
});

test('ECharts tooltips use rich text instead of executable HTML', () => {
  assert.match(movements, /renderMode: 'richText'/);
  assert.doesNotMatch(movements, /<b>|<br\s*\/?/i);
  assert.doesNotMatch(movements, /\beval\s*\(|new\s+Function\s*\(/);
});

test('safe transaction renderer reads month state from canonical movements runtime', () => {
  assert.match(renderers, /root\.renderMonthTabs\?\.\(data\)/);
  assert.match(renderers, /root\.PlannkeMovements\?\.currentMonth/);
  assert.doesNotMatch(renderers, /_currentMonth/);
});

test('HTML-facing movement actions are published by the canonical runtime', () => {
  [
    '_populateMovFilters', 'renderMonthTabs', 'renderMovimentacao', 'renderSankey',
    'renderSunburst', 'setMovViewMode', 'changeMonth', 'clearTxSearch',
    'filterDashboardToTransactions', 'updateMonthNavigator'
  ].forEach(name => assert.match(movements, new RegExp(`root\\.${name} = `)));
  assert.match(movements, /root\.PlannkeMovements = api/);
});

test('one-time movement integration files are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'integrate-movements-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'integrate-movements-once.yml')), false);
});

test('movements runtime is syntax-checked and available offline', () => {
  assert.match(pkg, /node --check app-movements\.js/);
  assert.match(sw, /'\.\/app-movements\.js'/);
});

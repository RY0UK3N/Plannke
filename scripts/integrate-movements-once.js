const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const navigationPath = path.join(root, 'app-navigation.js');
const renderersPath = path.join(root, 'safe-renderers.js');
const packagePath = path.join(root, 'package.json');
const swPath = path.join(root, 'sw.js');
const testsDir = path.join(root, 'tests');
const movementTestPath = path.join(testsDir, 'movements-module.test.js');
const workflowPath = path.join(root, '.github', 'workflows', 'integrate-movements-once.yml');
const selfPath = __filename;

let navigation = fs.readFileSync(navigationPath, 'utf8');
const movementLoader = `    function loadMovementRuntime() {\n        if (root.PlannkeMovements) return Promise.resolve(root.PlannkeMovements);\n        if (typeof document === 'undefined') return Promise.resolve(null);\n        const existing = document.querySelector('script[data-plannke-movements]');\n        if (existing) {\n            return new Promise((resolve, reject) => {\n                if (root.PlannkeMovements) return resolve(root.PlannkeMovements);\n                existing.addEventListener('load', () => resolve(root.PlannkeMovements || null), { once: true });\n                existing.addEventListener('error', () => reject(new Error('Falha ao carregar runtime de Movimentações.')), { once: true });\n            });\n        }\n        return new Promise((resolve, reject) => {\n            const script = document.createElement('script');\n            script.src = 'app-movements.js';\n            script.async = false;\n            script.dataset.plannkeMovements = 'true';\n            script.addEventListener('load', () => resolve(root.PlannkeMovements || null), { once: true });\n            script.addEventListener('error', () => reject(new Error('Falha ao carregar runtime de Movimentações.')), { once: true });\n            document.body.appendChild(script);\n        });\n    }\n\n`;
const rendererMarker = '    function waitForCanonicalRenderers() {';
if (!navigation.includes('function loadMovementRuntime()')) {
  if (!navigation.includes(rendererMarker)) throw new Error('Renderer boundary marker missing in navigation');
  navigation = navigation.replace(rendererMarker, movementLoader + rendererMarker);
}

const replacements = [
  [
    '    const planningReady = loadPlanningRuntime();\n    const renderersReady = waitForCanonicalRenderers();',
    '    const planningReady = loadPlanningRuntime();\n    const movementsReady = loadMovementRuntime();\n    const renderersReady = waitForCanonicalRenderers();'
  ],
  [
    '    root.PlannkePlanningReady = planningReady;\n    root.PlannkeRenderersReady = renderersReady;',
    '    root.PlannkePlanningReady = planningReady;\n    root.PlannkeMovementsReady = movementsReady;\n    root.PlannkeRenderersReady = renderersReady;'
  ],
  [
    'Promise.all([transactionsReady, dashboardReady, entitiesReady, settingsReady, planningReady, renderersReady])',
    'Promise.all([transactionsReady, dashboardReady, entitiesReady, settingsReady, planningReady, movementsReady, renderersReady])'
  ],
  [
    '.then(([transactions, dashboard, entities, settings, planning, renderers]) => {',
    '.then(([transactions, dashboard, entities, settings, planning, movements, renderers]) => {'
  ],
  [
    "                if (!planning) throw new Error('Runtime canônico de Planejamento não inicializou.');\n                if (!renderers)",
    "                if (!planning) throw new Error('Runtime canônico de Planejamento não inicializou.');\n                if (!movements) throw new Error('Runtime canônico de Movimentações não inicializou.');\n                if (!renderers)"
  ],
  [
    "        if (leaving === 'movimentacao' && target !== 'movimentacao' && typeof _fluxoChart !== 'undefined' && _fluxoChart) {\n            _fluxoChart.dispose();\n            _fluxoChart = null;\n        }",
    "        if (leaving === 'movimentacao' && target !== 'movimentacao') {\n            root.PlannkeMovements?.disposeChart?.();\n        }"
  ],
  [
    '        loadPlanningRuntime,\n        waitForCanonicalRenderers,',
    '        loadPlanningRuntime,\n        loadMovementRuntime,\n        waitForCanonicalRenderers,'
  ]
];
for (const [before, after] of replacements) {
  if (!navigation.includes(after)) {
    if (!navigation.includes(before)) throw new Error(`Navigation integration marker missing: ${before.slice(0, 70)}`);
    navigation = navigation.replace(before, after);
  }
}
fs.writeFileSync(navigationPath, navigation);

let renderers = fs.readFileSync(renderersPath, 'utf8');
if (renderers.includes('        renderMonthTabs(data);')) {
  renderers = renderers.replace('        renderMonthTabs(data);', '        root.renderMonthTabs?.(data);');
}
const monthFilter = "        if (_currentMonth) filtered = filtered.filter(t => String(t.date || '').startsWith(_currentMonth));";
const canonicalMonthFilter = "        const currentMonth = root.PlannkeMovements?.currentMonth || '';\n        if (currentMonth) filtered = filtered.filter(t => String(t.date || '').startsWith(currentMonth));";
if (renderers.includes(monthFilter)) renderers = renderers.replace(monthFilter, canonicalMonthFilter);
if (!renderers.includes(canonicalMonthFilter)) throw new Error('Safe renderer current-month integration failed');
if (renderers.includes('_currentMonth')) throw new Error('Safe renderers still depend on app.js movement lexical state');
fs.writeFileSync(renderersPath, renderers);

let pkg = fs.readFileSync(packagePath, 'utf8');
if (!pkg.includes('node --check app-movements.js')) {
  pkg = pkg.replace('node --check app-transactions.js &&', 'node --check app-transactions.js && node --check app-movements.js &&');
}
fs.writeFileSync(packagePath, pkg);

let sw = fs.readFileSync(swPath, 'utf8');
if (!sw.includes("'./app-movements.js'")) {
  sw = sw.replace("  './app-transactions.js',", "  './app-transactions.js',\n  './app-movements.js',");
}
fs.writeFileSync(swPath, sw);

const oldRegex = 'Promise\\.all\\(\\[transactionsReady, dashboardReady, entitiesReady, settingsReady, planningReady, renderersReady\\]\\)';
const newRegex = 'Promise\\.all\\(\\[transactionsReady, dashboardReady, entitiesReady, settingsReady, planningReady, movementsReady, renderersReady\\]\\)';
for (const entry of fs.readdirSync(testsDir)) {
  if (!entry.endsWith('.test.js')) continue;
  const file = path.join(testsDir, entry);
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes(oldRegex)) {
    content = content.split(oldRegex).join(newRegex);
    fs.writeFileSync(file, content);
  }
}

const movementTest = `const test = require('node:test');
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
  assert.match(navigation, /function loadMovementRuntime\\(/);
  assert.match(navigation, /script\\.src = 'app-movements\\.js'/);
  assert.match(navigation, /root\\.PlannkeMovementsReady = movementsReady/);
  assert.match(navigation, /Promise\\.all\\(\\[transactionsReady, dashboardReady, entitiesReady, settingsReady, planningReady, movementsReady, renderersReady\\]\\)/);
  assert.match(navigation, /Runtime canônico de Movimentações não inicializou/);
  assert.match(navigation, /root\\.PlannkeMovements\\?\\.disposeChart\\?\\.\\(\\)/);
});

test('movement filters render account category and card names with DOM APIs', () => {
  assert.match(movements, /categorySelect\\.replaceChildren\\(\\)/);
  assert.match(movements, /accountSelect\\.replaceChildren\\(\\)/);
  assert.match(movements, /option\\.textContent = label/);
  assert.match(movements, /document\\.createElement\\('optgroup'\\)/);
  assert.doesNotMatch(movements, /\\.innerHTML\\s*=/);
  assert.doesNotMatch(movements, /insertAdjacentHTML\\s*\\(/);
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
  assert.doesNotMatch(movements, /<b>|<br\\s*\\/?/i);
  assert.doesNotMatch(movements, /\\beval\\s*\\(|new\\s+Function\\s*\\(/);
});

test('safe transaction renderer reads month state from canonical movements runtime', () => {
  assert.match(renderers, /root\\.renderMonthTabs\\?\\.\\(data\\)/);
  assert.match(renderers, /root\\.PlannkeMovements\\?\\.currentMonth/);
  assert.doesNotMatch(renderers, /_currentMonth/);
});

test('movements runtime is syntax-checked and available offline', () => {
  assert.match(pkg, /node --check app-movements\\.js/);
  assert.match(sw, /'\\.\\/app-movements\\.js'/);
});
`;
fs.writeFileSync(movementTestPath, movementTest);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

console.log('Integrated canonical movements runtime into boot, renderers, tests and PWA.');

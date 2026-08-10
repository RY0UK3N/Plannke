const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'app.js');
const testPath = path.join(root, 'tests', 'legacy-runtime-retirement.test.js');
const workflowPath = path.join(root, '.github', 'workflows', 'retire-app-movements-once.yml');
const selfPath = __filename;

let app = fs.readFileSync(appPath, 'utf8');

function removeRange(startMarker, endMarker, label) {
  const start = app.indexOf(startMarker);
  const end = app.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(`Could not locate ${label}`);
  if (app.indexOf(startMarker, start + startMarker.length) >= 0) throw new Error(`Multiple ${label} start markers found`);
  app = app.slice(0, start) + app.slice(end);
}

const stateBlock = "let _currentMonth = null;\nlet _fluxoChart = null;\nlet _fluxoMode = 'sankey';\nlet _movViewMode = 'list'; // 'list', 'sankey', 'sunburst'\n\n";
if (!app.startsWith(stateBlock)) throw new Error('Legacy movement state block is not at app.js start');
app = app.slice(stateBlock.length);

removeRange(
  '/* ============================================================\n   BUSCA DE TRANSAÇÕES\n   ============================================================ */',
  '/* ============================================================\n   CAMPO DE VALOR FORMATADO (R$ 0,00)\n   ============================================================ */',
  'legacy clear-search block'
);

removeRange(
  'function filterDashboardToTransactions(type) {',
  '/* ============================================================\n   MODAL SYSTEM\n   ============================================================ */',
  'legacy dashboard movement helper'
);

removeRange(
  '/* ============================================================\n   FILTROS DA MOVIMENTAÇÃO — categoria + conta\n   ============================================================ */',
  '/* ============================================================\n   PROJEÇÃO — Previsão de Patrimônio (12 meses)\n   ============================================================ */',
  'legacy movement filter block'
);

const tailMarker = '/* ============================================================\n   DASHBOARD / NAVIGATION HELPERS\n   ============================================================ */';
const tailStart = app.indexOf(tailMarker);
if (tailStart < 0) throw new Error('Legacy movement tail marker not found');
const tail = app.slice(tailStart);
[
  'function filterDashboardToTransactions(filter)',
  'function renderMonthTabs(data)',
  'function setMovViewMode(mode)',
  'function renderMovimentacao(data)',
  'function renderSankey(data)',
  'function renderSunburst(data)',
  'function changeMonth(dir)',
  'const COLOR_MAP = new Proxy'
].forEach(marker => {
  if (!tail.includes(marker)) throw new Error(`Expected movement tail marker missing: ${marker}`);
});
app = `${app.slice(0, tailStart).trimEnd()}\n`;

[
  '_currentMonth', '_fluxoChart', '_fluxoMode', '_movViewMode',
  'function clearTxSearch(', 'function _populateMovFilters(',
  'function filterDashboardToTransactions(', 'function renderMonthTabs(',
  'function setMovViewMode(', 'function renderMovimentacao(',
  'function _getFluxoChart(', 'function _setFluxoEmpty(',
  'function renderSankey(', 'function renderSunburst(',
  'function updateMonthNavigator(', 'function changeMonth(',
  'const COLOR_MAP = new Proxy'
].forEach(marker => {
  if (app.includes(marker)) throw new Error(`Retired movement marker survived app.js cleanup: ${marker}`);
});

if (!app.includes('function renderProjection(')) throw new Error('Projection base must remain');
if (!app.includes('function renderAll(')) throw new Error('Temporary renderAll bridge must remain');
fs.writeFileSync(appPath, app);

let test = fs.readFileSync(testPath, 'utf8');
const dashboardDecl = "const dashboard = fs.readFileSync(path.join(root, 'app-dashboard.js'), 'utf8');";
if (!test.includes("const movements = fs.readFileSync(path.join(root, 'app-movements.js'), 'utf8');")) {
  if (!test.includes(dashboardDecl)) throw new Error('Retirement test dashboard declaration marker not found');
  test = test.replace(dashboardDecl, `${dashboardDecl}\nconst movements = fs.readFileSync(path.join(root, 'app-movements.js'), 'utf8');`);
}

const ownershipTest = `\ntest('app monolith no longer owns movement state filters or charts', () => {\n  ['clearTxSearch', '_populateMovFilters', 'filterDashboardToTransactions', 'renderMonthTabs', 'setMovViewMode', 'renderMovimentacao', 'renderSankey', 'renderSunburst', 'updateMonthNavigator', 'changeMonth']\n    .forEach(name => assert.doesNotMatch(app, new RegExp('function\\\\s+' + name.replace('_', '\\\\_') + '\\\\s*\\\\(')));\n  assert.doesNotMatch(app, /_currentMonth|_fluxoChart|_movViewMode|const COLOR_MAP = new Proxy/);\n\n  assert.match(movements, /root\\._populateMovFilters = populateMovementFilters/);\n  assert.match(movements, /root\\.renderMonthTabs = renderMonthTabs/);\n  assert.match(movements, /root\\.renderMovimentacao = renderMovimentacao/);\n  assert.match(movements, /root\\.renderSankey = renderSankey/);\n  assert.match(movements, /root\\.renderSunburst = renderSunburst/);\n  assert.match(movements, /root\\.changeMonth = changeMonth/);\n  assert.match(movements, /root\\.clearTxSearch = clearTxSearch/);\n  assert.match(app, /function renderProjection\\(/);\n});\n\ntest('legacy renderAll reaches movement globals only after canonical movement runtime is ready', () => {\n  assert.match(app, /function renderAll\\(\\)[\\s\\S]*renderMovimentacao\\(data\\);[\\s\\S]*_populateMovFilters\\(data\\);/);\n  assert.match(navigation, /root\\.PlannkeMovementsReady = movementsReady/);\n  assert.ok(navigation.indexOf(\"if (!movements) throw new Error('Runtime canônico de Movimentações não inicializou.');\") < navigation.indexOf('legacyInitApp.apply(root, args)'));\n});\n`;
if (!test.includes("test('app monolith no longer owns movement state filters or charts'")) {
  test = `${test.trimEnd()}\n${ownershipTest}`;
}

const artifactNeedle = "  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-renderers-once.yml')), false);";
if (test.includes(artifactNeedle) && !test.includes('retire-app-movements-once.js')) {
  test = test.replace(
    artifactNeedle,
    `${artifactNeedle}\n  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-app-movements-once.js')), false);\n  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-movements-once.yml')), false);`
  );
}
fs.writeFileSync(testPath, test);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}
console.log('Retired legacy movement runtime from app.js.');

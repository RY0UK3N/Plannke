const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'app.js');
const testPath = path.join(root, 'tests', 'legacy-runtime-retirement.test.js');
const workflowPath = path.join(root, '.github', 'workflows', 'retire-app-renderers-once.yml');
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
  '/* ============================================================\n   COMPARATIVO MENSAL — últimos 6 meses\n   ============================================================ */',
  '/* ============================================================\n   FILTROS DA MOVIMENTAÇÃO — categoria + conta\n   ============================================================ */',
  'legacy comparison chart'
);

removeRange(
  'function renderDashboard(data) {',
  '/* ============================================================\n   MONTH NAVIGATION\n   ============================================================ */',
  'legacy dashboard transaction and entity renderers'
);

removeRange(
  'function renderChart(data) {',
  '/* ============================================================\n   EXCEL — Memory Card (Enhanced Export)\n   ============================================================ */',
  'legacy dashboard doughnut chart'
);

app = app.replace('let _summaryChart = null;\n', '');

[
  'function renderComparisonChart(',
  'function renderDashboard(',
  'function _renderTxItem(',
  'function renderTransactions(',
  'function renderAccounts(',
  'function renderCards(',
  'function handlePayFatura(',
  'function renderChart('
].forEach(marker => {
  if (app.includes(marker)) throw new Error(`Retired renderer marker survived: ${marker}`);
});

if (!app.includes('const COLOR_MAP = new Proxy')) throw new Error('COLOR_MAP must remain for Sunburst');
if (!app.includes('function renderMovimentacao(')) throw new Error('Movement renderer must remain');
if (!app.includes('function renderSankey(') || !app.includes('function renderSunburst(')) throw new Error('Movement charts must remain');
if (!app.includes('function renderProjection(')) throw new Error('Projection base must remain until extracted');
fs.writeFileSync(appPath, app);

let test = fs.readFileSync(testPath, 'utf8');
const renderersDecl = "const renderers = fs.readFileSync(path.join(root, 'safe-renderers.js'), 'utf8');";
if (!test.includes("const dashboard = fs.readFileSync(path.join(root, 'app-dashboard.js'), 'utf8');")) {
  if (!test.includes(renderersDecl)) throw new Error('Safe renderer declaration marker not found');
  test = test.replace(renderersDecl, `${renderersDecl}\nconst dashboard = fs.readFileSync(path.join(root, 'app-dashboard.js'), 'utf8');`);
}

const ownershipTest = `\ntest('app monolith no longer owns canonical dashboard transaction or entity renderers', () => {\n  ['renderComparisonChart', 'renderDashboard', '_renderTxItem', 'renderTransactions', 'renderAccounts', 'renderCards', 'handlePayFatura', 'renderChart']\n    .forEach(name => assert.doesNotMatch(app, new RegExp('function\\\\s+' + name.replace('_', '\\\\_') + '\\\\s*\\\\(')));\n\n  assert.match(dashboard, /root\\.renderChart = renderChart/);\n  assert.match(dashboard, /root\\.renderComparisonChart = renderComparisonChart/);\n  assert.match(renderers, /root\\._renderTxItem = safeRenderTxItem/);\n  assert.match(renderers, /root\\.renderTransactions = safeRenderTransactions/);\n  assert.match(renderers, /root\\.renderDashboard = safeRenderDashboard/);\n  assert.match(renderers, /root\\.renderAccounts = safeRenderAccounts/);\n  assert.match(renderers, /root\\.renderCards = safeRenderCards/);\n  assert.match(entities, /root\\.handlePayFatura = handlePayFatura/);\n\n  assert.match(app, /const COLOR_MAP = new Proxy/);\n  assert.match(app, /function renderMovimentacao\\(/);\n  assert.match(app, /function renderSankey\\(/);\n  assert.match(app, /function renderSunburst\\(/);\n  assert.match(app, /function renderProjection\\(/);\n});\n`;
if (!test.includes("test('app monolith no longer owns canonical dashboard transaction or entity renderers'")) {
  test = `${test.trimEnd()}\n${ownershipTest}`;
}

const artifactNeedle = "  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-settings-once.yml')), false);";
if (test.includes(artifactNeedle) && !test.includes('retire-app-renderers-once.js')) {
  test = test.replace(artifactNeedle, `${artifactNeedle}\n  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-app-renderers-once.js')), false);\n  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-renderers-once.yml')), false);`);
}
fs.writeFileSync(testPath, test);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

console.log('Retired legacy app dashboard, transaction and entity renderers.');

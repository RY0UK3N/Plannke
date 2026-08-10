const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const navigation = fs.readFileSync(path.join(root, 'app-navigation.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'app-dashboard.js'), 'utf8');
const renderers = fs.readFileSync(path.join(root, 'safe-renderers.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

test('canonical dashboard runtime is loaded and required before app boot', () => {
  assert.match(navigation, /function loadDashboardRuntime\(/);
  assert.match(navigation, /script\.src = 'app-dashboard\.js'/);
  assert.match(navigation, /root\.PlannkeDashboardReady = dashboardReady/);
  assert.match(navigation, /Promise\.all\(\[transactionsReady, dashboardReady, entitiesReady, settingsReady, projectionReady, planningReady, movementsReady, renderersReady\]\)/);
  assert.match(navigation, /Runtime canônico do dashboard não inicializou/);
});

test('dashboard chart runtime replaces chart globals used by the safe renderer', () => {
  assert.match(dashboard, /root\.renderChart = renderChart/);
  assert.match(dashboard, /root\.renderComparisonChart = renderComparisonChart/);
  assert.match(dashboard, /root\.PlannkeDashboard = \{/);
  assert.match(renderers, /renderChart\(data\)/);
  assert.match(renderers, /renderComparisonChart\(data\)/);
});

test('dashboard charts keep user data out of executable HTML', () => {
  assert.doesNotMatch(dashboard, /\.innerHTML\s*=/);
  assert.doesNotMatch(dashboard, /\.outerHTML\s*=/);
  assert.doesNotMatch(dashboard, /insertAdjacentHTML\s*\(/);
  assert.doesNotMatch(dashboard, /\beval\s*\(|new\s+Function\s*\(/);
  assert.match(dashboard, /empty\.textContent = 'Nenhum gasto neste mês\.'/);
  assert.match(dashboard, /new root\.Chart\(/);
});

test('dashboard runtime refreshes charts after theme changes', () => {
  assert.match(dashboard, /const legacyApplyTheme = root\.applyTheme/);
  assert.match(dashboard, /root\.applyTheme = function applyThemeWithCanonicalDashboard/);
  assert.match(dashboard, /refreshTheme\(\)/);
  assert.match(dashboard, /summaryChart\?\.update\('none'\)/);
});

test('dashboard runtime is syntax-checked and available offline', () => {
  assert.match(pkg, /node --check app-dashboard\.js/);
  assert.match(sw, /'\.\/app-dashboard\.js'/);
});

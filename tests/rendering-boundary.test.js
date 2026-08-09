const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'app-navigation.js'), 'utf8');
const renderers = fs.readFileSync(path.join(root, 'safe-renderers.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

test('application boot explicitly waits for the canonical rendering boundary', () => {
  assert.match(navigation, /function waitForCanonicalRenderers\(/);
  assert.match(navigation, /root\.PlannkeRenderersReady = renderersReady/);
  assert.match(navigation, /Promise\.all\(\[transactionsReady, renderersReady\]\)/);
  assert.match(navigation, /Renderizadores canônicos não inicializaram/);
  assert.match(navigation, /legacyInitApp\.apply\(root, args\)/);
});

test('safe renderer layer owns the current data-heavy rendering globals', () => {
  [
    '_renderTxItem',
    'renderTransactions',
    'renderAccounts',
    'renderCards',
    'renderBudgets',
    'renderBudgetManager',
    'renderDashboard'
  ].forEach(name => assert.match(renderers, new RegExp(`root\\.${name} = `)));

  assert.match(renderers, /root\.PlannkeSafeRenderers = \{/);
  assert.match(renderers, /renderDashboard: safeRenderDashboard/);
  assert.match(renderers, /renderTransactions: safeRenderTransactions/);
});

test('canonical data-heavy renderers do not build executable HTML strings', () => {
  assert.doesNotMatch(renderers, /\.innerHTML\s*=/);
  assert.doesNotMatch(renderers, /\.outerHTML\s*=/);
  assert.doesNotMatch(renderers, /insertAdjacentHTML\s*\(/);
  assert.doesNotMatch(renderers, /\beval\s*\(|new\s+Function\s*\(/);
  assert.match(renderers, /\.replaceChildren\(/);
  assert.match(renderers, /\.textContent = String\(textValue\)/);
});

test('dashboard renderer delegates only charts while owning user-data DOM', () => {
  assert.match(renderers, /function safeRenderDashboard\(data\)/);
  assert.match(renderers, /renderChart\(data\)/);
  assert.match(renderers, /renderComparisonChart\(data\)/);
  assert.match(renderers, /renderBudgets\(data\)/);
  assert.match(renderers, /recentList\.replaceChildren\(\)/);
  assert.match(renderers, /upcomingList\.replaceChildren\(\)/);
});

test('rendering boundary is loaded locally before application boot can complete', () => {
  const navigationAt = index.indexOf('src="app-navigation.js"');
  const bridgeAt = index.indexOf('src="ui-bridge.js"');
  const renderersAt = index.indexOf('src="safe-renderers.js"');
  const productAt = index.indexOf('src="product-core.js"');

  assert.ok(navigationAt >= 0 && bridgeAt > navigationAt);
  assert.ok(renderersAt > bridgeAt && productAt > renderersAt);
  assert.match(sw, /'\.\/safe-renderers\.js'/);
  assert.match(pkg, /node --check safe-renderers\.js/);
});

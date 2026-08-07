const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'safe-renderers.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('critical renderers avoid HTML-string APIs and executable attributes', () => {
  assert.doesNotMatch(code, /\.innerHTML\b/);
  assert.doesNotMatch(code, /\.outerHTML\b/);
  assert.doesNotMatch(code, /insertAdjacentHTML/);
  assert.doesNotMatch(code, /setAttribute\(\s*['"]on/i);
  assert.doesNotMatch(code, /\beval\s*\(/);
  assert.doesNotMatch(code, /new\s+Function\s*\(/);
  assert.match(code, /\.textContent\s*=/);
  assert.match(code, /addEventListener\(['"]click['"]/);
});

test('DOM-safe layer replaces the main user-data renderers', () => {
  for (const name of [
    '_renderTxItem',
    'renderTransactions',
    'renderAccounts',
    'renderCards',
    'renderBudgets',
    'renderBudgetManager',
    'renderDashboard'
  ]) {
    assert.match(code, new RegExp(`root\\.${name}\\s*=`), `${name} should be replaced`);
  }
});

test('card availability uses all outstanding unpaid billings', () => {
  assert.match(code, /getOutstandingCardBalance/);
  assert.match(code, /limite comprometido/i);
});

test('safe renderers load after legacy functions and before product wrappers', () => {
  const app = index.indexOf('<script src="app.js"></script>');
  const safe = index.indexOf('<script src="safe-renderers.js"></script>');
  const core = index.indexOf('<script src="product-core.js"></script>');
  const product = index.indexOf('<script src="product.js"></script>');
  assert.ok(app >= 0 && safe > app, 'safe-renderers.js must load after app.js');
  assert.ok(core > safe, 'product-core.js must load after safe-renderers.js');
  assert.ok(product > core, 'product.js must remain last among product layers');
});

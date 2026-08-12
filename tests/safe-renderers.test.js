const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'src', 'app', 'safe-renderers.js'), 'utf8');
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

test('pure product core loads before boot and safe renderers need no product compatibility runtime', () => {
  const core = index.indexOf('<script src="src/core/product-core.js"></script>');
  const runtime = index.indexOf('<script src="src/app/app-runtime.js"></script>');
  const boot = index.indexOf('<script src="src/app/app-boot.js"></script>');
  const safe = index.indexOf('<script src="src/app/safe-renderers.js"></script>');
  assert.ok(core >= 0 && core < runtime, 'product-core.js must load before application orchestration');
  assert.ok(boot > runtime && safe > boot, 'safe-renderers.js must load after canonical boot');
  assert.equal(index.indexOf('<script src="app.js"></script>'), -1);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const movements = fs.readFileSync(path.join(root, 'app-movements.js'), 'utf8');
const actions = fs.readFileSync(path.join(root, 'app-actions.js'), 'utf8');

function movementMarkup() {
  const start = html.indexOf('<div class="content-view hidden" id="movimentacao-view">');
  const end = html.indexOf('<div class="content-view hidden" id="projecao-view">', start);
  assert.ok(start >= 0 && end > start, 'movement workspace markers must exist');
  return html.slice(start, end);
}

test('movement workspace has no compatibility action attributes', () => {
  const markup = movementMarkup();
  assert.doesNotMatch(markup, /data-plannke-(?:onclick|onchange|oninput)=/);
  ['mov-month-prev', 'mov-month-next', 'btn-mov-list', 'btn-mov-sankey', 'btn-mov-sunburst', 'tx-filter', 'tx-filter-category', 'tx-filter-account', 'tx-search', 'tx-search-clear']
    .forEach(id => assert.match(markup, new RegExp(`id="${id}"`)));
});

test('app-movements explicitly binds its static controls once', () => {
  assert.match(movements, /let controlsBound = false/);
  assert.match(movements, /function bindMovementControls\(/);
  assert.match(movements, /if \(controlsBound \|\| typeof document === 'undefined'\) return/);
  assert.match(movements, /byId\('mov-month-prev'\)\?\.addEventListener\('click', \(\) => changeMonth\(-1\)\)/);
  assert.match(movements, /byId\('mov-month-next'\)\?\.addEventListener\('click', \(\) => changeMonth\(1\)\)/);
  assert.match(movements, /byId\('btn-mov-list'\)\?\.addEventListener\('click', \(\) => setMovViewMode\('list'\)\)/);
  assert.match(movements, /byId\('tx-search'\)\?\.addEventListener\('input', renderCurrentMovement\)/);
  assert.match(movements, /byId\('tx-search-clear'\)\?\.addEventListener\('click', clearTxSearch\)/);
  assert.match(movements, /root\.PlannkeMovements = api;\s*bindMovementControls\(\)/);
});

test('movement-local controls no longer occupy compatibility allowlist', () => {
  ['changeMonth', 'setMovViewMode', 'renderMovimentacao', 'clearTxSearch']
    .forEach(name => assert.doesNotMatch(actions, new RegExp(`'${name}'`)));
  assert.match(actions, /'filterDashboardToTransactions'/);
});

test('one-time movement control binding artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'bind-movement-controls-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'bind-movement-controls-once.yml')), false);
});

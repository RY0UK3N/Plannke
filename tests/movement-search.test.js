const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const movementsSource = fs.readFileSync(path.join(root, 'app-movements.js'), 'utf8');
const rendererSource = fs.readFileSync(path.join(root, 'safe-renderers.js'), 'utf8');

function loadMovements() {
  const context = { console, Intl, Math, Date, Set, Map, String, Number, Array, Object, RegExp, JSON };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'product-core.js'), 'utf8'), context);
  vm.runInContext(movementsSource, context);
  return context.PlannkeMovements;
}

test('smart search combines type, amount and tag filters from canonical movements runtime', () => {
  const api = loadMovements();
  const data = {
    accounts: [{ id: 'acc1', name: 'Nubank' }], cards: [],
    transactions: [
      { id: '1', type: 'expense', description: 'Hotel', category: 'Viagem', amount: 450, date: '2026-08-01', accountId: 'acc1', status: 'completed', tags: ['viagem'] },
      { id: '2', type: 'expense', description: 'Café', category: 'Restaurante', amount: 35, date: '2026-08-01', accountId: 'acc1', status: 'completed', tags: ['viagem'] },
      { id: '3', type: 'income', description: 'Reembolso', category: 'Outros', amount: 500, date: '2026-08-02', accountId: 'acc1', status: 'completed', tags: ['viagem'] }
    ]
  };
  const result = api.searchTransactions(data, 'gastos >200 #viagem');
  assert.equal(result.length, 1);
  assert.equal(result[0].description, 'Hotel');
});

test('smart search filters planned transactions by normalized account name', () => {
  const api = loadMovements();
  const data = {
    accounts: [{ id: 'acc1', name: 'Nubank' }, { id: 'acc2', name: 'Itaú' }], cards: [],
    transactions: [
      { id: '1', type: 'expense', description: 'Internet', category: 'Contas', amount: 120, date: '2026-08-20', accountId: 'acc1', status: 'planned', tags: [] },
      { id: '2', type: 'expense', description: 'Energia', category: 'Contas', amount: 180, date: '2026-08-21', accountId: 'acc2', status: 'planned', tags: [] },
      { id: '3', type: 'expense', description: 'Mercado', category: 'Supermercado', amount: 300, date: '2026-08-01', accountId: 'acc1', status: 'completed', tags: [] }
    ]
  };
  const result = api.searchTransactions(data, 'previstas conta:nubank');
  assert.equal(result.length, 1);
  assert.equal(result[0].description, 'Internet');
});

test('movement search recognizes structured filters without treating plain text as smart syntax', () => {
  const api = loadMovements();
  assert.equal(api.isSmartSearch('categoria:supermercado mes passado'), true);
  assert.equal(api.isSmartSearch('#viagem'), true);
  assert.equal(api.isSmartSearch('café da manhã'), false);
});

test('safe transaction renderer delegates structured queries to movements and keeps literal search local', () => {
  assert.match(rendererSource, /movementSearch\?\.isSmartSearch\?\.\(searchRaw\)/);
  assert.match(rendererSource, /movementSearch\.searchTransactions\(data, searchRaw\)/);
  assert.match(rendererSource, /searchTerm && !smartSearch/);
  assert.match(rendererSource, /root\.renderMonthTabs\?\.\(renderData\)/);
});

test('canonical movements runtime remains the structured-search owner', () => {
  assert.match(movementsSource, /function searchTransactions\(/);
  assert.match(movementsSource, /function isSmartSearch\(/);
});

test('movement search help is built with DOM APIs instead of HTML strings', () => {
  assert.match(movementsSource, /function installSearchHelp\(/);
  assert.match(movementsSource, /button\.textContent = label/);
  assert.match(movementsSource, /button\.dataset\.query = queryValue/);
  assert.doesNotMatch(movementsSource, /\.innerHTML\s*=/);
});

test('one-time movement search migration artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'promote-movement-search-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'promote-movement-search-once.yml')), false);
});

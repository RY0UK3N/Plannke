const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const runtime = fs.readFileSync(path.join(root, 'src', 'app', 'app-runtime.js'), 'utf8');
const movements = fs.readFileSync(path.join(root, 'src', 'app', 'app-movements.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'src', 'app', 'app-navigation.js'), 'utf8');

test('movement DOM and chart ownership lives only in the canonical movement runtime', () => {
  assert.equal(fs.existsSync(path.join(root, 'app.js')), false);
  assert.doesNotMatch(runtime, /sankeyChart|tx-filter-category|tx-filter-account|fluxo-month-text/);
  assert.doesNotMatch(runtime, /_currentMonth|_fluxoChart|_movViewMode|COLOR_MAP/);
  assert.match(movements, /byId\('sankeyChart'\)/);
  assert.match(movements, /byId\('tx-filter-category'\)/);
  assert.match(movements, /byId\('tx-filter-account'\)/);
  assert.match(movements, /root\.PlannkeMovements = api/);
});

test('canonical render orchestration reaches movement globals only after PlannkeMovementsReady', () => {
  assert.match(runtime, /function renderAll\(\)[\s\S]*root\.renderMovimentacao\?\.\(data\);[\s\S]*root\._populateMovFilters\?\.\(data\);/);
  assert.match(navigation, /root\.PlannkeMovementsReady = movementsReady/);
  assert.ok(
    navigation.indexOf("if (!movements) throw new Error('Runtime canônico de Movimentações não inicializou.');")
      < navigation.indexOf('legacyInitApp.apply(root, args)')
  );
});

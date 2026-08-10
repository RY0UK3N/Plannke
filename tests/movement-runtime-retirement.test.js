const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const movements = fs.readFileSync(path.join(root, 'app-movements.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'app-navigation.js'), 'utf8');

test('movement DOM and chart ownership no longer leaks into app.js', () => {
  assert.doesNotMatch(app, /sankeyChart|tx-filter-category|tx-filter-account|fluxo-month-text/);
  assert.doesNotMatch(app, /_currentMonth|_fluxoChart|_movViewMode|COLOR_MAP/);
  assert.doesNotMatch(app, /function (?:renderMovimentacao|renderSankey|renderSunburst|renderMonthTabs|changeMonth|clearTxSearch)\(/);

  assert.match(movements, /byId\('sankeyChart'\)/);
  assert.match(movements, /byId\('tx-filter-category'\)/);
  assert.match(movements, /byId\('tx-filter-account'\)/);
  assert.match(movements, /root\.PlannkeMovements = api/);
});

test('legacy render bridge can only reach movement globals after PlannkeMovementsReady', () => {
  assert.match(app, /function renderAll\(\)[\s\S]*renderMovimentacao\(data\);[\s\S]*_populateMovFilters\(data\);/);
  assert.match(navigation, /root\.PlannkeMovementsReady = movementsReady/);
  assert.ok(
    navigation.indexOf("if (!movements) throw new Error('Runtime canônico de Movimentações não inicializou.');")
      < navigation.indexOf('legacyInitApp.apply(root, args)')
  );
});

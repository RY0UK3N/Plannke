const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const projection = fs.readFileSync(path.join(root, 'src', 'app', 'app-projection.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'src', 'app', 'app-navigation.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

function runtime() {
  const sandbox = { console, Intl };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(projection, sandbox, { filename: 'app-projection.js' });
  return sandbox.PlannkeProjection;
}

test('canonical projection runtime is required before planning and legacy init', () => {
  assert.match(navigation, /function loadProjectionRuntime\(/);
  assert.match(navigation, /script\.src = 'src\/app\/app-projection\.js'/);
  assert.match(navigation, /root\.PlannkeProjectionReady = projectionReady/);
  assert.match(navigation, /projectionReady\.then\(/);
  assert.match(navigation, /Runtime canônico de Projeção não inicializou/);
});

test('historical average is used only when there is no recurring plan', () => {
  const api = runtime();
  const model = api.buildProjectionModel({
    accounts: [{ balance: 1000 }],
    transactions: [
      { date: '2026-05-10', type: 'income', amount: 3000 },
      { date: '2026-05-11', type: 'expense', amount: 1000 },
      { date: '2026-06-10', type: 'income', amount: 3000 },
      { date: '2026-06-11', type: 'expense', amount: 1000 },
      { date: '2026-07-10', type: 'income', amount: 3000 },
      { date: '2026-07-11', type: 'expense', amount: 1000 }
    ]
  }, '2026-08-09');

  assert.equal(model.source.mode, 'history');
  assert.equal(model.source.count, 3);
  assert.equal(model.incomes[0], 0);
  assert.equal(model.expenses[0], 0);
  assert.equal(model.incomes[1], 3000);
  assert.equal(model.expenses[1], 1000);
});

test('planned recurring occurrences replace rather than stack with historical average', () => {
  const api = runtime();
  const model = api.buildProjectionModel({
    accounts: [{ balance: 1000 }],
    transactions: [
      { date: '2026-05-10', type: 'income', amount: 5000 },
      { date: '2026-05-11', type: 'expense', amount: 2500 },
      { date: '2026-06-10', type: 'income', amount: 5000 },
      { date: '2026-06-11', type: 'expense', amount: 2500 },
      { date: '2026-07-10', type: 'income', amount: 5000 },
      { date: '2026-07-11', type: 'expense', amount: 2500 },
      { id: '_rec_salary_2026-09-05', ruleId: 'salary', synthetic: true, status: 'planned', date: '2026-09-05', type: 'income', amount: 3000 },
      { id: '_rec_rent_2026-09-10', ruleId: 'rent', synthetic: true, status: 'planned', date: '2026-09-10', type: 'expense', amount: 1200 }
    ]
  }, '2026-08-09');

  assert.equal(model.source.mode, 'planned-recurring');
  assert.equal(model.source.count, 2);
  assert.equal(model.incomes[1], 3000);
  assert.equal(model.expenses[1], 1200);
});

test('legacy recurring transactions keep monthly baseline compatibility', () => {
  const api = runtime();
  const model = api.buildProjectionModel({
    accounts: [{ balance: 500 }],
    transactions: [
      { date: '2026-01-05', type: 'income', amount: 1000, recurring: true },
      { date: '2026-01-10', type: 'expense', amount: 400, recurring: true }
    ]
  }, '2026-08-09');

  assert.equal(model.source.mode, 'legacy-recurring');
  assert.equal(model.incomes[0], 0);
  assert.equal(model.expenses[0], 0);
  assert.equal(model.incomes[1], 1000);
  assert.equal(model.expenses[1], 400);
});

test('projection rendering uses DOM APIs and rich-text tooltips', () => {
  assert.match(projection, /summary\.replaceChildren\(\)/);
  assert.match(projection, /document\.createTextNode\(/);
  assert.match(projection, /renderMode: 'richText'/);
  assert.doesNotMatch(projection, /\.innerHTML\s*=/);
  assert.doesNotMatch(projection, /\.outerHTML\s*=/);
  assert.doesNotMatch(projection, /insertAdjacentHTML\s*\(/);
  assert.doesNotMatch(projection, /<b>|<br\s*\/?/i);
  assert.doesNotMatch(projection, /\beval\s*\(|new\s+Function\s*\(/);
});

test('projection runtime is syntax-checked and available offline', () => {
  assert.match(pkg, /node --check src\/app\/app-projection\.js/);
  assert.match(sw, /'\.\/src\/app\/app-projection\.js'/);
});

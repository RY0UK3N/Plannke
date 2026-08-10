const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const navigation = fs.readFileSync(path.join(root, 'app-navigation.js'), 'utf8');
const planning = fs.readFileSync(path.join(root, 'app-planning.js'), 'utf8');
const core = require(path.join(root, 'product-core.js'));
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

test('canonical planning runtime is loaded and required before app boot', () => {
  assert.match(navigation, /function loadPlanningRuntime\(/);
  assert.match(navigation, /script\.src = 'app-planning\.js'/);
  assert.match(navigation, /root\.PlannkePlanningReady = planningReady/);
  assert.match(navigation, /Promise\.all\(\[transactionsReady, dashboardReady, entitiesReady, settingsReady, planningReady, renderersReady\]\)/);
  assert.match(navigation, /Runtime canônico de Planejamento não inicializou/);
});

test('planning UI renders user-controlled values with DOM APIs', () => {
  assert.match(planning, /hub\.replaceChildren\(\)/);
  assert.match(planning, /node\.textContent = String\(textValue\)/);
  assert.match(planning, /document\.createTextNode\(/);
  assert.match(planning, /form\.addEventListener\('submit'/);
  assert.doesNotMatch(planning, /\.innerHTML\s*=/);
  assert.doesNotMatch(planning, /\.outerHTML\s*=/);
  assert.doesNotMatch(planning, /insertAdjacentHTML\s*\(/);
  assert.doesNotMatch(planning, /\beval\s*\(|new\s+Function\s*\(/);
});

test('projection data includes clamped recurring occurrences from PlannkeCore', async () => {
  const sandbox = {
    console,
    PlannkeCore: core,
    renderProjection() {},
    formatCurrency: value => String(value),
    formatDate: value => String(value)
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(planning, sandbox, { filename: 'app-planning.js' });
  await sandbox.PlannkePlanning.ready;

  const data = {
    accounts: [{ id: 'acc', name: 'Conta', balance: 1000 }],
    cards: [],
    transactions: [],
    settings: {},
    planning: {
      goals: [],
      reserves: [],
      categoryRules: [],
      recurringRules: [{
        id: 'rent', type: 'expense', description: 'Aluguel', category: 'Casa', amount: 100,
        dayOfMonth: 31, accountId: 'acc', startDate: '2025-01-31', endDate: '', active: true
      }]
    }
  };

  const projected = sandbox.PlannkePlanning.buildProjectionData(data, '2025-01-30');
  const dates = projected.transactions.slice(0, 3).map(tx => tx.date);
  assert.deepEqual(Array.from(dates), ['2025-01-31', '2025-02-28', '2025-03-31']);
  assert.ok(projected.transactions.every(tx => tx.synthetic && tx.status === 'planned'));
});

test('planning boundary prevents product.js from reclaiming renderProjection during boot', async () => {
  const legacy = () => 'legacy';
  const sandbox = { console, PlannkeCore: core, renderProjection: legacy };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(planning, sandbox, { filename: 'app-planning.js' });
  await sandbox.PlannkePlanning.ready;

  const canonical = sandbox.renderProjection;
  sandbox.renderProjection = () => 'product-wrapper';
  assert.equal(sandbox.renderProjection, canonical);
  assert.equal(canonical.__plannkeCanonicalPlanning, true);
});

test('removing a household member also clears persisted sharing references', () => {
  assert.match(planning, /sharedTransactionMeta/);
  assert.match(planning, /meta\.paidByMemberId === id/);
  assert.match(planning, /meta\.sharedWithMemberIds = meta\.sharedWithMemberIds\.filter/);
});

test('planning runtime is syntax-checked and available offline', () => {
  assert.match(pkg, /node --check app-planning\.js/);
  assert.match(sw, /'\.\/app-planning\.js'/);
});

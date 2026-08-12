const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const navigation = fs.readFileSync(path.join(root, 'src', 'app', 'app-navigation.js'), 'utf8');
const planning = fs.readFileSync(path.join(root, 'src', 'app', 'app-planning.js'), 'utf8');
const core = require(path.join(root, 'src', 'core', 'product-core.js'));
const Money = require(path.join(root, 'src', 'shared', 'money.js'));
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

function sandboxFor(data = null, projectionRender = () => undefined) {
  let saved = null;
  const sandbox = {
    console,
    PlannkeCore: core,
    PlannkeMoney: Money,
    PlannkeProjection: { renderProjection: projectionRender },
    formatCurrency: value => String(value),
    formatDate: value => String(value),
    getData: data ? () => data : undefined,
    saveData: data ? value => { saved = value; } : undefined,
    renderAll() {},
    showToast() {}
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(planning, sandbox, { filename: 'app-planning.js' });
  return { sandbox, saved: () => saved };
}

test('canonical planning runtime waits for canonical projection before app boot', () => {
  assert.doesNotMatch(navigation, /PlannkeProjectionBase/);
  assert.match(navigation, /function loadProjectionRuntime\(/);
  assert.match(navigation, /function loadPlanningRuntime\(/);
  assert.match(navigation, /projectionReady\.then\(/);
  assert.match(navigation, /root\.PlannkeProjectionReady = projectionReady/);
  assert.match(navigation, /root\.PlannkePlanningReady = planningReady/);
  assert.match(navigation, /Promise\.all\(\[transactionsReady, dashboardReady, entitiesReady, settingsReady, projectionReady, planningReady, movementsReady, renderersReady\]\)/);
  assert.match(navigation, /Runtime canônico de Projeção não inicializou/);
  assert.match(navigation, /Runtime canônico de Planejamento não inicializou/);
});

test('planning UI renders user-controlled values with DOM APIs', () => {
  assert.match(planning, /hub\.replaceChildren\(\)/);
  assert.match(planning, /hub\.onclick = event =>/);
  assert.match(planning, /node\.textContent = String\(textValue\)/);
  assert.match(planning, /document\.createTextNode\(/);
  assert.match(planning, /form\.addEventListener\('submit'/);
  assert.doesNotMatch(planning, /\.innerHTML\s*=/);
  assert.doesNotMatch(planning, /\.outerHTML\s*=/);
  assert.doesNotMatch(planning, /insertAdjacentHTML\s*\(/);
  assert.doesNotMatch(planning, /\beval\s*\(|new\s+Function\s*\(/);
});

test('projection data includes clamped recurring occurrences from PlannkeCore', async () => {
  const { sandbox } = sandboxFor();
  await sandbox.PlannkePlanning.ready;

  const data = {
    accounts: [{ id: 'acc', name: 'Conta', balance: 1000 }],
    cards: [], transactions: [], settings: {},
    planning: {
      goals: [], reserves: [], categoryRules: [],
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

test('planning projection delegates visual model to PlannkeProjection then renders hub', async () => {
  let calls = 0;
  let received = null;
  const data = {
    accounts: [], cards: [], transactions: [], settings: {},
    planning: { goals: [], reserves: [], recurringRules: [], categoryRules: [] }
  };
  const { sandbox } = sandboxFor(data, projectionData => {
    calls += 1;
    received = projectionData;
    return { delegated: true };
  });
  await sandbox.PlannkePlanning.ready;

  const result = sandbox.renderProjection(data);
  assert.equal(calls, 1);
  assert.equal(result.delegated, true);
  assert.ok(received);
  assert.equal(sandbox.renderProjection.__plannkeCanonicalPlanning, true);
});

test('planning no longer owns projection capture or property locking', () => {
  assert.doesNotMatch(planning, /legacyProjection|PlannkeProjectionBase|projectionBoundaryLocked|Object\.defineProperty\(root, 'renderProjection'/);
  assert.match(planning, /root\.PlannkeProjection\?\.renderProjection\?\.\(/);
  assert.match(planning, /root\.renderProjection = canonicalRenderProjection/);
});

test('household balances split completed shared expenses equally', async () => {
  const { sandbox } = sandboxFor();
  await sandbox.PlannkePlanning.ready;
  const data = {
    accounts: [], cards: [], planning: {},
    settings: { household: { enabled: true, members: [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Bia' }] } },
    transactions: [{ type: 'expense', status: 'completed', amount: 100, paidByMemberId: 'a', sharedWithMemberIds: ['b'] }]
  };
  const balances = sandbox.PlannkePlanning.householdBalances(data);
  assert.equal(balances.a, 50);
  assert.equal(balances.b, -50);
});

test('planning actions persist goal updates and item removals through saveData', async () => {
  const data = {
    accounts: [], cards: [], transactions: [], settings: {},
    planning: {
      goals: [{ id: 'g1', name: 'Viagem', targetAmount: 1000, currentAmount: 100, targetDate: '' }],
      reserves: [{ id: 'r1', name: 'Emergência', amount: 200 }],
      recurringRules: [{ id: 'rule1', type: 'expense', description: 'Internet', category: 'Casa', amount: 100, dayOfMonth: 10, accountId: 'acc', startDate: '2025-01-01', endDate: '', active: true }],
      categoryRules: [{ id: 'cat1', contains: 'uber', category: 'Transporte' }]
    }
  };
  const { sandbox, saved } = sandboxFor(data);
  await sandbox.PlannkePlanning.ready;

  const hub = { querySelectorAll: () => [{ dataset: { goalCurrent: 'g1' }, value: '350.50' }] };
  sandbox.PlannkePlanning.handlePlanningAction('save-goal-current', 'g1', hub);
  assert.equal(saved().planning.goals[0].currentAmount, 35050);

  sandbox.PlannkePlanning.handlePlanningAction('delete-reserve', 'r1', hub);
  assert.equal(saved().planning.reserves.length, 0);
  sandbox.PlannkePlanning.handlePlanningAction('delete-rule', 'rule1', hub);
  assert.equal(saved().planning.recurringRules.length, 0);
  sandbox.PlannkePlanning.handlePlanningAction('delete-cat-rule', 'cat1', hub);
  assert.equal(saved().planning.categoryRules.length, 0);
});

test('removing a household member clears live and persisted sharing references', async () => {
  const data = {
    accounts: [], cards: [], planning: {},
    settings: {
      household: { enabled: true, members: [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Bia' }] },
      sharedTransactionMeta: { tx1: { paidByMemberId: 'b', sharedWithMemberIds: ['a', 'b'] } }
    },
    transactions: [{ id: 'tx1', paidByMemberId: 'b', sharedWithMemberIds: ['a', 'b'] }]
  };
  const { sandbox, saved } = sandboxFor(data);
  await sandbox.PlannkePlanning.ready;
  sandbox.PlannkePlanning.handlePlanningAction('delete-member', 'b', { querySelectorAll: () => [] });

  assert.deepEqual(Array.from(saved().settings.household.members, member => member.id), ['a']);
  assert.equal(saved().transactions[0].paidByMemberId, null);
  assert.deepEqual(Array.from(saved().transactions[0].sharedWithMemberIds), ['a']);
  assert.equal(saved().settings.sharedTransactionMeta.tx1.paidByMemberId, null);
  assert.deepEqual(Array.from(saved().settings.sharedTransactionMeta.tx1.sharedWithMemberIds), ['a']);
});

test('planning runtime is syntax-checked and available offline', () => {
  assert.match(pkg, /node --check src\/app\/app-planning\.js/);
  assert.match(sw, /'\.\/src\/app\/app-planning\.js'/);
});

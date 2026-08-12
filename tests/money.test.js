const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const M = require('../src/shared/money.js');

test('converte e formata dinheiro somente na fronteira de Money', () => {
  assert.equal(M.reaisToCents(0.1), 10);
  assert.equal(M.reaisToCents(0.2), 20);
  assert.equal(M.reaisToCents(0.1 + 0.2), 30);
  assert.equal(M.parseMoneyInput('R$ 1.234,56'), 123456);
  assert.equal(M.formatMoney(1001), 'R$ 10,01');
});

test('parcelamento distribui o resto deterministicamente e conserva o total', () => {
  assert.deepEqual(M.allocateMoney(10000, 3), [3334, 3333, 3333]);
  assert.equal(M.allocateMoney(10000, 3).reduce((sum, value) => sum + value, 0), 10000);
});

test('migração monetária v2 para v3 converte todos os campos e é idempotente', () => {
  const legacy = {
    schemaVersion: 2,
    accounts: [{ balance: 0.1 + 0.2, openingBalance: -10.01 }],
    cards: [{ limit: 100.25 }],
    transactions: [{ amount: 0.1 }],
    cardBillings: [{ paidAmount: 0.2 }],
    planning: { goals: [{ targetAmount: 50, currentAmount: 1.01 }], reserves: [{ amount: 2 }], recurringRules: [{ amount: 3 }] },
    settings: { schemaVersion: 2, budgets: { Casa: 4.5 }, productState: { openingBalances: { acc: 5 }, planning: { goals: [], reserves: [], recurringRules: [] } } }
  };
  const first = M.migrateDataToCents(legacy);
  assert.equal(first.data.accounts[0].balance, 30);
  assert.equal(first.data.accounts[0].openingBalance, -1001);
  assert.equal(first.data.cards[0].limit, 10025);
  assert.equal(first.data.transactions[0].amount, 10);
  assert.equal(first.data.settings.budgets.Casa, 450);
  assert.equal(first.data.planning.goals[0].currentAmount, 101);
  const second = M.migrateDataToCents(first.data);
  assert.equal(second.changed, false);
  assert.deepEqual(second.data, first.data);
});

test('schema em centavos rejeita valores fracionários e versões futuras', () => {
  assert.throws(() => M.migrateDataToCents({ schemaVersion: 3, transactions: [{ amount: 10.5 }], settings: {} }), error => error.code === 'INVALID_MONEY_VALUE');
  assert.throws(() => M.migrateDataToCents({ schemaVersion: 99, settings: {} }), error => error.code === 'UNSUPPORTED_SCHEMA_VERSION');
});

test('fronteira Money carrega antes do domínio e está disponível offline', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const sw = fs.readFileSync('sw.js', 'utf8');
  assert.ok(html.indexOf('src/shared/money.js') < html.indexOf('src/core/storage.js'));
  assert.match(sw, /\.\/src\/shared\/money\.js/);
});

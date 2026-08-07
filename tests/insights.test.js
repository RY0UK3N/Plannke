const test = require('node:test');
const assert = require('node:assert/strict');

const C = require('../product-core.js');
global.PlannkeCore = C;
const I = require('../insights.js');

function baseData() {
  return {
    accounts: [{ id: 'acc', name: 'Conta', openingBalance: 5000, balance: 5000 }],
    cards: [],
    cardBillings: [],
    transactions: [],
    planning: { goals: [], reserves: [], recurringRules: [], categoryRules: [], onboardingComplete: true },
    settings: { budgets: {} }
  };
}

test('compares month-to-date with the same period of previous month', () => {
  const data = baseData();
  data.transactions.push(
    { id: 'old', type: 'expense', amount: 100, date: '2026-07-05', status: 'completed', category: 'Mercado', accountId: 'acc' },
    { id: 'new', type: 'expense', amount: 150, date: '2026-08-05', status: 'completed', category: 'Mercado', accountId: 'acc' }
  );
  const insights = I.buildInsights(data, '2026-08-07');
  const comparison = insights.find(x => x.id === 'month-comparison');
  assert.ok(comparison);
  assert.match(comparison.text, /50% a mais/);
});

test('flags a category close to or over its monthly budget', () => {
  const data = baseData();
  data.settings.budgets = { Supermercado: 500 };
  data.transactions.push({ id: 'm', type: 'expense', amount: 450, date: '2026-08-04', status: 'completed', category: 'Supermercado', accountId: 'acc' });
  const insight = I.buildInsights(data, '2026-08-07').find(x => x.id === 'budget-Supermercado');
  assert.ok(insight);
  assert.match(insight.text, /90%/);
});

test('sums planned and recurring expenses in the next seven days', () => {
  const data = baseData();
  data.transactions.push({ id: 'bill', type: 'expense', amount: 200, date: '2026-08-10', status: 'planned', category: 'Conta', accountId: 'acc' });
  data.planning.recurringRules.push({ id: 'internet', type: 'expense', description: 'Internet', category: 'Internet', amount: 100, dayOfMonth: 12, accountId: 'acc', startDate: '2026-01-01', endDate: '', active: true });
  const upcoming = I.upcomingExpenses(data, '2026-08-07', 7);
  assert.equal(upcoming.total, 300);
  assert.equal(upcoming.count, 2);
});

test('warns when recurring expenses consume most recurring income', () => {
  const data = baseData();
  data.planning.recurringRules.push(
    { id: 'salary', type: 'income', description: 'Salário', category: 'Salário', amount: 3000, dayOfMonth: 5, accountId: 'acc', startDate: '2026-01-01', endDate: '', active: true },
    { id: 'rent', type: 'expense', description: 'Aluguel', category: 'Moradia', amount: 2500, dayOfMonth: 10, accountId: 'acc', startDate: '2026-01-01', endDate: '', active: true }
  );
  const insight = I.buildInsights(data, '2026-08-07').find(x => x.id === 'fixed-load');
  assert.ok(insight);
  assert.equal(insight.kind, 'warning');
  assert.match(insight.text, /83%/);
});

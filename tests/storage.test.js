const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function makeStorage() {
  const map = new Map();
  return {
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    clear: () => map.clear()
  };
}

function loadStorage() {
  const context = {
    console,
    Intl,
    Date,
    structuredClone,
    crypto: globalThis.crypto,
    sessionStorage: makeStorage()
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('storage.js', 'utf8'), context, { filename: 'storage.js' });
  return context;
}

test('transferência conta -> cartão debita a origem apenas uma vez', () => {
  const ctx = loadStorage();
  const data = {
    schemaVersion: 2,
    accounts: [{ id: 'acc', name: 'Conta', balance: 1000 }],
    cards: [{ id: 'card', name: 'Cartão', limit: 5000, closingDay: 10, dueDay: 20 }],
    transactions: [],
    cardBillings: [],
    settings: {}
  };

  ctx.applyTransactionBalances(data, 'transfer', 200, 'acc', 'card');
  assert.equal(data.accounts[0].balance, 800);

  ctx.revertTransactionBalances(data, {
    type: 'transfer', amount: 200, accountId: 'acc', destinationId: 'card'
  });
  assert.equal(data.accounts[0].balance, 1000);
});

test('vencimento 31 é limitado ao último dia do mês', () => {
  const ctx = loadStorage();
  const data = {
    accounts: [],
    cards: [{ id: 'card', name: 'Cartão', limit: 5000, closingDay: 10, dueDay: 31 }],
    transactions: [],
    cardBillings: [],
    settings: {}
  };

  const billing = ctx.getCardBilling(data, 'card', '2026-01');
  assert.equal(billing.dueDate, '2026-02-28');
});

test('pagamento de fatura cria vínculo e debita uma vez', () => {
  const ctx = loadStorage();
  const data = {
    schemaVersion: 2,
    accounts: [{ id: 'acc', name: 'Conta', balance: 1000 }],
    cards: [{ id: 'card', name: 'Cartão', limit: 5000, closingDay: 10, dueDay: 20 }],
    transactions: [],
    cardBillings: [],
    settings: {}
  };
  ctx.sessionStorage.setItem('planner_session_cache', JSON.stringify(data));

  const paymentId = ctx.payCardBilling('card', '2026-07', 'acc', 300);
  const saved = ctx.getData();

  assert.ok(paymentId);
  assert.equal(saved.accounts[0].balance, 700);
  assert.equal(saved.transactions.length, 1);
  assert.equal(saved.transactions[0].id, paymentId);
  assert.equal(saved.cardBillings[0].paymentTransactionId, paymentId);
  assert.equal(saved.cardBillings[0].isPaid, true);
});

test('excluir pagamento reabre fatura e restaura saldo', () => {
  const ctx = loadStorage();
  const data = {
    schemaVersion: 2,
    accounts: [{ id: 'acc', name: 'Conta', balance: 1000 }],
    cards: [{ id: 'card', name: 'Cartão', limit: 5000, closingDay: 10, dueDay: 20 }],
    transactions: [],
    cardBillings: [],
    settings: {}
  };
  ctx.sessionStorage.setItem('planner_session_cache', JSON.stringify(data));

  const paymentId = ctx.payCardBilling('card', '2026-07', 'acc', 300);
  ctx.deleteTransaction(paymentId);
  const saved = ctx.getData();

  assert.equal(saved.accounts[0].balance, 1000);
  assert.equal(saved.transactions.length, 0);
  assert.equal(saved.cardBillings[0].isPaid, false);
  assert.equal(saved.cardBillings[0].paymentTransactionId, null);
});

test('limite comprometido ignora apenas faturas realmente pagas', () => {
  const ctx = loadStorage();
  const data = {
    accounts: [],
    cards: [{ id: 'card', name: 'Cartão', limit: 5000, closingDay: 10, dueDay: 20 }],
    transactions: [
      { id: 'a', type: 'expense', amount: 100, date: '2026-07-15', accountId: 'card' },
      { id: 'b', type: 'expense', amount: 250, date: '2026-08-15', accountId: 'card' }
    ],
    cardBillings: [
      { cardId: 'card', period: '2026-07', isPaid: true }
    ],
    settings: {}
  };

  assert.equal(ctx.getOutstandingCardBalance(data, 'card'), 250);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadStorage() {
  const events = [];
  class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  }
  const context = {
    console,
    Intl,
    Date,
    Math,
    JSON,
    structuredClone,
    crypto: globalThis.crypto,
    CustomEvent,
    dispatchEvent(event) { events.push(event); }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('src/core/storage.js', 'utf8'), context, { filename: 'storage.js' });
  context.__events = events;
  return context;
}

function baseData() {
  return {
    schemaVersion: 2,
    accounts: [{ id: 'acc', name: 'Conta', balance: 1000 }],
    cards: [{ id: 'card', name: 'Cartão', limit: 5000, closingDay: 10, dueDay: 20 }],
    transactions: [],
    cardBillings: [],
    settings: {}
  };
}

test('transferência conta -> cartão debita a origem apenas uma vez', () => {
  const ctx = loadStorage();
  const data = baseData();
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
  ctx.saveData(baseData());
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
  ctx.saveData(baseData());
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
    cardBillings: [{ cardId: 'card', period: '2026-07', isPaid: true }],
    settings: {}
  };
  assert.equal(ctx.getOutstandingCardBalance(data, 'card'), 250);
});

test('parcelamento preserva o dia original e limita meses curtos', () => {
  const ctx = loadStorage();
  ctx.saveData(baseData());
  ctx.saveTransaction(null, 'expense', 'Notebook', 100, '2026-01-31', 'acc', 'Compras', 1, 3, 'grupo', null, false);
  ctx.saveTransaction(null, 'expense', 'Notebook', 100, '2026-03-03', 'acc', 'Compras', 2, 3, 'grupo', null, false);
  ctx.saveTransaction(null, 'expense', 'Notebook', 100, '2026-04-03', 'acc', 'Compras', 3, 3, 'grupo', null, false);
  const txs = ctx.getData().transactions.filter(t => t.groupId === 'grupo');
  assert.deepEqual(Array.from(txs, t => t.date), ['2026-01-31', '2026-02-28', '2026-03-31']);
});

test('normalização neutraliza HTML, atributos e strings executáveis', () => {
  const ctx = loadStorage();
  const raw = {
    accounts: [{ id: 'acc\" onclick=alert(1)', name: '<img src=x onerror=alert(1)>', balance: 10 }],
    cards: [],
    transactions: [{
      id: "tx');alert(1)//",
      type: 'expense',
      description: '<svg onload=alert(1)>',
      category: "McDonald's & <Teste>",
      amount: 5,
      date: '2026-08-07',
      accountId: 'acc\" onclick=alert(1)'
    }],
    cardBillings: [],
    settings: {
      categories: { income: [], expense: { '<Grupo>': ["Cat');alert(1)//"] } },
      budgets: {},
      categoryColors: {}
    }
  };
  ctx.saveData(raw);
  const safe = ctx.getData();
  assert.doesNotMatch(safe.accounts[0].id, /[^A-Za-z0-9_.:-]/);
  assert.equal(safe.transactions[0].accountId, safe.accounts[0].id);
  assert.doesNotMatch(safe.accounts[0].name, /[<>&"'\\]/);
  assert.doesNotMatch(safe.transactions[0].description, /[<>&"'\\]/);
  assert.doesNotMatch(safe.transactions[0].category, /[<>&"'\\]/);
  assert.ok(safe.transactions[0].category.includes('McDonald’s'));
});

test('salvar alteração emite evento de mudança sem depender de estado de backup', () => {
  const ctx = loadStorage();
  ctx.saveData(baseData());
  const before = ctx.__events.length;
  ctx.saveAccount('acc', 'Conta atualizada', 1000);
  assert.ok(ctx.__events.length > before);
  assert.equal(ctx.__events.at(-1).type, 'plannke:data-changed');
});

test('normalização de datas aceita ISO e DD/MM/AAAA', () => {
  const ctx = loadStorage();
  assert.equal(ctx.normalizeDateString('2026-08-07', ''), '2026-08-07');
  assert.equal(ctx.normalizeDateString('07/08/2026', ''), '2026-08-07');
  assert.equal(ctx.normalizeDateString('2026-02-31', ''), '');
});

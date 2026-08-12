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
  vm.runInContext(fs.readFileSync('src/shared/money.js', 'utf8'), context, { filename: 'money.js' });
  vm.runInContext(fs.readFileSync('src/core/storage.js', 'utf8'), context, { filename: 'storage.js' });
  context.__events = events;
  return context;
}

function baseData() {
  return {
    schemaVersion: 3,
    accounts: [{ id: 'acc', name: 'Conta', balance: 1000 }],
    cards: [{ id: 'card', name: 'Cartão', limit: 5000, closingDay: 10, dueDay: 20 }],
    transactions: [],
    cardBillings: [],
    settings: { schemaVersion: 3 }
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
  const data = baseData();
  data.transactions.push({ id: 'purchase', type: 'expense', amount: 300, date: '2026-07-15', accountId: 'card' });
  ctx.saveData(data);
  const paymentId = ctx.payCardBilling('card', '2026-07', 'acc', 300);
  const saved = ctx.getData();
  assert.ok(paymentId);
  assert.equal(saved.accounts[0].balance, 700);
  assert.equal(saved.transactions.length, 2);
  assert.equal(saved.transactions.find(transaction => transaction.id === paymentId).id, paymentId);
  assert.equal(saved.cardBillings[0].paymentTransactionId, paymentId);
  assert.equal(saved.cardBillings[0].isPaid, true);
});

test('excluir pagamento reabre fatura e restaura saldo', () => {
  const ctx = loadStorage();
  const data = baseData();
  data.transactions.push({ id: 'purchase', type: 'expense', amount: 300, date: '2026-07-15', accountId: 'card' });
  ctx.saveData(data);
  const paymentId = ctx.payCardBilling('card', '2026-07', 'acc', 300);
  ctx.deleteTransaction(paymentId);
  const saved = ctx.getData();
  assert.equal(saved.accounts[0].balance, 1000);
  assert.equal(saved.transactions.length, 1);
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

test('editar transação inexistente falha sem alterar saldo ou estado', () => {
  const ctx = loadStorage();
  ctx.saveData(baseData());
  const before = ctx.getData();
  assert.throws(
    () => ctx.saveTransaction('missing', 'expense', 'Fantasma', 10, '2026-08-12', 'acc', 'Outros', 1, 1, null, null, false),
    error => error.code === 'TRANSACTION_NOT_FOUND'
  );
  assert.deepEqual(ctx.getData(), before);
});

test('pagamento integral valida referências, valor, duplicidade e preserva estado nas falhas', () => {
  const ctx = loadStorage();
  const data = baseData();
  data.transactions.push({ id: 'purchase', type: 'expense', amount: 30, date: '2026-07-15', accountId: 'card' });
  ctx.saveData(data);
  const assertAtomicFailure = (fn, code) => {
    const before = ctx.getData();
    assert.throws(fn, error => error.code === code);
    assert.deepEqual(ctx.getData(), before);
  };
  assertAtomicFailure(() => ctx.payCardBilling('card', '2026-07', 'missing', 30), 'ACCOUNT_NOT_FOUND');
  assertAtomicFailure(() => ctx.payCardBilling('missing', '2026-07', 'acc', 30), 'CARD_NOT_FOUND');
  assertAtomicFailure(() => ctx.payCardBilling('card', '2026-06', 'acc', 30), 'BILLING_NOT_FOUND');
  for (const invalid of [0, -1, 20, 40]) {
    assertAtomicFailure(() => ctx.payCardBilling('card', '2026-07', 'acc', invalid), 'INVALID_AMOUNT');
  }
  assert.ok(ctx.payCardBilling('card', '2026-07', 'acc', 30));
  assertAtomicFailure(() => ctx.payCardBilling('card', '2026-07', 'acc', 30), 'BILLING_ALREADY_PAID');
});

test('conta e cartão com histórico são arquivados sem criar órfãos', () => {
  const ctx = loadStorage();
  const data = baseData();
  data.transactions.push({ id: 'a', type: 'expense', amount: 20, date: '2026-08-01', accountId: 'acc' });
  data.transactions.push({ id: 'b', type: 'expense', amount: 30, date: '2026-08-15', accountId: 'card' });
  data.cardBillings.push({ cardId: 'card', period: '2026-07', isPaid: false });
  ctx.saveData(data);
  assert.equal(ctx.deleteAccount('acc'), 'archived');
  assert.equal(ctx.deleteCard('card'), 'archived');
  const saved = ctx.getData();
  assert.equal(saved.accounts[0].status, 'archived');
  assert.equal(saved.cards[0].status, 'archived');
  assert.equal(saved.transactions.length, 2);
  assert.equal(saved.cardBillings.length, 1);
});

test('entidades sem referências ainda podem ser excluídas definitivamente', () => {
  const ctx = loadStorage();
  ctx.saveData(baseData());
  assert.equal(ctx.deleteAccount('acc'), 'deleted');
  assert.equal(ctx.deleteCard('card'), 'deleted');
  assert.equal(ctx.getData().accounts.length, 0);
  assert.equal(ctx.getData().cards.length, 0);
});

test('normalização restaura backup v2 em centavos uma única vez', () => {
  const ctx = loadStorage();
  const legacy = baseData();
  legacy.schemaVersion = 2;
  legacy.settings.schemaVersion = 2;
  legacy.accounts[0].balance = 0.1 + 0.2;
  legacy.accounts[0].openingBalance = 10.01;
  legacy.cards[0].limit = 99.99;
  legacy.transactions.push({ id: 'legacy', type: 'expense', amount: 0.1, date: '2026-08-01', accountId: 'acc' });
  const migrated = ctx.normalizeData(legacy);
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.accounts[0].balance, 30);
  assert.equal(migrated.accounts[0].openingBalance, 1001);
  assert.equal(migrated.cards[0].limit, 9999);
  assert.equal(migrated.transactions[0].amount, 10);
  assert.deepEqual(ctx.normalizeData(migrated), migrated);
});

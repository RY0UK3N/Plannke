const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadProduct() {
  const context = {
    console,
    Intl,
    Math,
    Date,
    Set,
    Map,
    String,
    Number,
    Array,
    Object,
    RegExp,
    JSON,
    structuredClone,
    navigator: {},
    location: { protocol: 'https:' },
    document: {
      readyState: 'loading',
      addEventListener() {},
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'product-core.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'product.js'), 'utf8'), context);
  return context;
}

test('smart search combines type, amount and tag filters', () => {
  const ctx = loadProduct();
  const data = {
    accounts: [{ id: 'acc1', name: 'Nubank' }], cards: [], settings: {},
    transactions: [
      { id: '1', type: 'expense', description: 'Hotel', category: 'Viagem', amount: 450, date: '2026-08-01', accountId: 'acc1', status: 'completed', tags: ['viagem'] },
      { id: '2', type: 'expense', description: 'Café', category: 'Restaurante', amount: 35, date: '2026-08-01', accountId: 'acc1', status: 'completed', tags: ['viagem'] },
      { id: '3', type: 'income', description: 'Reembolso', category: 'Outros', amount: 500, date: '2026-08-02', accountId: 'acc1', status: 'completed', tags: ['viagem'] },
    ],
  };
  const result = ctx.PlannkeProduct.searchTransactions(data, 'gastos >200 #viagem');
  assert.equal(result.length, 1);
  assert.equal(result[0].description, 'Hotel');
});

test('smart search filters planned transactions by account', () => {
  const ctx = loadProduct();
  const data = {
    accounts: [{ id: 'acc1', name: 'Nubank' }, { id: 'acc2', name: 'Itaú' }], cards: [], settings: {},
    transactions: [
      { id: '1', type: 'expense', description: 'Internet', category: 'Contas', amount: 120, date: '2026-08-20', accountId: 'acc1', status: 'planned', tags: [] },
      { id: '2', type: 'expense', description: 'Energia', category: 'Contas', amount: 180, date: '2026-08-21', accountId: 'acc2', status: 'planned', tags: [] },
      { id: '3', type: 'expense', description: 'Mercado', category: 'Supermercado', amount: 300, date: '2026-08-01', accountId: 'acc1', status: 'completed', tags: [] },
    ],
  };
  const result = ctx.PlannkeProduct.searchTransactions(data, 'previstas conta:nubank');
  assert.equal(result.length, 1);
  assert.equal(result[0].description, 'Internet');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'core', 'storage.js'), 'utf8');
const moneySource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'shared', 'money.js'), 'utf8');

function createContext() {
  const events = [];
  class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  }
  const context = {
    console,
    Date,
    Math,
    JSON,
    Intl,
    structuredClone: global.structuredClone,
    CustomEvent,
    dispatchEvent(event) { events.push(event); },
    crypto: { randomUUID: () => 'test-id' }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(moneySource, context);
  vm.runInContext(source, context);
  return { context, events };
}

test('finance core contains no durable browser persistence or legacy Excel importer', () => {
  assert.doesNotMatch(source, /sessionStorage/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /planner_session_cache/);
  assert.doesNotMatch(source, /planner_autosave/);
  assert.doesNotMatch(source, /hardenedImportFromExcel/);
  assert.doesNotMatch(source, /FileReader/);
  assert.doesNotMatch(source, /Memory Card Engine/);
  assert.doesNotMatch(source, /load\('src\/core\/product-core\.js'\)/);
});

test('finance core fallback is isolated in memory until StorageAdapter takes ownership', () => {
  const { context } = createContext();
  const initial = context.getData();
  initial.accounts.push({ id: 'acc', name: 'Conta', balance: 100 });
  assert.equal(context.getData().accounts.length, 0, 'getData returns a clone');
  context.saveData(initial);
  const saved = context.getData();
  assert.equal(saved.accounts.length, 1);
  saved.accounts[0].balance = 999;
  assert.equal(context.getData().accounts[0].balance, 100, 'fallback cache is not mutable by reference');
});

test('account, transaction and balance operations remain independent from persistence backend', () => {
  const { context } = createContext();
  context.saveAccount(null, 'Principal', 1000);
  const account = context.getData().accounts[0];
  assert.ok(account);
  context.saveTransaction(null, 'expense', 'Mercado', 125, '2026-08-08', account.id, 'Alimentação', 1, 1, null, null, false);
  let data = context.getData();
  assert.equal(data.transactions.length, 1);
  assert.equal(data.accounts[0].balance, 875);
  context.deleteTransaction(data.transactions[0].id);
  data = context.getData();
  assert.equal(data.transactions.length, 0);
  assert.equal(data.accounts[0].balance, 1000);
});

test('date normalization keeps month-end installments clamped', () => {
  const { context } = createContext();
  assert.equal(context.addMonthsClamped('2026-01-31', 1), '2026-02-28');
  assert.equal(context.addMonthsClamped('2024-01-31', 1), '2024-02-29');
});

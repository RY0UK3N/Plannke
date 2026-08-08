const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'storage-adapter.js'), 'utf8');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createWebStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    dump() { return Object.fromEntries(map); }
  };
}

function createContext({ local = {}, session = {}, fallback = null } = {}) {
  const localStorage = createWebStorage(local);
  const sessionStorage = createWebStorage(session);
  const events = [];
  const listeners = new Map();
  const documentListeners = new Map();
  const base = fallback || {
    schemaVersion: 2,
    accounts: [],
    cards: [],
    transactions: [],
    cardBillings: [],
    settings: { schemaVersion: 2, theme: 'dark', budgets: {}, categoryColors: {} }
  };

  class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  }

  const context = {
    console,
    Date,
    Math,
    Promise,
    JSON,
    structuredClone: global.structuredClone,
    localStorage,
    sessionStorage,
    CustomEvent,
    normalizeData: value => clone(value),
    getData: () => clone(base),
    saveData: () => undefined,
    dispatchEvent(event) { events.push(event); },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    document: {
      visibilityState: 'visible',
      addEventListener(type, handler) {
        if (!documentListeners.has(type)) documentListeners.set(type, []);
        documentListeners.get(type).push(handler);
      }
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, localStorage, sessionStorage, events, listeners, documentListeners };
}

test('migrates the legacy autosave into the versioned adapter store', async () => {
  const legacy = {
    schemaVersion: 2,
    accounts: [{ id: 'acc1', name: 'Principal', balance: 1500 }],
    cards: [],
    transactions: [],
    cardBillings: [],
    settings: { schemaVersion: 2, theme: 'dark' }
  };
  const { context, localStorage } = createContext({
    local: { planner_autosave: JSON.stringify(legacy) }
  });

  await context.PlannkeStorage.ready;
  assert.deepEqual(context.getData(), legacy);
  const envelope = JSON.parse(localStorage.getItem('plannke:data:v1'));
  assert.equal(envelope.version, 1);
  assert.deepEqual(envelope.data, legacy);
  assert.equal(context.PlannkeStorage.getStatus().source, 'legacy-localStorage');
});

test('uses an in-memory clone and persists every save through the adapter', async () => {
  const { context, localStorage, events } = createContext();
  await context.PlannkeStorage.ready;
  const data = context.getData();
  data.accounts.push({ id: 'acc1', name: 'Conta', balance: 100 });
  const saved = context.saveData(data);

  assert.equal(saved.accounts.length, 1);
  saved.accounts[0].balance = 999;
  assert.equal(context.getData().accounts[0].balance, 100, 'callers must not mutate the runtime cache by reference');

  await context.PlannkeStorage.flush();
  const envelope = JSON.parse(localStorage.getItem('plannke:data:v1'));
  assert.equal(envelope.data.accounts[0].balance, 100);
  assert.equal(JSON.parse(localStorage.getItem('planner_autosave')).accounts[0].balance, 100);
  assert.ok(events.some(event => event.type === 'plannke:storage-status' && event.detail.state === 'saving'));
  assert.ok(events.some(event => event.type === 'plannke:storage-status' && event.detail.state === 'saved'));
});

test('creates a recovery point before bulk imports or destructive changes', async () => {
  const first = {
    schemaVersion: 2,
    accounts: [{ id: 'acc1', name: 'Conta', balance: 100 }],
    cards: [],
    transactions: [{ id: 't0', type: 'expense', description: 'Base', amount: 10, date: '2026-08-01', accountId: 'acc1' }],
    cardBillings: [],
    settings: { schemaVersion: 2, theme: 'dark' }
  };
  const { context } = createContext({ local: { planner_autosave: JSON.stringify(first) } });
  await context.PlannkeStorage.ready;
  const bulk = context.getData();
  for (let i = 1; i <= 5; i += 1) {
    bulk.transactions.push({ id: `t${i}`, type: 'expense', description: `Import ${i}`, amount: i, date: '2026-08-02', accountId: 'acc1' });
  }
  context.saveData(bulk);

  const snapshots = context.PlannkeStorage.listSnapshots();
  assert.equal(snapshots[0].reason, 'before-bulk-change');
});

test('planning-only data can be snapshotted and destructive planning changes are protected', async () => {
  const initial = {
    schemaVersion: 2,
    accounts: [],
    cards: [],
    transactions: [],
    cardBillings: [],
    planning: {
      recurringRules: [{ id: 'r1', type: 'expense', amount: 90, active: true }],
      goals: [{ id: 'g1', name: 'Reserva', currentAmount: 100 }],
      reserves: [],
      categoryRules: []
    },
    settings: { schemaVersion: 2, theme: 'dark', household: { members: [] }, sharedTransactionMeta: {} }
  };
  const { context } = createContext({ local: { planner_autosave: JSON.stringify(initial) } });
  await context.PlannkeStorage.ready;

  const manual = context.PlannkeStorage.createSnapshot('manual-test');
  assert.ok(manual, 'planning-only state should qualify for recovery');

  const changed = context.getData();
  changed.planning.goals = [];
  context.saveData(changed);
  assert.equal(context.PlannkeStorage.listSnapshots()[0].reason, 'before-destructive-change');
});

test('restores a snapshot and keeps a safety snapshot of the state being replaced', async () => {
  const initial = {
    schemaVersion: 2,
    accounts: [{ id: 'acc1', name: 'Conta', balance: 100 }],
    cards: [],
    transactions: [],
    cardBillings: [],
    settings: { schemaVersion: 2, theme: 'dark' }
  };
  const { context } = createContext({ local: { planner_autosave: JSON.stringify(initial) } });
  await context.PlannkeStorage.ready;
  const snapshot = context.PlannkeStorage.createSnapshot('manual-test');
  const changed = context.getData();
  changed.accounts[0].balance = 450;
  context.saveData(changed);
  assert.equal(context.getData().accounts[0].balance, 450);

  const result = context.PlannkeStorage.restoreSnapshot(snapshot.id);
  assert.equal(result.data.accounts[0].balance, 100);
  assert.ok(result.safetySnapshotId);
  assert.equal(context.PlannkeStorage.listSnapshots()[0].reason, 'before-restore');
});

test('retired browser boot hooks are not recreated by StorageAdapter', async () => {
  const { context, listeners, documentListeners } = createContext();
  await context.PlannkeStorage.ready;

  assert.equal(context.loadFromLocalStorage, undefined);
  assert.equal(context.setupBeforeUnload, undefined);
  assert.equal(context.checkImportPrompt, undefined);
  assert.equal(listeners.has('beforeunload'), false);
  assert.equal(listeners.has('pagehide'), true);
  assert.equal(documentListeners.has('visibilitychange'), true);
});

test('StorageCoordinator accepts an asynchronous backend and serializes saves', async () => {
  const { context } = createContext();
  await context.PlannkeStorage.ready;
  const { StorageCoordinator } = context.PlannkeStorage;
  const writes = [];
  let stored = {
    schemaVersion: 2,
    accounts: [], cards: [], transactions: [], cardBillings: [], settings: { schemaVersion: 2, theme: 'dark' }
  };
  const asyncAdapter = {
    kind: 'sqlite-test-double',
    async load() {
      await Promise.resolve();
      return { data: clone(stored), source: 'async-test', savedAt: null };
    },
    async save(data) {
      const value = data.accounts?.[0]?.balance || 0;
      await new Promise(resolve => setTimeout(resolve, value === 1 ? 8 : 1));
      stored = clone(data);
      writes.push(value);
      return { savedAt: new Date().toISOString() };
    },
    listSnapshots() { return []; },
    createSnapshot() { return null; }
  };

  const coordinator = new StorageCoordinator(asyncAdapter, stored);
  await coordinator.initialize();
  const first = coordinator.getData();
  first.accounts = [{ id: 'a', name: 'A', balance: 1 }];
  coordinator.saveData(first);
  const second = coordinator.getData();
  second.accounts[0].balance = 2;
  coordinator.saveData(second);
  await coordinator.flush();

  assert.deepEqual(writes.slice(-2), [1, 2]);
  assert.equal(stored.accounts[0].balance, 2);
});

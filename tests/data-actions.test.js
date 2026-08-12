const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/app/app-data.js', 'utf8');

function load(overrides = {}) {
  const saved = [];
  const toasts = [];
  const written = [];
  const sheets = [];
  const data = {
    schemaVersion: 2,
    accounts: [{ id: 'acc', name: 'Principal', balance: 1200, openingBalance: 1000 }],
    cards: [{ id: 'card', name: 'Visa', limit: 4000, closingDay: 10, dueDay: 20 }],
    transactions: [{ id: 'tx', type: 'expense', description: 'Mercado', category: 'Mercado', amount: 100, date: '2026-08-08', accountId: 'acc', status: 'completed' }],
    cardBillings: [],
    planning: {
      goals: [{ id: 'goal', name: 'Viagem', targetAmount: 5000, currentAmount: 500 }],
      reserves: [{ id: 'reserve', name: 'Emergência', amount: 1000 }],
      recurringRules: [{ id: 'rule', type: 'expense', description: 'Internet', amount: 150, day: 10 }],
      categoryRules: []
    },
    settings: { schemaVersion: 2, theme: 'light' }
  };
  const context = {
    console,
    Date,
    Intl,
    JSON,
    confirm: () => true,
    getData: () => JSON.parse(JSON.stringify(data)),
    saveData: value => { saved.push(JSON.parse(JSON.stringify(value))); return value; },
    normalizeData: value => value,
    renderAll: () => {},
    showToast: (message, type) => toasts.push({ message, type }),
    getOutstandingCardBalance: () => 250,
    XLSX: {
      utils: {
        book_new: () => ({ SheetNames: [], Sheets: {} }),
        json_to_sheet: rows => ({ rows }),
        book_append_sheet: (workbook, sheet, name) => {
          workbook.SheetNames.push(name);
          workbook.Sheets[name] = sheet;
          sheets.push({ name, rows: sheet.rows });
        }
      },
      writeFile: (workbook, filename) => written.push({ workbook, filename })
    },
    ...overrides
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'app-data.js' });
  return { context, saved, toasts, written, sheets };
}

test('clear data uses the canonical save boundary and preserves only appearance preference', () => {
  const { context, saved, toasts } = load();
  context.confirmClearData();

  assert.equal(saved.length, 1);
  const clean = saved[0];
  assert.deepEqual(Array.from(clean.accounts), []);
  assert.deepEqual(Array.from(clean.cards), []);
  assert.deepEqual(Array.from(clean.transactions), []);
  assert.deepEqual(Array.from(clean.planning.goals), []);
  assert.deepEqual(Array.from(clean.planning.reserves), []);
  assert.deepEqual(Array.from(clean.planning.recurringRules), []);
  assert.equal(clean.settings.theme, 'light');
  assert.match(toasts[0].message, /recuperação/i);
});

test('Excel export is a report with readable sheets, not a restoration payload', () => {
  const { context, written, sheets } = load();
  context.exportToExcel();

  assert.equal(written.length, 1);
  assert.match(written[0].filename, /^Plannke_Relatorio_\d{4}-\d{2}-\d{2}\.xlsx$/);
  assert.deepEqual(Array.from(written[0].workbook.SheetNames), ['Resumo', 'Movimentações', 'Contas', 'Cartões', 'Planejamento']);
  assert.equal(sheets.some(sheet => /Configura|Nova Transação|Memory/i.test(sheet.name)), false);
  assert.equal(JSON.stringify(sheets).includes('planner_autosave'), false);
  assert.equal(JSON.stringify(sheets).includes('productState'), false);
});

test('canonical data actions contain no browser-storage or executable HTML APIs', () => {
  assert.doesNotMatch(source, /localStorage|sessionStorage|planner_autosave|planner_session_cache/);
  assert.doesNotMatch(source, /importFromExcel|FileReader|Memory Card|_backupDone/);
  assert.doesNotMatch(source, /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|\beval\s*\(|new\s+Function\s*\(/);
});

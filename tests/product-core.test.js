const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../product-core.js');

function baseData() {
  return {
    accounts: [{ id: 'acc', name: 'Conta', balance: 700 }],
    cards: [],
    transactions: [
      { id: 'old', type: 'income', amount: 1000, date: '2026-08-01', accountId: 'acc' },
      { id: 'future', type: 'expense', amount: 300, date: '2026-08-20', accountId: 'acc' }
    ],
    cardBillings: [],
    planning: {}
  };
}

test('migração reconstrói openingBalance e remove futuro do saldo atual', () => {
  const data = baseData();
  const { changed } = C.migrateLedger(data, '2026-08-07');
  assert.equal(changed, true);
  assert.equal(data.accounts[0].openingBalance, 0);
  assert.equal(data.transactions[0].status, 'completed');
  assert.equal(data.transactions[1].status, 'planned');
  assert.equal(data.accounts[0].balance, 1000);
});

test('recalcular ledger ignora transação prevista', () => {
  const data = baseData();
  C.migrateLedger(data, '2026-08-07');
  data.transactions.push({ id: 'planned', type: 'expense', amount: 200, date: '2026-08-10', accountId: 'acc', status: 'planned' });
  C.recomputeAccountBalances(data);
  assert.equal(data.accounts[0].balance, 1000);
  data.transactions.at(-1).status = 'completed';
  C.recomputeAccountBalances(data);
  assert.equal(data.accounts[0].balance, 800);
});

test('recorrência no dia 31 usa último dia válido do mês', () => {
  const occurrences = C.recurringOccurrences([{
    id: 'r1', type: 'expense', description: 'Aluguel', category: 'Casa', amount: 100,
    dayOfMonth: 31, accountId: 'acc', startDate: '2026-01-01', active: true
  }], '2026-01-01', '2026-03-31');
  assert.deepEqual(occurrences.map(x => x.date), ['2026-01-31', '2026-02-28', '2026-03-31']);
});

test('dinheiro livre desconta cartão, reservas, metas e previstos', () => {
  const data = {
    accounts: [{ id: 'acc', name: 'Conta', openingBalance: 5000, balance: 5000 }],
    cards: [{ id: 'card', closingDay: 10, dueDay: 20, limit: 5000 }],
    transactions: [
      { id: 'cardtx', type: 'expense', amount: 800, date: '2026-08-05', accountId: 'card', status: 'completed' },
      { id: 'bill', type: 'expense', amount: 400, date: '2026-08-10', accountId: 'acc', status: 'planned' },
      { id: 'salary', type: 'income', amount: 3000, date: '2026-08-20', accountId: 'acc', status: 'planned' }
    ],
    cardBillings: [],
    planning: {
      reserves: [{ id: 'res', name: 'Emergência', amount: 500 }],
      goals: [{ id: 'goal', name: 'Viagem', targetAmount: 2000, currentAmount: 300 }],
      recurringRules: [], categoryRules: []
    }
  };
  const pulse = C.getFinancialPulse(data, '2026-08-07');
  assert.equal(pulse.balance, 5000);
  assert.equal(pulse.cardCommitted, 800);
  assert.equal(pulse.reserved, 800);
  assert.equal(pulse.plannedBankExpenses, 400);
  assert.equal(pulse.committed, 2000);
  assert.equal(pulse.free, 3000);
  assert.equal(pulse.horizon, '2026-08-20');
});

test('regra de categoria reconhece descrição', () => {
  const category = C.applyCategoryRules('UBER *TRIP SAO PAULO', 'Outros', [
    { id: 'r', contains: 'uber', category: 'Transporte' }
  ]);
  assert.equal(category, 'Transporte');
});

test('CSV bancário brasileiro é reconhecido e deduplicado', () => {
  const csv = 'Data;Descrição;Valor\n07/08/2026;UBER TRIP;-25,90\n07/08/2026;PIX RECEBIDO;100,00';
  const parsed = C.parseCsvBank(csv, 'acc', [{ id: 'r', contains: 'uber', category: 'Transporte' }]);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].type, 'expense');
  assert.equal(parsed[0].amount, 25.9);
  assert.equal(parsed[0].category, 'Transporte');
  assert.equal(parsed[1].type, 'income');
  assert.equal(C.dedupeImported([parsed[0]], parsed).length, 1);
});

test('OFX básico é convertido para transações', () => {
  const ofx = '<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260807120000<TRNAMT>-42.50<FITID>abc123<NAME>POSTO IPIRANGA</STMTTRN></BANKTRANLIST></OFX>';
  const parsed = C.parseOfxBank(ofx, 'acc', [{ id: 'r', contains: 'ipiranga', category: 'Combustível' }]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].date, '2026-08-07');
  assert.equal(parsed[0].amount, 42.5);
  assert.equal(parsed[0].category, 'Combustível');
});

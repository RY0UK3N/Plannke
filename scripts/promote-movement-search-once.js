const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(root, file), content);

function replaceOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(search, replacement);
}

function replaceRegexOnce(source, regex, replacement, label) {
  const matches = source.match(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`)) || [];
  if (matches.length !== 1) throw new Error(`${label}: expected exactly one match, found ${matches.length}`);
  return source.replace(regex, replacement);
}

let movements = read('app-movements.js');
let renderers = read('safe-renderers.js');
let product = read('product.js');

if (movements.includes('function searchTransactions(')) throw new Error('app-movements.js already owns smart search');
if (!product.includes('function searchTransactions(')) throw new Error('product.js no longer contains expected smart search block');

const movementSearchRuntime = String.raw`
    function normalizeSearch(value) {
        return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }

    function movementToday() {
        if (root.PlannkeCore?.localDateString) return root.PlannkeCore.localDateString();
        const now = new Date();
        return \\`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}\\`;
    }

    function movementAddDays(dateStr, days) {
        if (root.PlannkeCore?.addDays) return root.PlannkeCore.addDays(dateStr, days);
        const match = String(dateStr || '').match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
        if (!match) return dateStr;
        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        date.setDate(date.getDate() + Number(days || 0));
        return \\`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}\\`;
    }

    function accountName(data, id) {
        return (data?.accounts || []).find(account => account.id === id)?.name
            || (data?.cards || []).find(card => card.id === id)?.name
            || '';
    }

    function previousMonth(month) {
        const [year, monthNumber] = String(month || '').split('-').map(Number);
        const date = new Date(year, monthNumber - 2, 1);
        return \\`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}\\`;
    }

    function searchTransactions(data, query) {
        const q = normalizeSearch(query).trim();
        const transactions = Array.isArray(data?.transactions) ? data.transactions : [];
        if (!q) return transactions;

        let items = [...transactions];
        const today = movementToday();
        const thisMonth = today.slice(0, 7);
        const tokens = q.match(/"[^"]+"|\\S+/g) || [];
        const free = [];

        tokens.forEach(raw => {
            const token = raw.replace(/^"|"$/g, '');
            if (['gasto', 'gastos', 'despesa', 'despesas'].includes(token)) { items = items.filter(tx => tx.type === 'expense'); return; }
            if (['entrada', 'entradas', 'receita', 'receitas'].includes(token)) { items = items.filter(tx => tx.type === 'income'); return; }
            if (['transferencia', 'transferencias'].includes(token)) { items = items.filter(tx => tx.type === 'transfer'); return; }
            if (['prevista', 'previstas', 'pendente', 'pendentes'].includes(token)) { items = items.filter(tx => tx.status === 'planned'); return; }
            if (['realizada', 'realizadas', 'pago', 'pagos'].includes(token)) { items = items.filter(tx => tx.status !== 'planned'); return; }
            if (token === 'hoje') { items = items.filter(tx => tx.date === today); return; }
            if (token === 'ontem') { items = items.filter(tx => tx.date === movementAddDays(today, -1)); return; }
            if (token === 'mes-atual' || token === 'estemes') { items = items.filter(tx => String(tx.date || '').startsWith(thisMonth)); return; }
            if (token === 'mes-passado') { const month = previousMonth(thisMonth); items = items.filter(tx => String(tx.date || '').startsWith(month)); return; }
            if (token.startsWith('#')) {
                const tag = token.slice(1);
                items = items.filter(tx => (tx.tags || []).some(value => normalizeSearch(value) === tag || normalizeSearch(value).includes(tag)));
                return;
            }
            if (token.startsWith('categoria:')) {
                const value = token.slice(10);
                items = items.filter(tx => normalizeSearch(tx.category).includes(value));
                return;
            }
            if (token.startsWith('conta:')) {
                const value = token.slice(6);
                items = items.filter(tx => normalizeSearch(accountName(data, tx.accountId)).includes(value) || normalizeSearch(accountName(data, tx.destinationId)).includes(value));
                return;
            }
            const amount = token.match(/^(>=|<=|>|<)(\\d+(?:[.,]\\d+)?)$/);
            if (amount) {
                const value = Number(amount[2].replace(',', '.'));
                items = items.filter(tx => amount[1] === '>' ? Number(tx.amount) > value
                    : amount[1] === '<' ? Number(tx.amount) < value
                        : amount[1] === '>=' ? Number(tx.amount) >= value
                            : Number(tx.amount) <= value);
                return;
            }
            free.push(token);
        });

        if (q.includes('este mes')) items = items.filter(tx => String(tx.date || '').startsWith(thisMonth));
        if (q.includes('mes passado')) {
            const month = previousMonth(thisMonth);
            items = items.filter(tx => String(tx.date || '').startsWith(month));
        }
        const months = q.match(/ultimos?\\s+(\\d+)\\s+mes/);
        if (months) {
            const count = Math.max(1, Math.min(60, Number(months[1])));
            const [year, monthNumber] = thisMonth.split('-').map(Number);
            const date = new Date(year, monthNumber - count, 1);
            const min = \\`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01\\`;
            items = items.filter(tx => tx.date >= min && tx.date <= today);
        }

        const noise = new Set(['este', 'mes', 'passado', 'ultimos', 'ultimo', 'com', 'de', 'do', 'da', 'em']);
        const words = free.filter(word => !noise.has(word) && !/^\\d+$/.test(word));
        if (words.length) {
            items = items.filter(tx => {
                const haystack = normalizeSearch([
                    tx.description,
                    tx.category,
                    accountName(data, tx.accountId),
                    ...(tx.tags || [])
                ].join(' '));
                return words.every(word => haystack.includes(word));
            });
        }
        return items;
    }

    function isSmartSearch(query) {
        const q = normalizeSearch(query);
        return /(^|\\s)(#\\S+|categoria:|conta:|[<>]=?\\d|gastos?|despesas?|entradas?|receitas?|previstas?|realizadas?|hoje|ontem|mes passado|este mes|ultimos? \\d+ mes)/.test(q);
    }

    function installSearchHelp() {
        if (typeof document === 'undefined') return;
        const input = byId('tx-search');
        if (!input) return;
        input.placeholder = 'Buscar ou filtrar: #viagem, gastos >200, mês passado…';
        if (byId('product-search-help')) return;

        const help = document.createElement('div');
        help.id = 'product-search-help';
        help.className = 'product-search-help tiny text-muted mt-2';
        const icon = document.createElement('i');
        icon.className = 'ph ph-magic-wand me-1';
        help.append(icon, document.createTextNode('Exemplos: '));

        [
            ['gastos >200', 'gastos >200'],
            ['#viagem', '#viagem'],
            ['previstas este mes', 'previstas este mês'],
            ['categoria:supermercado mes passado', 'supermercado mês passado']
        ].forEach(([query, label]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.query = query;
            button.textContent = label;
            help.appendChild(button);
        });

        help.addEventListener('click', event => {
            const button = event.target.closest?.('[data-query]');
            if (!button) return;
            input.value = button.dataset.query;
            renderMovimentacao(root.getData?.());
        });
        input.parentElement?.after(help);
    }

`;

movements = replaceOnce(
  movements,
  "    function formatCurrency(value) {",
  `${movementSearchRuntime}    function formatCurrency(value) {`,
  'insert canonical movement search runtime'
);

movements = replaceOnce(
  movements,
  "    function bindMovementControls() {\n        if (controlsBound || typeof document === 'undefined') return;\n        controlsBound = true;",
  "    function bindMovementControls() {\n        if (typeof document === 'undefined') return;\n        installSearchHelp();\n        if (controlsBound) return;\n        controlsBound = true;",
  'install search help from movement controls'
);

movements = replaceOnce(
  movements,
  "        updateMonthNavigator,\n        disposeChart",
  "        updateMonthNavigator,\n        searchTransactions,\n        isSmartSearch,\n        installSearchHelp,\n        disposeChart",
  'publish movement search API'
);

const oldRendererSearch = `        if (!data) data = getData();
        root.renderMonthTabs?.(data);
        const tbody = document.getElementById('all-transactions-body');
        const mobileList = document.getElementById('all-transactions-mobile');
        if (!tbody || !mobileList) return;
        tbody.replaceChildren();
        mobileList.replaceChildren();

        const filter = document.getElementById('tx-filter')?.value || 'all';
        const filterCat = document.getElementById('tx-filter-category')?.value || 'all';
        const filterAcc = document.getElementById('tx-filter-account')?.value || 'all';
        const searchRaw = document.getElementById('tx-search')?.value || '';
        const searchTerm = searchRaw.toLowerCase().trim();
        document.getElementById('tx-search-clear')?.classList.toggle('hidden', !searchTerm);

        let filtered = Array.isArray(data.transactions) ? data.transactions : [];
        if (filter !== 'all') filtered = filtered.filter(t => t.type === filter);
        if (filterCat !== 'all') filtered = filtered.filter(t => t.category === filterCat);
        if (filterAcc !== 'all') filtered = filtered.filter(t => t.accountId === filterAcc || t.destinationId === filterAcc);
        const currentMonth = root.PlannkeMovements?.currentMonth || '';
        if (currentMonth) filtered = filtered.filter(t => String(t.date || '').startsWith(currentMonth));
        if (searchTerm) filtered = filtered.filter(t => String(t.description || '').toLowerCase().includes(searchTerm));`;

const newRendererSearch = `        if (!data) data = getData();
        const searchRaw = document.getElementById('tx-search')?.value || '';
        const searchTerm = searchRaw.toLowerCase().trim();
        const movementSearch = root.PlannkeMovements;
        const smartSearch = !!searchTerm && !!movementSearch?.isSmartSearch?.(searchRaw);
        const renderData = smartSearch
            ? { ...data, transactions: movementSearch.searchTransactions(data, searchRaw) }
            : data;

        root.renderMonthTabs?.(renderData);
        const tbody = document.getElementById('all-transactions-body');
        const mobileList = document.getElementById('all-transactions-mobile');
        if (!tbody || !mobileList) return;
        tbody.replaceChildren();
        mobileList.replaceChildren();

        const filter = document.getElementById('tx-filter')?.value || 'all';
        const filterCat = document.getElementById('tx-filter-category')?.value || 'all';
        const filterAcc = document.getElementById('tx-filter-account')?.value || 'all';
        document.getElementById('tx-search-clear')?.classList.toggle('hidden', !searchTerm);

        let filtered = Array.isArray(renderData.transactions) ? renderData.transactions : [];
        if (filter !== 'all') filtered = filtered.filter(t => t.type === filter);
        if (filterCat !== 'all') filtered = filtered.filter(t => t.category === filterCat);
        if (filterAcc !== 'all') filtered = filtered.filter(t => t.accountId === filterAcc || t.destinationId === filterAcc);
        const currentMonth = root.PlannkeMovements?.currentMonth || '';
        if (currentMonth) filtered = filtered.filter(t => String(t.date || '').startsWith(currentMonth));
        if (searchTerm && !smartSearch) filtered = filtered.filter(t => String(t.description || '').toLowerCase().includes(searchTerm));`;

renderers = replaceOnce(renderers, oldRendererSearch, newRendererSearch, 'route smart search through canonical renderer');

product = replaceOnce(
  product,
  "    const normalize = value => String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();\n",
  '',
  'remove product search normalizer'
);

product = replaceRegexOnce(
  product,
  /\n    function accountName\(data, id\) \{[\s\S]*?\n    function patchRenderers\(\) \{/,
  '\n\n    function patchRenderers() {',
  'remove smart search and help from product layer'
);

product = replaceRegexOnce(
  product,
  /\n        const originalTransactions = globalThis\.renderTransactions;[\s\S]*?\n        \};\n    \}\n\n    function renderFinancialPulse/,
  '\n    }\n\n    function renderFinancialPulse',
  'remove product renderTransactions wrapper'
);

product = replaceRegexOnce(
  product,
  /\n    function decorateTransactionStatuses\(data\) \{[\s\S]*?\n    \}\n\n    function accountOptions/,
  '\n\n    function accountOptions',
  'remove redundant transaction status decorator'
);

product = replaceOnce(
  product,
  'injectTransactionFields();patchRenderers();injectSearchHelp();injectBankImport();',
  'injectTransactionFields();patchRenderers();injectBankImport();',
  'remove search help from product init'
);

product = replaceOnce(
  product,
  "globalThis.addEventListener('plannke:data-changed',()=>setTimeout(()=>{injectBankImport();injectSearchHelp();},0));",
  "globalThis.addEventListener('plannke:data-changed',()=>setTimeout(()=>{injectBankImport();},0));",
  'remove search reinjection from product data listener'
);

product = replaceOnce(
  product,
  'globalThis.PlannkeProduct={init,searchTransactions};',
  'globalThis.PlannkeProduct={init};',
  'retire search API from PlannkeProduct'
);

const movementSearchTest = `const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const movementsSource = fs.readFileSync(path.join(root, 'app-movements.js'), 'utf8');
const productSource = fs.readFileSync(path.join(root, 'product.js'), 'utf8');
const rendererSource = fs.readFileSync(path.join(root, 'safe-renderers.js'), 'utf8');

function loadMovements() {
  const context = { console, Intl, Math, Date, Set, Map, String, Number, Array, Object, RegExp, JSON };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'product-core.js'), 'utf8'), context);
  vm.runInContext(movementsSource, context);
  return context.PlannkeMovements;
}

test('smart search combines type, amount and tag filters from canonical movements runtime', () => {
  const api = loadMovements();
  const data = {
    accounts: [{ id: 'acc1', name: 'Nubank' }], cards: [],
    transactions: [
      { id: '1', type: 'expense', description: 'Hotel', category: 'Viagem', amount: 450, date: '2026-08-01', accountId: 'acc1', status: 'completed', tags: ['viagem'] },
      { id: '2', type: 'expense', description: 'Café', category: 'Restaurante', amount: 35, date: '2026-08-01', accountId: 'acc1', status: 'completed', tags: ['viagem'] },
      { id: '3', type: 'income', description: 'Reembolso', category: 'Outros', amount: 500, date: '2026-08-02', accountId: 'acc1', status: 'completed', tags: ['viagem'] }
    ]
  };
  const result = api.searchTransactions(data, 'gastos >200 #viagem');
  assert.equal(result.length, 1);
  assert.equal(result[0].description, 'Hotel');
});

test('smart search filters planned transactions by normalized account name', () => {
  const api = loadMovements();
  const data = {
    accounts: [{ id: 'acc1', name: 'Nubank' }, { id: 'acc2', name: 'Itaú' }], cards: [],
    transactions: [
      { id: '1', type: 'expense', description: 'Internet', category: 'Contas', amount: 120, date: '2026-08-20', accountId: 'acc1', status: 'planned', tags: [] },
      { id: '2', type: 'expense', description: 'Energia', category: 'Contas', amount: 180, date: '2026-08-21', accountId: 'acc2', status: 'planned', tags: [] },
      { id: '3', type: 'expense', description: 'Mercado', category: 'Supermercado', amount: 300, date: '2026-08-01', accountId: 'acc1', status: 'completed', tags: [] }
    ]
  };
  const result = api.searchTransactions(data, 'previstas conta:nubank');
  assert.equal(result.length, 1);
  assert.equal(result[0].description, 'Internet');
});

test('movement search recognizes structured filters without treating plain text as smart syntax', () => {
  const api = loadMovements();
  assert.equal(api.isSmartSearch('categoria:supermercado mes passado'), true);
  assert.equal(api.isSmartSearch('#viagem'), true);
  assert.equal(api.isSmartSearch('café da manhã'), false);
});

test('safe transaction renderer delegates structured queries to movements and keeps literal search local', () => {
  assert.match(rendererSource, /movementSearch\?\.isSmartSearch\?\.\(searchRaw\)/);
  assert.match(rendererSource, /movementSearch\.searchTransactions\(data, searchRaw\)/);
  assert.match(rendererSource, /searchTerm && !smartSearch/);
  assert.match(rendererSource, /root\.renderMonthTabs\?\.\(renderData\)/);
});

test('product compatibility layer no longer owns movement search or wraps renderTransactions', () => {
  assert.doesNotMatch(productSource, /function searchTransactions\(/);
  assert.doesNotMatch(productSource, /function isSmartSearch\(/);
  assert.doesNotMatch(productSource, /function injectSearchHelp\(/);
  assert.doesNotMatch(productSource, /originalTransactions = globalThis\.renderTransactions/);
  assert.doesNotMatch(productSource, /PlannkeProduct=\{init,searchTransactions\}/);
  assert.match(productSource, /globalThis\.PlannkeProduct=\{init\}/);
});

test('movement search help is built with DOM APIs instead of HTML strings', () => {
  assert.match(movementsSource, /function installSearchHelp\(/);
  assert.match(movementsSource, /button\.textContent = label/);
  assert.match(movementsSource, /button\.dataset\.query = query/);
  assert.doesNotMatch(movementsSource, /\.innerHTML\s*=/);
});
`;

const oldTest = path.join(root, 'tests', 'product-ui-logic.test.js');
const newTest = path.join(root, 'tests', 'movement-search.test.js');
if (!fs.existsSync(oldTest)) throw new Error('expected tests/product-ui-logic.test.js before migration');
if (fs.existsSync(newTest)) throw new Error('tests/movement-search.test.js already exists');
fs.renameSync(oldTest, newTest);
fs.writeFileSync(newTest, movementSearchTest);

write('app-movements.js', movements);
write('safe-renderers.js', renderers);
write('product.js', product);

const finalMovements = read('app-movements.js');
const finalProduct = read('product.js');
const finalRenderers = read('safe-renderers.js');
if (!finalMovements.includes('function searchTransactions(') || !finalMovements.includes('function isSmartSearch(')) throw new Error('canonical movement search missing after migration');
if (finalMovements.includes('.innerHTML =')) throw new Error('movement runtime introduced unsafe HTML rendering');
if (finalProduct.includes('function searchTransactions(') || finalProduct.includes('originalTransactions = globalThis.renderTransactions')) throw new Error('product search ownership was not retired');
if (!finalRenderers.includes('movementSearch.searchTransactions(data, searchRaw)')) throw new Error('safe renderer did not adopt movement search API');

const self = path.join(root, 'scripts', 'promote-movement-search-once.js');
const workflow = path.join(root, '.github', 'workflows', 'promote-movement-search-once.yml');
if (fs.existsSync(self)) fs.unlinkSync(self);
if (fs.existsSync(workflow)) fs.unlinkSync(workflow);

console.log('[movement search] canonical ownership moved to app-movements.js');

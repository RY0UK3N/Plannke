const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(rootDir, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(rootDir, file), content);

function replaceOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(search, replacement);
}

function replaceRegexOnce(source, regex, replacement, label) {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  const count = (source.match(new RegExp(regex.source, flags)) || []).length;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(regex, replacement);
}

function normalizeSearch(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function movementToday() {
  if (root.PlannkeCore?.localDateString) return root.PlannkeCore.localDateString();
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function movementAddDays(dateStr, days) {
  if (root.PlannkeCore?.addDays) return root.PlannkeCore.addDays(dateStr, days);
  const match = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateStr;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() + Number(days || 0));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function accountName(data, id) {
  return (data?.accounts || []).find(account => account.id === id)?.name
    || (data?.cards || []).find(card => card.id === id)?.name
    || '';
}

function previousMonth(month) {
  const [year, monthNumber] = String(month || '').split('-').map(Number);
  const date = new Date(year, monthNumber - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function searchTransactions(data, query) {
  const q = normalizeSearch(query).trim();
  const transactions = Array.isArray(data?.transactions) ? data.transactions : [];
  if (!q) return transactions;

  let items = [...transactions];
  const today = movementToday();
  const thisMonth = today.slice(0, 7);
  const tokens = q.match(/"[^"]+"|\S+/g) || [];
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
    if (token === 'mes-passado') { const monthValue = previousMonth(thisMonth); items = items.filter(tx => String(tx.date || '').startsWith(monthValue)); return; }
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
    const amount = token.match(/^(>=|<=|>|<)(\d+(?:[.,]\d+)?)$/);
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
    const monthValue = previousMonth(thisMonth);
    items = items.filter(tx => String(tx.date || '').startsWith(monthValue));
  }
  const months = q.match(/ultimos?\s+(\d+)\s+mes/);
  if (months) {
    const count = Math.max(1, Math.min(60, Number(months[1])));
    const [year, monthNumber] = thisMonth.split('-').map(Number);
    const date = new Date(year, monthNumber - count, 1);
    const min = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
    items = items.filter(tx => tx.date >= min && tx.date <= today);
  }

  const noise = new Set(['este', 'mes', 'passado', 'ultimos', 'ultimo', 'com', 'de', 'do', 'da', 'em']);
  const words = free.filter(word => !noise.has(word) && !/^\d+$/.test(word));
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
  return /(^|\s)(#\S+|categoria:|conta:|[<>]=?\d|gastos?|despesas?|entradas?|receitas?|previstas?|realizadas?|hoje|ontem|mes passado|este mes|ultimos? \d+ mes)/.test(q);
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
  const iconNode = document.createElement('i');
  iconNode.className = 'ph ph-magic-wand me-1';
  help.append(iconNode, document.createTextNode('Exemplos: '));

  [
    ['gastos >200', 'gastos >200'],
    ['#viagem', '#viagem'],
    ['previstas este mes', 'previstas este mês'],
    ['categoria:supermercado mes passado', 'supermercado mês passado']
  ].forEach(([queryValue, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.query = queryValue;
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

function indent(fn) {
  return fn.toString().split('\n').map(line => `    ${line}`).join('\n');
}

const searchRuntime = [
  normalizeSearch,
  movementToday,
  movementAddDays,
  accountName,
  previousMonth,
  searchTransactions,
  isSmartSearch,
  installSearchHelp
].map(indent).join('\n\n') + '\n\n';

let movements = read('app-movements.js');
let renderers = read('safe-renderers.js');
let product = read('product.js');

if (movements.includes('function searchTransactions(')) throw new Error('app-movements.js already owns smart search');
if (!product.includes('function searchTransactions(')) throw new Error('product.js no longer contains expected smart search block');

movements = replaceOnce(
  movements,
  "    function formatCurrency(value) {",
  `${searchRuntime}    function formatCurrency(value) {`,
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

product = replaceOnce(product, "    const normalize = value => String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();\n", '', 'remove product search normalizer');
product = replaceRegexOnce(product, /\n    function accountName\(data, id\) \{[\s\S]*?\n    function patchRenderers\(\) \{/, '\n\n    function patchRenderers() {', 'remove smart search and help from product layer');
product = replaceRegexOnce(product, /\n        const originalTransactions = globalThis\.renderTransactions;[\s\S]*?\n        \};\n    \}\n\n    function renderFinancialPulse/, '\n    }\n\n    function renderFinancialPulse', 'remove product renderTransactions wrapper');
product = replaceRegexOnce(product, /\n    function decorateTransactionStatuses\(data\) \{[\s\S]*?\n    \}\n\n    function accountOptions/, '\n\n    function accountOptions', 'remove redundant transaction status decorator');
product = replaceOnce(product, 'injectTransactionFields();patchRenderers();injectSearchHelp();injectBankImport();', 'injectTransactionFields();patchRenderers();injectBankImport();', 'remove search help from product init');
product = replaceOnce(product, "globalThis.addEventListener('plannke:data-changed',()=>setTimeout(()=>{injectBankImport();injectSearchHelp();},0));", "globalThis.addEventListener('plannke:data-changed',()=>setTimeout(()=>{injectBankImport();},0));", 'remove search reinjection from product data listener');
product = replaceOnce(product, 'globalThis.PlannkeProduct={init,searchTransactions};', 'globalThis.PlannkeProduct={init};', 'retire search API from PlannkeProduct');

write('app-movements.js', movements);
write('safe-renderers.js', renderers);
write('product.js', product);

if (!movements.includes('function searchTransactions(') || !movements.includes('function isSmartSearch(')) throw new Error('canonical movement search missing after migration');
if (/\.innerHTML\s*=/.test(movements)) throw new Error('movement runtime introduced unsafe HTML rendering');
if (product.includes('function searchTransactions(') || product.includes('originalTransactions = globalThis.renderTransactions')) throw new Error('product search ownership was not retired');
if (!renderers.includes('movementSearch.searchTransactions(data, searchRaw)')) throw new Error('safe renderer did not adopt movement search API');

for (const file of [
  path.join(rootDir, 'scripts', 'promote-movement-search-once.js'),
  path.join(rootDir, '.github', 'workflows', 'promote-movement-search-once.yml')
]) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
console.log('[movement search] canonical ownership moved to app-movements.js');

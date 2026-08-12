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

function cloneBankImportState(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

function normalizeBankText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function merchantRuleKey(description) {
  const stop = new Set(['compra', 'pagamento', 'debito', 'credito', 'pix', 'transacao', 'cartao', 'online', 'brasil', 'ltda', 'sa']);
  const words = normalizeBankText(description)
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 3 && !stop.has(word));
  return words.slice(0, 2).join(' ').slice(0, 60);
}

function getPendingBankImport() {
  return cloneBankImportState(pendingBankImport);
}

function setBankImportResult(message) {
  if (typeof document === 'undefined') return;
  const result = document.getElementById('product-bank-result');
  if (result) result.textContent = String(message || '');
}

function notifyBankImportReview(options = {}) {
  root.PlannkePresentationDesktop?.renderBankImportReview?.(options);
}

function updateBankImportItem(index, patch = {}) {
  const item = pendingBankImport?.items?.[Number(index)];
  if (!item) return false;
  if (Object.prototype.hasOwnProperty.call(patch, 'include')) item.include = !!patch.include;
  if (Object.prototype.hasOwnProperty.call(patch, 'category')) {
    item.category = String(patch.category || 'Outros');
    item.categoryChanged = item.category !== item.originalCategory;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'remember')) {
    item.remember = !!patch.remember && !!merchantRuleKey(item.transaction?.description);
  }
  return true;
}

function cancelBankImport() {
  pendingBankImport = null;
  notifyBankImportReview();
  setBankImportResult('Importação cancelada; nenhum lançamento foi alterado.');
}

function confirmBankImport() {
  if (!pendingBankImport) return;
  const data = typeof root.getData === 'function' ? root.getData() : null;
  const core = root.PlannkeCore;
  if (!data || !core) return;
  const selected = pendingBankImport.items.filter(item => item.include);
  if (!selected.length) {
    showToast('Selecione pelo menos uma movimentação.', 'error');
    return;
  }

  if (selected.length < 5) {
    try { root.PlannkeStorage?.createSnapshot?.('before-bank-import'); }
    catch (error) { console.warn('Ponto de recuperação da importação indisponível:', error); }
  }

  if (typeof core.ensurePlanning === 'function') core.ensurePlanning(data);
  if (!data.planning || typeof data.planning !== 'object') data.planning = {};
  if (!Array.isArray(data.planning.categoryRules)) data.planning.categoryRules = [];

  selected.forEach(item => {
    const transaction = { ...item.transaction, category: item.category || 'Outros' };
    data.transactions.push(transaction);
    if (!item.remember) return;
    const contains = merchantRuleKey(transaction.description);
    if (!contains) return;
    const exists = data.planning.categoryRules.some(rule => normalizeBankText(rule.contains) === contains && rule.category === transaction.category);
    if (!exists) {
      data.planning.categoryRules.push({
        id: typeof core.safeId === 'function' ? core.safeId('', 'catrule') : `catrule-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        contains,
        category: transaction.category
      });
    }
  });

  if (typeof core.sanitizePlanning === 'function') data.planning = core.sanitizePlanning(data.planning);
  root.saveData?.(data);
  root.renderAll?.();
  const imported = selected.length;
  const learned = selected.filter(item => item.remember).length;
  pendingBankImport = null;
  notifyBankImportReview();
  setBankImportResult(`${imported} movimentação${imported === 1 ? '' : 'ões'} confirmada${imported === 1 ? '' : 's'}${learned ? ` · ${learned} regra${learned === 1 ? '' : 's'} memorizada${learned === 1 ? '' : 's'}` : ''}.`);
  showToast(`${imported} movimentação${imported === 1 ? '' : 'ões'} importada${imported === 1 ? '' : 's'}.`);
}

async function readBankFileText(file) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('Arquivo bancário inválido.');
  const encoding = String(file.name || '').toLowerCase().endsWith('.ofx') ? 'windows-1252' : 'utf-8';
  const Decoder = root.TextDecoder;
  if (typeof Decoder !== 'function') throw new Error('TextDecoder indisponível.');
  return new Decoder(encoding).decode(await file.arrayBuffer());
}

async function stageBankFile(file, accountId) {
  const core = root.PlannkeCore;
  const data = typeof root.getData === 'function' ? root.getData() : null;
  if (!core || !data) return null;
  try {
    const source = await readBankFileText(file);
    const planning = data.planning && typeof data.planning === 'object' ? data.planning : {};
    const rules = Array.isArray(planning.categoryRules) ? planning.categoryRules : [];
    const lower = String(file.name || '').toLowerCase();
    const incoming = lower.endsWith('.ofx')
      ? core.parseOfxBank(source, accountId, rules)
      : core.parseCsvBank(source, accountId, rules);
    const fresh = core.dedupeImported(data.transactions || [], incoming || []);
    if (!incoming?.length) {
      showToast('Não consegui identificar movimentações nesse arquivo.', 'error');
      return null;
    }
    if (!fresh.length) {
      showToast('Nenhuma movimentação nova encontrada.', 'info');
      return null;
    }
    pendingBankImport = {
      accountId,
      fileName: file.name,
      totalFound: incoming.length,
      items: fresh.map(transaction => {
        const originalCategory = transaction.category || 'Outros';
        const suggested = !['Outros', 'Sem Categoria', ''].includes(originalCategory);
        return {
          transaction: { ...transaction },
          originalCategory,
          category: originalCategory,
          suggested,
          categoryChanged: false,
          include: true,
          remember: false
        };
      })
    };
    notifyBankImportReview({ focus: true });
    setBankImportResult(`${incoming.length} encontradas · ${fresh.length} novas aguardando revisão.`);
    return getPendingBankImport();
  } catch (error) {
    console.error(error);
    showToast('Erro ao ler o extrato.', 'error');
    return null;
  } finally {
    if (typeof document !== 'undefined') {
      const input = document.getElementById('product-bank-file');
      if (input) input.value = '';
    }
  }
}

function captureBankImport(event) {
  if (event.target?.id !== 'product-bank-file') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const file = event.target.files?.[0];
  const accountId = document.getElementById('product-bank-account')?.value;
  if (!file || !accountId) {
    showToast('Escolha a conta antes de selecionar o extrato.', 'error');
    event.target.value = '';
    return;
  }
  void stageBankFile(file, accountId);
}

function indent(fn) {
  return fn.toString().split('\n').map(line => `    ${line}`).join('\n');
}

let appData = read('app-data.js');
let desktop = read('app-presentation-desktop.js');
let storageUi = read('storage-ui.js');
let bankEntryTest = read('tests/bank-import-entry.test.js');
let desktopTest = read('tests/desktop-final.test.js');
let securityTest = read('tests/security-shell.test.js');

if (appData.includes('let pendingBankImport')) throw new Error('app-data already owns pending bank import state');
if (!desktop.includes('let pendingBankImport = null;')) throw new Error('desktop presentation no longer has expected pending bank import state');

appData = replaceOnce(appData, '    let controlsBound = false;\n', '    let controlsBound = false;\n    let pendingBankImport = null;\n', 'add canonical bank import state');
const workflowRuntime = [
  cloneBankImportState,
  normalizeBankText,
  merchantRuleKey,
  getPendingBankImport,
  setBankImportResult,
  notifyBankImportReview,
  updateBankImportItem,
  cancelBankImport,
  confirmBankImport,
  readBankFileText,
  stageBankFile,
  captureBankImport
].map(indent).join('\n\n') + '\n\n';
appData = replaceOnce(appData, '    function refreshBankAccountOptions(select, data) {', `${workflowRuntime}    function refreshBankAccountOptions(select, data) {`, 'insert bank import workflow into data runtime');
appData = replaceOnce(
  appData,
  "        ensureBankImportPanel();\n        document.getElementById('data-export-excel')?.addEventListener('click', exportToExcel);",
  "        ensureBankImportPanel();\n        document.addEventListener('change', captureBankImport, true);\n        document.getElementById('data-export-excel')?.addEventListener('click', exportToExcel);",
  'bind capture listener in data runtime'
);
appData = replaceOnce(
  appData,
  "        planningRows,\n        ensureBankImportPanel,",
  "        planningRows,\n        getPendingBankImport,\n        merchantRuleKey,\n        updateBankImportItem,\n        cancelBankImport,\n        confirmBankImport,\n        readBankFileText,\n        stageBankFile,\n        captureBankImport,\n        ensureBankImportPanel,",
  'publish bank workflow API'
);

// Retire state and controller logic from the presentation layer.
desktop = replaceOnce(desktop, '    let pendingBankImport = null;\n', '', 'remove presentation bank state');
desktop = replaceRegexOnce(desktop, /\n    function normalizeText\(value\) \{[\s\S]*?\n    function categoryOptions\(data, type, selected\) \{/, '\n    function categoryOptions(data, type, selected) {', 'remove merchant rule controller helpers from presentation');
desktop = replaceRegexOnce(desktop, /\n    function cancelBankImport\(\) \{[\s\S]*?\n    function renderBankImportReview\(\) \{/, '\n    function renderBankImportReview(options = {}) {', 'remove cancel and confirm controllers from presentation');
desktop = replaceOnce(
  desktop,
  "        const existing = document.getElementById('presentation-import-review');\n        if (!pendingBankImport) {",
  "        const bankImport = root.PlannkeDataActions;\n        const pendingBankImport = bankImport?.getPendingBankImport?.();\n        const existing = document.getElementById('presentation-import-review');\n        if (!pendingBankImport) {",
  'read pending state from canonical data runtime'
);
desktop = replaceOnce(
  desktop,
  "            include.addEventListener('change', () => { item.include = include.checked; row.classList.toggle('excluded', !item.include); });",
  "            include.addEventListener('change', () => { bankImport?.updateBankImportItem?.(index, { include: include.checked }); row.classList.toggle('excluded', !include.checked); });",
  'delegate include updates to data runtime'
);
desktop = replaceOnce(
  desktop,
  "                item.category = category.value;\n                item.categoryChanged = item.category !== item.originalCategory;\n                remember.disabled = !merchantRuleKey(item.transaction.description);",
  "                bankImport?.updateBankImportItem?.(index, { category: category.value });\n                remember.disabled = !bankImport?.merchantRuleKey?.(item.transaction.description);",
  'delegate category updates to data runtime'
);
desktop = replaceOnce(desktop, '            remember.disabled = !merchantRuleKey(item.transaction.description);', '            remember.disabled = !bankImport?.merchantRuleKey?.(item.transaction.description);', 'delegate remember availability');
desktop = replaceOnce(desktop, "            remember.addEventListener('change', () => { item.remember = remember.checked; });", "            remember.addEventListener('change', () => { bankImport?.updateBankImportItem?.(index, { remember: remember.checked }); });", 'delegate remember updates');
desktop = replaceOnce(desktop, "        cancel.addEventListener('click', cancelBankImport);", "        cancel.addEventListener('click', () => bankImport?.cancelBankImport?.());", 'delegate cancellation');
desktop = replaceOnce(desktop, "        confirm.addEventListener('click', confirmBankImport);", "        confirm.addEventListener('click', () => bankImport?.confirmBankImport?.());", 'delegate confirmation');
desktop = replaceOnce(
  desktop,
  '        if (!existing) view.appendChild(review);\n    }',
  "        if (!existing) view.appendChild(review);\n        if (options.focus) review.scrollIntoView({ behavior: 'smooth', block: 'start' });\n    }",
  'keep review focus as presentation concern'
);
desktop = replaceRegexOnce(desktop, /\n    function stageBankFile\(file, accountId\) \{[\s\S]*?\n    function updateDesktopCopy\(\) \{/, '\n    function updateDesktopCopy() {', 'remove file reading and capture controller from presentation');
desktop = replaceOnce(desktop, "        document.addEventListener('change', captureBankImport, true);\n", '', 'remove presentation capture listener');

// Small-import recovery belongs to the data controller now, not click-text interception.
storageUi = replaceRegexOnce(storageUi, /\n    function protectSmallBankImport\(event\) \{[\s\S]*?\n    function refresh\(\) \{/, '\n    function refresh() {', 'remove UI bank import snapshot interceptor');
storageUi = replaceOnce(storageUi, "        document.addEventListener('click', protectSmallBankImport, true);\n", '', 'remove UI snapshot click binding');

bankEntryTest = replaceOnce(
  bankEntryTest,
  "test('desktop presentation keeps reviewed import staging while data owns the entry', () => {\n  assert.match(desktop, /function captureBankImport\\(/);\n  assert.match(desktop, /function stageBankFile\\(/);\n  assert.match(desktop, /function renderBankImportReview\\(/);\n  assert.match(desktop, /event\\.stopImmediatePropagation\\(\\)/);\n});",
  "test('data runtime owns bank import staging while presentation only renders the review', () => {\n  assert.match(appData, /function captureBankImport\\(/);\n  assert.match(appData, /function stageBankFile\\(/);\n  assert.match(appData, /event\\.stopImmediatePropagation\\(\\)/);\n  assert.match(desktop, /function renderBankImportReview\\(/);\n  assert.doesNotMatch(desktop, /function (?:captureBankImport|stageBankFile|confirmBankImport|cancelBankImport)\\(/);\n});",
  'advance bank entry ownership test'
);

desktopTest = replaceOnce(desktopTest, "const shell = fs.readFileSync(path.join(root, 'app-shell.js'), 'utf8');", "const shell = fs.readFileSync(path.join(root, 'app-shell.js'), 'utf8');\nconst appData = fs.readFileSync(path.join(root, 'app-data.js'), 'utf8');", 'load data runtime in desktop contract');
desktopTest = replaceRegexOnce(
  desktopTest,
  /  assert\.match\(js, \/function captureBankImport\\\(\/\);[\s\S]*?  assert\.match\(js, \/'utf-8'\/\);/,
  "  assert.match(appData, /function captureBankImport\\(/);\n  assert.match(appData, /event\\.stopImmediatePropagation\\(\\)/);\n  assert.match(appData, /function stageBankFile\\(/);\n  assert.match(js, /function renderBankImportReview\\(/);\n  assert.match(js, /Revisar movimentações/);\n  assert.match(js, /Confirmar selecionadas/);\n  assert.match(appData, /function merchantRuleKey\\(/);\n  assert.match(appData, /windows-1252/);\n  assert.match(appData, /'utf-8'/);\n  assert.doesNotMatch(js, /function (?:captureBankImport|stageBankFile|confirmBankImport|cancelBankImport)\\(/);",
  'advance desktop reviewed import contract'
);

securityTest = replaceOnce(
  securityTest,
  "test('bank files are intercepted for review by the desktop presentation boundary', () => {\n  assert.match(desktop, /document\\.addEventListener\\('change', captureBankImport, true\\)/);\n  assert.match(desktop, /event\\.stopImmediatePropagation\\(\\)/);\n  assert.match(desktop, /pendingBankImport/);\n  assert.match(desktop, /function confirmBankImport\\(/);\n  assert.match(desktop, /data\\.transactions\\.push\\(transaction\\)/);\n  assert.doesNotMatch(product, /function (?:injectBankImport|importBankFile)\\(/);\n  assert.match(appData, /function ensureBankImportPanel\\(/);\n});",
  "test('bank import controller is canonical data code while presentation only renders review UI', () => {\n  assert.match(appData, /document\\.addEventListener\\('change', captureBankImport, true\\)/);\n  assert.match(appData, /event\\.stopImmediatePropagation\\(\\)/);\n  assert.match(appData, /let pendingBankImport = null/);\n  assert.match(appData, /function confirmBankImport\\(/);\n  assert.match(appData, /data\\.transactions\\.push\\(transaction\\)/);\n  assert.match(appData, /new Decoder\\(encoding\\)\\.decode\\(await file\\.arrayBuffer\\(\\)\\)/);\n  assert.doesNotMatch(appData, /FileReader/);\n  assert.match(desktop, /function renderBankImportReview\\(/);\n  assert.doesNotMatch(desktop, /let pendingBankImport|function (?:captureBankImport|stageBankFile|confirmBankImport|cancelBankImport)\\(/);\n  assert.doesNotMatch(product, /function (?:injectBankImport|importBankFile)\\(/);\n});",
  'move bank security boundary to data runtime'
);
securityTest = replaceOnce(
  securityTest,
  "  assert.match(storageUi, /before-bank-import/);\n  assert.match(storageUi, /selectedCount <= 0 \\|\\| selectedCount >= 5/);",
  "  assert.match(storageUi, /'before-bank-import': 'Antes de importar extrato'/);\n  assert.match(appData, /selected\\.length < 5/);\n  assert.match(appData, /createSnapshot\\?\\.\\('before-bank-import'\\)/);\n  assert.doesNotMatch(storageUi, /protectSmallBankImport|selectedCount/);",
  'move small bank recovery guard to data runtime'
);

write('app-data.js', appData);
write('app-presentation-desktop.js', desktop);
write('storage-ui.js', storageUi);
write('tests/bank-import-entry.test.js', bankEntryTest);
write('tests/desktop-final.test.js', desktopTest);
write('tests/security-shell.test.js', securityTest);

const workflowTest = `const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appData = fs.readFileSync(path.join(root, 'app-data.js'), 'utf8');
const desktop = fs.readFileSync(path.join(root, 'app-presentation-desktop.js'), 'utf8');
const storageUi = fs.readFileSync(path.join(root, 'storage-ui.js'), 'utf8');

test('data runtime owns the complete bank import controller and pending state', () => {
  assert.match(appData, /let pendingBankImport = null/);
  ['getPendingBankImport', 'updateBankImportItem', 'cancelBankImport', 'confirmBankImport', 'readBankFileText', 'stageBankFile', 'captureBankImport']
    .forEach(name => assert.match(appData, new RegExp('function\\\\s+' + name + '\\\\s*\\\\(')));
  assert.match(appData, /parseOfxBank/);
  assert.match(appData, /parseCsvBank/);
  assert.match(appData, /dedupeImported/);
});

test('bank files use ArrayBuffer plus explicit local decoders instead of FileReader', () => {
  assert.match(appData, /file\\.arrayBuffer\\(\\)/);
  assert.match(appData, /'windows-1252'/);
  assert.match(appData, /'utf-8'/);
  assert.match(appData, /new Decoder\\(encoding\\)\\.decode/);
  assert.doesNotMatch(appData, /FileReader/);
});

test('small reviewed imports create a specific recovery point before mutation', () => {
  assert.match(appData, /selected\\.length < 5/);
  assert.match(appData, /createSnapshot\\?\\.\\('before-bank-import'\\)/);
  assert.ok(appData.indexOf("createSnapshot?.('before-bank-import')") < appData.indexOf('selected.forEach(item =>'));
  assert.doesNotMatch(storageUi, /protectSmallBankImport|selectedCount/);
});

test('presentation renders review state but cannot own or mutate the controller directly', () => {
  assert.match(desktop, /const pendingBankImport = bankImport\\?\\.getPendingBankImport\\?\\.\\(\\)/);
  assert.match(desktop, /bankImport\\?\\.updateBankImportItem\\?\\./);
  assert.match(desktop, /bankImport\\?\\.cancelBankImport\\?\\./);
  assert.match(desktop, /bankImport\\?\\.confirmBankImport\\?\\./);
  assert.doesNotMatch(desktop, /let pendingBankImport/);
  assert.doesNotMatch(desktop, /function (?:merchantRuleKey|captureBankImport|stageBankFile|confirmBankImport|cancelBankImport)\\(/);
  assert.doesNotMatch(desktop, /FileReader|parseOfxBank|parseCsvBank|dedupeImported/);
});

test('data capture listener remains in the capture phase and review focus stays visual', () => {
  assert.match(appData, /document\\.addEventListener\\('change', captureBankImport, true\\)/);
  assert.match(appData, /event\\.stopImmediatePropagation\\(\\)/);
  assert.match(desktop, /if \\(options\\.focus\\) review\\.scrollIntoView/);
});

test('one-time bank workflow migration artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'promote-bank-import-workflow-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'promote-bank-import-workflow-once.yml')), false);
});
`;
write('tests/bank-import-workflow.test.js', workflowTest);

if (/FileReader/.test(appData)) throw new Error('canonical data runtime must not use FileReader');
if (/let pendingBankImport|function (?:captureBankImport|stageBankFile|confirmBankImport|cancelBankImport)\(/.test(desktop)) throw new Error('presentation still owns bank controller state or actions');
if (/protectSmallBankImport|selectedCount/.test(storageUi)) throw new Error('storage UI still intercepts bank confirmation');

for (const file of [
  path.join(rootDir, 'scripts', 'promote-bank-import-workflow-once.js'),
  path.join(rootDir, '.github', 'workflows', 'promote-bank-import-workflow-once.yml')
]) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

console.log('[bank import workflow] state, reading, confirmation and recovery moved to app-data.js');

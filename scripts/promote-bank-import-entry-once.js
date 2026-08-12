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

function refreshBankAccountOptions(select, data) {
  if (!select) return;
  const selected = select.value || '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Escolha a conta...';
  const options = [placeholder];
  (data?.accounts || []).forEach(account => {
    const option = document.createElement('option');
    option.value = String(account.id || '');
    option.textContent = `${account.name || 'Conta'} · ${currency(account.balance)}`;
    options.push(option);
  });
  select.replaceChildren(...options);
  select.value = (data?.accounts || []).some(account => String(account.id) === selected) ? selected : '';
}

function ensureBankImportPanel() {
  if (typeof document === 'undefined') return null;
  const backup = document.getElementById('backup-view');
  const row = backup?.querySelector(':scope > .row') || backup?.querySelector('.row');
  if (!backup || !row) return null;

  let panel = document.getElementById('product-bank-import');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'col-12 col-md-7 col-lg-5 mt-3';
    panel.id = 'product-bank-import';

    const card = document.createElement('div');
    card.className = 'card';
    const body = document.createElement('div');
    body.className = 'card-body p-4';
    const title = document.createElement('div');
    title.className = 'product-card-title';
    const titleMain = document.createElement('div');
    const icon = document.createElement('i');
    icon.className = 'ph ph-file-arrow-up';
    const strong = document.createElement('strong');
    strong.textContent = 'Importar extrato bancário';
    titleMain.append(icon, strong);
    const subtitle = document.createElement('small');
    subtitle.textContent = 'OFX ou CSV — sem conexão com seu banco';
    title.append(titleMain, subtitle);

    const copy = document.createElement('p');
    copy.className = 'small text-muted';
    copy.textContent = 'O arquivo é lido localmente. Duplicatas são removidas antes da revisão das movimentações.';

    const account = document.createElement('select');
    account.id = 'product-bank-account';
    account.className = 'form-select mb-2';

    const label = document.createElement('label');
    label.className = 'btn btn-outline-primary w-100';
    label.appendChild(document.createTextNode('Selecionar OFX / CSV'));
    const input = document.createElement('input');
    input.id = 'product-bank-file';
    input.className = 'd-none';
    input.type = 'file';
    input.accept = '.ofx,.csv,text/csv';
    label.appendChild(input);

    const result = document.createElement('div');
    result.id = 'product-bank-result';
    result.className = 'tiny text-muted mt-2';

    body.append(title, copy, account, label, result);
    card.appendChild(body);
    panel.appendChild(card);
    row.appendChild(panel);
  }

  const data = typeof root.getData === 'function' ? root.getData() : { accounts: [] };
  refreshBankAccountOptions(document.getElementById('product-bank-account'), data);
  root.PlannkePresentationDesktop?.decorateBackup?.();
  return panel;
}

function indent(fn) {
  return fn.toString().split('\n').map(line => `    ${line}`).join('\n');
}

let appData = read('app-data.js');
let product = read('product.js');
let navRetirement = read('tests/product-navigation-retirement.test.js');
let security = read('tests/security-shell.test.js');

if (appData.includes('function ensureBankImportPanel(')) throw new Error('app-data.js already owns bank import entry');
if (!product.includes('function injectBankImport(') || !product.includes('function importBankFile(')) throw new Error('expected product.js bank import entry runtime');

const bankEntryRuntime = [refreshBankAccountOptions, ensureBankImportPanel].map(indent).join('\n\n') + '\n\n';
appData = replaceOnce(appData, '    function bindDataControls() {', `${bankEntryRuntime}    function bindDataControls() {`, 'insert canonical bank import entry');
appData = replaceOnce(
  appData,
  "        controlsBound = true;\n        document.getElementById('data-export-excel')?.addEventListener('click', exportToExcel);",
  "        controlsBound = true;\n        ensureBankImportPanel();\n        document.getElementById('data-export-excel')?.addEventListener('click', exportToExcel);",
  'initialize bank import entry with data controls'
);
appData = replaceOnce(
  appData,
  "        document.getElementById('settings-clear-data')?.addEventListener('click', confirmClearData);\n    }",
  "        document.getElementById('settings-clear-data')?.addEventListener('click', confirmClearData);\n        root.addEventListener?.('plannke:data-changed', () => {\n            if (typeof root.setTimeout === 'function') root.setTimeout(ensureBankImportPanel, 0);\n            else ensureBankImportPanel();\n        });\n    }",
  'refresh bank import accounts after data changes'
);
appData = replaceOnce(
  appData,
  "        planningRows,\n        bindDataControls",
  "        planningRows,\n        ensureBankImportPanel,\n        refreshBankAccountOptions,\n        bindDataControls",
  'publish bank import entry API'
);

product = replaceRegexOnce(
  product,
  /\n\n    function accountOptions\(data, selected = ''\) \{[\s\S]*?\n\n    function onboardingModal\(\) \{/,
  '\n\n    function onboardingModal() {',
  'remove product-owned bank import entry and direct importer'
);
product = replaceOnce(product, 'injectTransactionFields();patchRenderers();injectBankImport();improveWelcome();maybeShowOnboarding();', 'injectTransactionFields();patchRenderers();improveWelcome();maybeShowOnboarding();', 'remove bank import injection from product init');
product = replaceOnce(product, "globalThis.addEventListener('plannke:data-changed',()=>setTimeout(()=>{injectBankImport();},0));", '', 'remove product bank import refresh listener');

navRetirement = replaceOnce(
  navRetirement,
  "/injectAssets\\(\\);installLedgerHooks\\(\\);injectTransactionFields\\(\\);patchRenderers\\(\\);injectBankImport\\(\\);improveWelcome\\(\\);maybeShowOnboarding\\(\\);/",
  "/injectAssets\\(\\);installLedgerHooks\\(\\);injectTransactionFields\\(\\);patchRenderers\\(\\);improveWelcome\\(\\);maybeShowOnboarding\\(\\);/",
  'advance product initialization contract'
);

security = replaceOnce(
  security,
  "test('bank files are intercepted for review before the legacy direct-import listener can run', () => {",
  "test('bank files are intercepted for review by the desktop presentation boundary', () => {",
  'rename bank review security contract'
);
security = replaceOnce(
  security,
  "  assert.match(desktop, /data\\.transactions\\.push\\(transaction\\)/);\n});",
  "  assert.match(desktop, /data\\.transactions\\.push\\(transaction\\)/);\n  assert.doesNotMatch(product, /function (?:injectBankImport|importBankFile)\\(/);\n  assert.match(appData, /function ensureBankImportPanel\\(/);\n});",
  'assert canonical bank entry ownership'
);

write('app-data.js', appData);
write('product.js', product);
write('tests/product-navigation-retirement.test.js', navRetirement);
write('tests/security-shell.test.js', security);

const bankTest = `const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appData = fs.readFileSync(path.join(root, 'app-data.js'), 'utf8');
const product = fs.readFileSync(path.join(root, 'product.js'), 'utf8');
const desktop = fs.readFileSync(path.join(root, 'app-presentation-desktop.js'), 'utf8');

test('canonical data runtime owns the bank import entry panel', () => {
  assert.match(appData, /function ensureBankImportPanel\\(/);
  assert.match(appData, /function refreshBankAccountOptions\\(/);
  assert.match(appData, /panel\\.id = 'product-bank-import'/);
  assert.match(appData, /input\\.id = 'product-bank-file'/);
  assert.match(appData, /account\\.id = 'product-bank-account'/);
  assert.match(appData, /ensureBankImportPanel,/);
});

test('bank import entry is DOM-safe and does not read files directly', () => {
  assert.match(appData, /document\\.createElement\\('select'\\)/);
  assert.match(appData, /select\\.replaceChildren\\(\.\.\.options\\)/);
  assert.doesNotMatch(appData, /\\.innerHTML\\s*=/);
  assert.doesNotMatch(appData, /FileReader/);
});

test('product compatibility layer no longer owns bank import UI or direct file import', () => {
  assert.doesNotMatch(product, /function injectBankImport\\(/);
  assert.doesNotMatch(product, /function importBankFile\\(/);
  assert.doesNotMatch(product, /function accountOptions\\(/);
  assert.doesNotMatch(product, /product-bank-import/);
  assert.doesNotMatch(product, /FileReader/);
});

test('desktop presentation keeps reviewed import staging while data owns the entry', () => {
  assert.match(desktop, /function captureBankImport\\(/);
  assert.match(desktop, /function stageBankFile\\(/);
  assert.match(desktop, /function renderBankImportReview\\(/);
  assert.match(desktop, /event\\.stopImmediatePropagation\\(\\)/);
});

test('bank account choices refresh after canonical data changes', () => {
  assert.match(appData, /root\\.addEventListener\\?\\.\\('plannke:data-changed'/);
  assert.match(appData, /root\\.setTimeout\\(ensureBankImportPanel, 0\\)/);
});

test('one-time bank import entry migration artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'promote-bank-import-entry-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'promote-bank-import-entry-once.yml')), false);
});
`;
write('tests/bank-import-entry.test.js', bankTest);

if (/function (?:injectBankImport|importBankFile)\(/.test(product)) throw new Error('product still owns bank import entry');
if (!appData.includes('function ensureBankImportPanel(')) throw new Error('app-data missing bank import entry');
if (/\.innerHTML\s*=/.test(appData)) throw new Error('app-data introduced unsafe HTML');

for (const file of [
  path.join(rootDir, 'scripts', 'promote-bank-import-entry-once.js'),
  path.join(rootDir, '.github', 'workflows', 'promote-bank-import-entry-once.yml')
]) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
console.log('[bank import] entry panel ownership moved to app-data.js');

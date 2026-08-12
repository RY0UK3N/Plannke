const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'app-runtime.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'app-ui.js'), 'utf8');
const appData = fs.readFileSync(path.join(root, 'app-data.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'app-navigation.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const manifest = fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8');
const product = fs.readFileSync(path.join(root, 'product.js'), 'utf8');
const productCss = fs.readFileSync(path.join(root, 'product.css'), 'utf8');
const insights = fs.readFileSync(path.join(root, 'insights.js'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'app-shell.js'), 'utf8');
const boot = fs.readFileSync(path.join(root, 'app-boot.js'), 'utf8');
const storageAdapter = fs.readFileSync(path.join(root, 'storage-adapter.js'), 'utf8');
const storageUi = fs.readFileSync(path.join(root, 'storage-ui.js'), 'utf8');
const storageUiCss = fs.readFileSync(path.join(root, 'storage-ui.css'), 'utf8');
const revamp = fs.readFileSync(path.join(root, 'app-presentation.js'), 'utf8');
const desktop = fs.readFileSync(path.join(root, 'app-presentation-desktop.js'), 'utf8');
const desktopCss = fs.readFileSync(path.join(root, 'app-presentation-desktop.css'), 'utf8');
const accountsCss = fs.readFileSync(path.join(root, 'app-presentation-accounts.css'), 'utf8');
const formsCss = fs.readFileSync(path.join(root, 'app-presentation-forms.css'), 'utf8');

function externalUrls(html) {
  return [...html.matchAll(/(?:src|href)="(https:\/\/[^\"]+)"/g)].map(match => match[1]);
}

test('product layer, app shell and safe renderers are loaded in the required order', () => {
  assert.match(index, /<link rel="stylesheet" href="product\.css">/);
  assert.match(index, /<script src="app-shell\.js" data-plannke-shell="true"><\/script>/);
  assert.match(index, /<script src="safe-renderers\.js"><\/script>/);
  assert.match(index, /<script src="product-core\.js"><\/script>/);
  assert.match(index, /<script src="product\.js"><\/script>/);
  assert.equal(index.indexOf('app.js'), -1);
  assert.ok(index.indexOf('app-runtime.js') < index.indexOf('app-shell.js'));
  assert.equal(index.indexOf('app-actions.js'), -1);
  assert.ok(index.indexOf('app-shell.js') < index.indexOf('app-boot.js'));
  assert.equal(index.indexOf('ui-bridge.js'), -1);
  assert.ok(index.indexOf('storage.js') < index.indexOf('product-core.js'));
  assert.ok(index.indexOf('product-core.js') < index.indexOf('app-boot.js'));
  assert.ok(index.indexOf('app-boot.js') < index.indexOf('safe-renderers.js'));
  assert.ok(index.indexOf('safe-renderers.js') < index.indexOf('product.js'));
  assert.match(boot, /script\.src = 'insights\.js'/);
  assert.match(boot, /serviceWorker\.register\('.\/sw\.js'\)/);
  assert.match(insights, /shell\.src = '\.\/app-shell\.js'/);
  assert.doesNotMatch(insights, /app-actions\.js|loadActions|plannkeActions/);
});

test('canonical app boot owns application start and waits for StorageAdapter', () => {
  assert.match(boot, /script\.src = 'storage-adapter\.js'/);
  assert.match(boot, /function waitForStorageReady\(/);
  assert.match(boot, /Promise\.resolve\(api\.ready\)/);
  assert.match(boot, /const applicationInit = root\?\.initApp/);
  assert.match(boot, /const storageReady = loadStorageAdapter\(\)/);
  assert.match(boot, /function startApplication\(\)/);
  assert.match(boot, /storageReady[\s\S]*applicationInit\.call\(root\)/);
  assert.equal(fs.existsSync(path.join(root, 'app-actions.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'app.js')), false);
  assert.doesNotMatch(runtime, /document\.addEventListener\(['"]DOMContentLoaded['"][\s\S]*initApp/);
  assert.doesNotMatch(runtime, /planner_autosave|planner_session_cache|loadFromLocalStorage|checkImportPrompt|setupBeforeUnload/);
  assert.doesNotMatch(ui, /planner_autosave|planner_session_cache|loadFromLocalStorage|checkImportPrompt|setupBeforeUnload/);
  assert.match(storageAdapter, /class LocalStorageAdapter/);
  assert.match(storageAdapter, /class StorageCoordinator/);
  assert.match(storageAdapter, /const ready = coordinator\.initialize\(\)/);
  assert.match(storageAdapter, /root\.getData = function/);
  assert.match(storageAdapter, /root\.saveData = function/);
  assert.doesNotMatch(storageAdapter, /root\.(?:loadFromLocalStorage|setupBeforeUnload|checkImportPrompt)\s*=/);
  assert.match(storageAdapter, /function recoveryFootprint\(/);
  assert.match(storageAdapter, /plannke:storage-status/);
});

test('canonical data actions replace the retired browser-storage and Memory Card runtime', () => {
  assert.match(navigation, /script\.src = 'app-data\.js'/);
  assert.match(navigation, /root\.PlannkeDataReady = dataActionsReady/);
  assert.match(navigation, /\['confirmClearData', 'exportToExcel'\]/);
  assert.match(appData, /root\.confirmClearData = confirmClearData/);
  assert.match(appData, /root\.exportToExcel = exportToExcel/);
  assert.match(appData, /Plannke_Relatorio_/);
  assert.match(appData, /'Resumo'/);
  assert.match(appData, /'Movimentações'/);
  assert.match(appData, /'Planejamento'/);
  assert.doesNotMatch(appData, /localStorage|sessionStorage|planner_autosave|planner_session_cache/);
  assert.doesNotMatch(appData, /Memory Card|importFromExcel|FileReader|_backupDone/);
  assert.doesNotMatch(appData, /\.innerHTML\s*=|\beval\s*\(|new\s+Function\s*\(/);
});

test('canonical desktop shell is primed synchronously before DOMContentLoaded', () => {
  assert.match(shell, /function primeCanonicalShell\(/);
  assert.match(shell, /api\.primeCanonicalShell\(\);\s*api\.loadPresentationAssets\(\);/);
  assert.match(shell, /document\.body\.classList\.add\('plannke-presentation'\)/);
  assert.match(shell, /document\.body\.dataset\.plannkeCanonical = 'desktop'/);
  assert.match(shell, /Central financeira/);
  assert.match(shell, /CANONICAL_PAGES/);
  assert.match(shell, /\['backup', 'ph-database', 'Dados'\]/);
  assert.doesNotMatch(shell, /function canonicalStylesPresent\([^)]*\)[\s\S]*?\}\);\n\}\)\(/);
});

test('source document contains no legacy application chrome or Memory Card entry flow', () => {
  assert.doesNotMatch(index, /class="navbar sticky-top planner-nav"/);
  assert.doesNotMatch(index, /class="fab-btn"/);
  assert.doesNotMatch(index, /id="mobile-tab-bar"/);
  assert.doesNotMatch(index, /id="welcomeModal"/);
  assert.doesNotMatch(index, /id="backupReminderModal"/);
  assert.doesNotMatch(index, /id="excelUpload"/);
  assert.doesNotMatch(index, /Inserir Memory Card|Salvar Backup Agora|Carregar Planilha/);
  assert.match(index, /id="backup-view"/);
  assert.match(index, /Dados e relatórios/);
  assert.match(index, /Exportar relatório Excel/);
});

test('canonical desktop styles are part of the first paint', () => {
  [
    'app-presentation.css',
    'app-presentation-dashboard.css',
    'app-presentation-movements.css',
    'app-presentation-planning.css',
    'app-presentation-accounts.css',
    'app-presentation-desktop.css',
    'storage-ui.css'
  ].forEach(asset => assert.ok(productCss.includes(`@import url('./${asset}')`), `missing canonical CSS import: ${asset}`));
  assert.match(productCss, /body:not\(\.plannke-presentation\) > main/);
  assert.match(productCss, /visibility: hidden !important/);
  assert.match(shell, /function canonicalStylesPresent\(/);
  assert.match(shell, /!canonicalStylesPresent\(\) && !document\.querySelector\('link\[data-plannke-presentation\]'\)/);
  assert.match(shell, /!canonicalStylesPresent\(\) && !document\.querySelector\('link\[data-plannke-desktop-style\]'\)/);
});

test('storage status and recovery UI are local and DOM-safe', () => {
  assert.match(boot, /script\.src = 'storage-ui\.js'/);
  assert.match(storageUi, /Salvando…/);
  assert.match(storageUi, /Salvo localmente/);
  assert.match(storageUi, /Recuperação local/);
  assert.match(storageUi, /createSnapshot\('manual'\)/);
  assert.match(storageUi, /restoreSnapshot\(snapshot\.id\)/);
  assert.match(storageUi, /'before-bank-import': 'Antes de importar extrato'/);
  assert.match(appData, /selected\.length < 5/);
  assert.match(appData, /createSnapshot\?\.\('before-bank-import'\)/);
  assert.doesNotMatch(storageUi, /protectSmallBankImport|selectedCount/);
  assert.match(storageUiCss, /\.plannke-recovery-panel/);
  assert.doesNotMatch(storageUi, /\.innerHTML\s*=/);
  assert.doesNotMatch(storageUi, /\.outerHTML\s*=/);
  assert.doesNotMatch(storageUi, /insertAdjacentHTML\s*\(/);
  assert.doesNotMatch(storageUi, /\beval\s*\(/);
});

test('storage UI observer cannot recursively rewrite its own status DOM', () => {
  assert.match(storageUi, /function setTextOnce\(/);
  assert.match(storageUi, /node\.textContent !== text/);
  assert.match(storageUi, /function setClassOnce\(/);
  assert.match(storageUi, /function setAttributeOnce\(/);
  assert.match(storageUi, /function scheduleObserverRefresh\(/);
  assert.match(storageUi, /new MutationObserver\(scheduleObserverRefresh\)/);
  assert.doesNotMatch(storageUi, /const observer = new MutationObserver\(\(\) => \{\s*updateStatus\(\)/);
});

test('revamp and final desktop assets are loaded locally and in deterministic order', () => {
  assert.match(shell, /script\.src = 'app-presentation\.js'/);
  assert.match(shell, /script\.async = false/);
  assert.match(shell, /desktopScript\.src = 'app-presentation-desktop\.js'/);
  assert.match(shell, /desktopScript\.async = false/);
  assert.match(shell, /script\.addEventListener\('load', loadDesktopAssets/);
  assert.match(revamp, /app-presentation-dashboard\.css/);
  assert.match(revamp, /app-presentation-movements\.css/);
  assert.match(revamp, /app-presentation-planning\.css/);
  assert.match(revamp, /app-presentation-accounts\.css/);
  assert.match(accountsCss, /@import url\('\.\/app-presentation-forms\.css'\)/);
  assert.match(formsCss, /@import url\('\.\/app-presentation-states\.css'\)/);
  assert.doesNotMatch(desktop, /\.innerHTML\s*=/);
  assert.doesNotMatch(desktop, /\beval\s*\(/);
  assert.match(desktopCss, /min-width: 1080px/);
});

test('bank import controller is canonical data code while presentation only renders review UI', () => {
  assert.match(appData, /document\.addEventListener\('change', captureBankImport, true\)/);
  assert.match(appData, /event\.stopImmediatePropagation\(\)/);
  assert.match(appData, /let pendingBankImport = null/);
  assert.match(appData, /function confirmBankImport\(/);
  assert.match(appData, /data\.transactions\.push\(transaction\)/);
  assert.match(appData, /new Decoder\(encoding\)\.decode\(await file\.arrayBuffer\(\)\)/);
  assert.doesNotMatch(appData, /FileReader/);
  assert.match(desktop, /function renderBankImportReview\(/);
  assert.doesNotMatch(desktop, /let pendingBankImport|function (?:captureBankImport|stageBankFile|confirmBankImport|cancelBankImport)\(/);
  assert.doesNotMatch(product, /function (?:injectBankImport|importBankFile)\(/);
});

test('third-party runtime dependencies are vendored and pinned', () => {
  const assets = [
    'vendor/bootstrap.min.css',
    'vendor/bootstrap.bundle.min.js',
    'vendor/phosphor-icons.css',
    'vendor/xlsx.full.min.js',
    'vendor/chart.umd.min.js',
    'vendor/echarts.min.js'
  ];
  assets.forEach(asset => assert.ok(fs.existsSync(path.join(root, asset)), `missing vendored asset: ${asset}`));
  assert.match(index, /href="vendor\/bootstrap\.min\.css"/);
  assert.match(index, /href="vendor\/phosphor-icons\.css"/);
  assert.match(index, /src="vendor\/bootstrap\.bundle\.min\.js"/);
  assert.match(index, /src="vendor\/xlsx\.full\.min\.js"/);
  assert.match(index, /src="vendor\/chart\.umd\.min\.js"/);
  assert.match(index, /src="vendor\/echarts\.min\.js"/);
  assert.doesNotMatch(index, /xlsx@0\.18\.5/);
  assert.doesNotMatch(index, /fonts\.googleapis\.com/);
});

test('one-time repository automations are not shipped with the application branch', () => {
  assert.equal(fs.existsSync(path.join(root, '.github/workflows/vendor-runtime-once.yml')), false);
  assert.equal(fs.existsSync(path.join(root, '.github/workflows/apply-storage-adapter-once.yml')), false);
  assert.equal(fs.existsSync(path.join(root, '.github/workflows/canonical-desktop-shell-once.yml')), false);
  assert.equal(fs.existsSync(path.join(root, '.github/workflows/retire-legacy-bootstrap-once.yml')), false);
  assert.equal(fs.existsSync(path.join(root, '.github/workflows/retire-app-bootstrap-once.yml')), false);
  assert.equal(fs.existsSync(path.join(root, '.github/workflows/retire-excel-legacy-once.yml')), false);
});

test('application shell uses local scripts and scopes inline style compatibility', () => {
  const match = index.match(/<meta http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  assert.ok(match, 'CSP meta tag should exist');
  const policy = match[1];
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /script-src 'self'/);
  assert.match(policy, /style-src 'self'/);
  assert.match(policy, /style-src-attr 'unsafe-inline'/);
  assert.match(policy, /font-src 'self' data: https:\/\/cdn\.jsdelivr\.net/);
  assert.match(policy, /connect-src 'self'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /base-uri 'self'/);
  assert.match(policy, /form-action 'self'/);
  const scriptPolicy = policy.match(/script-src[^;]*/)?.[0] || '';
  assert.equal(scriptPolicy.trim(), "script-src 'self'");
  assert.doesNotMatch(scriptPolicy, /'unsafe-inline'/);
  assert.doesNotMatch(scriptPolicy, /'unsafe-eval'/);
  assert.doesNotMatch(policy, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
});

test('index has no external scripts or stylesheets after vendoring', () => {
  assert.deepEqual(externalUrls(index), []);
  const phosphor = fs.readFileSync(path.join(root, 'vendor/phosphor-icons.css'), 'utf8');
  assert.match(phosphor, /cdn\.jsdelivr\.net\/npm\/@phosphor-icons\/web@2\.1\.2\/src\/regular\/Phosphor\.woff2/);
});

test('installed PWA prefers current local assets and falls back to cache offline', () => {
  assert.match(sw, /CACHE_NAME = 'plannke-shell-v38'/);
  assert.match(sw, /event\.request\.mode === 'navigate'/);
  const navigationBlock = sw.slice(sw.indexOf("event.request.mode === 'navigate'"), sw.indexOf("if (url.origin === self.location.origin)"));
  assert.ok(navigationBlock.indexOf('fetch(event.request)') < navigationBlock.indexOf("caches.match('./index.html')"));

  const localStart = sw.indexOf('if (url.origin === self.location.origin)');
  const localEnd = sw.indexOf("event.respondWith(\n    caches.match(event.request)", localStart);
  const localBlock = sw.slice(localStart, localEnd === -1 ? undefined : localEnd);
  assert.ok(localBlock.indexOf('fetch(event.request)') < localBlock.indexOf('caches.match(event.request)'));

  const parsedManifest = JSON.parse(manifest);
  assert.equal(parsedManifest.id, './');
  assert.equal(parsedManifest.background_color, '#0b0d12');
  assert.equal(parsedManifest.theme_color, '#0b0d12');

  [
    'app-ui.js', 'app-runtime.js', 'app-shell.js', 'app-boot.js', 'app-navigation.js', 'app-data.js',
    'product-core.js', 'product.js', 'insights.js', 'storage-adapter.js', 'storage-ui.js', 'storage-ui.css', 'safe-renderers.js',
    'app-presentation.js', 'app-presentation.css', 'app-presentation-desktop.js', 'app-presentation-desktop.css',
    'app-presentation-dashboard.css', 'app-presentation-movements.css', 'app-presentation-planning.css',
    'app-presentation-accounts.css', 'app-presentation-forms.css', 'app-presentation-states.css',
    'vendor/bootstrap.min.css', 'vendor/bootstrap.bundle.min.js', 'vendor/phosphor-icons.css',
    'vendor/xlsx.full.min.js', 'vendor/chart.umd.min.js', 'vendor/echarts.min.js'
  ].forEach(asset => assert.ok(sw.includes(asset), `missing PWA asset: ${asset}`));
});

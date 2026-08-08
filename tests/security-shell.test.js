const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const product = fs.readFileSync(path.join(root, 'product.js'), 'utf8');
const insights = fs.readFileSync(path.join(root, 'insights.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'ui-bridge.js'), 'utf8');
const storageAdapter = fs.readFileSync(path.join(root, 'storage-adapter.js'), 'utf8');
const storageUi = fs.readFileSync(path.join(root, 'storage-ui.js'), 'utf8');
const storageUiCss = fs.readFileSync(path.join(root, 'storage-ui.css'), 'utf8');
const revamp = fs.readFileSync(path.join(root, 'revamp.js'), 'utf8');
const desktop = fs.readFileSync(path.join(root, 'revamp-desktop.js'), 'utf8');
const desktopCss = fs.readFileSync(path.join(root, 'revamp-desktop.css'), 'utf8');
const accountsCss = fs.readFileSync(path.join(root, 'revamp-accounts.css'), 'utf8');
const formsCss = fs.readFileSync(path.join(root, 'revamp-forms.css'), 'utf8');

function externalUrls(html) {
  return [...html.matchAll(/(?:src|href)="(https:\/\/[^\"]+)"/g)].map(match => match[1]);
}

test('product layer, UI bridge and safe renderers are loaded in the required order', () => {
  assert.match(index, /<link rel="stylesheet" href="product\.css">/);
  assert.match(index, /<script src="ui-bridge\.js" data-plannke-ui-bridge="true"><\/script>/);
  assert.match(index, /<script src="safe-renderers\.js"><\/script>/);
  assert.match(index, /<script src="product-core\.js"><\/script>/);
  assert.match(index, /<script src="product\.js"><\/script>/);
  assert.ok(index.indexOf('app.js') < index.indexOf('ui-bridge.js'));
  assert.ok(index.indexOf('ui-bridge.js') < index.indexOf('safe-renderers.js'));
  assert.ok(index.indexOf('safe-renderers.js') < index.indexOf('product-core.js'));
  assert.ok(index.indexOf('product-core.js') < index.indexOf('product.js'));
  assert.match(product, /script\.src = 'insights\.js'/);
  assert.match(insights, /bridge\.src = '\.\/ui-bridge\.js'/);
});

test('StorageAdapter is ready before the legacy initApp body is allowed to run', () => {
  assert.match(bridge, /script\.src = 'storage-adapter\.js'/);
  assert.match(bridge, /function waitForStorageReady\(/);
  assert.match(bridge, /Promise\.resolve\(api\.ready\)/);
  assert.match(bridge, /const legacyInitApp = root\?\.initApp/);
  assert.match(bridge, /const storageReady = loadStorageAdapter\(\)/);
  assert.match(bridge, /storageReady[\s\S]*legacyInitApp\.apply/);
  assert.match(storageAdapter, /class LocalStorageAdapter/);
  assert.match(storageAdapter, /class StorageCoordinator/);
  assert.match(storageAdapter, /const ready = coordinator\.initialize\(\)/);
  assert.match(storageAdapter, /root\.getData = function/);
  assert.match(storageAdapter, /root\.saveData = function/);
  assert.match(storageAdapter, /plannke:storage-status/);
});

test('storage status and recovery UI are local and DOM-safe', () => {
  assert.match(bridge, /stylesheet\.href = 'storage-ui\.css'/);
  assert.match(bridge, /script\.src = 'storage-ui\.js'/);
  assert.match(storageUi, /Salvando…/);
  assert.match(storageUi, /Salvo localmente/);
  assert.match(storageUi, /Recuperação local/);
  assert.match(storageUi, /createSnapshot\('manual'\)/);
  assert.match(storageUi, /restoreSnapshot\(snapshot\.id\)/);
  assert.match(storageUiCss, /\.plannke-recovery-panel/);
  assert.doesNotMatch(storageUi, /\.innerHTML\s*=/);
  assert.doesNotMatch(storageUi, /\.outerHTML\s*=/);
  assert.doesNotMatch(storageUi, /insertAdjacentHTML\s*\(/);
  assert.doesNotMatch(storageUi, /\beval\s*\(/);
});

test('revamp and final desktop assets are loaded from trusted local scripts', () => {
  assert.match(bridge, /stylesheet\.href = 'revamp\.css'/);
  assert.match(bridge, /desktopStyle\.href = 'revamp-desktop\.css'/);
  assert.match(bridge, /script\.src = 'revamp\.js'/);
  assert.match(bridge, /desktopScript\.src = 'revamp-desktop\.js'/);
  assert.match(bridge, /loadRevampAssets\(\)/);
  assert.match(revamp, /revamp-dashboard\.css/);
  assert.match(revamp, /revamp-movements\.css/);
  assert.match(revamp, /revamp-planning\.css/);
  assert.match(revamp, /revamp-accounts\.css/);
  assert.match(accountsCss, /@import url\('\.\/revamp-forms\.css'\)/);
  assert.match(formsCss, /@import url\('\.\/revamp-states\.css'\)/);
  assert.doesNotMatch(desktop, /\.innerHTML\s*=/);
  assert.doesNotMatch(desktop, /\beval\s*\(/);
  assert.match(desktopCss, /min-width: 1080px/);
});

test('bank files are intercepted for review before the legacy direct-import listener can run', () => {
  assert.match(desktop, /document\.addEventListener\('change', captureBankImport, true\)/);
  assert.match(desktop, /event\.stopImmediatePropagation\(\)/);
  assert.match(desktop, /pendingBankImport/);
  assert.match(desktop, /function confirmBankImport\(/);
  assert.match(desktop, /data\.transactions\.push\(transaction\)/);
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

test('PWA navigation is network-first and local runtime assets are cached', () => {
  assert.match(sw, /CACHE_NAME = 'plannke-shell-v20'/);
  assert.match(sw, /event\.request\.mode === 'navigate'/);
  const navigationBlock = sw.slice(sw.indexOf("event.request.mode === 'navigate'"), sw.indexOf("if (url.origin === self.location.origin)"));
  assert.ok(navigationBlock.indexOf('fetch(event.request)') < navigationBlock.indexOf("caches.match('./index.html')"));
  [
    'product-core.js', 'product.js', 'insights.js', 'ui-bridge.js', 'storage-adapter.js', 'storage-ui.js', 'storage-ui.css', 'safe-renderers.js',
    'revamp.js', 'revamp.css', 'revamp-desktop.js', 'revamp-desktop.css',
    'revamp-dashboard.css', 'revamp-movements.css', 'revamp-planning.css',
    'revamp-accounts.css', 'revamp-forms.css', 'revamp-states.css',
    'vendor/bootstrap.min.css', 'vendor/bootstrap.bundle.min.js', 'vendor/phosphor-icons.css',
    'vendor/xlsx.full.min.js', 'vendor/chart.umd.min.js', 'vendor/echarts.min.js'
  ].forEach(asset => assert.ok(sw.includes(asset), `missing PWA asset: ${asset}`));
});

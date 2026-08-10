const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'app-ui.js'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'app-runtime.js'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'app-shell.js'), 'utf8');
const boot = fs.readFileSync(path.join(root, 'app-boot.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'app-navigation.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'ui-bridge.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

test('static shell loads canonical UI runtime navigation shell bridge and boot in order', () => {
  assert.doesNotMatch(html, /<script src="app\.js"><\/script>/);
  const storageIndex = html.indexOf('<script src="storage.js"></script>');
  const uiIndex = html.indexOf('<script src="app-ui.js"></script>');
  const runtimeIndex = html.indexOf('<script src="app-runtime.js"></script>');
  const navigationIndex = html.indexOf('<script src="app-navigation.js"></script>');
  const shellIndex = html.indexOf('<script src="app-shell.js" data-plannke-shell="true"></script>');
  const bridgeIndex = html.indexOf('<script src="ui-bridge.js" data-plannke-ui-bridge="true"></script>');
  const bootIndex = html.indexOf('<script src="app-boot.js"></script>');
  assert.ok(storageIndex >= 0 && storageIndex < uiIndex);
  assert.ok(uiIndex < runtimeIndex);
  assert.ok(runtimeIndex < navigationIndex);
  assert.ok(navigationIndex < shellIndex);
  assert.ok(shellIndex < bridgeIndex);
  assert.ok(bridgeIndex < bootIndex);
});

test('shared UI utilities own legacy globals without HTML-string rendering', () => {
  ['setupCurrencyInput', 'getCurrencyValue', 'setCurrencyValue', 'openModal', 'closeModal', 'showToast', 'showFormError', 'clearFormError']
    .forEach(name => assert.match(ui, new RegExp('root\\.' + name + ' = ' + name)));
  assert.match(ui, /root\._showDeleteConfirm = showDeleteConfirm/);
  assert.match(ui, /root\.PlannkeUI = api/);
  assert.match(ui, /text\.textContent = String\(message \?\? ''\)/);
  assert.doesNotMatch(ui, /\.innerHTML\s*=/);
  assert.doesNotMatch(ui, /\.outerHTML\s*=/);
  assert.doesNotMatch(ui, /insertAdjacentHTML\s*\(/);
  assert.doesNotMatch(ui, /\beval\s*\(|new\s+Function\s*\(/);
});

test('application runtime owns init and render orchestration only', () => {
  assert.match(runtime, /function initApp\(/);
  assert.match(runtime, /function renderAll\(/);
  assert.match(runtime, /root\.initApp = initApp/);
  assert.match(runtime, /root\.renderAll = renderAll/);
  assert.match(runtime, /root\.PlannkeRuntime = api/);
  assert.match(runtime, /root\.renderProjection\?\.\(data\)/);
  assert.match(runtime, /root\._populateMovFilters\?\.\(data\)/);
  assert.doesNotMatch(runtime, /innerHTML|echarts|new Chart|XLSX|FileReader/);
});

test('desktop shell owns chrome while compatibility bridge owns only action routing', () => {
  assert.match(shell, /root\.PlannkeShell = api/);
  assert.match(shell, /function primeCanonicalShell\(/);
  assert.doesNotMatch(bridge, /primeCanonicalShell|loadRevampAssets|CANONICAL_PAGES/);
  assert.match(bridge, /function dispatch\(/);
});

test('navigation wraps canonical init before app-boot captures it', () => {
  assert.match(navigation, /const legacyInitApp = root\.initApp/);
  assert.match(navigation, /root\.initApp = \(\.\.\.args\) => Promise\.all/);
  assert.match(boot, /const applicationInit = root\?\.initApp/);
  assert.doesNotMatch(bridge, /const applicationInit = root\?\.initApp/);
});

test('PWA and syntax checks use canonical UI runtime shell and boot instead of app.js', () => {
  assert.match(sw, /plannke-shell-v31/);
  assert.match(sw, /'\.\/app-ui\.js'/);
  assert.match(sw, /'\.\/app-runtime\.js'/);
  assert.match(sw, /'\.\/app-shell\.js'/);
  assert.match(sw, /'\.\/app-boot\.js'/);
  assert.doesNotMatch(sw, /'\.\/app\.js'/);
  assert.match(pkg, /node --check app-ui\.js/);
  assert.match(pkg, /node --check app-runtime\.js/);
  assert.match(pkg, /node --check app-shell\.js/);
  assert.match(pkg, /node --check app-boot\.js/);
});

test('one-time canonical UI integration artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'integrate-canonical-ui-runtime-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'integrate-canonical-ui-runtime-once.yml')), false);
});

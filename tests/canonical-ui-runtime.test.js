const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'app-ui.js'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'app-runtime.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'app-navigation.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'ui-bridge.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

test('static shell loads canonical UI and runtime before navigation and bridge', () => {
  assert.doesNotMatch(html, /<script src="app\.js"><\/script>/);
  const storageIndex = html.indexOf('<script src="storage.js"></script>');
  const uiIndex = html.indexOf('<script src="app-ui.js"></script>');
  const runtimeIndex = html.indexOf('<script src="app-runtime.js"></script>');
  const navigationIndex = html.indexOf('<script src="app-navigation.js"></script>');
  const bridgeIndex = html.indexOf('<script src="ui-bridge.js" data-plannke-ui-bridge="true"></script>');
  assert.ok(storageIndex >= 0 && storageIndex < uiIndex);
  assert.ok(uiIndex < runtimeIndex);
  assert.ok(runtimeIndex < navigationIndex);
  assert.ok(navigationIndex < bridgeIndex);
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

test('navigation still wraps the canonical init before ui bridge captures it', () => {
  assert.match(navigation, /const legacyInitApp = root\.initApp/);
  assert.match(navigation, /root\.initApp = \(\.\.\.args\) => Promise\.all/);
  assert.match(bridge, /const applicationInit = root\?\.initApp/);
});

test('PWA and syntax checks use canonical UI runtime instead of app.js', () => {
  assert.match(sw, /plannke-shell-v28/);
  assert.match(sw, /'\.\/app-ui\.js'/);
  assert.match(sw, /'\.\/app-runtime\.js'/);
  assert.doesNotMatch(sw, /'\.\/app\.js'/);
  assert.match(pkg, /node --check app-ui\.js/);
  assert.match(pkg, /node --check app-runtime\.js/);
});

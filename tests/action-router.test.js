const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const actions = require('../app-actions.js');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app-actions.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'ui-bridge.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const insights = fs.readFileSync(path.join(root, 'insights.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

test('canonical action router owns the compatibility parser and delegation', () => {
  assert.match(source, /root\.PlannkeActions = api/);
  assert.match(source, /const DATA_ATTRS = \{/);
  assert.match(source, /const ALLOWED_CALLS = new Set/);
  assert.match(source, /function parseCall\(/);
  assert.match(source, /function dispatch\(/);
  assert.match(source, /function handleDelegated\(/);
  assert.doesNotMatch(source, /\beval\s*\(|new\s+Function\s*\(/);
  assert.equal(actions.canHandle('dupTx("abc")'), true);
  assert.equal(actions.canHandle('alert(document.cookie)'), false);
});

test('canonical actions stay isolated from shell boot storage and rendering ownership', () => {
  assert.doesNotMatch(source, /CANONICAL_PAGES|primeCanonicalShell|loadRevampAssets|loadDesktopAssets/);
  assert.doesNotMatch(source, /loadStorageAdapter|loadStorageUiAssets|startApplication|applicationInit|storageReady/);
  assert.doesNotMatch(source, /renderDashboard|renderProjection|safeRender|StorageCoordinator/);
});

test('static shell loads app-actions instead of the retired UI bridge', () => {
  assert.match(index, /<script src="app-actions\.js" data-plannke-actions="true"><\/script>/);
  assert.doesNotMatch(index, /<script src="ui-bridge\.js"/);
  const shellAt = index.indexOf('src="app-shell.js"');
  const actionsAt = index.indexOf('src="app-actions.js"');
  const bootAt = index.indexOf('src="app-boot.js"');
  assert.ok(shellAt >= 0 && actionsAt > shellAt && bootAt > actionsAt);
});

test('insights fallback loads the canonical action router after the shell', () => {
  assert.match(insights, /actions\.src = '\.\/app-actions\.js'/);
  assert.match(insights, /actions\.dataset\.plannkeActions = 'true'/);
  assert.match(insights, /shell\.addEventListener\('load', loadActions/);
  assert.doesNotMatch(insights, /ui-bridge\.js|plannkeUiBridge|loadBridge/);
});

test('PWA and CI use app-actions while ui-bridge is outside runtime', () => {
  assert.match(sw, /plannke-shell-v32/);
  assert.match(sw, /'\.\/app-actions\.js'/);
  assert.doesNotMatch(sw, /'\.\/ui-bridge\.js'/);
  assert.match(pkg, /node --check app-actions\.js/);
});

test('old bridge remains equivalent only as a temporary removal checkpoint', () => {
  assert.equal(fs.existsSync(path.join(root, 'ui-bridge.js')), true);
  ['splitArgs', 'parseCall', 'canHandle', 'dispatch', 'init'].forEach(name => {
    assert.match(bridge, new RegExp(name));
    assert.match(source, new RegExp(name));
  });
});

test('one-time canonical action router swap artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'install-app-actions-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'install-app-actions-once.yml')), false);
});

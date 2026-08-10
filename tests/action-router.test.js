const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const actions = require('../app-actions.js');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app-actions.js'), 'utf8');
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

test('static shell loads app-actions with no retired UI bridge', () => {
  assert.match(index, /<script src="app-actions\.js" data-plannke-actions="true"><\/script>/);
  assert.doesNotMatch(index, /ui-bridge\.js|data-plannke-ui-bridge/);
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

test('PWA and CI use app-actions with no retired bridge reference', () => {
  assert.match(sw, /plannke-shell-v32/);
  assert.match(sw, /'\.\/app-actions\.js'/);
  assert.doesNotMatch(sw, /ui-bridge\.js/);
  assert.match(pkg, /node --check app-actions\.js/);
  assert.doesNotMatch(pkg, /node --check ui-bridge\.js/);
});

test('ui-bridge.js is physically retired from the repository', () => {
  assert.equal(fs.existsSync(path.join(root, 'ui-bridge.js')), false);
});

test('one-time canonical action router swap artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'install-app-actions-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'install-app-actions-once.yml')), false);
});

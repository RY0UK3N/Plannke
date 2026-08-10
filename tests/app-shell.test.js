const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const shell = fs.readFileSync(path.join(root, 'app-shell.js'), 'utf8');
const actions = fs.readFileSync(path.join(root, 'app-actions.js'), 'utf8');
const insights = fs.readFileSync(path.join(root, 'insights.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

test('canonical shell owns desktop chrome and revamp assets', () => {
  assert.match(shell, /const CANONICAL_PAGES = \[/);
  assert.match(shell, /function primeCanonicalShell\(/);
  assert.match(shell, /function loadRevampAssets\(/);
  assert.match(shell, /function loadDesktopAssets\(/);
  assert.match(shell, /Central financeira/);
  assert.match(shell, /root\.PlannkeShell = api/);
  assert.doesNotMatch(shell, /\.innerHTML\s*=|\beval\s*\(|new\s+Function\s*\(/);
});

test('shell-owned settings and new-transaction actions use explicit listeners', () => {
  assert.match(shell, /settings\.addEventListener\('click', \(\) => root\.openSettingsPanel\?\.\(\)\)/);
  assert.match(shell, /add\.addEventListener\('click', \(\) => root\.openTxModal\?\.\(null\)\)/);
  assert.doesNotMatch(shell, /dataset\.plannkeOnclick/);
  assert.doesNotMatch(actions, /'openSettingsPanel'/);
  assert.doesNotMatch(actions, /'openTxModal'/);
});

test('canonical action router does not own shell construction or visual assets', () => {
  assert.doesNotMatch(actions, /CANONICAL_PAGES|primeCanonicalShell|loadRevampAssets|loadDesktopAssets|Central financeira/);
  assert.doesNotMatch(actions, /revamp(?:-desktop)?\.(?:js|css)/);
  assert.match(actions, /const DATA_ATTRS = \{/);
  assert.match(actions, /const ALLOWED_CALLS = new Set/);
  assert.match(actions, /function dispatch\(/);
  assert.match(actions, /function handleDelegated\(/);
});

test('static shell loads app-shell before canonical actions and app boot', () => {
  const navigationAt = index.indexOf('src="app-navigation.js"');
  const shellAt = index.indexOf('src="app-shell.js"');
  const actionsAt = index.indexOf('src="app-actions.js"');
  const bootAt = index.indexOf('src="app-boot.js"');
  assert.ok(navigationAt >= 0 && shellAt > navigationAt && actionsAt > shellAt && bootAt > actionsAt);
  assert.match(index, /<script src="app-shell\.js" data-plannke-shell="true"><\/script>/);
  assert.match(index, /<script src="app-actions\.js" data-plannke-actions="true"><\/script>/);
  assert.doesNotMatch(index, /<script src="ui-bridge\.js"/);
});

test('insights fallback loads shell before canonical actions', () => {
  assert.match(insights, /shell\.src = '\.\/app-shell\.js'/);
  assert.match(insights, /shell\.addEventListener\('load', loadActions/);
  assert.match(insights, /actions\.src = '\.\/app-actions\.js'/);
  assert.doesNotMatch(insights, /ui-bridge\.js|loadBridge|plannkeUiBridge/);
});

test('canonical shell and actions are syntax-checked and available offline', () => {
  assert.match(pkg, /node --check app-shell\.js/);
  assert.match(pkg, /node --check app-actions\.js/);
  assert.match(sw, /plannke-shell-v32/);
  assert.match(sw, /'\.\/app-shell\.js'/);
  assert.match(sw, /'\.\/app-actions\.js'/);
  assert.doesNotMatch(sw, /'\.\/ui-bridge\.js'/);
});

test('one-time app shell extraction artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'extract-app-shell-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'extract-app-shell-once.yml')), false);
});

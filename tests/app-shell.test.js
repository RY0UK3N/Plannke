const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const shell = fs.readFileSync(path.join(root, 'app-shell.js'), 'utf8');
const insights = fs.readFileSync(path.join(root, 'insights.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

test('canonical shell owns desktop chrome and revamp assets', () => {
  assert.match(shell, /const CANONICAL_PAGES = \[/);
  assert.match(shell, /function primeCanonicalShell\(/);
  assert.match(shell, /function loadPresentationAssets\(/);
  assert.match(shell, /function loadDesktopAssets\(/);
  assert.match(shell, /Central financeira/);
  assert.match(shell, /root\.PlannkeShell = api/);
  assert.doesNotMatch(shell, /\.innerHTML\s*=|\beval\s*\(|new\s+Function\s*\(/);
});

test('shell-owned settings and new-transaction actions use explicit listeners', () => {
  assert.match(shell, /settings\.addEventListener\('click', \(\) => root\.openSettingsPanel\?\.\(\)\)/);
  assert.match(shell, /add\.addEventListener\('click', \(\) => root\.openTxModal\?\.\(null\)\)/);
  assert.doesNotMatch(shell, /dataset\.plannkeOnclick/);
});

test('compatibility action router is no longer part of shell ownership', () => {
  assert.equal(fs.existsSync(path.join(root, 'app-actions.js')), false);
  assert.doesNotMatch(index, /app-actions\.js|data-plannke-actions/);
});

test('static shell loads app-shell directly before app boot', () => {
  const navigationAt = index.indexOf('src="app-navigation.js"');
  const shellAt = index.indexOf('src="app-shell.js"');
  const bootAt = index.indexOf('src="app-boot.js"');
  assert.ok(navigationAt >= 0 && shellAt > navigationAt && bootAt > shellAt);
  assert.match(index, /<script src="app-shell\.js" data-plannke-shell="true"><\/script>/);
  assert.doesNotMatch(index, /<script src="(?:ui-bridge|app-actions)\.js"/);
});

test('insights fallback loads only the canonical shell', () => {
  assert.match(insights, /shell\.src = '\.\/app-shell\.js'/);
  assert.doesNotMatch(insights, /app-actions\.js|loadActions|plannkeActions/);
  assert.doesNotMatch(insights, /ui-bridge\.js|loadBridge|plannkeUiBridge/);
});

test('canonical shell is syntax-checked and available offline without action router', () => {
  assert.match(pkg, /node --check app-shell\.js/);
  assert.doesNotMatch(pkg, /node --check app-actions\.js/);
  assert.match(sw, /plannke-shell-v37/);
  assert.match(sw, /'\.\/app-shell\.js'/);
  assert.doesNotMatch(sw, /'\.\/(?:ui-bridge|app-actions)\.js'/);
});

test('one-time app shell extraction artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'extract-app-shell-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'extract-app-shell-once.yml')), false);
});

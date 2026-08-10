const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const shell = fs.readFileSync(path.join(root, 'app-shell.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'ui-bridge.js'), 'utf8');
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

test('compatibility bridge no longer owns shell construction or visual assets', () => {
  assert.doesNotMatch(bridge, /CANONICAL_PAGES|primeCanonicalShell|loadRevampAssets|loadDesktopAssets|Central financeira/);
  assert.match(bridge, /const DATA_ATTRS = \{/);
  assert.match(bridge, /const ALLOWED_CALLS = new Set/);
  assert.match(bridge, /function dispatch\(/);
  assert.match(bridge, /function handleDelegated\(/);
});

test('static shell loads app-shell before compatibility bridge and app boot', () => {
  const navigationAt = index.indexOf('src="app-navigation.js"');
  const shellAt = index.indexOf('src="app-shell.js"');
  const bridgeAt = index.indexOf('src="ui-bridge.js"');
  const bootAt = index.indexOf('src="app-boot.js"');
  assert.ok(navigationAt >= 0 && shellAt > navigationAt && bridgeAt > shellAt && bootAt > bridgeAt);
  assert.match(index, /<script src="app-shell\.js" data-plannke-shell="true"><\/script>/);
});

test('insights fallback loads shell before compatibility bridge', () => {
  assert.match(insights, /shell\.src = '\.\/app-shell\.js'/);
  assert.match(insights, /shell\.addEventListener\('load', loadBridge/);
  assert.match(insights, /bridge\.src = '\.\/ui-bridge\.js'/);
});

test('canonical shell is syntax-checked and available offline', () => {
  assert.match(pkg, /node --check app-shell\.js/);
  assert.match(sw, /plannke-shell-v31/);
  assert.match(sw, /'\.\/app-shell\.js'/);
});

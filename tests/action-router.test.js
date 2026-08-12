const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const insights = fs.readFileSync(path.join(root, 'insights.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

test('app-actions compatibility router is physically retired', () => {
  assert.equal(fs.existsSync(path.join(root, 'app-actions.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'ui-bridge.js')), false);
});

test('static shell boots directly from canonical shell into app boot', () => {
  const navigationAt = index.indexOf('src="app-navigation.js"');
  const shellAt = index.indexOf('src="app-shell.js"');
  const bootAt = index.indexOf('src="app-boot.js"');
  assert.ok(navigationAt >= 0 && shellAt > navigationAt && bootAt > shellAt);
  assert.doesNotMatch(index, /app-actions\.js|data-plannke-actions/);
});

test('insights fallback requires only canonical shell', () => {
  assert.match(insights, /shell\.src = '\.\/app-shell\.js'/);
  assert.doesNotMatch(insights, /app-actions\.js|plannkeActions|loadActions/);
});

test('PWA and CI no longer carry the compatibility router', () => {
  assert.match(sw, /plannke-shell-v38/);
  assert.doesNotMatch(sw, /'\.\/app-actions\.js'/);
  assert.doesNotMatch(pkg, /node --check app-actions\.js/);
});

test('one-time canonical action router artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'install-app-actions-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'install-app-actions-once.yml')), false);
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-app-actions-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-actions-once.yml')), false);
});

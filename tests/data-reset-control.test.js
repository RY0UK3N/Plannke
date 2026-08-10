const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const data = fs.readFileSync(path.join(root, 'app-data.js'), 'utf8');

test('settings reset button is inert markup with an explicit ID', () => {
  assert.match(html, /id="settings-clear-data"/);
  assert.doesNotMatch(html, /data-plannke-(?:onclick|onchange|oninput)=/);
});

test('app-data owns reset click and preserves confirmation before save', () => {
  assert.match(data, /document\.getElementById\('settings-clear-data'\)\?\.addEventListener\('click', confirmClearData\)/);
  assert.match(data, /root\.confirm\(/);
  assert.match(data, /if \(!approved\) return/);
  assert.match(data, /root\.saveData\(emptyDataset\(theme\)\)/);
});

test('data reset no longer depends on a compatibility router', () => {
  assert.equal(fs.existsSync(path.join(root, 'app-actions.js')), false);
});

test('one-time data reset migration artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'bind-data-reset-v2-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'bind-data-reset-v2-once.yml')), false);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const data = fs.readFileSync(path.join(root, 'app-data.js'), 'utf8');
const actions = fs.readFileSync(path.join(root, 'app-actions.js'), 'utf8');

test('settings reset button is inert markup with an explicit ID', () => {
  assert.match(html, /id="settings-clear-data"/);
  assert.doesNotMatch(html, /data-plannke-onclick="confirmClearData\(\)"/);
});

test('app-data owns the reset click while preserving two-step confirmation', () => {
  assert.match(data, /document\.getElementById\('settings-clear-data'\)\?\.addEventListener\('click', confirmClearData\)/);
  assert.match(data, /if \(!clearArmed\)/);
  assert.match(data, /clearArmed = true/);
  assert.match(data, /storage\.replaceData\(emptyDataset\(\)\)/);
});

test('confirmClearData no longer occupies compatibility allowlist', () => {
  assert.doesNotMatch(actions, /'confirmClearData'/);
});

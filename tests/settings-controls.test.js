const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'app-settings.js'), 'utf8');

test('settings-owned static controls no longer store compatibility code', () => {
  ['settings-theme-toggle', 'cat-modal-tab-expense', 'cat-modal-tab-income', 'cat-tab-expense', 'cat-tab-income', 'cat-modal-add', 'cat-add']
    .forEach(id => assert.match(html, new RegExp(`id="${id}"`)));
  assert.doesNotMatch(html, /data-plannke-(?:onclick|onchange|oninput)=/);
});

test('app-settings binds its static controls exactly once', () => {
  assert.match(settings, /let controlsBound = false/);
  assert.match(settings, /function bindSettingsControls\(/);
  assert.match(settings, /if \(controlsBound \|\| typeof document === 'undefined'\) return/);
  assert.match(settings, /byId\('settings-theme-toggle'\)\?\.addEventListener\('change', toggleTheme\)/);
  assert.match(settings, /byId\('cat-modal-tab-expense'\)\?\.addEventListener\('click', \(\) => switchCatTabModal\('expense'\)\)/);
  assert.match(settings, /byId\('cat-modal-add'\)\?\.addEventListener\('click', addCustomCategoryModal\)/);
  assert.match(settings, /byId\('cat-tab-expense'\)\?\.addEventListener\('click', \(\) => switchCatTab\('expense'\)\)/);
  assert.match(settings, /byId\('cat-add'\)\?\.addEventListener\('click', addCustomCategory\)/);
  assert.match(settings, /root\.PlannkeSettings = api;\s*bindSettingsControls\(\)/);
});

test('settings controls no longer depend on compatibility routing', () => {
  assert.equal(fs.existsSync(path.join(root, 'app-actions.js')), false);
});

test('one-time settings control binding artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'bind-settings-controls-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'bind-settings-controls-once.yml')), false);
});

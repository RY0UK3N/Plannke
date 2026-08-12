const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'src', 'app', 'app-navigation.js'), 'utf8');

test('shortcut launcher is owned by navigation with no compatibility code', () => {
  assert.match(html, /id="settings-shortcuts"/);
  assert.doesNotMatch(html, /data-plannke-onclick/);
  assert.match(navigation, /document\.getElementById\('settings-shortcuts'\)\?\.addEventListener\('click'/);
  assert.match(navigation, /document\.getElementById\('shortcutsModal'\)/);
});

test('shortcut launcher no longer depends on a compatibility router', () => {
  assert.equal(fs.existsSync(path.join(root, 'app-actions.js')), false);
});

test('one-time shortcut binding artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'bind-shortcut-control-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'bind-shortcut-control-once.yml')), false);
});

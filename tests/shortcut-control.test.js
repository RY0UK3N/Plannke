const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'app-navigation.js'), 'utf8');
const actions = fs.readFileSync(path.join(root, 'app-actions.js'), 'utf8');

test('shortcut launcher is inert markup with an explicit ID', () => {
  assert.match(html, /id="settings-shortcuts"/);
  assert.doesNotMatch(html, /data-plannke-onclick="bootstrap\.Modal\.getOrCreateInstance\(document\.getElementById\('shortcutsModal'\)\)\.show\(\)"/);
});

test('navigation owns shortcut modal launcher', () => {
  assert.match(navigation, /function setupKeyboardShortcuts\(/);
  assert.match(navigation, /document\.getElementById\('settings-shortcuts'\)\?\.addEventListener\('click',/);
  assert.match(navigation, /document\.getElementById\('shortcutsModal'\)/);
  assert.match(navigation, /root\.bootstrap\?\.Modal/);
});

test('shortcut special compatibility route is retired', () => {
  assert.doesNotMatch(actions, /return 'shortcuts'/);
  assert.doesNotMatch(actions, /kind === 'shortcuts'/);
  assert.doesNotMatch(actions, /shortcutsModal/);
});

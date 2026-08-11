const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const shell = fs.readFileSync(path.join(root, 'app-shell.js'), 'utf8');
const presentation = fs.readFileSync(path.join(root, 'app-presentation.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('shell exposes presentation loader and metadata without revamp runtime vocabulary', () => {
  assert.match(shell, /api\.loadPresentationAssets\(\)/);
  assert.match(shell, /function loadPresentationAssets\(\)/);
  assert.match(shell, /loadPresentationAssets\s*$/m);
  assert.match(shell, /data-plannke-presentation/);
  assert.match(shell, /dataset\.plannkePresentation = 'desktop'/);
  assert.doesNotMatch(shell, /loadRevampAssets/);
  assert.doesNotMatch(shell, /data-plannke-revamp/);
  assert.doesNotMatch(shell, /dataset\.plannkeRevamp/);
});

test('body and view metadata use presentation names while visual selectors stay unchanged', () => {
  assert.match(shell, /dataset\.presentationVersion = '2'/);
  assert.doesNotMatch(shell, /dataset\.revampVersion/);
  assert.match(presentation, /dataset\.presentationView = target/);
  assert.match(presentation, /dataset\.plannkePresentationView = asset/);
  assert.doesNotMatch(presentation, /dataset\.revampView|dataset\.plannkeRevampView/);

  assert.match(shell, /classList\.add\('plannke-revamp'\)/);
  assert.match(shell, /shell\.id = 'revamp-shell'/);
  assert.match(presentation, /revamp-nav-item/);
});

test('PWA cache advances for presentation metadata update without renaming visual assets', () => {
  assert.match(sw, /plannke-shell-v36/);
  assert.match(sw, /'\.\/revamp\.css'/);
  assert.match(sw, /'\.\/revamp-desktop\.css'/);
});

test('one-time presentation metadata migration artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'promote-presentation-metadata-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'promote-presentation-metadata-once.yml')), false);
});

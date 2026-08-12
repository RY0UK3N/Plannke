const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const shell = fs.readFileSync(path.join(root, 'src', 'app', 'app-shell.js'), 'utf8');
const presentation = fs.readFileSync(path.join(root, 'src', 'app', 'app-presentation.js'), 'utf8');
const desktop = fs.readFileSync(path.join(root, 'src', 'app', 'app-presentation-desktop.js'), 'utf8');
const productCss = fs.readFileSync(path.join(root, 'src', 'styles', 'product.css'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const stylesheets = [
  'app-presentation.css',
  'app-presentation-dashboard.css',
  'app-presentation-movements.css',
  'app-presentation-planning.css',
  'app-presentation-accounts.css',
  'app-presentation-desktop.css',
  'app-presentation-forms.css',
  'app-presentation-states.css'
];

const visualSources = [shell, presentation, desktop, productCss, ...stylesheets.map(file => fs.readFileSync(path.join(root, 'src', 'styles', file), 'utf8'))];

test('canonical shell and presentation runtime use the presentation visual namespace', () => {
  assert.match(shell, /shell\.id = 'presentation-shell'/);
  assert.match(shell, /classList\.add\('plannke-presentation'\)/);
  assert.match(shell, /make\('div', 'presentation-shell'\)/);
  assert.match(presentation, /\.presentation-nav-item/);
  assert.match(presentation, /presentation-dashboard/);
  assert.match(desktop, /presentation-dashboard-empty/);
});

test('old revamp structural identifiers are absent from runtime and CSS', () => {
  visualSources.forEach(source => {
    assert.doesNotMatch(source, /revamp-/);
    assert.doesNotMatch(source, /plannke-revamp/);
  });
});

test('all presentation stylesheets use the canonical selector namespace', () => {
  const css = stylesheets.map(file => fs.readFileSync(path.join(root, 'src', 'styles', file), 'utf8')).join('\n');
  assert.match(css, /\.presentation-/);
  assert.match(css, /body\.plannke-presentation/);
  assert.match(productCss, /body:not\(\.plannke-presentation\)/);
  assert.doesNotMatch(css, /\.revamp-|#revamp-|--revamp-/);
});

test('presentation shell test file is promoted with the selector namespace', () => {
  assert.equal(fs.existsSync(path.join(root, 'tests', 'revamp-shell.test.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'tests', 'presentation-shell.test.js')), true);
});

test('PWA cache advances for canonical presentation selectors', () => {
  assert.match(sw, /plannke-shell-v41/);
});

test('one-time selector migration artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'promote-presentation-selectors-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'promote-presentation-selectors-once.yml')), false);
});

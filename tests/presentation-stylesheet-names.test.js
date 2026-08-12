const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const shell = fs.readFileSync(path.join(root, 'app-shell.js'), 'utf8');
const presentation = fs.readFileSync(path.join(root, 'app-presentation.js'), 'utf8');
const productCss = fs.readFileSync(path.join(root, 'product.css'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

const renamed = {
  'revamp.css': 'app-presentation.css',
  'presentation-dashboard.css': 'app-presentation-dashboard.css',
  'presentation-movements.css': 'app-presentation-movements.css',
  'presentation-planning.css': 'app-presentation-planning.css',
  'presentation-accounts.css': 'app-presentation-accounts.css',
  'presentation-desktop.css': 'app-presentation-desktop.css',
  'presentation-forms.css': 'app-presentation-forms.css',
  'presentation-states.css': 'app-presentation-states.css'
};

test('presentation stylesheets use canonical filenames and old files are retired', () => {
  for (const [oldName, newName] of Object.entries(renamed)) {
    assert.equal(fs.existsSync(path.join(root, oldName)), false, `${oldName} should be retired`);
    assert.equal(fs.existsSync(path.join(root, newName)), true, `${newName} should exist`);
  }
});

test('product shell and presentation runtime point to canonical stylesheet filenames', () => {
  for (const newName of Object.values(renamed)) {
    assert.ok(productCss.includes(newName) || shell.includes(newName) || presentation.includes(newName) || sw.includes(newName), `missing canonical stylesheet reference: ${newName}`);
  }
});

test('stylesheet visual selector namespace follows the isolated selector promotion', () => {
  const sources = Object.values(renamed).map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  assert.match(sources, /\.presentation-/);
  assert.match(sources, /body\.plannke-presentation/);
  assert.match(productCss, /body:not\(\.plannke-presentation\)/);
});

test('stylesheet dependency imports use canonical filenames without changing selector content', () => {
  const accounts = fs.readFileSync(path.join(root, 'app-presentation-accounts.css'), 'utf8');
  const forms = fs.readFileSync(path.join(root, 'app-presentation-forms.css'), 'utf8');
  assert.match(accounts, /@import url\('\.\/app-presentation-forms\.css'\)/);
  assert.match(forms, /@import url\('\.\/app-presentation-states\.css'\)/);
});

test('PWA cache advances for canonical presentation stylesheet filenames', () => {
  assert.match(sw, /plannke-shell-v39/);
  Object.values(renamed).forEach(file => assert.ok(sw.includes(`'./${file}'`), `missing PWA stylesheet: ${file}`));
});

test('one-time stylesheet rename artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'promote-presentation-stylesheets-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'promote-presentation-stylesheets-once.yml')), false);
});

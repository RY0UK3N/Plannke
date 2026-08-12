const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const shell = fs.readFileSync(path.join(root, 'src', 'app', 'app-shell.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('canonical presentation runtime uses its product name instead of revamp.js', () => {
  assert.equal(fs.existsSync(path.join(root, 'revamp.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'src', 'app', 'app-presentation.js')), true);
  const presentation = read('src/app/app-presentation.js');
  assert.match(presentation, /root\.PlannkePresentation = \{/);
  assert.doesNotMatch(presentation, /PlannkeRevamp/);
});

test('shell PWA and CI load the renamed presentation runtime', () => {
  assert.match(shell, /script\.src = 'src\/app\/app-presentation\.js'/);
  assert.match(shell, /root\.PlannkePresentation/);
  assert.doesNotMatch(shell, /['"]revamp\.js['"]|PlannkeRevamp/);
  assert.match(sw, /plannke-shell-v41/);
  assert.match(sw, /'\.\/src\/app\/app-presentation\.js'/);
  assert.doesNotMatch(sw, /'\.\/revamp\.js'/);
  assert.match(pkg, /node --check src\/app\/app-presentation\.js/);
  assert.doesNotMatch(pkg, /node --check revamp\.js/);
});

test('desktop finishing runtime follows the canonical presentation API without being renamed yet', () => {
  assert.equal(fs.existsSync(path.join(root, 'src', 'app', 'app-presentation-desktop.js')), true);
  const desktop = read('src/app/app-presentation-desktop.js');
  assert.match(desktop, /PlannkePresentation/);
  assert.doesNotMatch(desktop, /PlannkeRevamp/);
  assert.match(shell, /desktopScript\.src = 'src\/app\/app-presentation-desktop\.js'/);
});

test('runtime rename leaves visual revamp selectors and CSS assets untouched', () => {
  const presentation = read('src/app/app-presentation.js');
  assert.match(presentation, /presentation-dashboard/);
  assert.match(presentation, /presentation-planning/);
  assert.equal(fs.existsSync(path.join(root, 'src', 'styles', 'app-presentation.css')), true);
  assert.equal(fs.existsSync(path.join(root, 'src', 'styles', 'app-presentation-desktop.css')), true);
  assert.match(sw, /'\.\/src\/styles\/app-presentation\.css'/);
  assert.match(sw, /'\.\/src\/styles\/app-presentation-desktop\.css'/);
});

test('one-time runtime rename artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'promote-presentation-runtime-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'promote-presentation-runtime-once.yml')), false);
});

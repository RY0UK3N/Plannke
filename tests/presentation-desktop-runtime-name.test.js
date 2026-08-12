const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const shell = fs.readFileSync(path.join(root, 'app-shell.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('desktop presentation runtime uses its canonical app name', () => {
  assert.equal(fs.existsSync(path.join(root, 'presentation-desktop.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'app-presentation-desktop.js')), true);
  const desktop = read('app-presentation-desktop.js');
  assert.match(desktop, /Plannke canonical desktop presentation layer/);
  assert.match(desktop, /root\.PlannkePresentationDesktop = \{/);
  assert.doesNotMatch(desktop, /PlannkeDesktop/);
});

test('desktop presentation extends the canonical presentation runtime without replacing it', () => {
  assert.equal(fs.existsSync(path.join(root, 'app-presentation.js')), true);
  const presentation = read('app-presentation.js');
  const desktop = read('app-presentation-desktop.js');
  assert.match(presentation, /root\.PlannkePresentation = \{/);
  assert.match(desktop, /root\.PlannkePresentation\?/);
  assert.doesNotMatch(desktop, /root\.PlannkePresentation\s*=/);
});

test('shell PWA and CI load the renamed desktop presentation runtime', () => {
  assert.match(shell, /desktopScript\.src = 'app-presentation-desktop\.js'/);
  assert.doesNotMatch(shell, /['"]presentation-desktop\.js['"]/);
  assert.match(sw, /plannke-shell-v38/);
  assert.match(sw, /'\.\/app-presentation-desktop\.js'/);
  assert.doesNotMatch(sw, /'\.\/presentation-desktop\.js'/);
  assert.match(pkg, /node --check app-presentation-desktop\.js/);
  assert.doesNotMatch(pkg, /node --check presentation-desktop\.js/);
});

test('desktop runtime rename leaves desktop CSS and revamp selectors untouched', () => {
  const desktop = read('app-presentation-desktop.js');
  assert.match(desktop, /presentation-dashboard-empty/);
  assert.match(desktop, /presentation-entity-unified/);
  assert.equal(fs.existsSync(path.join(root, 'app-presentation-desktop.css')), true);
  assert.match(sw, /'\.\/app-presentation-desktop\.css'/);
});

test('one-time desktop runtime rename artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'promote-presentation-desktop-runtime-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'promote-presentation-desktop-runtime-once.yml')), false);
});

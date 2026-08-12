const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const projection = fs.readFileSync(path.join(root, 'src', 'app', 'app-projection.js'), 'utf8');
const planning = fs.readFileSync(path.join(root, 'src', 'app', 'app-planning.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'src', 'app', 'app-navigation.js'), 'utf8');

test('projection boundary no longer depends on legacy capture or property locking', () => {
  assert.doesNotMatch(navigation, /PlannkeProjectionBase/);
  assert.doesNotMatch(planning, /PlannkeProjectionBase|legacyProjection/);
  assert.doesNotMatch(planning, /Object\.defineProperty\(root, 'renderProjection'/);
  assert.match(planning, /root\.PlannkeProjection\?\.renderProjection\?\.\(/);
  assert.match(planning, /root\.renderProjection = canonicalRenderProjection/);
});

test('projection dates stay local and rendering stays DOM-safe', () => {
  assert.doesNotMatch(projection, /toISOString\(/);
  assert.match(projection, /root\.PlannkeCore\?\.localDateString/);
  assert.match(projection, /summary\.replaceChildren\(\)/);
  assert.match(projection, /renderMode: 'richText'/);
  assert.doesNotMatch(projection, /\.innerHTML\s*=|insertAdjacentHTML\s*\(/);
});

test('one-time projection integration files are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'integrate-projection-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'integrate-projection-once.yml')), false);
});

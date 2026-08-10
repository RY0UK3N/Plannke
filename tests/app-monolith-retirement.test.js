const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'app-ui.js'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'app-runtime.js'), 'utf8');

test('app.js is permanently retired from source shell cache and CI', () => {
  assert.equal(fs.existsSync(path.join(root, 'app.js')), false);
  assert.doesNotMatch(index, /(?:src=["'])app\.js(?:["'])/);
  assert.doesNotMatch(sw, /['"]\.\/app\.js['"]/);
  assert.doesNotMatch(pkg, /node --check app\.js/);
});

test('retired monolith responsibilities remain split across canonical UI and runtime', () => {
  assert.match(ui, /root\.PlannkeUI = api/);
  assert.match(ui, /root\.showToast = showToast/);
  assert.match(ui, /root\._showDeleteConfirm = showDeleteConfirm/);
  assert.match(runtime, /root\.PlannkeRuntime = api/);
  assert.match(runtime, /root\.initApp = initApp/);
  assert.match(runtime, /root\.renderAll = renderAll/);
});

test('one-time monolith removal artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'remove-app-js-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'remove-app-js-once.yml')), false);
});

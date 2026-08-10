const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const data = fs.readFileSync(path.join(root, 'app-data.js'), 'utf8');
const actions = fs.readFileSync(path.join(root, 'app-actions.js'), 'utf8');

function dataMarkup() {
  const start = html.indexOf('<div class="content-view hidden" id="backup-view">');
  const end = html.indexOf('</main>', start);
  assert.ok(start >= 0 && end > start, 'data workspace markers must exist');
  return html.slice(start, end);
}

test('data workspace export button has explicit ID and no compatibility action', () => {
  const markup = dataMarkup();
  assert.match(markup, /id="data-export-excel"/);
  assert.doesNotMatch(markup, /data-plannke-onclick="exportToExcel\(\)"/);
});

test('app-data binds report export explicitly once', () => {
  assert.match(data, /let controlsBound = false/);
  assert.match(data, /function bindDataControls\(/);
  assert.match(data, /if \(controlsBound \|\| typeof document === 'undefined'\) return/);
  assert.match(data, /document\.getElementById\('data-export-excel'\)\?\.addEventListener\('click', exportToExcel\)/);
  assert.match(data, /bindDataControls\(\);/);
});

test('Excel export no longer occupies compatibility allowlist', () => {
  assert.doesNotMatch(actions, /'exportToExcel'/);
});

test('one-time data control binding artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'bind-data-controls-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'bind-data-controls-once.yml')), false);
});

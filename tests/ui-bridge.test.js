const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bridge = require('../ui-bridge.js');

const root = path.resolve(__dirname, '..');
const sources = ['index.html', 'app.js'].map(file => ({
  file,
  content: fs.readFileSync(path.join(root, file), 'utf8')
}));

function extractHandlers(content) {
  const handlers = [];
  const re = /\b(onclick|onchange|oninput)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = re.exec(content))) handlers.push({ attr: match[1], code: match[2] });
  return handlers;
}

test('UI bridge recognizes every legacy inline handler in the shell and renderers', () => {
  const unknown = [];
  let count = 0;
  sources.forEach(source => {
    extractHandlers(source.content).forEach(handler => {
      count++;
      if (!bridge.canHandle(handler.code)) unknown.push(`${source.file}: ${handler.attr}="${handler.code}"`);
    });
  });
  assert.ok(count > 20, 'expected to inventory the existing legacy handlers');
  assert.deepEqual(unknown, []);
});

test('UI bridge uses an allowlist and never evaluates handler source', () => {
  const source = fs.readFileSync(path.join(root, 'ui-bridge.js'), 'utf8');
  assert.doesNotMatch(source, /\beval\s*\(/);
  assert.doesNotMatch(source, /new\s+Function\s*\(/);
  assert.equal(bridge.canHandle('alert(document.cookie)'), false);
  assert.equal(bridge.canHandle('fetch("https://example.com")'), false);
  assert.equal(bridge.canHandle('dupTx("abc")'), true);
});

test('inline argument parser only accepts the migration vocabulary', () => {
  const call = bridge.parseCall("saveBudgetEntry('Mercado', this.dataset.rawValue || this.value)");
  assert.equal(call.name, 'saveBudgetEntry');
  assert.deepEqual(call.args, ["'Mercado'", 'this.dataset.rawValue || this.value']);
  assert.equal(bridge.parseCall('unknownFunction()'), null);
});

test('static shell marks product layer as present before legacy loader runs', () => {
  const bridgeSource = fs.readFileSync(path.join(root, 'ui-bridge.js'), 'utf8');
  const storageSource = fs.readFileSync(path.join(root, 'storage.js'), 'utf8');
  assert.match(bridgeSource, /currentScript\.dataset\.plannkeProduct\s*=\s*['"]static-shell['"]/);
  assert.match(storageSource, /querySelector\(['"]script\[data-plannke-product\]['"]\)/);
});

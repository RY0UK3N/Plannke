const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bridge = require('../ui-bridge.js');

const root = path.resolve(__dirname, '..');
const sources = ['index.html'].map(file => ({
  file,
  content: fs.readFileSync(path.join(root, file), 'utf8')
}));

function extractHandlers(content) {
  const handlers = [];
  const re = /\bdata-plannke-(onclick|onchange|oninput)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = re.exec(content))) handlers.push({ attr: match[1], code: match[2] });
  return handlers;
}

test('UI bridge recognizes every static compatibility action in the canonical shell', () => {
  assert.equal(fs.existsSync(path.join(root, 'app.js')), false);
  const unknown = [];
  let count = 0;
  sources.forEach(source => {
    extractHandlers(source.content).forEach(handler => {
      count++;
      if (!bridge.canHandle(handler.code)) unknown.push(`${source.file}: ${handler.attr}="${handler.code}"`);
    });
  });
  assert.ok(count > 20, 'expected to inventory the remaining compatibility actions');
  assert.deepEqual(unknown, []);
  sources.forEach(source => assert.doesNotMatch(source.content, /\s(?:onclick|onchange|oninput)=/));
});

test('UI bridge uses an allowlist and never evaluates handler source', () => {
  const source = fs.readFileSync(path.join(root, 'ui-bridge.js'), 'utf8');
  assert.doesNotMatch(source, /\beval\s*\(/);
  assert.doesNotMatch(source, /new\s+Function\s*\(/);
  assert.equal(bridge.canHandle('alert(document.cookie)'), false);
  assert.equal(bridge.canHandle('fetch("https://example.com")'), false);
  assert.equal(bridge.canHandle('dupTx("abc")'), true);
});

test('compatibility argument parser only accepts the allowlisted vocabulary', () => {
  const call = bridge.parseCall("saveBudgetEntry('Mercado', this.dataset.rawValue || this.value)");
  assert.equal(call.name, 'saveBudgetEntry');
  assert.deepEqual(call.args, ["'Mercado'", 'this.dataset.rawValue || this.value']);
  assert.equal(bridge.parseCall('unknownFunction()'), null);
});

test('static shell owns product loading and finance core has no duplicate dynamic loader', () => {
  const bridgeSource = fs.readFileSync(path.join(root, 'ui-bridge.js'), 'utf8');
  const storageSource = fs.readFileSync(path.join(root, 'storage.js'), 'utf8');
  assert.match(bridgeSource, /currentScript\.dataset\.plannkeProduct\s*=\s*['"]static-shell['"]/);
  assert.doesNotMatch(storageSource, /script\[data-plannke-product\]/);
  assert.doesNotMatch(storageSource, /load\(['"]product-core\.js['"]\)/);
  assert.doesNotMatch(storageSource, /document\.addEventListener\(['"]DOMContentLoaded['"]/);
});

test('UI bridge no longer scans or observes the DOM for executable attributes', () => {
  const source = fs.readFileSync(path.join(root, 'ui-bridge.js'), 'utf8');
  assert.doesNotMatch(source, /EVENT_ATTRS|migrateElement|new MutationObserver/);
  assert.doesNotMatch(source, /querySelectorAll\?\.\('\[onclick\],\[onchange\],\[oninput\]'\)/);
  assert.match(source, /document\.addEventListener\('click'/);
  assert.match(source, /document\.addEventListener\('change'/);
  assert.match(source, /document\.addEventListener\('input'/);
});

test('one-time inline handler migration retirement artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-inline-handler-migration-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-inline-handler-migration-once.yml')), false);
});

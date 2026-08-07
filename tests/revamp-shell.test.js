const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'revamp.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'revamp.css'), 'utf8');

test('revamp shell stays DOM-safe and does not evaluate dynamic code', () => {
  assert.doesNotMatch(js, /\.innerHTML\s*=/);
  assert.doesNotMatch(js, /\.outerHTML\s*=/);
  assert.doesNotMatch(js, /insertAdjacentHTML\s*\(/);
  assert.doesNotMatch(js, /\beval\s*\(/);
  assert.doesNotMatch(js, /new\s+Function\s*\(/);
});

test('revamp navigation covers the existing product views', () => {
  ['dashboard', 'movimentacao', 'projecao', 'accounts', 'backup'].forEach(target => {
    assert.match(js, new RegExp(`${target}:\\s*\\{`));
  });
  assert.match(js, /findLegacyNavigation/);
  assert.match(js, /link\.click\(\)/);
});

test('desktop and tablet are first-class while mobile keeps the legacy shell', () => {
  assert.match(css, /@media \(min-width: 768px\)/);
  assert.match(css, /@media \(min-width: 1180px\)/);
  assert.match(css, /@media \(min-width: 768px\) and \(max-width: 1179\.98px\)/);
  assert.match(css, /@media \(max-width: 767\.98px\)/);
  assert.match(css, /--rv-sidebar-tablet: 82px/);
  assert.match(css, /\.revamp-sidebar/);
  assert.match(css, /\.revamp-topbar/);
  assert.match(css, /\.plannke-revamp > \.planner-nav/);
});

test('new shell preserves accessibility hooks for navigation and actions', () => {
  assert.match(js, /aria-label/);
  assert.match(js, /aria-current/);
  assert.match(css, /:focus-visible/);
});

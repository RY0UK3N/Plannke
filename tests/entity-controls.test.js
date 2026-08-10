const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const entities = fs.readFileSync(path.join(root, 'app-entities.js'), 'utf8');
const actions = fs.readFileSync(path.join(root, 'app-actions.js'), 'utf8');

function accountsMarkup() {
  const start = html.indexOf('<div class="content-view hidden" id="accounts-view">');
  const end = html.indexOf('<div class="content-view hidden" id="backup-view">', start);
  assert.ok(start >= 0 && end > start, 'accounts workspace markers must exist');
  return html.slice(start, end);
}

test('accounts workspace creation controls have explicit IDs and no compatibility actions', () => {
  const markup = accountsMarkup();
  assert.match(markup, /id="accounts-add-account"/);
  assert.match(markup, /id="accounts-add-card"/);
  assert.doesNotMatch(markup, /data-plannke-onclick="openModal/);
});

test('entity detail period selector no longer stores executable compatibility code', () => {
  assert.match(html, /id="detail-period-select"/);
  assert.doesNotMatch(html, /data-plannke-onchange="window\._detailContext/);
});

test('app-entities binds static entity controls exactly once', () => {
  assert.match(entities, /let controlsBound = false/);
  assert.match(entities, /function bindEntityControls\(/);
  assert.match(entities, /if \(controlsBound \|\| typeof document === 'undefined'\) return/);
  assert.match(entities, /byId\('accounts-add-account'\)\?\.addEventListener\('click', \(\) => root\.bootstrap\?\.Modal\?\.getOrCreateInstance\(byId\('accountModal'\)\)\?\.show\(\)\)/);
  assert.match(entities, /byId\('accounts-add-card'\)\?\.addEventListener\('click', \(\) => root\.bootstrap\?\.Modal\?\.getOrCreateInstance\(byId\('cardModal'\)\)\?\.show\(\)\)/);
  assert.match(entities, /byId\('detail-period-select'\)\?\.addEventListener\('change', event => root\._detailContext\?\.onPeriodChange\?\.\(event\.target\.value\)\)/);
  assert.match(entities, /bindEntityControls\(\);/);
});

test('generic modal and detail-period compatibility routes are retired', () => {
  assert.doesNotMatch(actions, /'openModal'/);
  assert.doesNotMatch(actions, /detail-period/);
  assert.doesNotMatch(actions, /_detailContext\?\.onPeriodChange/);
});

test('one-time entity control binding artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'bind-entity-controls-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'bind-entity-controls-once.yml')), false);
});

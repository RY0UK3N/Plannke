const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const runtime = fs.readFileSync(path.join(root, 'app-runtime.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'app-ui.js'), 'utf8');
const projection = fs.readFileSync(path.join(root, 'app-projection.js'), 'utf8');
const planning = fs.readFileSync(path.join(root, 'app-planning.js'), 'utf8');

test('projection implementation is physically retired from the old app monolith', () => {
  assert.equal(fs.existsSync(path.join(root, 'app.js')), false);
  assert.doesNotMatch(runtime, /_projectionChart|projectionChart|projection-summary-list/);
  assert.doesNotMatch(ui, /_projectionChart|projectionChart|projection-summary-list/);
  assert.match(projection, /function buildProjectionModel\(/);
  assert.match(projection, /function renderProjection\(data, options = \{\}\)/);
  assert.match(projection, /function renderSummary\(/);
  assert.match(planning, /root\.PlannkeProjection\?\.renderProjection\?\.\(/);
});

test('canonical runtime is limited to orchestration and shared UI stays separate', () => {
  assert.match(runtime, /function initApp\(/);
  assert.match(runtime, /function renderAll\(/);
  assert.match(runtime, /root\.renderProjection\?\.\(data\)/);
  assert.match(ui, /function setupCurrencyInput\(/);
  assert.match(ui, /function openModal\(/);
  assert.match(ui, /function showToast\(/);
  assert.doesNotMatch(runtime, /\becharts\b|\bChart\b/);
  assert.doesNotMatch(ui, /\becharts\b|\bChart\b/);
});

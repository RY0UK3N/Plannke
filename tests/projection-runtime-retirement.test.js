const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const projection = fs.readFileSync(path.join(root, 'app-projection.js'), 'utf8');
const planning = fs.readFileSync(path.join(root, 'app-planning.js'), 'utf8');

 test('projection implementation is physically retired from app.js', () => {
  assert.doesNotMatch(app, /_projectionChart|projectionChart/);
  assert.doesNotMatch(app, /function renderProjection\(/);
  assert.doesNotMatch(app, /projection-summary-list/);
  assert.match(projection, /function buildProjectionModel\(/);
  assert.match(projection, /function renderProjection\(data, options = \{\}\)/);
  assert.match(projection, /function renderSummary\(/);
  assert.match(planning, /root\.PlannkeProjection\?\.renderProjection\?\.\(/);
});

test('app.js is now limited to temporary orchestration and shared UI utilities', () => {
  assert.match(app, /function initApp\(/);
  assert.match(app, /function renderAll\(/);
  assert.match(app, /function setupCurrencyInput\(/);
  assert.match(app, /function openModal\(/);
  assert.match(app, /function showToast\(/);
  assert.doesNotMatch(app, /\becharts\b|\bChart\b/);
});

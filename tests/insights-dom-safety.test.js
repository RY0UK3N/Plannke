const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const insights = fs.readFileSync(path.join(root, 'insights.js'), 'utf8');

test('Insights render user-derived text with DOM APIs only', () => {
  assert.match(insights, /function make\(tag, className, text\)/);
  assert.match(insights, /node\.textContent = String\(text\)/);
  assert.match(insights, /section\.replaceChildren\(body\)/);
  assert.match(insights, /copy\.append\(make\('strong', '', item\.title\), make\('small', '', item\.text\)\)/);
  assert.doesNotMatch(insights, /\.innerHTML\s*=/);
  assert.doesNotMatch(insights, /\.outerHTML\s*=/);
  assert.doesNotMatch(insights, /insertAdjacentHTML\s*\(/);
  assert.doesNotMatch(insights, /\beval\s*\(|new\s+Function\s*\(/);
});

test('Insights keep financial calculations separate from DOM rendering', () => {
  assert.match(insights, /function buildInsights\(data, today = localDateString\(\)\)/);
  assert.match(insights, /return insights\.sort\(\(a, b\) => b\.priority - a\.priority\)\.slice\(0, 5\)/);
  assert.match(insights, /const insights = buildInsights\(data\)/);
});

test('one-time DOM-safe Insights migration artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'dom-safe-insights-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'dom-safe-insights-once.yml')), false);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const renderers = fs.readFileSync(path.join(root, 'src', 'app', 'safe-renderers.js'), 'utf8');
const planning = fs.readFileSync(path.join(root, 'src', 'app', 'app-planning.js'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'src', 'app', 'app-runtime.js'), 'utf8');

test('final retirement advances the shipped cache contract', () => {
  assert.match(sw, /plannke-shell-v41/);
});

test('safe rendering boundary owns financial pulse without HTML strings', () => {
  assert.match(renderers, /function renderFinancialPulse\(/);
  assert.match(renderers, /PlannkeCore/);
  assert.match(renderers, /getFinancialPulse/);
  assert.match(renderers, /section\.replaceChildren\(heading, grid, insight\)/);
  assert.match(renderers, /renderFinancialPulse\(data\)/);
  assert.doesNotMatch(renderers, /\.innerHTML\s*=/);
});

test('dashboard charts totals and budgets use completed transactions through today', () => {
  assert.match(renderers, /function completedDashboardData\(/);
  assert.match(renderers, /tx\.status !== 'planned'/);
  assert.match(renderers, /String\(tx\.date \|\| ''\) <= today/);
  assert.match(renderers, /renderChart\(completedData\)/);
  assert.match(renderers, /renderBudgets\(completedData\)/);
  assert.match(renderers, /renderComparisonChart\(data\)/);
});

test('planning owns DOM-safe onboarding and runtime invokes it after canonical init', () => {
  assert.match(planning, /function onboardingModal\(/);
  assert.match(planning, /function maybeShowOnboarding\(/);
  assert.match(planning, /onboardingComplete/);
  assert.match(planning, /planning\.recurringRules\.push/);
  assert.match(planning, /onboardingModal,/);
  assert.match(planning, /maybeShowOnboarding,/);
  assert.doesNotMatch(planning, /\.innerHTML\s*=/);
  assert.match(runtime, /root\.PlannkePlanning\?\.maybeShowOnboarding\?\.\(\)/);
});

test('one-time final product runtime retirement artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-product-runtime-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-product-runtime-once.yml')), false);
});

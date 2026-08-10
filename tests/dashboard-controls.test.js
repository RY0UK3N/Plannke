const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'app-dashboard.js'), 'utf8');
const actions = fs.readFileSync(path.join(root, 'app-actions.js'), 'utf8');

function dashboardMarkup() {
  const start = html.indexOf('<div class="content-view" id="dashboard-view">');
  const end = html.indexOf('<div class="content-view hidden" id="movimentacao-view">', start);
  assert.ok(start >= 0 && end > start, 'dashboard workspace markers must exist');
  return html.slice(start, end);
}

test('dashboard static actions have explicit IDs and no compatibility attributes', () => {
  const markup = dashboardMarkup();
  assert.match(markup, /id="dashboard-budget-manage"/);
  assert.match(markup, /id="dashboard-view-all-transactions"/);
  assert.doesNotMatch(markup, /data-plannke-onclick="openBudgetManager\(\)"/);
  assert.doesNotMatch(markup, /data-plannke-onclick="filterDashboardToTransactions/);
});

test('app-dashboard binds its static actions exactly once', () => {
  assert.match(dashboard, /let controlsBound = false/);
  assert.match(dashboard, /function bindDashboardControls\(/);
  assert.match(dashboard, /if \(controlsBound \|\| typeof document === 'undefined'\) return/);
  assert.match(dashboard, /document\.getElementById\('dashboard-budget-manage'\)\?\.addEventListener\('click', \(\) => root\.openBudgetManager\?\.\(\)\)/);
  assert.match(dashboard, /document\.getElementById\('dashboard-view-all-transactions'\)\?\.addEventListener\('click', event =>/);
  assert.match(dashboard, /root\.filterDashboardToTransactions\?\.\('all'\)/);
  assert.match(dashboard, /bindDashboardControls\(\);/);
});

test('dashboard-local actions no longer occupy compatibility allowlist', () => {
  assert.doesNotMatch(actions, /'openBudgetManager'/);
  assert.doesNotMatch(actions, /'filterDashboardToTransactions'/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'revamp.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'revamp.css'), 'utf8');
const planningCss = fs.readFileSync(path.join(root, 'revamp-planning.css'), 'utf8');
const accountsCss = fs.readFileSync(path.join(root, 'revamp-accounts.css'), 'utf8');
const formsCss = fs.readFileSync(path.join(root, 'revamp-forms.css'), 'utf8');
const statesCss = fs.readFileSync(path.join(root, 'revamp-states.css'), 'utf8');

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
  assert.match(js, /aria-selected/);
  assert.match(css, /:focus-visible/);
  assert.match(planningCss, /\.revamp-planning-tab:focus-visible/);
  assert.match(accountsCss, /:focus-visible/);
  assert.match(formsCss, /:focus-visible/);
  assert.match(statesCss, /:focus-visible/);
});

test('planning is organized into decision-oriented desktop tabs without replacing finance handlers', () => {
  ['overview', 'recurring', 'goals', 'household'].forEach(tab => {
    assert.match(js, new RegExp(`id: '${tab}'`));
  });
  assert.match(js, /Visão geral/);
  assert.match(js, /Compromissos/);
  assert.match(js, /Objetivos/);
  assert.match(js, /Casa e regras/);
  assert.match(js, /#product-recurring-form/);
  assert.match(js, /#product-goal-form/);
  assert.match(js, /#product-reserve-form/);
  assert.match(js, /#product-category-rule-form/);
  assert.match(js, /#product-member-form/);
  assert.match(js, /applyPlanningTab/);
});

test('planning summary exposes reserved, recurring income, recurring expenses and 45-day commitments', () => {
  assert.match(js, /totalReserved/);
  assert.match(js, /recurringExpense/);
  assert.match(js, /recurringIncome/);
  assert.match(js, /upcomingExpenseTotal/);
  assert.match(js, /buildFinancialCalendar/);
  assert.match(js, /Próximos 45 dias/);
});

test('planning desktop and tablet layouts remain separate from mobile', () => {
  assert.match(planningCss, /@media \(min-width: 768px\)/);
  assert.match(planningCss, /@media \(min-width: 1180px\)/);
  assert.match(planningCss, /@media \(min-width: 768px\) and \(max-width: 1179\.98px\)/);
  assert.match(planningCss, /@media \(max-width: 767\.98px\)/);
  assert.match(planningCss, /\.revamp-planning-summary/);
  assert.match(planningCss, /\.revamp-planning-tabs/);
  assert.match(planningCss, /\.product-calendar/);
});

test('page observer cannot recursively redecorate planning or accounts', () => {
  const syncPageBody = js.match(/function syncPage\(\) \{([\s\S]*?)\n    \}\n\n    function arrangeDashboardPrimary/);
  assert.ok(syncPageBody, 'syncPage function should be detectable');
  assert.doesNotMatch(syncPageBody[1], /decoratePlanning\s*\(/);
  assert.doesNotMatch(syncPageBody[1], /decorateAccounts\s*\(/);
  assert.match(js, /function addClassOnce\(/);
  assert.match(js, /function schedulePlanningDecoration\(/);
  assert.match(js, /function scheduleAccountsDecoration\(/);
  assert.match(js, /planningObserver\.observe\(planningHub, \{ childList: true \}\)/);
  assert.doesNotMatch(js, /planningObserver\.observe\(planningHub, \{[^}]*subtree:\s*true/);
});

test('accounts overview uses the existing outstanding-card calculation', () => {
  assert.match(js, /function accountSnapshot\(/);
  assert.match(js, /getOutstandingCardBalance/);
  assert.match(js, /accountBalance/);
  assert.match(js, /cardOutstanding/);
  assert.match(js, /cardAvailable/);
  assert.match(js, /afterCards/);
  assert.match(js, /Saldo nas contas/);
  assert.match(js, /Faturas pendentes/);
  assert.match(js, /Limite disponível/);
  assert.match(js, /Após cartões/);
});

test('accounts and cards have dedicated desktop/tablet presentation while mobile stays unchanged', () => {
  assert.match(accountsCss, /@media \(min-width: 768px\)/);
  assert.match(accountsCss, /@media \(min-width: 1180px\)/);
  assert.match(accountsCss, /@media \(min-width: 768px\) and \(max-width: 1179\.98px\)/);
  assert.match(accountsCss, /@media \(max-width: 767\.98px\)/);
  assert.match(accountsCss, /\.revamp-accounts-summary/);
  assert.match(accountsCss, /#accounts-grid/);
  assert.match(accountsCss, /#cards-grid/);
  assert.match(accountsCss, /\.billing-history/);
  assert.match(accountsCss, /\.pay-fatura-section/);
});

test('desktop and tablet forms share a consistent modal language without changing mobile', () => {
  assert.match(formsCss, /@media \(min-width: 768px\)/);
  assert.match(formsCss, /#transactionModal \.modal-dialog/);
  assert.match(formsCss, /#accountModal \.modal-dialog/);
  assert.match(formsCss, /#cardModal \.modal-dialog/);
  assert.match(formsCss, /#productOnboardingModal \.modal-dialog/);
  assert.match(formsCss, /\.form-control:focus/);
  assert.match(formsCss, /\.form-select:focus/);
  assert.match(formsCss, /\.tx-type-group/);
  assert.match(formsCss, /\.btn-check:checked \+ \.btn-type/);
  assert.match(formsCss, /@media \(max-width: 767\.98px\)/);
});

test('empty states and microinteractions stay restrained and honor reduced motion', () => {
  assert.match(statesCss, /#accounts-grid/);
  assert.match(statesCss, /#cards-grid/);
  assert.match(statesCss, /#all-transactions-body/);
  assert.match(statesCss, /#toast-container/);
  assert.match(statesCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(statesCss, /transition-duration: 0\.01ms/);
  assert.match(statesCss, /@media \(max-width: 767\.98px\)/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'revamp.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'revamp.css'), 'utf8');
const desktopCss = fs.readFileSync(path.join(root, 'revamp-desktop.css'), 'utf8');
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

test('presentation navigation covers product views through the canonical navigation boundary', () => {
  ['dashboard', 'movimentacao', 'projecao', 'accounts', 'backup'].forEach(target => {
    assert.match(js, new RegExp(`${target}:\\s*\\{`));
  });
  assert.match(js, /function navigate\(target\)[\s\S]*root\._navigateTo\(target\)/);
  assert.doesNotMatch(js, /findLegacyNavigation/);
  assert.doesNotMatch(js, /planner-pill-nav/);
  assert.doesNotMatch(js, /link\.click\(\)/);
});

test('final product direction is desktop-only while retaining the responsive base as fallback code', () => {
  assert.match(css, /\.revamp-sidebar/);
  assert.match(css, /\.revamp-topbar/);
  assert.match(desktopCss, /body\.plannke-revamp/);
  assert.match(desktopCss, /min-width: 1080px/);
  assert.match(desktopCss, /grid-template-columns: 236px minmax\(0, 1fr\)/);
  assert.match(desktopCss, /mobile-tab-bar/);
  assert.match(desktopCss, /display: none !important/);
  assert.match(desktopCss, /revamp-brand-copy/);
  assert.match(desktopCss, /revamp-nav-label/);
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

test('planning retains the dedicated large-screen composition used by the desktop shell', () => {
  assert.match(planningCss, /\.revamp-planning-summary/);
  assert.match(planningCss, /\.revamp-planning-tabs/);
  assert.match(planningCss, /\.product-calendar/);
  assert.match(desktopCss, /#revamp-shell/);
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

test('accounts and cards keep their dedicated workspace and share the final two-column desktop grid', () => {
  assert.match(accountsCss, /\.revamp-accounts-summary/);
  assert.match(accountsCss, /#accounts-grid/);
  assert.match(accountsCss, /#cards-grid/);
  assert.match(accountsCss, /\.billing-history/);
  assert.match(accountsCss, /\.pay-fatura-section/);
  assert.match(desktopCss, /revamp-accounts #accounts-grid,[\s\S]*revamp-accounts #cards-grid/);
  assert.match(desktopCss, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(desktopCss, /revamp-entity-unified/);
});

test('forms use the consistent base language plus final compact desktop workspace sizing', () => {
  assert.match(formsCss, /#transactionModal \.modal-dialog/);
  assert.match(formsCss, /#accountModal \.modal-dialog/);
  assert.match(formsCss, /#cardModal \.modal-dialog/);
  assert.match(formsCss, /\.form-control:focus/);
  assert.match(formsCss, /\.form-select:focus/);
  assert.match(formsCss, /\.tx-type-group/);
  assert.match(desktopCss, /#transactionModal \.modal-dialog/);
  assert.match(desktopCss, /max-width: 980px/);
  assert.match(desktopCss, /#tx-fields-wrapper:not\(\.hidden\)/);
  assert.match(desktopCss, /grid-auto-flow: row dense/);
  assert.match(desktopCss, /#accountForm/);
  assert.match(desktopCss, /#cardForm/);
});

test('empty states and microinteractions stay restrained and honor reduced motion', () => {
  assert.match(statesCss, /#accounts-grid/);
  assert.match(statesCss, /#cards-grid/);
  assert.match(statesCss, /#all-transactions-body/);
  assert.match(statesCss, /#toast-container/);
  assert.match(statesCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(statesCss, /transition-duration: 0\.01ms/);
});

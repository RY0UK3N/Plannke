const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'app-presentation-desktop.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'app-presentation-desktop.css'), 'utf8');
const statesCss = fs.readFileSync(path.join(root, 'app-presentation-states.css'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'app-shell.js'), 'utf8');

test('final shell explicitly targets desktop app windows', () => {
  assert.match(css, /body\.plannke-presentation\s*\{[\s\S]*min-width: 1080px/);
  assert.match(css, /#presentation-shell[\s\S]*grid-template-columns: 236px minmax\(0, 1fr\)/);
  assert.match(css, /mobile-tab-bar/);
  assert.match(css, /display: none !important/);
  assert.match(js, /dataset\.plannkeTarget = 'desktop'/);
});

test('desktop finishing assets load only after the base revamp is ready', () => {
  assert.match(shell, /function loadDesktopAssets\(/);
  assert.match(shell, /script\.addEventListener\('load', loadDesktopAssets/);
  assert.match(shell, /desktopStyle\.href = 'app-presentation-desktop\.css'/);
  assert.match(shell, /desktopScript\.src = 'app-presentation-desktop\.js'/);
});

test('desktop shell removes legacy mobile footer spacing and keeps brand copy stacked', () => {
  assert.match(statesCss, /html body\.plannke-presentation\s*\{[\s\S]*padding-bottom: 0 !important/);
  assert.match(statesCss, /\.presentation-content > main\.container-xl[\s\S]*padding-bottom: 28px !important/);
  assert.match(statesCss, /\.presentation-brand-copy strong,[\s\S]*\.presentation-brand-copy span[\s\S]*display: block !important/);
  assert.match(statesCss, /\.presentation-brand-copy span[\s\S]*white-space: nowrap/);
});

test('dashboard has dedicated non-colliding empty states', () => {
  assert.match(js, /function decorateDashboardEmptyStates\(/);
  assert.match(js, /Nenhuma transação registrada/);
  assert.match(js, /Nenhuma conta futura/);
  assert.match(css, /\.presentation-dashboard-empty\s*\{/);
  assert.match(css, /justify-content: center/);
  assert.match(css, /\.presentation-dashboard-activity \.tx-item-desc/);
  assert.match(css, /text-overflow: ellipsis/);
});

test('accounts and cards use the same desktop card system', () => {
  assert.match(js, /presentation-entity-unified/);
  assert.match(js, /presentation-account-card/);
  assert.match(js, /presentation-credit-card/);
  assert.match(js, /presentation-account-meta/);
  assert.match(css, /#accounts-grid,[\s\S]*#cards-grid[\s\S]*grid-template-columns: repeat\(2/);
  assert.match(css, /\.presentation-entity-unified[\s\S]*min-height: 360px/);
  assert.match(css, /\.presentation-credit-card::before/);
});

test('data page treats Excel as a report and bank files as reviewed imports', () => {
  assert.match(js, /Salvamento automático ativo/);
  assert.match(js, /Dados e relatórios/);
  assert.match(js, /Exportar relatório Excel/);
  assert.match(js, /planilha é somente um relatório externo/i);
  assert.match(js, /importLabel\.hidden = true/);
  assert.match(js, /function captureBankImport\(/);
  assert.match(js, /event\.stopImmediatePropagation\(\)/);
  assert.match(js, /function stageBankFile\(/);
  assert.match(js, /function renderBankImportReview\(/);
  assert.match(js, /Revisar movimentações/);
  assert.match(js, /Confirmar selecionadas/);
  assert.match(js, /merchantRuleKey/);
  assert.match(js, /windows-1252/);
  assert.match(js, /'utf-8'/);
  assert.match(css, /presentation-import-review/);
  assert.match(css, /presentation-import-table/);
});

test('transaction form is compact and uses the desktop grid without normal scrolling', () => {
  assert.match(css, /#transactionModal \.modal-dialog[\s\S]*max-width: 980px/);
  assert.match(css, /#tx-fields-wrapper:not\(\.hidden\)[\s\S]*repeat\(12/);
  assert.match(css, /tx-type-group > \.btn-type[\s\S]*min-height: 46px/);
  assert.match(css, /product-tx-extra,[\s\S]*display: contents/);
  assert.match(css, /button\[type="submit"\][\s\S]*grid-column: 10 \/ -1/);
  assert.match(js, /Registre a movimentação sem sair do contexto atual/);
});

test('statement and invoice modal are serious desktop review workspaces', () => {
  assert.match(css, /#entityDetailModal \.modal-dialog[\s\S]*max-width: 1180px/);
  assert.match(css, /#detail-tx-list \.tx-item/);
  assert.match(css, /#detail-footer-pay/);
  assert.match(css, /position: sticky/);
  assert.match(css, /#detail-pay-acc-select/);
  assert.match(js, /Área de revisão/);
  assert.match(js, /Fatura do cartão/);
  assert.match(js, /Extrato da conta/);
  assert.match(js, /Movimentações do período/);
});

test('planning has a navigation and visible-workspace repair path', () => {
  assert.match(js, /function ensurePlanningNavigation\(/);
  assert.match(js, /function repairPlanningWorkspace\(/);
  assert.match(js, /desktop-planning-repair/);
  assert.match(js, /planningObserver\.observe\(planning, \{ attributes: true, attributeFilter: \['class'\], childList: true \}\)/);
  assert.match(js, /applyPlanningTab/);
  assert.match(css, /#projecao-view:not\(\.hidden\) > #presentation-planning-overview/);
});

test('desktop finishing layer remains DOM-safe', () => {
  assert.doesNotMatch(js, /\.innerHTML\s*=/);
  assert.doesNotMatch(js, /\.outerHTML\s*=/);
  assert.doesNotMatch(js, /insertAdjacentHTML\s*\(/);
  assert.doesNotMatch(js, /\beval\s*\(/);
  assert.doesNotMatch(js, /new\s+Function\s*\(/);
});

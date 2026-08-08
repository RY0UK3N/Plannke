const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'revamp-desktop.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'revamp-desktop.css'), 'utf8');

test('final shell explicitly targets desktop app windows', () => {
  assert.match(css, /body\.plannke-revamp\s*\{[\s\S]*min-width: 1080px/);
  assert.match(css, /#revamp-shell[\s\S]*grid-template-columns: 236px minmax\(0, 1fr\)/);
  assert.match(css, /mobile-tab-bar/);
  assert.match(css, /display: none !important/);
  assert.match(js, /dataset\.plannkeTarget = 'desktop'/);
});

test('dashboard prevents text and value collisions', () => {
  assert.match(css, /product-insight-row strong/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /revamp-dashboard-accounts \.qa-item/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(css, /revamp-dashboard-activity \.tx-item-desc/);
  assert.match(css, /text-overflow: ellipsis/);
  assert.match(css, /upcoming-item/);
});

test('backup is presented as autosave plus portable export/import', () => {
  assert.match(js, /Salvamento automático ativo/);
  assert.match(js, /Backup e portabilidade/);
  assert.match(js, /Exportar Excel/);
  assert.match(js, /Importar Excel/);
  assert.match(js, /Excel não é mais o armazenamento principal/);
  assert.match(css, /revamp-backup-status/);
  assert.match(css, /revamp-backup-grid/);
  assert.match(css, /revamp-bank-import-panel/);
});

test('desktop forms use wider structured layouts', () => {
  assert.match(css, /#transactionModal \.modal-dialog[\s\S]*max-width: 900px/);
  assert.match(css, /#tx-fields-wrapper:not\(\.hidden\)[\s\S]*repeat\(12/);
  assert.match(css, /#accountForm/);
  assert.match(css, /#cardForm/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(js, /Registre uma entrada, gasto ou transferência/);
  assert.match(js, /Configure limite, fechamento e vencimento/);
});

test('statement and invoice modal are desktop review workspaces', () => {
  assert.match(css, /#entityDetailModal \.modal-dialog[\s\S]*max-width: 1080px/);
  assert.match(css, /#detail-tx-list \.tx-item/);
  assert.match(css, /#detail-footer-pay/);
  assert.match(css, /position: sticky/);
  assert.match(css, /#detail-pay-acc-select/);
  assert.match(js, /revamp-detail-modal/);
});

test('desktop finishing layer remains DOM-safe', () => {
  assert.doesNotMatch(js, /\.innerHTML\s*=/);
  assert.doesNotMatch(js, /\.outerHTML\s*=/);
  assert.doesNotMatch(js, /insertAdjacentHTML\s*\(/);
  assert.doesNotMatch(js, /\beval\s*\(/);
  assert.doesNotMatch(js, /new\s+Function\s*\(/);
});

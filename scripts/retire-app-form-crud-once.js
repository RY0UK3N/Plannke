const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'app.js');
const testPath = path.join(root, 'tests', 'legacy-runtime-retirement.test.js');
const workflowPath = path.join(root, '.github', 'workflows', 'retire-app-form-crud-once.yml');
const selfPath = __filename;

let app = fs.readFileSync(appPath, 'utf8');

function removeRange(startMarker, endMarker, label) {
  const start = app.indexOf(startMarker);
  const end = app.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(`Could not locate ${label}`);
  if (app.indexOf(startMarker, start + startMarker.length) >= 0) throw new Error(`Multiple ${label} start markers found`);
  app = app.slice(0, start) + app.slice(end);
}

removeRange(
  '/* ============================================================\n   QUICK ADD (atalhos rápidos no dashboard)\n   ============================================================ */',
  '/* ============================================================\n   MODAL SYSTEM\n   ============================================================ */',
  'legacy quick add and transaction modal opener'
);

removeRange(
  'function setupModalEvents() {',
  'function _populateAccountDropdowns() {',
  'legacy modal event bindings'
);

removeRange(
  'function _populateAccountDropdowns() {',
  '/* ============================================================\n   CATEGORIAS — Sistema customizável (persiste em data.settings)\n   ============================================================ */',
  'legacy transaction entity dropdowns'
);

removeRange(
  '/* ============================================================\n   TRANSACTION FORM LOGIC\n   ============================================================ */',
  '/* ============================================================\n   FEEDBACK\n   ============================================================ */',
  'legacy transaction form display logic'
);

removeRange(
  '/* ============================================================\n   FORMS\n   ============================================================ */',
  '/* ============================================================\n   CRUD WRAPPERS\n   ============================================================ */',
  'legacy form submit bindings'
);

removeRange(
  'function edAcc(id) {',
  '/* ── Rich delete confirmation ── */',
  'legacy entity edit and transaction duplicate wrappers'
);

removeRange(
  'function edTx(id) {',
  '/* ============================================================\n   RENDER ALL\n   ============================================================ */',
  'legacy transaction/entity CRUD wrappers'
);

[
  'function setupQuickAdd(',
  'function openTxModal(',
  'function setupModalEvents(',
  'function _populateAccountDropdowns(',
  'function toggleInstallmentField(',
  'function updateInstallmentHelper(',
  'function setupForms(',
  'function edAcc(',
  'function edCard(',
  'function dupTx(',
  'function edTx(',
  'function delTx(',
  'function delAcc(',
  'function delCard('
].forEach(marker => {
  if (app.includes(marker)) throw new Error(`Retired app marker survived: ${marker}`);
});

if (!app.includes('function _showDeleteConfirm(')) throw new Error('_showDeleteConfirm must remain as shared modal utility');
if (!app.includes('function openModal(') || !app.includes('function closeModal(')) throw new Error('Generic modal utilities must remain');
if (!app.includes('function getCurrencyValue(') || !app.includes('function setCurrencyValue(')) throw new Error('Currency utilities must remain');
fs.writeFileSync(appPath, app);

let test = fs.readFileSync(testPath, 'utf8');
const transactionDecl = "const entities = fs.readFileSync(path.join(root, 'app-entities.js'), 'utf8');";
if (!test.includes("const transactions = fs.readFileSync(path.join(root, 'app-transactions.js'), 'utf8');")) {
  if (!test.includes(transactionDecl)) throw new Error('Canonical entity declaration marker not found');
  test = test.replace(transactionDecl, `${transactionDecl}\nconst transactions = fs.readFileSync(path.join(root, 'app-transactions.js'), 'utf8');`);
}

const ownershipTest = `\ntest('app monolith no longer owns transaction/entity forms or CRUD actions', () => {\n  [\n    'setupQuickAdd', 'openTxModal', 'setupModalEvents', '_populateAccountDropdowns',\n    'toggleInstallmentField', 'updateInstallmentHelper', 'setupForms',\n    'edAcc', 'edCard', 'dupTx', 'edTx', 'delTx', 'delAcc', 'delCard'\n  ].forEach(name => assert.doesNotMatch(app, new RegExp('function\\\\s+' + name.replace('_', '\\\\_') + '\\\\s*\\\\(')));\n\n  ['openTxModal', 'setupModalEvents', 'toggleInstallmentField', 'updateInstallmentHelper', 'setupForms', 'dupTx', 'edTx', 'delTx']\n    .forEach(name => assert.match(transactions, new RegExp('function\\\\s+' + name + '\\\\s*\\\\(')));\n  ['setupModalEvents', 'setupForms', 'edAcc', 'edCard', 'delAcc', 'delCard']\n    .forEach(name => assert.match(entities, new RegExp('function\\\\s+' + name + '\\\\s*\\\\(')));\n\n  assert.match(app, /function _showDeleteConfirm\\(/);\n  assert.match(app, /function openModal\\(/);\n  assert.match(app, /function closeModal\\(/);\n});\n`;
if (!test.includes("test('app monolith no longer owns transaction/entity forms or CRUD actions'")) {
  test = `${test.trimEnd()}\n${ownershipTest}`;
}

const artifactNeedle = "  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-entity-details-once.yml')), false);";
if (test.includes(artifactNeedle) && !test.includes('retire-app-form-crud-once.js')) {
  test = test.replace(artifactNeedle, `${artifactNeedle}\n  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-app-form-crud-once.js')), false);\n  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-app-form-crud-once.yml')), false);`);
}
fs.writeFileSync(testPath, test);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

console.log('Retired legacy app transaction/entity form and CRUD runtime.');

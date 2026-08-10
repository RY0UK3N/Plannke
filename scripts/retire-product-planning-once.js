const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const productPath = path.join(root, 'product.js');
const productUiTestPath = path.join(root, 'tests', 'product-ui-logic.test.js');
const retirementTestPath = path.join(root, 'tests', 'legacy-runtime-retirement.test.js');
const workflowPath = path.join(root, '.github', 'workflows', 'retire-product-planning-once.yml');
const selfPath = __filename;

let source = fs.readFileSync(productPath, 'utf8');

function removeBetween(startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`Could not locate ${label} markers`);
  }
  if (source.indexOf(startMarker, start + startMarker.length) >= 0) {
    throw new Error(`Multiple ${label} start markers found`);
  }
  source = source.slice(0, start) + source.slice(end);
}

removeBetween(
  '        const originalProjection = globalThis.renderProjection;',
  '        const originalTransactions = globalThis.renderTransactions;',
  'legacy projection wrapper'
);

removeBetween(
  '    function householdBalances(data) {',
  '    function injectBankImport() {',
  'legacy planning UI'
);

const oldExport = '    globalThis.PlannkeProduct={init,searchTransactions,householdBalances};';
const newExport = '    globalThis.PlannkeProduct={init,searchTransactions};';
if (!source.includes(oldExport)) throw new Error('Legacy PlannkeProduct export marker not found');
source = source.replace(oldExport, newExport);

[
  'const originalProjection = globalThis.renderProjection',
  'function householdBalances(data)',
  'function renderPlanningHub(data)',
  'function attachPlanningEvents(hub)'
].forEach(marker => {
  if (source.includes(marker)) throw new Error(`Legacy planning marker survived: ${marker}`);
});

fs.writeFileSync(productPath, source);

let productUiTests = fs.readFileSync(productUiTestPath, 'utf8');
const obsoleteHouseholdTest = "\ntest('household balance shows who should receive after equal split', () => {";
const obsoleteAt = productUiTests.indexOf(obsoleteHouseholdTest);
if (obsoleteAt < 0) throw new Error('Obsolete PlannkeProduct household test marker not found');
productUiTests = `${productUiTests.slice(0, obsoleteAt).trimEnd()}\n`;
fs.writeFileSync(productUiTestPath, productUiTests);

const retirementTest = `const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const product = fs.readFileSync(path.join(root, 'product.js'), 'utf8');
const planning = fs.readFileSync(path.join(root, 'app-planning.js'), 'utf8');
const productUiLogic = fs.readFileSync(path.join(root, 'tests', 'product-ui-logic.test.js'), 'utf8');

test('product layer no longer owns the planning projection runtime', () => {
  assert.doesNotMatch(product, /const originalProjection = globalThis\\.renderProjection/);
  assert.doesNotMatch(product, /function renderPlanningHub\\(/);
  assert.doesNotMatch(product, /function attachPlanningEvents\\(/);
  assert.doesNotMatch(product, /function householdBalances\\(/);
  assert.match(planning, /function canonicalRenderProjection\\(/);
  assert.match(planning, /function renderPlanningHub\\(/);
});

test('product public surface no longer exports the retired household planning helper', () => {
  assert.match(product, /globalThis\\.PlannkeProduct=\\{init,searchTransactions\\};/);
  assert.doesNotMatch(product, /PlannkeProduct=\\{[^}]*householdBalances/);
  assert.doesNotMatch(productUiLogic, /PlannkeProduct\\.householdBalances/);
  assert.match(planning, /householdBalances,/);
});
`;
fs.writeFileSync(retirementTestPath, retirementTest);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

console.log('Retired legacy planning runtime from product.js and removed one-time migration files.');

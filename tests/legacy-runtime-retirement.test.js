const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const product = fs.readFileSync(path.join(root, 'product.js'), 'utf8');
const planning = fs.readFileSync(path.join(root, 'app-planning.js'), 'utf8');
const productUiLogic = fs.readFileSync(path.join(root, 'tests', 'product-ui-logic.test.js'), 'utf8');

test('product layer no longer owns the planning projection runtime', () => {
  assert.doesNotMatch(product, /const originalProjection = globalThis\.renderProjection/);
  assert.doesNotMatch(product, /function renderPlanningHub\(/);
  assert.doesNotMatch(product, /function attachPlanningEvents\(/);
  assert.doesNotMatch(product, /function householdBalances\(/);
  assert.match(planning, /function canonicalRenderProjection\(/);
  assert.match(planning, /function renderPlanningHub\(/);
});

test('product public surface no longer exports the retired household planning helper', () => {
  assert.match(product, /globalThis\.PlannkeProduct=\{init,searchTransactions\};/);
  assert.doesNotMatch(product, /PlannkeProduct=\{[^}]*householdBalances/);
  assert.doesNotMatch(productUiLogic, /PlannkeProduct\.householdBalances/);
  assert.match(planning, /householdBalances,/);
});

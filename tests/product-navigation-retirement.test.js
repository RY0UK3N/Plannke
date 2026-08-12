const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const product = fs.readFileSync(path.join(root, 'product.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'app-navigation.js'), 'utf8');
const presentation = fs.readFileSync(path.join(root, 'app-presentation.js'), 'utf8');

test('product layer no longer reaches retired pill navigation markup', () => {
  assert.doesNotMatch(product, /function simplifyNavigation\(/);
  assert.doesNotMatch(product, /planner-pill-nav/);
  assert.doesNotMatch(product, /simplifyNavigation\(\)/);
  assert.doesNotMatch(product, /const names = \{ dashboard: 'Início'/);
});

test('canonical navigation remains the only product workspace navigation boundary', () => {
  assert.match(navigation, /function navigateTo\(target\)/);
  assert.match(navigation, /root\._navigateTo = navigateTo/);
  assert.match(presentation, /root\._navigateTo\(target\)/);
  assert.doesNotMatch(presentation, /planner-pill-nav/);
});

test('product initialization keeps only active product enhancements without navigation or boot mutation', () => {
  assert.match(product, /patchRenderers\(\);maybeShowOnboarding\(\);/);
  assert.doesNotMatch(product, /installLedgerHooks\(\)|injectTransactionFields\(\)/);
  assert.doesNotMatch(product, /injectAssets\(\)|improveWelcome\(\)/);
});

test('one-time product navigation retirement artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-product-nav-fallback-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-product-nav-fallback-once.yml')), false);
});

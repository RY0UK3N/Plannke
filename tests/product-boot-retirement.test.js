const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const boot = fs.readFileSync(path.join(root, 'app-boot.js'), 'utf8');
const product = fs.readFileSync(path.join(root, 'product.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('canonical boot owns optional insights and PWA registration', () => {
  assert.match(boot, /function loadProductEnhancements\(/);
  assert.match(boot, /script\.src = 'insights\.js'/);
  assert.match(boot, /serviceWorker\.register\('.\/sw\.js'\)/);
  assert.match(boot, /loadProductEnhancements,\n        startApplication/);
});

test('product compatibility layer no longer bootstraps assets or PWA', () => {
  assert.doesNotMatch(product, /function injectAssets\(/);
  assert.doesNotMatch(product, /serviceWorker\.register|manifest\.webmanifest|script\.src = 'insights\.js'/);
  assert.match(index, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(index, /<link rel="stylesheet" href="product\.css">/);
});

test('retired welcome modal fallback stays out of product runtime', () => {
  assert.doesNotMatch(product, /function improveWelcome\(/);
  assert.doesNotMatch(product, /product-import-option|welcome-options|welcome-tagline/);
  assert.doesNotMatch(product, /document\.getElementById\('welcomeModal'\)[\s\S]*product-bank-file/);
});

test('product runtime cannot reclaim canonical boot ownership', () => {
  assert.doesNotMatch(product, /loadProductEnhancements|data-plannke-insights/);
  assert.doesNotMatch(product, /navigator\.serviceWorker|document\.head\.appendChild/);
});

test('one-time product boot migration artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'promote-product-boot-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'promote-product-boot-once.yml')), false);
});

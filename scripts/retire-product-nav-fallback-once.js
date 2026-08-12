const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const productPath = path.join(root, 'product.js');
let product = fs.readFileSync(productPath, 'utf8');

const functionBlock = `    function simplifyNavigation() {\n        const names = { dashboard: 'Início', movimentacao: 'Movimentações', projecao: 'Planejamento', accounts: 'Contas', backup: 'Backup' };\n        document.querySelectorAll('.planner-pill-nav [data-target]').forEach(link => { if (names[link.dataset.target]) link.textContent = names[link.dataset.target]; });\n    }\n\n`;
const oldInit = 'if(initialized)return;initialized=true;injectAssets();installLedgerHooks();simplifyNavigation();injectTransactionFields();patchRenderers();injectBankImport();improveWelcome();maybeShowOnboarding();';
const newInit = 'if(initialized)return;initialized=true;injectAssets();installLedgerHooks();injectTransactionFields();patchRenderers();injectBankImport();improveWelcome();maybeShowOnboarding();';

if ((product.split(functionBlock).length - 1) !== 1) throw new Error('expected exactly one simplifyNavigation function');
if ((product.split(oldInit).length - 1) !== 1) throw new Error('expected exactly one simplifyNavigation init call');

product = product.replace(functionBlock, '').replace(oldInit, newInit);
if (/simplifyNavigation|planner-pill-nav/.test(product)) throw new Error('retired navigation fallback still present in product.js');
fs.writeFileSync(productPath, product);

const testSource = `const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const product = fs.readFileSync(path.join(root, 'product.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'app-navigation.js'), 'utf8');
const presentation = fs.readFileSync(path.join(root, 'app-presentation.js'), 'utf8');

test('product layer no longer reaches retired pill navigation markup', () => {
  assert.doesNotMatch(product, /function simplifyNavigation\\(/);
  assert.doesNotMatch(product, /planner-pill-nav/);
  assert.doesNotMatch(product, /simplifyNavigation\\(\\)/);
});

test('canonical navigation remains the only product workspace navigation boundary', () => {
  assert.match(navigation, /function navigateTo\\(target\\)/);
  assert.match(navigation, /root\\._navigateTo = navigateTo/);
  assert.match(presentation, /root\\._navigateTo\\(target\\)/);
  assert.doesNotMatch(presentation, /planner-pill-nav/);
});

test('product initialization keeps active enhancements without navigation mutation', () => {
  assert.match(product, /injectAssets\\(\\);installLedgerHooks\\(\\);injectTransactionFields\\(\\);patchRenderers\\(\\);injectBankImport\\(\\);improveWelcome\\(\\);maybeShowOnboarding\\(\\);/);
});

test('one-time product navigation retirement artifacts are not shipped', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-product-nav-fallback-once.js')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-product-nav-fallback-once.yml')), false);
});
`;
fs.writeFileSync(path.join(root, 'tests', 'product-navigation-retirement.test.js'), testSource);

for (const file of [
  path.join(root, 'scripts', 'retire-product-nav-fallback-once.js'),
  path.join(root, '.github', 'workflows', 'retire-product-nav-fallback-once.yml')
]) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

console.log('[product navigation] retired dead planner-pill-nav fallback');

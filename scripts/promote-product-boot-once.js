const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function write(file, content) {
  fs.writeFileSync(path.join(root, file), content);
}

function replaceOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`missing migration anchor: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`duplicate migration anchor: ${label}`);
  return source.slice(0, first) + to + source.slice(first + from.length);
}

let boot = read('app-boot.js');
const bootAnchor = "    const applicationInit = root?.initApp;\n";
const enhancementRuntime = `    function loadProductEnhancements() {\n        if (!root || typeof document === 'undefined') return;\n        if (!document.querySelector('script[data-plannke-insights]')) {\n            const script = document.createElement('script');\n            script.src = 'insights.js';\n            script.async = false;\n            script.dataset.plannkeInsights = 'true';\n            document.body.appendChild(script);\n        }\n        if ('serviceWorker' in root.navigator && root.location?.protocol !== 'file:') {\n            root.navigator.serviceWorker.register('./sw.js').catch(error => console.warn('PWA indisponível:', error));\n        }\n    }\n\n`;
boot = replaceOnce(boot, bootAnchor, enhancementRuntime + bootAnchor, 'app boot product enhancements');
boot = replaceOnce(
  boot,
  "            .then(() => applicationInit.call(root));\n",
  "            .then(() => applicationInit.call(root))\n            .then(() => { loadProductEnhancements(); });\n",
  'start application enhancement handoff'
);
boot = replaceOnce(
  boot,
  "        loadStorageUiAssets,\n        startApplication\n",
  "        loadStorageUiAssets,\n        loadProductEnhancements,\n        startApplication\n",
  'boot API export'
);
write('app-boot.js', boot);

let product = read('product.js');
const assetStart = product.indexOf('\n    function injectAssets() {');
const assetEnd = product.indexOf('\n    function memberOptions(', assetStart);
if (assetStart < 0 || assetEnd < 0) throw new Error('product asset bootstrap block not found');
product = product.slice(0, assetStart) + '\n' + product.slice(assetEnd);

const welcomeStart = product.indexOf('\n    function improveWelcome() {');
const welcomeEnd = product.indexOf('\n    function init() {', welcomeStart);
if (welcomeStart < 0 || welcomeEnd < 0) throw new Error('retired welcome fallback block not found');
product = product.slice(0, welcomeStart) + '\n' + product.slice(welcomeEnd);

product = replaceOnce(
  product,
  "        if(initialized)return;initialized=true;injectAssets();installLedgerHooks();injectTransactionFields();patchRenderers();improveWelcome();maybeShowOnboarding();try{renderAll();}catch(err){console.warn('Atualização visual do produto:',err);}\n",
  "        if(initialized)return;initialized=true;installLedgerHooks();injectTransactionFields();patchRenderers();maybeShowOnboarding();try{renderAll();}catch(err){console.warn('Atualização visual do produto:',err);}\n",
  'product init bootstrap calls'
);
write('product.js', product);

let security = read('tests/security-shell.test.js');
security = replaceOnce(
  security,
  "  assert.match(product, /script\\.src = 'insights\\.js'/);\n",
  "  assert.match(boot, /script\\.src = 'insights\\.js'/);\n  assert.match(boot, /serviceWorker\\.register\\('\.\\/sw\\.js'\\)/);\n",
  'security shell insights ownership'
);
write('tests/security-shell.test.js', security);

const regression = `const test = require('node:test');\nconst assert = require('node:assert/strict');\nconst fs = require('node:fs');\nconst path = require('node:path');\n\nconst root = path.resolve(__dirname, '..');\nconst boot = fs.readFileSync(path.join(root, 'app-boot.js'), 'utf8');\nconst product = fs.readFileSync(path.join(root, 'product.js'), 'utf8');\nconst index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');\n\ntest('canonical boot owns optional insights and PWA registration', () => {\n  assert.match(boot, /function loadProductEnhancements\\(/);\n  assert.match(boot, /script\\.src = 'insights\\.js'/);\n  assert.match(boot, /serviceWorker\\.register\\('\.\\/sw\\.js'\\)/);\n  assert.match(boot, /loadProductEnhancements,\\n        startApplication/);\n});\n\ntest('product compatibility layer no longer bootstraps assets or PWA', () => {\n  assert.doesNotMatch(product, /function injectAssets\\(/);\n  assert.doesNotMatch(product, /serviceWorker\\.register|manifest\\.webmanifest|script\\.src = 'insights\\.js'/);\n  assert.match(index, /<link rel=\"manifest\" href=\"manifest\\.webmanifest\">/);\n  assert.match(index, /<link rel=\"stylesheet\" href=\"product\\.css\">/);\n});\n\ntest('retired welcome modal fallback stays out of product runtime', () => {\n  assert.doesNotMatch(product, /function improveWelcome\\(/);\n  assert.doesNotMatch(product, /product-import-option|welcome-options|welcome-tagline/);\n});\n\ntest('one-time product boot migration artifacts are not shipped', () => {\n  assert.equal(fs.existsSync(path.join(root, 'scripts', 'promote-product-boot-once.js')), false);\n  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'promote-product-boot-once.yml')), false);\n});\n`;
write('tests/product-boot-retirement.test.js', regression);

fs.rmSync(path.join(root, 'scripts', 'promote-product-boot-once.js'));
fs.rmSync(path.join(root, '.github', 'workflows', 'promote-product-boot-once.yml'));
console.log('[product boot] assets/PWA moved to app-boot and retired welcome fallback removed');

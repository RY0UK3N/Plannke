const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const navigationTestPath = path.join(root, 'tests', 'navigation-module.test.js');
const safeRenderersTestPath = path.join(root, 'tests', 'safe-renderers.test.js');
const securityShellTestPath = path.join(root, 'tests', 'security-shell.test.js');
const workflowPath = path.join(root, '.github', 'workflows', 'integrate-canonical-ui-runtime-once.yml');
const selfPath = __filename;

function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing exact marker for ${label}`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Multiple exact markers for ${label}`);
  return source.replace(before, after);
}

let html = fs.readFileSync(indexPath, 'utf8');
const oldBoot = `    <script src="storage.js"></script>\n    <script src="app.js"></script>\n    <script src="app-navigation.js"></script>`;
const newBoot = `    <script src="storage.js"></script>\n    <script src="app-ui.js"></script>\n    <script src="app-runtime.js"></script>\n    <script src="app-navigation.js"></script>`;
html = replaceExact(html, oldBoot, newBoot, 'static shell boot sequence');
if (html.includes('<script src="app.js"></script>')) throw new Error('app.js survived in the static shell.');
fs.writeFileSync(indexPath, html);

let navigationTest = fs.readFileSync(navigationTestPath, 'utf8');
navigationTest = replaceExact(
  navigationTest,
  `test('navigation module loads before the bridge starts the application', () => {\n  const appAt = index.indexOf('src="app.js"');\n  const navigationAt = index.indexOf('src="app-navigation.js"');\n  const bridgeAt = index.indexOf('src="ui-bridge.js"');\n  assert.ok(appAt >= 0 && navigationAt > appAt && bridgeAt > navigationAt);\n  assert.match(sw, /'\\.\\/app-navigation\\.js'/);\n  assert.match(pkg, /node --check app-navigation\\.js/);\n});`,
  `test('canonical app runtime loads before navigation and the bridge starts the application', () => {\n  const uiAt = index.indexOf('src="app-ui.js"');\n  const runtimeAt = index.indexOf('src="app-runtime.js"');\n  const navigationAt = index.indexOf('src="app-navigation.js"');\n  const bridgeAt = index.indexOf('src="ui-bridge.js"');\n  assert.ok(uiAt >= 0 && runtimeAt > uiAt && navigationAt > runtimeAt && bridgeAt > navigationAt);\n  assert.equal(index.indexOf('src="app.js"'), -1);\n  assert.match(sw, /'\\.\\/app-navigation\\.js'/);\n  assert.match(pkg, /node --check app-navigation\\.js/);\n});`,
  'navigation boot assertion'
);
fs.writeFileSync(navigationTestPath, navigationTest);

let safeTest = fs.readFileSync(safeRenderersTestPath, 'utf8');
safeTest = replaceExact(
  safeTest,
  `test('safe renderers load after legacy functions and before product wrappers', () => {\n  const app = index.indexOf('<script src="app.js"></script>');\n  const safe = index.indexOf('<script src="safe-renderers.js"></script>');\n  const core = index.indexOf('<script src="product-core.js"></script>');\n  const product = index.indexOf('<script src="product.js"></script>');\n  assert.ok(app >= 0 && safe > app, 'safe-renderers.js must load after app.js');\n  assert.ok(core > safe, 'product-core.js must load after safe-renderers.js');\n  assert.ok(product > core, 'product.js must remain last among product layers');\n});`,
  `test('safe renderers load after canonical orchestration and before product wrappers', () => {\n  const runtime = index.indexOf('<script src="app-runtime.js"></script>');\n  const safe = index.indexOf('<script src="safe-renderers.js"></script>');\n  const core = index.indexOf('<script src="product-core.js"></script>');\n  const product = index.indexOf('<script src="product.js"></script>');\n  assert.ok(runtime >= 0 && safe > runtime, 'safe-renderers.js must load after app-runtime.js');\n  assert.equal(index.indexOf('<script src="app.js"></script>'), -1);\n  assert.ok(core > safe, 'product-core.js must load after safe-renderers.js');\n  assert.ok(product > core, 'product.js must remain last among product layers');\n});`,
  'safe renderer boot assertion'
);
fs.writeFileSync(safeRenderersTestPath, safeTest);

let securityTest = fs.readFileSync(securityShellTestPath, 'utf8');
securityTest = replaceExact(securityTest, "assert.match(sw, /CACHE_NAME = 'plannke-shell-v27'/);", "assert.match(sw, /CACHE_NAME = 'plannke-shell-v28'/);", 'PWA cache version');
securityTest = replaceExact(
  securityTest,
  `    'app-navigation.js', 'app-data.js',\n    'product-core.js', 'product.js', 'insights.js', 'ui-bridge.js', 'storage-adapter.js', 'storage-ui.js', 'storage-ui.css', 'safe-renderers.js',`,
  `    'app-ui.js', 'app-runtime.js', 'app-navigation.js', 'app-data.js',\n    'product-core.js', 'product.js', 'insights.js', 'ui-bridge.js', 'storage-adapter.js', 'storage-ui.js', 'storage-ui.css', 'safe-renderers.js',`,
  'PWA canonical runtime assets'
);
fs.writeFileSync(securityShellTestPath, securityTest);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

console.log('Canonical UI/runtime installed and historical boot assertions migrated.');

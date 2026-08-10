const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const bridgePath = path.join(root, 'ui-bridge.js');
const indexPath = path.join(root, 'index.html');
const securityPath = path.join(root, 'tests', 'security-shell.test.js');
const workflowPath = path.join(root, '.github', 'workflows', 'extract-app-boot-once.yml');
const selfPath = __filename;

function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing exact marker for ${label}`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Multiple exact markers for ${label}`);
  return source.replace(before, after);
}

let bridge = fs.readFileSync(bridgePath, 'utf8');
const factoryMarker = `})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {`;
const markerIndex = bridge.indexOf(factoryMarker);
if (markerIndex < 0 || markerIndex !== bridge.lastIndexOf(factoryMarker)) throw new Error('UI bridge factory marker is missing or ambiguous.');
const newWrapper = `(function (root, factory) {\n    if (typeof document !== 'undefined' && document.currentScript) {\n        document.currentScript.dataset.plannkeProduct = 'static-shell';\n    }\n\n    const api = factory(root);\n    if (typeof module === 'object' && module.exports) module.exports = api;\n    if (root) root.PlannkeUIBridge = api;\n\n    if (typeof document !== 'undefined') {\n        api.primeCanonicalShell();\n        api.loadRevampAssets();\n\n        const start = () => api.init();\n        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });\n        else start();\n    }\n${factoryMarker}`;
bridge = newWrapper + bridge.slice(markerIndex + factoryMarker.length);
[
  'function waitForStorageReady(',
  'function loadStorageAdapter(',
  'function loadStorageUiAssets(',
  'const applicationInit = root?.initApp',
  'const storageReady = loadStorageAdapter()',
  'function startApplication()'
].forEach(marker => {
  if (bridge.includes(marker)) throw new Error(`Boot responsibility survived ui-bridge.js: ${marker}`);
});
fs.writeFileSync(bridgePath, bridge);

let html = fs.readFileSync(indexPath, 'utf8');
html = replaceExact(
  html,
  `    <script src="ui-bridge.js" data-plannke-ui-bridge="true"></script>\n    <script src="safe-renderers.js"></script>`,
  `    <script src="ui-bridge.js" data-plannke-ui-bridge="true"></script>\n    <script src="app-boot.js"></script>\n    <script src="safe-renderers.js"></script>`,
  'static shell app boot order'
);
fs.writeFileSync(indexPath, html);

let security = fs.readFileSync(securityPath, 'utf8');
security = replaceExact(
  security,
  `const bridge = fs.readFileSync(path.join(root, 'ui-bridge.js'), 'utf8');`,
  `const bridge = fs.readFileSync(path.join(root, 'ui-bridge.js'), 'utf8');\nconst boot = fs.readFileSync(path.join(root, 'app-boot.js'), 'utf8');`,
  'security boot source declaration'
);
security = replaceExact(
  security,
  `  assert.ok(index.indexOf('app-runtime.js') < index.indexOf('ui-bridge.js'));\n  assert.ok(index.indexOf('ui-bridge.js') < index.indexOf('safe-renderers.js'));`,
  `  assert.ok(index.indexOf('app-runtime.js') < index.indexOf('ui-bridge.js'));\n  assert.ok(index.indexOf('ui-bridge.js') < index.indexOf('app-boot.js'));\n  assert.ok(index.indexOf('app-boot.js') < index.indexOf('safe-renderers.js'));`,
  'security shell module order'
);
const oldBootTest = `test('canonical bridge owns application boot and waits for StorageAdapter', () => {\n  assert.match(bridge, /script\\.src = 'storage-adapter\\.js'/);\n  assert.match(bridge, /function waitForStorageReady\\(/);\n  assert.match(bridge, /Promise\\.resolve\\(api\\.ready\\)/);\n  assert.match(bridge, /const applicationInit = root\\?\\.initApp/);\n  assert.match(bridge, /const storageReady = loadStorageAdapter\\(\\)/);\n  assert.match(bridge, /function startApplication\\(\\)/);\n  assert.match(bridge, /storageReady[\\s\\S]*applicationInit\\.call\\(root\\)/);\n  assert.match(bridge, /api\\.init\\(\\);\\s*startApplication\\(\\);/);`;
const newBootTest = `test('canonical app boot owns application start and waits for StorageAdapter', () => {\n  assert.match(boot, /script\\.src = 'storage-adapter\\.js'/);\n  assert.match(boot, /function waitForStorageReady\\(/);\n  assert.match(boot, /Promise\\.resolve\\(api\\.ready\\)/);\n  assert.match(boot, /const applicationInit = root\\?\\.initApp/);\n  assert.match(boot, /const storageReady = loadStorageAdapter\\(\\)/);\n  assert.match(boot, /function startApplication\\(\\)/);\n  assert.match(boot, /storageReady[\\s\\S]*applicationInit\\.call\\(root\\)/);\n  assert.doesNotMatch(bridge, /loadStorageAdapter|startApplication|applicationInit/);`;
security = replaceExact(security, oldBootTest, newBootTest, 'security boot ownership test');
security = replaceExact(
  security,
  "  assert.match(bridge, /script\\.src = 'storage-ui\\.js'/);",
  "  assert.match(boot, /script\\.src = 'storage-ui\\.js'/);",
  'storage UI loader ownership'
);
security = replaceExact(security, "assert.match(sw, /CACHE_NAME = 'plannke-shell-v28'/);", "assert.match(sw, /CACHE_NAME = 'plannke-shell-v29'/);", 'security PWA cache version');
security = replaceExact(
  security,
  `    'app-ui.js', 'app-runtime.js', 'app-navigation.js', 'app-data.js',`,
  `    'app-ui.js', 'app-runtime.js', 'app-boot.js', 'app-navigation.js', 'app-data.js',`,
  'security PWA app boot asset'
);
fs.writeFileSync(securityPath, security);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

console.log('Extracted application boot from ui-bridge.js.');

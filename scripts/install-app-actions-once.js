const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const insightsPath = path.join(root, 'insights.js');
const securityPath = path.join(root, 'tests', 'security-shell.test.js');
const workflowPath = path.join(root, '.github', 'workflows', 'install-app-actions-once.yml');
const selfPath = __filename;

function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing exact marker for ${label}`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Multiple exact markers for ${label}`);
  return source.replace(before, after);
}

let html = fs.readFileSync(indexPath, 'utf8');
html = replaceExact(
  html,
  '<script src="ui-bridge.js" data-plannke-ui-bridge="true"></script>',
  '<script src="app-actions.js" data-plannke-actions="true"></script>',
  'static compatibility router'
);
if (html.includes('src="ui-bridge.js"')) throw new Error('ui-bridge.js survived in the static shell.');
fs.writeFileSync(indexPath, html);

let insights = fs.readFileSync(insightsPath, 'utf8');
insights = replaceExact(insights, 'const loadBridge = () => {', 'const loadActions = () => {', 'fallback loader name');
insights = replaceExact(insights, "if (document.querySelector('script[data-plannke-ui-bridge]')) return;", "if (document.querySelector('script[data-plannke-actions]')) return;", 'fallback action selector');
insights = replaceExact(insights, "const bridge = document.createElement('script');\n            bridge.src = './ui-bridge.js';\n            bridge.dataset.plannkeUiBridge = 'true';\n            bridge.defer = true;\n            document.head.appendChild(bridge);", "const actions = document.createElement('script');\n            actions.src = './app-actions.js';\n            actions.dataset.plannkeActions = 'true';\n            actions.defer = true;\n            document.head.appendChild(actions);", 'fallback action script');
insights = insights.replaceAll('loadBridge()', 'loadActions()');
insights = insights.replaceAll("addEventListener('load', loadBridge", "addEventListener('load', loadActions");
if (/ui-bridge\.js|plannkeUiBridge|loadBridge/.test(insights)) throw new Error('Legacy UI bridge fallback marker survived insights.js.');
fs.writeFileSync(insightsPath, insights);

let security = fs.readFileSync(securityPath, 'utf8');
security = replaceExact(
  security,
  "const bridge = fs.readFileSync(path.join(root, 'ui-bridge.js'), 'utf8');",
  "const actions = fs.readFileSync(path.join(root, 'app-actions.js'), 'utf8');",
  'security action source declaration'
);
security = replaceExact(
  security,
  "test('product layer, app shell, compatibility bridge and safe renderers are loaded in the required order', () => {",
  "test('product layer, app shell, canonical actions and safe renderers are loaded in the required order', () => {",
  'security order test title'
);
security = replaceExact(
  security,
  "  assert.match(index, /<script src=\"ui-bridge\\.js\" data-plannke-ui-bridge=\"true\"><\\/script>/);",
  "  assert.match(index, /<script src=\"app-actions\\.js\" data-plannke-actions=\"true\"><\\/script>/);",
  'security canonical action script'
);
security = replaceExact(
  security,
  "  assert.ok(index.indexOf('app-shell.js') < index.indexOf('ui-bridge.js'));\n  assert.ok(index.indexOf('ui-bridge.js') < index.indexOf('app-boot.js'));",
  "  assert.ok(index.indexOf('app-shell.js') < index.indexOf('app-actions.js'));\n  assert.ok(index.indexOf('app-actions.js') < index.indexOf('app-boot.js'));\n  assert.equal(index.indexOf('ui-bridge.js'), -1);",
  'security action order'
);
security = replaceExact(
  security,
  "  assert.match(insights, /shell\\.addEventListener\\('load', loadBridge/);\n  assert.match(insights, /bridge\\.src = '\\.\\/ui-bridge\\.js'/);",
  "  assert.match(insights, /shell\\.addEventListener\\('load', loadActions/);\n  assert.match(insights, /actions\\.src = '\\.\\/app-actions\\.js'/);",
  'security insights action fallback'
);
security = replaceExact(
  security,
  "  assert.doesNotMatch(bridge, /loadStorageAdapter|startApplication|applicationInit/);",
  "  assert.doesNotMatch(actions, /loadStorageAdapter|startApplication|applicationInit/);",
  'security action boot separation'
);
security = replaceExact(security, "assert.match(sw, /CACHE_NAME = 'plannke-shell-v31'/);", "assert.match(sw, /CACHE_NAME = 'plannke-shell-v32'/);", 'security PWA version');
security = replaceExact(
  security,
  "    'product-core.js', 'product.js', 'insights.js', 'ui-bridge.js', 'storage-adapter.js', 'storage-ui.js', 'storage-ui.css', 'safe-renderers.js',",
  "    'product-core.js', 'product.js', 'insights.js', 'app-actions.js', 'storage-adapter.js', 'storage-ui.js', 'storage-ui.css', 'safe-renderers.js',",
  'security PWA action asset'
);
fs.writeFileSync(securityPath, security);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}
console.log('Installed app-actions.js as the canonical compatibility router and migrated security contracts.');

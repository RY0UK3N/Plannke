const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const bridgePath = path.join(root, 'ui-bridge.js');
const indexPath = path.join(root, 'index.html');
const insightsPath = path.join(root, 'insights.js');
const securityPath = path.join(root, 'tests', 'security-shell.test.js');
const swPath = path.join(root, 'sw.js');
const workflowPath = path.join(root, '.github', 'workflows', 'extract-app-shell-once.yml');
const selfPath = __filename;

function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing exact marker for ${label}`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Multiple exact markers for ${label}`);
  return source.replace(before, after);
}

function removeRange(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(`Could not locate ${label}`);
  return source.slice(0, start) + source.slice(end);
}

let bridge = fs.readFileSync(bridgePath, 'utf8');
bridge = replaceExact(bridge, `        api.primeCanonicalShell();\n        api.loadRevampAssets();\n\n`, '', 'bridge shell wrapper calls');
bridge = removeRange(bridge, '    const CANONICAL_PAGES = [', '    // Temporary compatibility vocabulary', 'canonical pages block');
bridge = removeRange(bridge, '    function make(tag, className, text) {', '    function splitArgs(source) {', 'shell construction helpers');
bridge = removeRange(bridge, '    function loadDesktopAssets() {', '    let initialized = false;', 'visual asset loaders');
bridge = replaceExact(bridge, '        primeCanonicalShell();\n', '', 'bridge init shell call');
bridge = replaceExact(bridge, '        primeCanonicalShell,\n        loadDesktopAssets,\n        loadRevampAssets,\n', '', 'bridge shell API exports');
['CANONICAL_PAGES', 'primeCanonicalShell', 'loadDesktopAssets', 'loadRevampAssets', 'Central financeira', 'revamp-desktop.js'].forEach(marker => {
  if (bridge.includes(marker)) throw new Error(`Shell marker survived ui-bridge.js: ${marker}`);
});
fs.writeFileSync(bridgePath, bridge);

let html = fs.readFileSync(indexPath, 'utf8');
html = replaceExact(
  html,
  `    <script src="app-navigation.js"></script>\n    <script src="ui-bridge.js" data-plannke-ui-bridge="true"></script>`,
  `    <script src="app-navigation.js"></script>\n    <script src="app-shell.js" data-plannke-shell="true"></script>\n    <script src="ui-bridge.js" data-plannke-ui-bridge="true"></script>`,
  'static shell script order'
);
fs.writeFileSync(indexPath, html);

let insights = fs.readFileSync(insightsPath, 'utf8');
const oldFallback = `        if (!document.querySelector('script[data-plannke-ui-bridge]')) {\n            const bridge = document.createElement('script');\n            bridge.src = './ui-bridge.js';\n            bridge.dataset.plannkeUiBridge = 'true';\n            bridge.defer = true;\n            document.head.appendChild(bridge);\n        }`;
const newFallback = `        const loadBridge = () => {\n            if (document.querySelector('script[data-plannke-ui-bridge]')) return;\n            const bridge = document.createElement('script');\n            bridge.src = './ui-bridge.js';\n            bridge.dataset.plannkeUiBridge = 'true';\n            bridge.defer = true;\n            document.head.appendChild(bridge);\n        };\n\n        if (root.PlannkeShell) {\n            loadBridge();\n        } else {\n            const existingShell = document.querySelector('script[data-plannke-shell]');\n            if (existingShell) existingShell.addEventListener('load', loadBridge, { once: true });\n            else {\n                const shell = document.createElement('script');\n                shell.src = './app-shell.js';\n                shell.dataset.plannkeShell = 'true';\n                shell.defer = true;\n                shell.addEventListener('load', loadBridge, { once: true });\n                document.head.appendChild(shell);\n            }\n        }`;
insights = replaceExact(insights, oldFallback, newFallback, 'insights shell/bridge fallback');
fs.writeFileSync(insightsPath, insights);

let security = fs.readFileSync(securityPath, 'utf8');
security = replaceExact(
  security,
  `const bridge = fs.readFileSync(path.join(root, 'ui-bridge.js'), 'utf8');`,
  `const shell = fs.readFileSync(path.join(root, 'app-shell.js'), 'utf8');\nconst bridge = fs.readFileSync(path.join(root, 'ui-bridge.js'), 'utf8');`,
  'security shell source declaration'
);
security = replaceExact(
  security,
  `test('product layer, UI bridge and safe renderers are loaded in the required order', () => {\n  assert.match(index, /<link rel="stylesheet" href="product\\.css">/);\n  assert.match(index, /<script src="ui-bridge\\.js" data-plannke-ui-bridge="true"><\\/script>/);`,
  `test('product layer, app shell, compatibility bridge and safe renderers are loaded in the required order', () => {\n  assert.match(index, /<link rel="stylesheet" href="product\\.css">/);\n  assert.match(index, /<script src="app-shell\\.js" data-plannke-shell="true"><\\/script>/);\n  assert.match(index, /<script src="ui-bridge\\.js" data-plannke-ui-bridge="true"><\\/script>/);`,
  'security order test title and shell assertion'
);
security = replaceExact(
  security,
  `  assert.ok(index.indexOf('app-runtime.js') < index.indexOf('ui-bridge.js'));\n  assert.ok(index.indexOf('ui-bridge.js') < index.indexOf('app-boot.js'));`,
  `  assert.ok(index.indexOf('app-runtime.js') < index.indexOf('app-shell.js'));\n  assert.ok(index.indexOf('app-shell.js') < index.indexOf('ui-bridge.js'));\n  assert.ok(index.indexOf('ui-bridge.js') < index.indexOf('app-boot.js'));`,
  'security shell/bridge order'
);
security = replaceExact(
  security,
  `  assert.match(insights, /bridge\\.src = '\\.\\/ui-bridge\\.js'/);`,
  `  assert.match(insights, /shell\\.src = '\\.\\/app-shell\\.js'/);\n  assert.match(insights, /shell\\.addEventListener\\('load', loadBridge/);\n  assert.match(insights, /bridge\\.src = '\\.\\/ui-bridge\\.js'/);`,
  'security insights fallback order'
);
security = security.replaceAll("assert.match(bridge, /function primeCanonicalShell\\(/);", "assert.match(shell, /function primeCanonicalShell\\(/);");
security = security.replaceAll("assert.match(bridge, /api\\.primeCanonicalShell\\(\\);\\s*api\\.loadRevampAssets\\(\\);/);", "assert.match(shell, /api\\.primeCanonicalShell\\(\\);\\s*api\\.loadRevampAssets\\(\\);/);");
security = security.replaceAll("assert.match(bridge, /document\\.body\\.classList\\.add\\('plannke-revamp'\\)/);", "assert.match(shell, /document\\.body\\.classList\\.add\\('plannke-revamp'\\)/);");
security = security.replaceAll("assert.match(bridge, /document\\.body\\.dataset\\.plannkeCanonical = 'desktop'/);", "assert.match(shell, /document\\.body\\.dataset\\.plannkeCanonical = 'desktop'/);");
security = security.replaceAll("assert.match(bridge, /Central financeira/);", "assert.match(shell, /Central financeira/);");
security = security.replaceAll("assert.match(bridge, /CANONICAL_PAGES/);", "assert.match(shell, /CANONICAL_PAGES/);");
security = security.replaceAll("assert.match(bridge, /\\['backup', 'ph-database', 'Dados'\\]/);", "assert.match(shell, /\\['backup', 'ph-database', 'Dados'\\]/);");
security = security.replaceAll("assert.doesNotMatch(bridge, /function canonicalStylesPresent", "assert.doesNotMatch(shell, /function canonicalStylesPresent");
security = security.replaceAll("assert.match(bridge, /function canonicalStylesPresent\\(/);", "assert.match(shell, /function canonicalStylesPresent\\(/);");
security = security.replaceAll("assert.match(bridge, /!canonicalStylesPresent", "assert.match(shell, /!canonicalStylesPresent");
security = security.replaceAll("assert.match(bridge, /script\\.src = 'revamp\\.js'/);", "assert.match(shell, /script\\.src = 'revamp\\.js'/);");
security = security.replaceAll("assert.match(bridge, /script\\.async = false/);", "assert.match(shell, /script\\.async = false/);");
security = security.replaceAll("assert.match(bridge, /desktopScript\\.src = 'revamp-desktop\\.js'/);", "assert.match(shell, /desktopScript\\.src = 'revamp-desktop\\.js'/);");
security = security.replaceAll("assert.match(bridge, /desktopScript\\.async = false/);", "assert.match(shell, /desktopScript\\.async = false/);");
security = security.replaceAll("assert.match(bridge, /script\\.addEventListener\\('load', loadDesktopAssets/);", "assert.match(shell, /script\\.addEventListener\\('load', loadDesktopAssets/);");
security = replaceExact(security, "assert.match(sw, /CACHE_NAME = 'plannke-shell-v30'/);", "assert.match(sw, /CACHE_NAME = 'plannke-shell-v31'/);", 'security PWA version');
security = replaceExact(
  security,
  `    'app-ui.js', 'app-runtime.js', 'app-boot.js', 'app-navigation.js', 'app-data.js',`,
  `    'app-ui.js', 'app-runtime.js', 'app-shell.js', 'app-boot.js', 'app-navigation.js', 'app-data.js',`,
  'security PWA shell asset'
);
security = `${security.trimEnd()}\n`;
fs.writeFileSync(securityPath, security);

let sw = fs.readFileSync(swPath, 'utf8');
sw = replaceExact(sw, "const CACHE_NAME = 'plannke-shell-v30';", "const CACHE_NAME = 'plannke-shell-v31';", 'PWA version');
sw = replaceExact(sw, "  './app-runtime.js',\n  './app-boot.js',", "  './app-runtime.js',\n  './app-shell.js',\n  './app-boot.js',", 'PWA app shell asset');
fs.writeFileSync(swPath, sw);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}
console.log('Extracted canonical desktop shell from ui-bridge.js.');

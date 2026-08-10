const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const swPath = path.join(root, 'sw.js');
const pkgPath = path.join(root, 'package.json');
const insightsPath = path.join(root, 'insights.js');
const actionsPath = path.join(root, 'app-actions.js');
const securityPath = path.join(root, 'tests', 'security-shell.test.js');
const workflowPath = path.join(root, '.github', 'workflows', 'retire-app-actions-once.yml');
const selfPath = __filename;

function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing exact marker for ${label}`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Multiple exact markers for ${label}`);
  return source.replace(before, after);
}

let index = fs.readFileSync(indexPath, 'utf8');
index = replaceExact(index, `    <script src="app-actions.js" data-plannke-actions="true"></script>\n`, '', 'index app-actions script');
fs.writeFileSync(indexPath, index);

let sw = fs.readFileSync(swPath, 'utf8');
sw = replaceExact(sw, `const CACHE_NAME = 'plannke-shell-v32';`, `const CACHE_NAME = 'plannke-shell-v33';`, 'PWA cache version');
sw = replaceExact(sw, `  './app-actions.js',\n`, '', 'PWA app-actions asset');
fs.writeFileSync(swPath, sw);

let pkg = fs.readFileSync(pkgPath, 'utf8');
pkg = replaceExact(pkg, ` && node --check app-actions.js`, '', 'CI app-actions syntax check');
fs.writeFileSync(pkgPath, pkg);

let insights = fs.readFileSync(insightsPath, 'utf8');
const compatibilityBlock = `\n        const loadActions = () => {\n            if (document.querySelector('script[data-plannke-actions]')) return;\n            const actions = document.createElement('script');\n            actions.src = './app-actions.js';\n            actions.dataset.plannkeActions = 'true';\n            actions.defer = true;\n            document.head.appendChild(actions);\n        };\n\n        if (root.PlannkeShell) {\n            loadActions();\n        } else {\n            const existingShell = document.querySelector('script[data-plannke-shell]');\n            if (existingShell) existingShell.addEventListener('load', loadActions, { once: true });\n            else {\n                const shell = document.createElement('script');\n                shell.src = './app-shell.js';\n                shell.dataset.plannkeShell = 'true';\n                shell.defer = true;\n                shell.addEventListener('load', loadActions, { once: true });\n                document.head.appendChild(shell);\n            }\n        }\n`;
const shellOnlyBlock = `\n        if (!root.PlannkeShell && !document.querySelector('script[data-plannke-shell]')) {\n            const shell = document.createElement('script');\n            shell.src = './app-shell.js';\n            shell.dataset.plannkeShell = 'true';\n            shell.defer = true;\n            document.head.appendChild(shell);\n        }\n`;
insights = replaceExact(insights, compatibilityBlock, shellOnlyBlock, 'insights action fallback');
fs.writeFileSync(insightsPath, insights);

let security = fs.readFileSync(securityPath, 'utf8');
security = replaceExact(security, `const actions = fs.readFileSync(path.join(root, 'app-actions.js'), 'utf8');\n`, '', 'security actions source');
security = replaceExact(security, `test('product layer, app shell, canonical actions and safe renderers are loaded in the required order', () => {`, `test('product layer, app shell and safe renderers are loaded in the required order', () => {`, 'security order title');
security = replaceExact(security, `  assert.match(index, /<script src=\"app-actions\\.js\" data-plannke-actions=\"true\"><\\/script>/);\n`, '', 'security action script assertion');
security = replaceExact(security, `  assert.ok(index.indexOf('app-shell.js') < index.indexOf('app-actions.js'));\n  assert.ok(index.indexOf('app-actions.js') < index.indexOf('app-boot.js'));\n`, `  assert.equal(index.indexOf('app-actions.js'), -1);\n  assert.ok(index.indexOf('app-shell.js') < index.indexOf('app-boot.js'));\n`, 'security shell boot order');
security = replaceExact(security, `  assert.match(insights, /shell\\.addEventListener\\('load', loadActions/);\n  assert.match(insights, /actions\\.src = '\\.\\/app-actions\\.js'/);\n`, `  assert.doesNotMatch(insights, /app-actions\\.js|loadActions|plannkeActions/);\n`, 'security insights fallback');
security = replaceExact(security, `  assert.doesNotMatch(actions, /loadStorageAdapter|startApplication|applicationInit/);\n`, `  assert.equal(fs.existsSync(path.join(root, 'app-actions.js')), false);\n`, 'security boot isolation');
security = replaceExact(security, `    'product-core.js', 'product.js', 'insights.js', 'app-actions.js', 'storage-adapter.js', 'storage-ui.js', 'storage-ui.css', 'safe-renderers.js',`, `    'product-core.js', 'product.js', 'insights.js', 'storage-adapter.js', 'storage-ui.js', 'storage-ui.css', 'safe-renderers.js',`, 'security PWA inventory');
security = replaceExact(security, `  assert.match(sw, /CACHE_NAME = 'plannke-shell-v32'/);`, `  assert.match(sw, /CACHE_NAME = 'plannke-shell-v33'/);`, 'security PWA cache version');
fs.writeFileSync(securityPath, security);

if (!fs.existsSync(actionsPath)) throw new Error('app-actions.js already missing before retirement');
fs.unlinkSync(actionsPath);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

console.log('Retired app-actions runtime and compatibility loader.');

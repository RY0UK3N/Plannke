const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const insightsPath = path.join(root, 'insights.js');
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

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}
console.log('Installed app-actions.js as the canonical compatibility router.');

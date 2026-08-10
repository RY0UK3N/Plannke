const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const workflowPath = path.join(root, '.github', 'workflows', 'integrate-canonical-ui-runtime-once.yml');
const selfPath = __filename;

let html = fs.readFileSync(indexPath, 'utf8');
const oldBoot = `    <script src="storage.js"></script>\n    <script src="app.js"></script>\n    <script src="app-navigation.js"></script>`;
const newBoot = `    <script src="storage.js"></script>\n    <script src="app-ui.js"></script>\n    <script src="app-runtime.js"></script>\n    <script src="app-navigation.js"></script>`;

if (!html.includes(oldBoot)) throw new Error('Legacy app.js boot sequence was not found exactly once.');
if (html.indexOf(oldBoot) !== html.lastIndexOf(oldBoot)) throw new Error('Legacy app.js boot sequence appears more than once.');
html = html.replace(oldBoot, newBoot);

if (html.includes('<script src="app.js"></script>')) throw new Error('app.js survived in the static shell.');
if (!html.includes('<script src="app-ui.js"></script>') || !html.includes('<script src="app-runtime.js"></script>')) {
  throw new Error('Canonical UI/runtime scripts were not installed.');
}
fs.writeFileSync(indexPath, html);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

console.log('Canonical UI/runtime installed in static shell.');

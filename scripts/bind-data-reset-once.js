const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const dataPath = path.join(root, 'app-data.js');
const actionsPath = path.join(root, 'app-actions.js');
const workflowPath = path.join(root, '.github', 'workflows', 'bind-data-reset-once.yml');
const selfPath = __filename;
function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing exact marker for ${label}`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Multiple exact markers for ${label}`);
  return source.replace(before, after);
}
let html = fs.readFileSync(htmlPath, 'utf8');
html = replaceExact(html, `<button class="btn btn-outline-danger btn-sm" data-plannke-onclick="confirmClearData()">`, `<button class="btn btn-outline-danger btn-sm" id="settings-clear-data">`, 'settings clear data button');
fs.writeFileSync(htmlPath, html);
let data = fs.readFileSync(dataPath, 'utf8');
data = replaceExact(data, `        document.getElementById('data-export-excel')?.addEventListener('click', exportToExcel);`, `        document.getElementById('data-export-excel')?.addEventListener('click', exportToExcel);\n        document.getElementById('settings-clear-data')?.addEventListener('click', confirmClearData);`, 'data control binder');
fs.writeFileSync(dataPath, data);
let actions = fs.readFileSync(actionsPath, 'utf8');
actions = replaceExact(actions, `        'confirmClearData',\n`, '', 'confirmClearData compatibility action');
fs.writeFileSync(actionsPath, actions);
for (const temporary of [workflowPath, selfPath]) if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
console.log('Bound data reset explicitly and retired its compatibility action.');

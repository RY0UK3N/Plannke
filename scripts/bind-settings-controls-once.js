const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const settingsPath = path.join(root, 'app-settings.js');
const actionsPath = path.join(root, 'app-actions.js');
const workflowPath = path.join(root, '.github', 'workflows', 'bind-settings-controls-once.yml');
const selfPath = __filename;

function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing exact marker for ${label}`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Multiple exact markers for ${label}`);
  return source.replace(before, after);
}

let html = fs.readFileSync(htmlPath, 'utf8');
html = replaceExact(html, `id="cat-modal-tab-expense" data-plannke-onclick="switchCatTabModal('expense')"`, `id="cat-modal-tab-expense"`, 'modal expense tab');
html = replaceExact(html, `id="cat-modal-tab-income" data-plannke-onclick="switchCatTabModal('income')"`, `id="cat-modal-tab-income"`, 'modal income tab');
html = replaceExact(html, `<button type="button" class="btn btn-primary btn-sm px-3 rounded-pill" data-plannke-onclick="addCustomCategoryModal()">`, `<button type="button" class="btn btn-primary btn-sm px-3 rounded-pill" id="cat-modal-add">`, 'modal add category');
html = replaceExact(html, `id="settings-theme-toggle" data-plannke-onchange="toggleTheme()"`, `id="settings-theme-toggle"`, 'theme toggle');
html = replaceExact(html, `id="cat-tab-expense" data-plannke-onclick="switchCatTab('expense')"`, `id="cat-tab-expense"`, 'settings expense tab');
html = replaceExact(html, `id="cat-tab-income" data-plannke-onclick="switchCatTab('income')"`, `id="cat-tab-income"`, 'settings income tab');
html = replaceExact(html, `<button type="button" class="btn btn-primary btn-sm px-3 rounded-pill" data-plannke-onclick="addCustomCategory()">`, `<button type="button" class="btn btn-primary btn-sm px-3 rounded-pill" id="cat-add">`, 'settings add category');
fs.writeFileSync(htmlPath, html);

let settings = fs.readFileSync(settingsPath, 'utf8');
settings = replaceExact(settings, `    let activeTab = 'expense';\n`, `    let activeTab = 'expense';\n    let controlsBound = false;\n`, 'settings control state');
const binder = `    function bindSettingsControls() {\n        if (controlsBound || typeof document === 'undefined') return;\n        controlsBound = true;\n        byId('settings-theme-toggle')?.addEventListener('change', toggleTheme);\n        byId('cat-modal-tab-expense')?.addEventListener('click', () => switchCatTabModal('expense'));\n        byId('cat-modal-tab-income')?.addEventListener('click', () => switchCatTabModal('income'));\n        byId('cat-modal-add')?.addEventListener('click', addCustomCategoryModal);\n        byId('cat-tab-expense')?.addEventListener('click', () => switchCatTab('expense'));\n        byId('cat-tab-income')?.addEventListener('click', () => switchCatTab('income'));\n        byId('cat-add')?.addEventListener('click', addCustomCategory);\n    }\n\n`;
settings = replaceExact(settings, `    function openSettingsPanel() {\n`, `${binder}    function openSettingsPanel() {\n`, 'settings control binder');
settings = replaceExact(settings, `        openSettingsPanel,\n`, `        openSettingsPanel,\n        bindSettingsControls,\n`, 'settings control API');
settings = replaceExact(settings, `    root.PlannkeSettings = api;\n`, `    root.PlannkeSettings = api;\n    bindSettingsControls();\n`, 'settings control boot binding');
fs.writeFileSync(settingsPath, settings);

let actions = fs.readFileSync(actionsPath, 'utf8');
actions = replaceExact(
  actions,
  `        'switchCatTabModal', 'addCustomCategoryModal',\n        'toggleTheme', 'switchCatTab', 'addCustomCategory', 'confirmClearData',\n`,
  `        'confirmClearData',\n`,
  'settings static compatibility allowlist'
);
fs.writeFileSync(actionsPath, actions);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}
console.log('Bound static settings controls explicitly and retired their compatibility actions.');

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const dataPath = path.join(root, 'app-data.js');
const actionsPath = path.join(root, 'app-actions.js');
const workflowPath = path.join(root, '.github', 'workflows', 'bind-data-controls-once.yml');
const selfPath = __filename;

function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing exact marker for ${label}`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Multiple exact markers for ${label}`);
  return source.replace(before, after);
}

let html = fs.readFileSync(htmlPath, 'utf8');
html = replaceExact(
  html,
  `<button class="btn btn-outline-primary" data-plannke-onclick="exportToExcel()"><i class="ph ph-file-xls me-2"></i>Exportar relatório Excel</button>`,
  `<button class="btn btn-outline-primary" id="data-export-excel"><i class="ph ph-file-xls me-2"></i>Exportar relatório Excel</button>`,
  'data Excel export button'
);
fs.writeFileSync(htmlPath, html);

let data = fs.readFileSync(dataPath, 'utf8');
data = replaceExact(data, `    'use strict';\n\n`, `    'use strict';\n\n    let controlsBound = false;\n\n`, 'data control state');
const binder = `    function bindDataControls() {\n        if (controlsBound || typeof document === 'undefined') return;\n        controlsBound = true;\n        document.getElementById('data-export-excel')?.addEventListener('click', exportToExcel);\n    }\n\n`;
data = replaceExact(data, `    root.confirmClearData = confirmClearData;\n`, `${binder}    root.confirmClearData = confirmClearData;\n`, 'data control binder');
data = replaceExact(data, `        planningRows\n    };\n`, `        planningRows,\n        bindDataControls\n    };\n    bindDataControls();\n`, 'data API and boot binding');
fs.writeFileSync(dataPath, data);

let actions = fs.readFileSync(actionsPath, 'utf8');
actions = replaceExact(
  actions,
  `        'openModal',\n        'exportToExcel', 'switchCatTabModal', 'addCustomCategoryModal',`,
  `        'openModal',\n        'switchCatTabModal', 'addCustomCategoryModal',`,
  'data compatibility allowlist'
);
fs.writeFileSync(actionsPath, actions);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}
console.log('Bound data export control explicitly and retired its compatibility action.');

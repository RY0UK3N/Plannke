const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const dashboardPath = path.join(root, 'app-dashboard.js');
const actionsPath = path.join(root, 'app-actions.js');
const workflowPath = path.join(root, '.github', 'workflows', 'bind-dashboard-controls-once.yml');
const selfPath = __filename;

function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing exact marker for ${label}`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Multiple exact markers for ${label}`);
  return source.replace(before, after);
}

let html = fs.readFileSync(htmlPath, 'utf8');
html = replaceExact(
  html,
  `<button class="btn btn-sm btn-outline-primary rounded-pill px-3" data-plannke-onclick="openBudgetManager()"><i class="ph ph-sliders-horizontal me-1"></i>Gerenciar</button>`,
  `<button class="btn btn-sm btn-outline-primary rounded-pill px-3" id="dashboard-budget-manage"><i class="ph ph-sliders-horizontal me-1"></i>Gerenciar</button>`,
  'dashboard budget button'
);
html = replaceExact(
  html,
  `<a href="#" class="badge rounded-pill ver-todas-badge text-decoration-none" data-plannke-onclick="filterDashboardToTransactions('all'); return false;">Ver Todas</a>`,
  `<a href="#" class="badge rounded-pill ver-todas-badge text-decoration-none" id="dashboard-view-all-transactions">Ver Todas</a>`,
  'dashboard view all link'
);
fs.writeFileSync(htmlPath, html);

let dashboard = fs.readFileSync(dashboardPath, 'utf8');
dashboard = replaceExact(
  dashboard,
  `    let comparisonChart = null;\n`,
  `    let comparisonChart = null;\n    let controlsBound = false;\n`,
  'dashboard control state'
);
const binder = `    function bindDashboardControls() {\n        if (controlsBound || typeof document === 'undefined') return;\n        controlsBound = true;\n        document.getElementById('dashboard-budget-manage')?.addEventListener('click', () => root.openBudgetManager?.());\n        document.getElementById('dashboard-view-all-transactions')?.addEventListener('click', event => {\n            event.preventDefault();\n            root.filterDashboardToTransactions?.('all');\n        });\n    }\n\n`;
dashboard = replaceExact(
  dashboard,
  `    function refreshTheme() {\n`,
  `${binder}    function refreshTheme() {\n`,
  'dashboard control binder'
);
dashboard = replaceExact(
  dashboard,
  `    root.PlannkeDashboard = {\n        renderChart,\n        renderComparisonChart,\n        refreshTheme\n    };\n`,
  `    root.PlannkeDashboard = {\n        renderChart,\n        renderComparisonChart,\n        refreshTheme,\n        bindDashboardControls\n    };\n    bindDashboardControls();\n`,
  'dashboard API and boot binding'
);
fs.writeFileSync(dashboardPath, dashboard);

let actions = fs.readFileSync(actionsPath, 'utf8');
actions = replaceExact(
  actions,
  `        'openBudgetManager', 'openCategoryManager',\n        'filterDashboardToTransactions',\n        'openModal',`,
  `        'openCategoryManager',\n        'openModal',`,
  'dashboard compatibility allowlist'
);
fs.writeFileSync(actionsPath, actions);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}
console.log('Bound dashboard static controls explicitly and retired their compatibility actions.');

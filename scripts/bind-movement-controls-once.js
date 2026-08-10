const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const movementsPath = path.join(root, 'app-movements.js');
const actionsPath = path.join(root, 'app-actions.js');
const workflowPath = path.join(root, '.github', 'workflows', 'bind-movement-controls-once.yml');
const selfPath = __filename;

function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing exact marker for ${label}`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Multiple exact markers for ${label}`);
  return source.replace(before, after);
}

let html = fs.readFileSync(htmlPath, 'utf8');
html = replaceExact(
  html,
  `<div class="month-nav-inline"><button class="btn btn-sm month-arrow" data-plannke-onclick="changeMonth(-1)"><i class="ph ph-caret-left"></i></button><div class="month-display"><span class="tiny text-muted uppercase fw-bold d-block mb-1">Mês de Referência</span><span class="month-text">Janeiro 2024</span></div><button class="btn btn-sm month-arrow" data-plannke-onclick="changeMonth(1)"><i class="ph ph-caret-right"></i></button></div>`,
  `<div class="month-nav-inline"><button class="btn btn-sm month-arrow" id="mov-month-prev"><i class="ph ph-caret-left"></i></button><div class="month-display"><span class="tiny text-muted uppercase fw-bold d-block mb-1">Mês de Referência</span><span class="month-text">Janeiro 2024</span></div><button class="btn btn-sm month-arrow" id="mov-month-next"><i class="ph ph-caret-right"></i></button></div>`,
  'movement month controls'
);
html = replaceExact(
  html,
  `<div class="btn-group btn-group-sm gap-1 p-1 rounded-pill mov-view-toggle shadow-sm"><button class="btn btn-primary rounded-pill px-4 active" id="btn-mov-list" data-plannke-onclick="setMovViewMode('list')">Lista</button><button class="btn btn-outline-light border-0 rounded-pill px-4" id="btn-mov-sankey" data-plannke-onclick="setMovViewMode('sankey')">Caminho</button><button class="btn btn-outline-light border-0 rounded-pill px-4" id="btn-mov-sunburst" data-plannke-onclick="setMovViewMode('sunburst')">Solar</button></div>`,
  `<div class="btn-group btn-group-sm gap-1 p-1 rounded-pill mov-view-toggle shadow-sm"><button class="btn btn-primary rounded-pill px-4 active" id="btn-mov-list">Lista</button><button class="btn btn-outline-light border-0 rounded-pill px-4" id="btn-mov-sankey">Caminho</button><button class="btn btn-outline-light border-0 rounded-pill px-4" id="btn-mov-sunburst">Solar</button></div>`,
  'movement view controls'
);
html = replaceExact(
  html,
  `<div id="mov-list-container" class="card"><div class="card-body"><div class="d-flex align-items-center gap-2 mb-2 flex-wrap"><h5 class="mb-0 fw-bold me-auto">Histórico de Transações</h5><select id="tx-filter" class="form-select form-select-sm mov-filter-select" data-plannke-onchange="renderMovimentacao()"><option value="all">Tipo</option><option value="income">Entradas</option><option value="expense">Gastos</option><option value="transfer">Transferências</option></select><select id="tx-filter-category" class="form-select form-select-sm mov-filter-select" data-plannke-onchange="renderMovimentacao()"><option value="all">Categoria</option></select><select id="tx-filter-account" class="form-select form-select-sm mov-filter-select" data-plannke-onchange="renderMovimentacao()"><option value="all">Conta</option></select><span id="tx-result-count" class="tx-result-badge hidden"></span></div><div class="mov-search-wrap mb-3"><i class="ph ph-magnifying-glass mov-search-icon"></i><input type="text" id="tx-search" class="form-control form-control-sm mov-search-input" placeholder="Buscar por descrição..." data-plannke-oninput="renderMovimentacao()" autocomplete="off"><button class="mov-search-clear hidden" id="tx-search-clear" data-plannke-onclick="clearTxSearch()" title="Limpar"><i class="ph ph-x"></i></button></div><div class="table-responsive d-none d-md-block"><table class="table table-hover align-middle mb-0"><thead><tr class="text-uppercase small text-muted"><th>Detalhes</th><th>Conta / Cartão</th><th>Valor</th><th class="text-end">Ações</th></tr></thead><tbody id="all-transactions-body"></tbody></table></div><ul class="list-unstyled mb-0 d-md-none" id="all-transactions-mobile"></ul></div></div>`,
  `<div id="mov-list-container" class="card"><div class="card-body"><div class="d-flex align-items-center gap-2 mb-2 flex-wrap"><h5 class="mb-0 fw-bold me-auto">Histórico de Transações</h5><select id="tx-filter" class="form-select form-select-sm mov-filter-select"><option value="all">Tipo</option><option value="income">Entradas</option><option value="expense">Gastos</option><option value="transfer">Transferências</option></select><select id="tx-filter-category" class="form-select form-select-sm mov-filter-select"><option value="all">Categoria</option></select><select id="tx-filter-account" class="form-select form-select-sm mov-filter-select"><option value="all">Conta</option></select><span id="tx-result-count" class="tx-result-badge hidden"></span></div><div class="mov-search-wrap mb-3"><i class="ph ph-magnifying-glass mov-search-icon"></i><input type="text" id="tx-search" class="form-control form-control-sm mov-search-input" placeholder="Buscar por descrição..." autocomplete="off"><button class="mov-search-clear hidden" id="tx-search-clear" title="Limpar"><i class="ph ph-x"></i></button></div><div class="table-responsive d-none d-md-block"><table class="table table-hover align-middle mb-0"><thead><tr class="text-uppercase small text-muted"><th>Detalhes</th><th>Conta / Cartão</th><th>Valor</th><th class="text-end">Ações</th></tr></thead><tbody id="all-transactions-body"></tbody></table></div><ul class="list-unstyled mb-0 d-md-none" id="all-transactions-mobile"></ul></div></div>`,
  'movement filters and search controls'
);
fs.writeFileSync(htmlPath, html);

let movements = fs.readFileSync(movementsPath, 'utf8');
movements = replaceExact(movements, '    let resizeAttached = false;\n', '    let resizeAttached = false;\n    let controlsBound = false;\n', 'movement control state');
const bindFunction = `    function bindMovementControls() {\n        if (controlsBound || typeof document === 'undefined') return;\n        controlsBound = true;\n\n        const renderCurrentMovement = () => renderMovimentacao(root.getData?.());\n        byId('mov-month-prev')?.addEventListener('click', () => changeMonth(-1));\n        byId('mov-month-next')?.addEventListener('click', () => changeMonth(1));\n        byId('btn-mov-list')?.addEventListener('click', () => setMovViewMode('list'));\n        byId('btn-mov-sankey')?.addEventListener('click', () => setMovViewMode('sankey'));\n        byId('btn-mov-sunburst')?.addEventListener('click', () => setMovViewMode('sunburst'));\n        ['tx-filter', 'tx-filter-category', 'tx-filter-account'].forEach(id => {\n            byId(id)?.addEventListener('change', renderCurrentMovement);\n        });\n        byId('tx-search')?.addEventListener('input', renderCurrentMovement);\n        byId('tx-search-clear')?.addEventListener('click', clearTxSearch);\n    }\n\n`;
movements = replaceExact(movements, '    const api = {\n', `${bindFunction}    const api = {\n`, 'movement control binder');
movements = replaceExact(movements, '        populateMovementFilters,\n', '        bindMovementControls,\n        populateMovementFilters,\n', 'movement control API');
movements = replaceExact(movements, '    root.PlannkeMovements = api;\n', '    root.PlannkeMovements = api;\n    bindMovementControls();\n', 'movement control boot binding');
fs.writeFileSync(movementsPath, movements);

let actions = fs.readFileSync(actionsPath, 'utf8');
actions = replaceExact(actions, `        'filterDashboardToTransactions', 'changeMonth', 'setMovViewMode',\n        'renderMovimentacao', 'clearTxSearch', 'openModal',`, `        'filterDashboardToTransactions',\n        'openModal',`, 'movement compatibility allowlist');
fs.writeFileSync(actionsPath, actions);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}
console.log('Bound static movement controls explicitly and retired their compatibility actions.');

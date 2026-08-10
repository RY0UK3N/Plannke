const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const entitiesPath = path.join(root, 'app-entities.js');
const actionsPath = path.join(root, 'app-actions.js');
const workflowPath = path.join(root, '.github', 'workflows', 'bind-entity-controls-once.yml');
const selfPath = __filename;

function replaceExact(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing exact marker for ${label}`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Multiple exact markers for ${label}`);
  return source.replace(before, after);
}

let html = fs.readFileSync(htmlPath, 'utf8');
html = replaceExact(
  html,
  `<div class="content-view hidden" id="accounts-view"><div class="d-flex justify-content-between align-items-center mb-3"><h5 class="mb-0 fw-bold">Contas Bancárias</h5><button class="btn btn-outline-primary btn-sm" data-plannke-onclick="openModal('accountModal')"><i class="ph ph-plus me-1"></i>Nova Conta</button></div><div class="row g-3 mb-4" id="accounts-grid"></div><div class="d-flex justify-content-between align-items-center mb-3"><h5 class="mb-0 fw-bold">Cartões de Crédito</h5><button class="btn btn-outline-primary btn-sm" data-plannke-onclick="openModal('cardModal')"><i class="ph ph-plus me-1"></i>Novo Cartão</button></div><div class="row g-3" id="cards-grid"></div></div>`,
  `<div class="content-view hidden" id="accounts-view"><div class="d-flex justify-content-between align-items-center mb-3"><h5 class="mb-0 fw-bold">Contas Bancárias</h5><button class="btn btn-outline-primary btn-sm" id="accounts-add-account"><i class="ph ph-plus me-1"></i>Nova Conta</button></div><div class="row g-3 mb-4" id="accounts-grid"></div><div class="d-flex justify-content-between align-items-center mb-3"><h5 class="mb-0 fw-bold">Cartões de Crédito</h5><button class="btn btn-outline-primary btn-sm" id="accounts-add-card"><i class="ph ph-plus me-1"></i>Novo Cartão</button></div><div class="row g-3" id="cards-grid"></div></div>`,
  'accounts creation controls'
);
html = replaceExact(
  html,
  `<select id="detail-period-select" class="form-select form-select-sm w-auto d-inline-block" data-plannke-onchange="window._detailContext?.onPeriodChange(this.value)"></select>`,
  `<select id="detail-period-select" class="form-select form-select-sm w-auto d-inline-block"></select>`,
  'detail period selector'
);
fs.writeFileSync(htmlPath, html);

let entities = fs.readFileSync(entitiesPath, 'utf8');
entities = replaceExact(entities, `    let formsBound = false;\n    let modalEventsBound = false;\n`, `    let formsBound = false;\n    let modalEventsBound = false;\n    let controlsBound = false;\n`, 'entity control state');
const binder = `    function bindEntityControls() {\n        if (controlsBound || typeof document === 'undefined') return;\n        controlsBound = true;\n        byId('accounts-add-account')?.addEventListener('click', () => root.bootstrap?.Modal?.getOrCreateInstance(byId('accountModal'))?.show());\n        byId('accounts-add-card')?.addEventListener('click', () => root.bootstrap?.Modal?.getOrCreateInstance(byId('cardModal'))?.show());\n        byId('detail-period-select')?.addEventListener('change', event => root._detailContext?.onPeriodChange?.(event.target.value));\n    }\n\n`;
entities = replaceExact(entities, `    function localToday() {\n`, `${binder}    function localToday() {\n`, 'entity control binder');
entities = replaceExact(entities, `        setupModalEvents,\n`, `        setupModalEvents,\n        bindEntityControls,\n`, 'entity control API');
entities = replaceExact(entities, `    root.PlannkeEntities = api;\n`, `    root.PlannkeEntities = api;\n    bindEntityControls();\n`, 'entity control boot binding');
fs.writeFileSync(entitiesPath, entities);

let actions = fs.readFileSync(actionsPath, 'utf8');
actions = replaceExact(actions, `        'openCategoryManager',\n        'openModal',\n        'switchCatTabModal',`, `        'openCategoryManager',\n        'switchCatTabModal',`, 'generic modal compatibility action');
actions = replaceExact(actions, `        if (/^window\\._detailContext\\?\\.onPeriodChange\\(this\\.value\\);?$/.test(value)) return 'detail-period';\n`, '', 'detail-period special kind');
actions = replaceExact(actions, `        if (kind === 'detail-period') {\n            root._detailContext?.onPeriodChange?.(element?.value);\n            return true;\n        }\n`, '', 'detail-period dispatch');
if (/detail-period|_detailContext\?\.onPeriodChange/.test(actions)) throw new Error('detail-period compatibility survived app-actions.js');
fs.writeFileSync(actionsPath, actions);

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}
console.log('Bound entity controls explicitly and retired generic modal/detail-period compatibility.');

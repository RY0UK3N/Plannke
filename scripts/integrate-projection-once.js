const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const projectionPath = path.join(root, 'app-projection.js');
const planningPath = path.join(root, 'app-planning.js');
const navigationPath = path.join(root, 'app-navigation.js');
const packagePath = path.join(root, 'package.json');
const swPath = path.join(root, 'sw.js');
const testsDir = path.join(root, 'tests');
const workflowPath = path.join(root, '.github', 'workflows', 'integrate-projection-once.yml');
const selfPath = __filename;

let projection = fs.readFileSync(projectionPath, 'utf8');
const apiMarker = '    const api = { buildProjectionModel, dispose, localDateString };';
const renderBlock = `    function renderChart(model) {
        const chartDom = document.getElementById('projectionChart');
        if (!chartDom || !root.echarts) return;
        if (projectionChart) {
            try { projectionChart.resize(); }
            catch (_) { dispose(); }
        }
        if (!projectionChart) {
            projectionChart = root.echarts.init(chartDom, null, { renderer: 'canvas' });
            if (!resizeAttached) {
                root.addEventListener?.('resize', () => projectionChart?.resize());
                resizeAttached = true;
            }
        }
        projectionChart.setOption({
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis', renderMode: 'richText',
                backgroundColor: '#1e1e2a', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
                textStyle: { color: '#f1f5f9', fontSize: 12 },
                formatter: params => {
                    if (!params?.length) return '';
                    return [params[0].name, ...params.map(item => '● ' + item.seriesName + ': ' + money(item.value))].join('\\n');
                }
            },
            legend: { data: ['Saldo Acumulado', 'Receitas', 'Despesas'], textStyle: { color: '#94a3b8', fontSize: 11 }, top: 0 },
            grid: { left: '3%', right: '4%', bottom: '8%', top: '14%', containLabel: true },
            xAxis: {
                type: 'category', data: model.labels,
                axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
                axisLabel: { color: '#94a3b8', fontSize: 11 }
            },
            yAxis: {
                type: 'value',
                axisLabel: { color: '#94a3b8', fontSize: 10, formatter: value => Math.abs(value) >= 1000 ? 'R$' + (value / 1000).toFixed(0) + 'k' : 'R$' + value.toFixed(0) },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } }
            },
            series: [
                {
                    name: 'Saldo Acumulado', type: 'line', data: model.balances, smooth: true,
                    symbol: 'circle', symbolSize: 6, lineStyle: { width: 3 }, itemStyle: { color: '#6366f1' },
                    areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [
                        { offset: 0, color: 'rgba(99,102,241,0.35)' }, { offset: 1, color: 'rgba(99,102,241,0.02)' }
                    ] } },
                    markLine: { silent: true, lineStyle: { color: 'rgba(255,255,255,0.15)', type: 'dashed' }, label: { show: false }, data: [{ yAxis: 0 }] }
                },
                { name: 'Receitas', type: 'bar', data: model.incomes, barMaxWidth: 18, itemStyle: { color: '#10b981', borderRadius: [4,4,0,0] } },
                { name: 'Despesas', type: 'bar', data: model.expenses, barMaxWidth: 18, itemStyle: { color: '#ef4444', borderRadius: [4,4,0,0] } }
            ]
        }, true);
    }

    function summaryItem(iconName, label, value, color = '') {
        const item = make('div', 'proj-summary-item');
        const labelNode = make('div', 'proj-summary-label');
        const labelIcon = icon(iconName);
        labelIcon.classList.add('me-1', 'opacity-75');
        labelNode.append(labelIcon, document.createTextNode(label));
        const valueNode = make('div', 'proj-summary-value', value);
        if (color) valueNode.style.color = color;
        item.append(labelNode, valueNode);
        return item;
    }

    function sourceNote(model) {
        const plural = model.source.count === 1 ? '' : 's';
        if (model.source.mode === 'planned-recurring') return 'Projeção baseada em ' + model.source.count + ' regra' + plural + ' recorrente' + plural + ' do Planejamento.';
        if (model.source.mode === 'legacy-recurring') return 'Projeção baseada em ' + model.source.count + ' lançamento' + plural + ' recorrente' + plural + ' legado' + plural + '.';
        if (model.source.mode === 'history') return 'Sem recorrentes cadastrados — usando média dos últimos ' + model.source.count + ' meses com movimentação.';
        return 'Cadastre recorrências no Planejamento para uma projeção mais precisa.';
    }

    function renderSummary(model) {
        const summary = document.getElementById('projection-summary-list');
        if (!summary) return;
        summary.replaceChildren();
        const deltaColor = model.balanceDelta >= 0 ? 'var(--color-primary)' : 'var(--color-expense)';
        const finalColor = model.finalBalance >= 0 ? 'var(--color-primary)' : 'var(--color-expense)';
        const averageColor = model.averageMonthlyDelta >= 0 ? 'var(--color-primary)' : 'var(--color-expense)';
        const negativeColor = model.negativeMonths > 0 ? 'var(--color-expense)' : '#10b981';
        summary.append(
            summaryItem('ph-wallet', 'Saldo Atual', money(model.initialBalance), 'var(--color-primary)'),
            summaryItem(model.balanceDelta >= 0 ? 'ph-trend-up' : 'ph-trend-down', model.balanceDelta >= 0 ? 'Crescimento projetado' : 'Queda projetada', (model.balanceDelta >= 0 ? '+' : '') + money(model.balanceDelta), deltaColor),
            summaryItem('ph-calendar-check', 'Saldo em ' + (model.labels[11] || '12 meses'), money(model.finalBalance), finalColor),
            make('div', 'proj-summary-divider'),
            summaryItem('ph-arrow-circle-up', 'Total receitas (12m)', money(model.totalIncome), '#10b981'),
            summaryItem('ph-arrow-circle-down', 'Total despesas (12m)', money(model.totalExpense), 'var(--color-expense)'),
            summaryItem('ph-piggy-bank', 'Economia/mês (média)', (model.averageMonthlyDelta >= 0 ? '+' : '') + money(model.averageMonthlyDelta), averageColor),
            make('div', 'proj-summary-divider'),
            summaryItem('ph-star', 'Melhor mês previsto', model.bestMonth),
            summaryItem('ph-warning', 'Meses no negativo', model.negativeMonths === 0 ? 'Nenhum ✓' : model.negativeMonths + (model.negativeMonths === 1 ? ' mês' : ' meses'), negativeColor),
            make('div', 'proj-summary-divider')
        );
        const note = make('div', 'tiny text-muted mt-2');
        note.style.lineHeight = '1.6';
        const info = icon('ph-info');
        info.classList.add('me-1');
        note.append(info, document.createTextNode(sourceNote(model)));
        summary.appendChild(note);
    }

    function renderProjection(data, options = {}) {
        const actual = data || root.getData?.();
        if (!actual) return;
        const model = buildProjectionModel(actual, options.today || localDateString());
        if (typeof document === 'undefined') return model;
        const view = document.getElementById('projecao-view');
        if (!view || view.classList.contains('hidden')) return model;
        renderChart(model);
        renderSummary(model);
        return model;
    }

    const api = { buildProjectionModel, renderProjection, renderSummary, dispose, localDateString };`;
if (!projection.includes('function renderProjection(data, options = {})')) {
  if (!projection.includes(apiMarker)) throw new Error('Projection API marker not found');
  projection = projection.replace(apiMarker, renderBlock);
}
fs.writeFileSync(projectionPath, projection);

let planning = fs.readFileSync(planningPath, 'utf8');
const oldPlanningState = `    let C = root.PlannkeCore || null;\n    let legacyProjection = typeof root.PlannkeProjectionBase === 'function' ? root.PlannkeProjectionBase : null;\n    let projectionBoundaryInstalled = false;\n    let projectionBoundaryLocked = false;`;
if (planning.includes(oldPlanningState)) planning = planning.replace(oldPlanningState, `    let C = root.PlannkeCore || null;`);

const planningStart = planning.indexOf('    function canonicalRenderProjection(data) {');
const planningEnd = planning.indexOf('    root.PlannkePlanning = api;', planningStart);
if (planningStart < 0 || planningEnd < 0) throw new Error('Planning projection bridge markers not found');
const planningTail = `    function canonicalRenderProjection(data) {
        const actual = data || root.getData?.();
        if (!actual) return;
        const result = root.PlannkeProjection?.renderProjection?.(buildProjectionData(actual));
        renderPlanningHub(actual);
        return result;
    }
    canonicalRenderProjection.__plannkeCanonicalPlanning = true;

    const api = {
        get ready() { return ready; },
        planningData,
        householdData,
        householdBalances,
        buildProjectionData,
        renderPlanningHub,
        handlePlanningAction,
        renderProjection: canonicalRenderProjection
    };

    const ready = waitForCore().then(core => {
        if (!core) throw new Error('PlannkeCore indisponível para o Planejamento.');
        if (!root.PlannkeProjection?.renderProjection) throw new Error('Runtime canônico de Projeção indisponível para o Planejamento.');
        C = core;
        root.renderProjection = canonicalRenderProjection;
        return api;
    });

`;
planning = planning.slice(0, planningStart) + planningTail + planning.slice(planningEnd);
if (/legacyProjection|PlannkeProjectionBase|projectionBoundaryLocked|installProjectionBoundary|releaseProjectionBoundary/.test(planning)) {
  throw new Error('Legacy projection bridge survived app-planning.js cleanup');
}
fs.writeFileSync(planningPath, planning);

let navigation = fs.readFileSync(navigationPath, 'utf8');
navigation = navigation.replace(/\n    if \(!root\.PlannkeProjectionBase[\s\S]*?\n    \}\n/, '\n');
const planningLoaderMarker = '    function loadPlanningRuntime() {';
const projectionLoader = `    function loadProjectionRuntime() {
        if (root.PlannkeProjection) return Promise.resolve(root.PlannkeProjection);
        if (typeof document === 'undefined') return Promise.resolve(null);
        const existing = document.querySelector('script[data-plannke-projection]');
        if (existing) {
            return new Promise((resolve, reject) => {
                if (root.PlannkeProjection) return resolve(root.PlannkeProjection);
                existing.addEventListener('load', () => resolve(root.PlannkeProjection || null), { once: true });
                existing.addEventListener('error', () => reject(new Error('Falha ao carregar runtime de Projeção.')), { once: true });
            });
        }
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'app-projection.js';
            script.async = false;
            script.dataset.plannkeProjection = 'true';
            script.addEventListener('load', () => resolve(root.PlannkeProjection || null), { once: true });
            script.addEventListener('error', () => reject(new Error('Falha ao carregar runtime de Projeção.')), { once: true });
            document.body.appendChild(script);
        });
    }

`;
if (!navigation.includes('function loadProjectionRuntime()')) {
  if (!navigation.includes(planningLoaderMarker)) throw new Error('Planning loader marker not found');
  navigation = navigation.replace(planningLoaderMarker, projectionLoader + planningLoaderMarker);
}
const navReplacements = [
  [
    '    const settingsReady = loadSettingsRuntime();\n    const planningReady = loadPlanningRuntime();',
    `    const settingsReady = loadSettingsRuntime();\n    const projectionReady = loadProjectionRuntime();\n    const planningReady = projectionReady.then(projection => {\n        if (!projection) throw new Error('Runtime canônico de Projeção não inicializou.');\n        return loadPlanningRuntime();\n    });`
  ],
  [
    '    root.PlannkeSettingsReady = settingsReady;\n    root.PlannkePlanningReady = planningReady;',
    '    root.PlannkeSettingsReady = settingsReady;\n    root.PlannkeProjectionReady = projectionReady;\n    root.PlannkePlanningReady = planningReady;'
  ],
  [
    'Promise.all([transactionsReady, dashboardReady, entitiesReady, settingsReady, planningReady, movementsReady, renderersReady])',
    'Promise.all([transactionsReady, dashboardReady, entitiesReady, settingsReady, projectionReady, planningReady, movementsReady, renderersReady])'
  ],
  [
    '.then(([transactions, dashboard, entities, settings, planning, movements, renderers]) => {',
    '.then(([transactions, dashboard, entities, settings, projection, planning, movements, renderers]) => {'
  ],
  [
    "                if (!settings) throw new Error('Runtime canônico de configurações não inicializou.');\n                if (!planning)",
    "                if (!settings) throw new Error('Runtime canônico de configurações não inicializou.');\n                if (!projection) throw new Error('Runtime canônico de Projeção não inicializou.');\n                if (!planning)"
  ],
  [
    '        loadSettingsRuntime,\n        loadPlanningRuntime,',
    '        loadSettingsRuntime,\n        loadProjectionRuntime,\n        loadPlanningRuntime,'
  ]
];
for (const [before, after] of navReplacements) {
  if (!navigation.includes(after)) {
    if (!navigation.includes(before)) throw new Error('Navigation projection integration marker missing: ' + before.slice(0, 70));
    navigation = navigation.replace(before, after);
  }
}
if (navigation.includes('PlannkeProjectionBase')) throw new Error('Projection capture survived navigation cleanup');
fs.writeFileSync(navigationPath, navigation);

let pkg = fs.readFileSync(packagePath, 'utf8');
if (!pkg.includes('node --check app-projection.js')) {
  pkg = pkg.replace('node --check app-dashboard.js &&', 'node --check app-dashboard.js && node --check app-projection.js &&');
}
fs.writeFileSync(packagePath, pkg);

let sw = fs.readFileSync(swPath, 'utf8');
if (!sw.includes("'./app-projection.js'")) {
  sw = sw.replace("  './app-dashboard.js',", "  './app-dashboard.js',\n  './app-projection.js',");
}
fs.writeFileSync(swPath, sw);

const oldPromiseRegex = 'Promise\\.all\\(\\[transactionsReady, dashboardReady, entitiesReady, settingsReady, planningReady, movementsReady, renderersReady\\]\\)';
const newPromiseRegex = 'Promise\\.all\\(\\[transactionsReady, dashboardReady, entitiesReady, settingsReady, projectionReady, planningReady, movementsReady, renderersReady\\]\\)';
for (const entry of fs.readdirSync(testsDir)) {
  if (!entry.endsWith('.test.js')) continue;
  const file = path.join(testsDir, entry);
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes(oldPromiseRegex)) {
    content = content.split(oldPromiseRegex).join(newPromiseRegex);
    fs.writeFileSync(file, content);
  }
}

for (const temporary of [workflowPath, selfPath]) {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}
console.log('Integrated canonical projection runtime and simplified planning projection bridge.');

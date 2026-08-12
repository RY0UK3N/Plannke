const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(rootDir, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(rootDir, file), content);

function replaceOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`missing migration anchor: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`duplicate migration anchor: ${label}`);
  return source.slice(0, first) + to + source.slice(first + from.length);
}

function completedDashboardData(data) {
    const today = localToday();
    return {
        ...data,
        transactions: (data?.transactions || []).filter(tx => tx.status !== 'planned' && String(tx.date || '') <= today)
    };
}

function pulseMetric(label, value, detail, stateClass = '') {
    const metric = make('div', `product-metric${stateClass ? ` ${stateClass}` : ''}`);
    metric.append(
        make('span', '', label),
        make('strong', '', value),
        make('small', '', detail)
    );
    return metric;
}

function renderFinancialPulse(data) {
    const dashboard = document.getElementById('dashboard-view');
    const core = root.PlannkeCore;
    if (!dashboard || typeof core?.getFinancialPulse !== 'function') return;

    let section = document.getElementById('financial-pulse');
    if (!section) {
        section = make('section', 'product-pulse mb-3');
        section.id = 'financial-pulse';
        dashboard.prepend(section);
    }

    const pulse = core.getFinancialPulse(data, localToday());
    const horizon = formatDate(pulse.horizon);
    const freeClass = Number(pulse.free || 0) >= 0 ? 'good' : 'bad';
    const insightText = Number(pulse.free || 0) < 0
        ? `Se todos os compromissos forem mantidos, faltam ${formatCurrency(Math.abs(pulse.free))} até ${horizon}.`
        : pulse.nextIncome
            ? `Você tem cerca de ${formatCurrency(pulse.daily)} por dia livres até a próxima entrada em ${horizon}.`
            : `Sem próxima entrada cadastrada; o cálculo usa o fim do mês (${horizon}).`;

    const heading = make('div', 'product-section-heading');
    const title = make('div');
    title.append(make('span', 'product-eyebrow', 'Visão rápida'), make('h5', '', 'Seu dinheiro hoje'));
    const privacy = make('span', 'product-privacy');
    privacy.append(icon('ph-device-mobile'), document.createTextNode(' dados locais'));
    heading.append(title, privacy);

    const grid = make('div', 'product-pulse-grid');
    grid.append(
        pulseMetric('Saldo atual', formatCurrency(pulse.balance), 'nas contas bancárias'),
        pulseMetric('Comprometido', formatCurrency(pulse.committed), 'cartões, reservas e previstos'),
        pulseMetric('Dinheiro livre', formatCurrency(pulse.free), `até ${horizon}`, freeClass),
        pulseMetric('Livre por dia', formatCurrency(pulse.daily), `${pulse.days} dia${pulse.days === 1 ? '' : 's'} no horizonte`)
    );

    const insight = make('div', 'product-insight');
    insight.append(icon('ph-sparkle'), make('span', '', insightText));
    section.replaceChildren(heading, grid, insight);
}

function onboardingModal() {
    if (typeof document === 'undefined') return null;
    const existing = document.getElementById('productOnboardingModal');
    if (existing) return existing;

    const modal = make('div', 'modal fade');
    modal.id = 'productOnboardingModal';
    modal.tabIndex = -1;
    const dialog = make('div', 'modal-dialog modal-dialog-centered');
    const content = make('div', 'modal-content product-onboarding');
    const body = make('div', 'modal-body p-4 p-md-5');
    const badge = make('div', 'product-onboarding-icon');
    badge.appendChild(icon('ph-wallet'));
    body.append(
        badge,
        make('span', 'product-eyebrow', 'Primeiros passos'),
        make('h3', 'fw-bold mt-1', 'Prepare seu Plannke'),
        make('p', 'text-muted small', 'Com três informações o Início já consegue calcular saldo, compromissos e dinheiro livre.')
    );

    const form = make('form');
    form.id = 'product-onboarding-form';

    const accountGroup = make('div', 'mb-3');
    accountGroup.appendChild(make('label', 'form-label small fw-semibold', 'Sua conta principal'));
    const accountName = input('accountName', 'text', 'Ex.: Nubank', { className: 'form-control mb-2', value: 'Conta principal', required: true });
    const balanceGroup = make('div', 'input-group');
    balanceGroup.append(make('span', 'input-group-text', 'R$'), input('balance', 'number', 'Saldo de hoje', { step: '0.01', required: true }));
    accountGroup.append(accountName, balanceGroup);

    const incomeGroup = make('div', 'mb-3');
    const incomeLabel = make('label', 'form-label small fw-semibold');
    incomeLabel.append(document.createTextNode('Renda mensal '), make('span', 'text-muted fw-normal', '(opcional)'));
    const incomeRow = make('div', 'row g-2');
    const incomeValueCol = make('div', 'col-8');
    const incomeValueGroup = make('div', 'input-group');
    incomeValueGroup.append(make('span', 'input-group-text', 'R$'), input('salary', 'number', 'Salário / renda', { min: 0, step: '0.01' }));
    incomeValueCol.appendChild(incomeValueGroup);
    const incomeDayCol = make('div', 'col-4');
    incomeDayCol.appendChild(input('salaryDay', 'number', 'Dia', { min: 1, max: 31 }));
    incomeRow.append(incomeValueCol, incomeDayCol);
    incomeGroup.append(incomeLabel, incomeRow);

    const cardDetails = make('details', 'product-details mb-3');
    cardDetails.appendChild(make('summary', '', 'Também uso cartão de crédito'));
    const cardWrap = make('div', 'mt-2');
    cardWrap.appendChild(input('cardName', 'text', 'Nome do cartão', { className: 'form-control mb-2' }));
    const cardRow = make('div', 'row g-2');
    const limitCol = make('div', 'col-6');
    limitCol.appendChild(input('cardLimit', 'number', 'Limite', { min: 0, step: '0.01' }));
    const closingCol = make('div', 'col-3');
    closingCol.appendChild(input('closingDay', 'number', 'Fecha', { min: 1, max: 31 }));
    const dueCol = make('div', 'col-3');
    dueCol.appendChild(input('dueDay', 'number', 'Vence', { min: 1, max: 31 }));
    cardRow.append(limitCol, closingCol, dueCol);
    cardWrap.appendChild(cardRow);
    cardDetails.appendChild(cardWrap);

    const submit = make('button', 'btn btn-primary w-100 rounded-pill py-2 fw-bold', 'Começar');
    submit.type = 'submit';
    const later = make('button', 'btn btn-link text-muted w-100 mt-2', 'Configurar depois');
    later.type = 'button';
    later.dataset.bsDismiss = 'modal';
    form.append(accountGroup, incomeGroup, cardDetails, submit);
    body.append(form, later);
    content.appendChild(body);
    dialog.appendChild(content);
    modal.appendChild(dialog);
    document.body.appendChild(modal);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        const data = root.getData();
        const planning = planningData(data);
        const accountId = root.generateId?.() || C.safeId('', 'account');
        const balance = Number(values.get('balance') || 0);
        data.accounts.push({
            id: accountId,
            name: clean(values.get('accountName') || 'Conta principal', 120),
            openingBalance: balance,
            balance
        });

        const salary = Number(values.get('salary') || 0);
        const salaryDay = Math.min(31, Math.max(1, Number(values.get('salaryDay') || 1)));
        if (salary > 0) {
            planning.recurringRules.push({
                id: C.safeId('', 'rule'),
                type: 'income',
                description: 'Renda mensal',
                category: 'Salário',
                amount: salary,
                dayOfMonth: salaryDay,
                accountId,
                startDate: C.localDateString(),
                endDate: '',
                active: true
            });
        }

        const cardName = clean(values.get('cardName'), 120);
        const limit = Number(values.get('cardLimit') || 0);
        if (cardName && limit > 0) {
            data.cards.push({
                id: root.generateId?.() || C.safeId('', 'card'),
                name: cardName,
                limit,
                closingDay: Math.min(31, Math.max(1, Number(values.get('closingDay') || 1))),
                dueDay: Math.min(31, Math.max(1, Number(values.get('dueDay') || 1)))
            });
        }

        planning.onboardingComplete = true;
        data.planning = C.sanitizePlanning(planning);
        root.saveData(data);
        root.bootstrap?.Modal.getInstance(modal)?.hide();
        root.renderAll?.();
        root.showToast?.('Plannke configurado.');
    });

    modal.addEventListener('hidden.bs.modal', () => {
        const data = root.getData();
        const planning = planningData(data);
        if (data.accounts.length && !planning.onboardingComplete) {
            planning.onboardingComplete = true;
            data.planning = C.sanitizePlanning(planning);
            root.saveData(data);
        }
    });
    return modal;
}

function maybeShowOnboarding() {
    if (typeof document === 'undefined' || !C || typeof root.getData !== 'function') return;
    const data = root.getData();
    const planning = planningData(data);
    if (data.accounts.length) {
        if (!planning.onboardingComplete) {
            planning.onboardingComplete = true;
            data.planning = C.sanitizePlanning(planning);
            root.saveData(data);
        }
        return;
    }
    if (planning.onboardingComplete) return;
    root.setTimeout?.(() => {
        const modal = onboardingModal();
        if (modal) root.bootstrap?.Modal.getOrCreateInstance(modal)?.show();
    }, 400);
}

// Safe renderers own the financial pulse and completed-dashboard projection.
let renderers = read('safe-renderers.js');
const rendererHelpers = [completedDashboardData, pulseMetric, renderFinancialPulse]
  .map(fn => `    ${fn.toString().replace(/\n/g, '\n    ')}`).join('\n\n');
renderers = replaceOnce(
  renderers,
  '    function safeRenderDashboard(data) {\n        const month = localToday().slice(0, 7);\n        const monthly = (data.transactions || []).filter(tx => String(tx.date || \'\').startsWith(month));\n',
  `${rendererHelpers}\n\n    function safeRenderDashboard(data) {\n        const completedData = completedDashboardData(data);\n        const month = localToday().slice(0, 7);\n        const monthly = completedData.transactions.filter(tx => String(tx.date || '').startsWith(month));\n`,
  'safe dashboard completed data'
);
renderers = replaceOnce(
  renderers,
  '        renderChart(data);\n        renderComparisonChart(data);\n        renderBudgets(data);\n',
  '        renderChart(completedData);\n        renderComparisonChart(data);\n        renderBudgets(completedData);\n        renderFinancialPulse(data);\n',
  'safe dashboard canonical enhancements'
);
renderers = replaceOnce(
  renderers,
  '        renderBudgets: safeRenderBudgets,\n        renderDashboard: safeRenderDashboard\n',
  '        renderBudgets: safeRenderBudgets,\n        renderDashboard: safeRenderDashboard,\n        renderFinancialPulse\n',
  'safe renderer pulse export'
);
write('safe-renderers.js', renderers);

// Planning owns onboarding state and creation flow.
let planning = read('app-planning.js');
const onboardingHelpers = [onboardingModal, maybeShowOnboarding]
  .map(fn => `    ${fn.toString().replace(/\n/g, '\n    ')}`).join('\n\n');
planning = replaceOnce(planning, '    const api = {\n', `${onboardingHelpers}\n\n    const api = {\n`, 'planning onboarding insertion');
planning = replaceOnce(
  planning,
  '        handlePlanningAction,\n        renderProjection: canonicalRenderProjection\n',
  '        handlePlanningAction,\n        onboardingModal,\n        maybeShowOnboarding,\n        renderProjection: canonicalRenderProjection\n',
  'planning onboarding exports'
);
write('app-planning.js', planning);

// Runtime invokes onboarding only after StorageAdapter-ready canonical init.
let runtime = read('app-runtime.js');
runtime = replaceOnce(
  runtime,
  "        root._navigateTo?.('dashboard');\n",
  "        root._navigateTo?.('dashboard');\n        root.PlannkePlanning?.maybeShowOnboarding?.();\n",
  'runtime onboarding orchestration'
);
write('app-runtime.js', runtime);

// Physically remove the compatibility runtime from source, PWA and CI.
let index = read('index.html');
index = replaceOnce(index, '    <script src="product.js"></script>\n', '', 'product runtime index script');
write('index.html', index);

let sw = read('sw.js');
sw = replaceOnce(sw, "const CACHE_NAME = 'plannke-shell-v38';", "const CACHE_NAME = 'plannke-shell-v39';", 'PWA cache retirement bump');
sw = replaceOnce(sw, "  './product.js',\n", '', 'product runtime cache entry');
write('sw.js', sw);

let pkg = read('package.json');
pkg = replaceOnce(pkg, ' && node --check product.js', '', 'product runtime syntax check');
write('package.json', pkg);

fs.rmSync(path.join(rootDir, 'product.js'));

// Historical contracts become permanent absence guards.
write('tests/product-boot-retirement.test.js', `const test = require('node:test');\nconst assert = require('node:assert/strict');\nconst fs = require('node:fs');\nconst path = require('node:path');\n\nconst root = path.resolve(__dirname, '..');\nconst boot = fs.readFileSync(path.join(root, 'app-boot.js'), 'utf8');\nconst index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');\n\ntest('canonical boot owns optional insights and PWA registration', () => {\n  assert.match(boot, /function loadProductEnhancements\\(/);\n  assert.match(boot, /script\\.src = 'insights\\.js'/);\n  assert.match(boot, /serviceWorker\\.register\\('\.\\/sw\\.js'\\)/);\n});\n\ntest('retired product compatibility runtime cannot reclaim boot ownership', () => {\n  assert.equal(fs.existsSync(path.join(root, 'product.js')), false);\n  assert.equal(index.indexOf('product.js'), -1);\n  assert.match(index, /<link rel=\"manifest\" href=\"manifest\\.webmanifest\">/);\n  assert.match(index, /<link rel=\"stylesheet\" href=\"product\\.css\">/);\n});\n\ntest('one-time product boot migration artifacts are not shipped', () => {\n  assert.equal(fs.existsSync(path.join(root, 'scripts', 'promote-product-boot-once.js')), false);\n  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'promote-product-boot-once.yml')), false);\n});\n`);

write('tests/product-navigation-retirement.test.js', `const test = require('node:test');\nconst assert = require('node:assert/strict');\nconst fs = require('node:fs');\nconst path = require('node:path');\n\nconst root = path.resolve(__dirname, '..');\nconst navigation = fs.readFileSync(path.join(root, 'app-navigation.js'), 'utf8');\nconst presentation = fs.readFileSync(path.join(root, 'app-presentation.js'), 'utf8');\n\ntest('retired product layer cannot reach navigation markup', () => {\n  assert.equal(fs.existsSync(path.join(root, 'product.js')), false);\n  assert.doesNotMatch(navigation, /planner-pill-nav/);\n  assert.doesNotMatch(presentation, /planner-pill-nav/);\n});\n\ntest('canonical navigation remains the only product workspace navigation boundary', () => {\n  assert.match(navigation, /function navigateTo\\(target\\)/);\n  assert.match(navigation, /root\\._navigateTo = navigateTo/);\n  assert.match(presentation, /root\\._navigateTo\\(target\\)/);\n});\n\ntest('one-time product navigation retirement artifacts are not shipped', () => {\n  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-product-nav-fallback-once.js')), false);\n  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-product-nav-fallback-once.yml')), false);\n});\n`);

let ledgerTest = read('tests/product-ledger-retirement.test.js');
ledgerTest = replaceOnce(ledgerTest, "const product = fs.readFileSync(path.join(root, 'product.js'), 'utf8');\n", "const productPath = path.join(root, 'product.js');\n", 'ledger product fixture');
ledgerTest = ledgerTest.replace(/  assert\.doesNotMatch\(product, \/prepareProductData\/\);\n/g, "  assert.equal(fs.existsSync(productPath), false);\n");
ledgerTest = ledgerTest.replace(/  assert\.doesNotMatch\(product, \/function installLedgerHooks\\\(\|__productWrapped\|globalThis\\\.saveAccount =\|globalThis\\\.saveTransaction =\/\);\n/g, "  assert.equal(fs.existsSync(productPath), false);\n");
ledgerTest = ledgerTest.replace(/  assert\.doesNotMatch\(product, \/tx-status\|tx-tags\|tx-paid-by\|tx-shared-with\|function injectTransactionFields\\\(\/\);\n/g, "  assert.equal(fs.existsSync(productPath), false);\n");
write('tests/product-ledger-retirement.test.js', ledgerTest);

let legacy = read('tests/legacy-runtime-retirement.test.js');
legacy = replaceOnce(legacy, "const product = fs.readFileSync(path.join(root, 'product.js'), 'utf8');\n", "const productPath = path.join(root, 'product.js');\n", 'legacy product fixture');
legacy = replaceOnce(
  legacy,
  "test('product layer no longer owns the planning projection runtime', () => {\n  assert.doesNotMatch(product, /const originalProjection = globalThis\\.renderProjection/);\n  assert.doesNotMatch(product, /function renderPlanningHub\\(|function attachPlanningEvents\\(|function householdBalances\\(/);\n  assert.match(planning, /function canonicalRenderProjection\\(/);\n  assert.match(planning, /function renderPlanningHub\\(/);\n  assert.match(product, /globalThis\\.PlannkeProduct=\\{init\\};/);\n  assert.doesNotMatch(movementSearch, /PlannkeProduct\\.householdBalances/);\n  assert.match(planning, /householdBalances,/);\n});\n",
  "test('retired product layer cannot own planning projection runtime', () => {\n  assert.equal(fs.existsSync(productPath), false);\n  assert.match(planning, /function canonicalRenderProjection\\(/);\n  assert.match(planning, /function renderPlanningHub\\(/);\n  assert.doesNotMatch(movementSearch, /PlannkeProduct\\.householdBalances/);\n  assert.match(planning, /householdBalances,/);\n});\n",
  'legacy product planning contract'
);
write('tests/legacy-runtime-retirement.test.js', legacy);

let boundary = read('tests/rendering-boundary.test.js');
boundary = replaceOnce(
  boundary,
  "test('pure product core loads before boot while rendering boundary precedes compatibility product runtime', () => {\n  const coreAt = index.indexOf('src=\"product-core.js\"');\n  const navigationAt = index.indexOf('src=\"app-navigation.js\"');\n  const shellAt = index.indexOf('src=\"app-shell.js\"');\n  const bootAt = index.indexOf('src=\"app-boot.js\"');\n  const renderersAt = index.indexOf('src=\"safe-renderers.js\"');\n  const productAt = index.indexOf('src=\"product.js\"');\n  assert.ok(coreAt >= 0 && navigationAt > coreAt && shellAt > navigationAt && bootAt > shellAt);\n  assert.ok(renderersAt > bootAt && productAt > renderersAt);\n  assert.equal(index.indexOf('src=\"ui-bridge.js\"'), -1);\n  assert.equal(index.indexOf('src=\"app-actions.js\"'), -1);\n  assert.doesNotMatch(sw, /'\\.\\/app-actions\\.js'/);\n  assert.match(sw, /'\\.\\/safe-renderers\\.js'/);\n  assert.doesNotMatch(pkg, /node --check app-actions\\.js/);\n  assert.match(pkg, /node --check safe-renderers\\.js/);\n});\n",
  "test('pure product core loads before boot and compatibility product runtime is retired', () => {\n  const coreAt = index.indexOf('src=\"product-core.js\"');\n  const navigationAt = index.indexOf('src=\"app-navigation.js\"');\n  const shellAt = index.indexOf('src=\"app-shell.js\"');\n  const bootAt = index.indexOf('src=\"app-boot.js\"');\n  const renderersAt = index.indexOf('src=\"safe-renderers.js\"');\n  assert.ok(coreAt >= 0 && navigationAt > coreAt && shellAt > navigationAt && bootAt > shellAt);\n  assert.ok(renderersAt > bootAt);\n  assert.equal(index.indexOf('src=\"product.js\"'), -1);\n  assert.equal(index.indexOf('src=\"ui-bridge.js\"'), -1);\n  assert.equal(index.indexOf('src=\"app-actions.js\"'), -1);\n  assert.doesNotMatch(sw, /'\\.\\/product\\.js'/);\n  assert.doesNotMatch(pkg, /node --check product\\.js/);\n});\n",
  'rendering boundary final product contract'
);
write('tests/rendering-boundary.test.js', boundary);

let safeTest = read('tests/safe-renderers.test.js');
safeTest = replaceOnce(
  safeTest,
  "test('pure product core loads before boot while safe renderers precede compatibility product runtime', () => {\n  const core = index.indexOf('<script src=\"product-core.js\"></script>');\n  const runtime = index.indexOf('<script src=\"app-runtime.js\"></script>');\n  const boot = index.indexOf('<script src=\"app-boot.js\"></script>');\n  const safe = index.indexOf('<script src=\"safe-renderers.js\"></script>');\n  const product = index.indexOf('<script src=\"product.js\"></script>');\n  assert.ok(core >= 0 && core < runtime, 'product-core.js must load before application orchestration');\n  assert.ok(boot > runtime && safe > boot, 'safe-renderers.js must load after canonical boot');\n  assert.equal(index.indexOf('<script src=\"app.js\"></script>'), -1);\n  assert.ok(product > safe, 'product.js compatibility runtime must remain after safe renderers');\n});\n",
  "test('pure product core loads before boot and safe renderers need no product compatibility runtime', () => {\n  const core = index.indexOf('<script src=\"product-core.js\"></script>');\n  const runtime = index.indexOf('<script src=\"app-runtime.js\"></script>');\n  const boot = index.indexOf('<script src=\"app-boot.js\"></script>');\n  const safe = index.indexOf('<script src=\"safe-renderers.js\"></script>');\n  assert.ok(core >= 0 && core < runtime, 'product-core.js must load before application orchestration');\n  assert.ok(boot > runtime && safe > boot, 'safe-renderers.js must load after canonical boot');\n  assert.equal(index.indexOf('<script src=\"app.js\"></script>'), -1);\n  assert.equal(index.indexOf('<script src=\"product.js\"></script>'), -1);\n});\n",
  'safe renderer final product contract'
);
write('tests/safe-renderers.test.js', safeTest);

let security = read('tests/security-shell.test.js');
security = replaceOnce(security, "const product = fs.readFileSync(path.join(root, 'product.js'), 'utf8');\n", '', 'security product fixture');
security = replaceOnce(security, "  assert.match(index, /<script src=\"product\\.js\"><\\/script>/);\n", "  assert.equal(index.indexOf('product.js'), -1);\n", 'security product script');
security = replaceOnce(security, "  assert.ok(index.indexOf('safe-renderers.js') < index.indexOf('product.js'));\n", "  assert.ok(index.indexOf('app-boot.js') < index.indexOf('safe-renderers.js'));\n", 'security product order');
security = replaceOnce(security, "  assert.doesNotMatch(product, /function (?:injectBankImport|importBankFile)\\(/);\n", "  assert.equal(fs.existsSync(path.join(root, 'product.js')), false);\n", 'security bank product absence');
security = security.replace("'product-core.js', 'product.js', 'insights.js'", "'product-core.js', 'insights.js'");
write('tests/security-shell.test.js', security);

const finalTest = `const test = require('node:test');\nconst assert = require('node:assert/strict');\nconst fs = require('node:fs');\nconst path = require('node:path');\n\nconst root = path.resolve(__dirname, '..');\nconst index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');\nconst sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');\nconst pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');\nconst renderers = fs.readFileSync(path.join(root, 'safe-renderers.js'), 'utf8');\nconst planning = fs.readFileSync(path.join(root, 'app-planning.js'), 'utf8');\nconst runtime = fs.readFileSync(path.join(root, 'app-runtime.js'), 'utf8');\n\ntest('product compatibility runtime is physically retired everywhere', () => {\n  assert.equal(fs.existsSync(path.join(root, 'product.js')), false);\n  assert.equal(index.indexOf('product.js'), -1);\n  assert.doesNotMatch(sw, /'\\.\\/product\\.js'/);\n  assert.doesNotMatch(pkg, /node --check product\\.js/);\n  assert.match(sw, /plannke-shell-v39/);\n});\n\ntest('safe rendering boundary owns financial pulse without HTML strings', () => {\n  assert.match(renderers, /function renderFinancialPulse\\(/);\n  assert.match(renderers, /PlannkeCore/);\n  assert.match(renderers, /getFinancialPulse/);\n  assert.match(renderers, /section\\.replaceChildren\\(heading, grid, insight\\)/);\n  assert.match(renderers, /renderFinancialPulse\\(data\\)/);\n  assert.doesNotMatch(renderers, /\\.innerHTML\\s*=/);\n});\n\ntest('dashboard charts totals and budgets use completed transactions through today', () => {\n  assert.match(renderers, /function completedDashboardData\\(/);\n  assert.match(renderers, /tx\\.status !== 'planned'/);\n  assert.match(renderers, /String\\(tx\\.date \\|\\| ''\\) <= today/);\n  assert.match(renderers, /renderChart\\(completedData\\)/);\n  assert.match(renderers, /renderBudgets\\(completedData\\)/);\n  assert.match(renderers, /renderComparisonChart\\(data\\)/);\n});\n\ntest('planning owns DOM-safe onboarding and runtime invokes it after canonical init', () => {\n  assert.match(planning, /function onboardingModal\\(/);\n  assert.match(planning, /function maybeShowOnboarding\\(/);\n  assert.match(planning, /onboardingComplete/);\n  assert.match(planning, /planning\\.recurringRules\\.push/);\n  assert.match(planning, /onboardingModal,/);\n  assert.match(planning, /maybeShowOnboarding,/);\n  assert.doesNotMatch(planning, /\\.innerHTML\\s*=/);\n  assert.match(runtime, /root\\.PlannkePlanning\\?\\.maybeShowOnboarding\\?\\.\\(\\)/);\n});\n\ntest('one-time final product runtime retirement artifacts are not shipped', () => {\n  assert.equal(fs.existsSync(path.join(root, 'scripts', 'retire-product-runtime-once.js')), false);\n  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'retire-product-runtime-once.yml')), false);\n});\n`;
write('tests/product-runtime-retirement.test.js', finalTest);

// Fail the migration if application references remain outside permanent absence tests/docs.
for (const file of ['index.html', 'sw.js', 'package.json', 'app-runtime.js', 'app-navigation.js', 'app-boot.js', 'safe-renderers.js', 'app-planning.js']) {
  if (read(file).includes('product.js')) throw new Error(`retired product.js still referenced by ${file}`);
}

fs.rmSync(path.join(rootDir, 'scripts', 'retire-product-runtime-once.js'));
fs.rmSync(path.join(rootDir, '.github', 'workflows', 'retire-product-runtime-once.yml'));
console.log('[product runtime] pulse/onboarding promoted and product.js physically retired');

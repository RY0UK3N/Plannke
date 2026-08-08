/* Plannke desktop/tablet visual shell.
   Keeps finance logic untouched and reorganizes the existing views for larger screens. */
(function (root) {
    'use strict';

    const PAGES = {
        dashboard: {
            label: 'Início',
            icon: 'ph-house',
            eyebrow: 'Visão financeira',
            title: 'Seu dinheiro, com contexto',
            subtitle: 'Saldo, compromissos e próximos passos em uma única visão.'
        },
        movimentacao: {
            label: 'Movimentações',
            icon: 'ph-arrows-left-right',
            eyebrow: 'Histórico',
            title: 'Movimentações',
            subtitle: 'Encontre, filtre e revise tudo o que entrou, saiu ou foi transferido.'
        },
        projecao: {
            label: 'Planejamento',
            icon: 'ph-target',
            eyebrow: 'Futuro',
            title: 'Planejamento',
            subtitle: 'Recorrências, metas, reservas e calendário financeiro.'
        },
        accounts: {
            label: 'Contas e cartões',
            icon: 'ph-wallet',
            eyebrow: 'Patrimônio',
            title: 'Contas e cartões',
            subtitle: 'Saldos, limites, faturas e meios de pagamento.'
        },
        backup: {
            label: 'Backup',
            icon: 'ph-floppy-disk',
            eyebrow: 'Memory Card',
            title: 'Backup e importação',
            subtitle: 'Leve seus dados com você e importe extratos sem conectar seu banco.'
        }
    };
    const VIEW_STYLES = ['revamp-dashboard.css', 'revamp-movements.css', 'revamp-planning.css'];
    const PLANNING_TABS = [
        { id: 'overview', label: 'Visão geral', icon: 'ph-squares-four' },
        { id: 'recurring', label: 'Compromissos', icon: 'ph-repeat' },
        { id: 'goals', label: 'Objetivos', icon: 'ph-target' },
        { id: 'household', label: 'Casa e regras', icon: 'ph-users-three' }
    ];

    let initialized = false;
    let pageObserver = null;
    let dashboardObserver = null;
    let planningObserver = null;
    let activePlanningTab = 'overview';

    function make(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function makeIcon(name) {
        return make('i', `ph ${name}`);
    }

    function ensureViewStyles() {
        VIEW_STYLES.forEach(asset => {
            if (document.querySelector(`link[href="${asset}"]`)) return;
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = asset;
            link.dataset.plannkeRevampView = asset;
            document.head.appendChild(link);
        });
    }

    function findLegacyNavigation(target) {
        return [...document.querySelectorAll('.planner-pill-nav [data-target]')]
            .find(link => link.dataset.target === target) || null;
    }

    function navigate(target) {
        const link = findLegacyNavigation(target);
        if (link) {
            link.click();
            window.setTimeout(syncPage, 0);
            return;
        }
        if (typeof root._navigateTo === 'function') {
            root._navigateTo(target);
            window.setTimeout(syncPage, 0);
        }
    }

    function createBrand() {
        const brand = make('div', 'revamp-brand');
        const mark = make('div', 'revamp-brand-mark', 'P');
        const copy = make('div', 'revamp-brand-copy');
        copy.append(
            make('strong', '', 'Plannke'),
            make('span', '', 'Finanças pessoais')
        );
        brand.append(mark, copy);
        return brand;
    }

    function createNavigation() {
        const nav = make('nav', 'revamp-nav');
        nav.setAttribute('aria-label', 'Navegação principal');
        Object.entries(PAGES).forEach(([target, page]) => {
            const button = make('button', 'revamp-nav-item');
            button.type = 'button';
            button.dataset.target = target;
            button.setAttribute('aria-label', page.label);
            button.append(makeIcon(page.icon), make('span', 'revamp-nav-label', page.label));
            button.addEventListener('click', () => navigate(target));
            nav.appendChild(button);
        });
        return nav;
    }

    function createSidebar() {
        const aside = make('aside', 'revamp-sidebar');
        aside.id = 'revamp-sidebar';
        aside.append(createBrand(), createNavigation());

        const spacer = make('div', 'revamp-sidebar-spacer');
        const local = make('div', 'revamp-local-status');
        local.append(makeIcon('ph-shield-check'), make('span', '', 'Dados locais'));

        const settings = make('button', 'revamp-settings');
        settings.type = 'button';
        settings.setAttribute('aria-label', 'Configurações');
        settings.append(makeIcon('ph-gear'), make('span', '', 'Configurações'));
        settings.addEventListener('click', () => root.openSettingsPanel?.());

        aside.append(spacer, local, settings);
        return aside;
    }

    function createTopbar() {
        const topbar = make('header', 'revamp-topbar');
        topbar.id = 'revamp-topbar';

        const copy = make('div', 'revamp-topbar-copy');
        const eyebrow = make('span', 'revamp-page-eyebrow');
        eyebrow.id = 'revamp-page-eyebrow';
        const title = make('h1', 'revamp-page-title');
        title.id = 'revamp-page-title';
        const subtitle = make('p', 'revamp-page-subtitle');
        subtitle.id = 'revamp-page-subtitle';
        copy.append(eyebrow, title, subtitle);

        const actions = make('div', 'revamp-topbar-actions');
        const add = make('button', 'revamp-primary-action');
        add.type = 'button';
        add.append(makeIcon('ph-plus'), make('span', '', 'Nova movimentação'));
        add.addEventListener('click', () => root.openTxModal?.(null));
        actions.appendChild(add);

        topbar.append(copy, actions);
        return topbar;
    }

    function buildShell() {
        if (document.getElementById('revamp-shell')) return;
        const main = document.querySelector('main');
        if (!main || !main.parentNode) return;

        const shell = make('div', 'revamp-shell');
        shell.id = 'revamp-shell';
        const content = make('div', 'revamp-content');
        content.id = 'revamp-content';
        const parent = main.parentNode;

        parent.insertBefore(shell, main);
        shell.appendChild(createSidebar());
        shell.appendChild(content);
        content.append(createTopbar(), main);
        document.body.classList.add('plannke-revamp');
        document.body.dataset.revampVersion = '1';
    }

    function currentTarget() {
        const visible = [...document.querySelectorAll('.content-view')]
            .find(view => !view.classList.contains('hidden'));
        return visible?.id?.replace(/-view$/, '') || 'dashboard';
    }

    function syncPage() {
        const target = currentTarget();
        const page = PAGES[target] || PAGES.dashboard;
        document.body.dataset.revampView = target;
        const eyebrow = document.getElementById('revamp-page-eyebrow');
        const title = document.getElementById('revamp-page-title');
        const subtitle = document.getElementById('revamp-page-subtitle');
        if (eyebrow) eyebrow.textContent = page.eyebrow;
        if (title) title.textContent = page.title;
        if (subtitle) subtitle.textContent = page.subtitle;

        document.querySelectorAll('.revamp-nav-item').forEach(button => {
            const active = button.dataset.target === target;
            button.classList.toggle('active', active);
            button.setAttribute('aria-current', active ? 'page' : 'false');
        });
        if (target === 'projecao') decoratePlanning();
    }

    function arrangeDashboardPrimary(dashboard) {
        let primary = document.getElementById('revamp-dashboard-primary');
        if (!primary) {
            primary = make('div', 'revamp-dashboard-primary');
            primary.id = 'revamp-dashboard-primary';
            dashboard.prepend(primary);
        }

        const pulse = document.getElementById('financial-pulse');
        const insights = document.getElementById('product-smart-insights');
        if (pulse && pulse.parentElement !== primary) primary.appendChild(pulse);
        if (insights && insights.parentElement !== primary) primary.appendChild(insights);
        if (pulse) pulse.classList.add('revamp-financial-pulse');
        if (insights) insights.classList.add('revamp-smart-insights');
    }

    function decorateDashboard() {
        const dashboard = document.getElementById('dashboard-view');
        if (!dashboard) return;
        dashboard.classList.add('revamp-dashboard');
        arrangeDashboardPrimary(dashboard);

        const rows = [...dashboard.children].filter(node => node.classList?.contains('row'));
        const names = [
            'revamp-dashboard-accounts',
            'revamp-dashboard-analysis',
            'revamp-dashboard-activity',
            'revamp-dashboard-comparison'
        ];
        rows.forEach((row, index) => {
            if (names[index]) row.classList.add(names[index]);
        });

        const balanceLabel = dashboard.querySelector('.balance-label');
        if (balanceLabel) balanceLabel.textContent = 'Saldo nas contas';
    }

    function money(value) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
            .format(Number(value || 0));
    }

    function planningSnapshot() {
        try {
            const data = typeof root.getData === 'function' ? root.getData() : null;
            if (!data) return null;
            const planning = data.planning && typeof data.planning === 'object' ? data.planning : {};
            const recurring = (Array.isArray(planning.recurringRules) ? planning.recurringRules : [])
                .filter(rule => rule.active !== false);
            const goals = Array.isArray(planning.goals) ? planning.goals : [];
            const reserves = Array.isArray(planning.reserves) ? planning.reserves : [];
            const rules = Array.isArray(planning.categoryRules) ? planning.categoryRules : [];
            const members = Array.isArray(data.settings?.household?.members) ? data.settings.household.members : [];
            const recurringExpense = recurring.filter(rule => rule.type === 'expense')
                .reduce((sum, rule) => sum + Number(rule.amount || 0), 0);
            const recurringIncome = recurring.filter(rule => rule.type === 'income')
                .reduce((sum, rule) => sum + Number(rule.amount || 0), 0);
            const totalReserved = reserves.reduce((sum, reserve) => sum + Number(reserve.amount || 0), 0)
                + goals.reduce((sum, goal) => sum + Number(goal.currentAmount || 0), 0);

            const core = root.PlannkeCore;
            const now = new Date();
            const fallbackToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const today = core?.localDateString ? core.localDateString() : fallbackToday;
            const end = core?.addDays ? core.addDays(today, 45) : today;
            const calendar = core?.buildFinancialCalendar ? core.buildFinancialCalendar(data, today, end) : [];
            const upcomingExpenses = calendar.filter(item => item.type === 'expense');
            const upcomingExpenseTotal = upcomingExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);

            return {
                totalReserved,
                recurringExpense,
                recurringIncome,
                upcomingExpenseTotal,
                upcomingExpenseCount: upcomingExpenses.length,
                recurringCount: recurring.length,
                objectiveCount: goals.length + reserves.length,
                householdCount: members.length + rules.length
            };
        } catch (error) {
            console.warn('Resumo de planejamento indisponível:', error);
            return null;
        }
    }

    function planningMetric(label, value, note, iconName) {
        const card = make('article', 'revamp-planning-metric');
        const head = make('div', 'revamp-planning-metric-head');
        const iconWrap = make('span', 'revamp-planning-metric-icon');
        iconWrap.appendChild(makeIcon(iconName));
        head.append(make('span', '', label), iconWrap);
        const copy = make('div');
        copy.append(make('strong', '', value), make('small', '', note));
        card.append(head, copy);
        return card;
    }

    function planningTabButton(tab, count) {
        const button = make('button', 'revamp-planning-tab');
        button.type = 'button';
        button.role = 'tab';
        button.dataset.planningTab = tab.id;
        button.setAttribute('aria-selected', tab.id === activePlanningTab ? 'true' : 'false');
        button.append(makeIcon(tab.icon), make('span', '', tab.label));
        if (Number.isFinite(count)) button.appendChild(make('span', 'revamp-planning-tab-count', count));
        button.addEventListener('click', () => applyPlanningTab(document.getElementById('projecao-view'), tab.id));
        return button;
    }

    function ensurePlanningControls(view, hub) {
        let controls = document.getElementById('revamp-planning-overview');
        if (!controls) {
            controls = make('section', 'revamp-planning-overview');
            controls.id = 'revamp-planning-overview';
            const summary = make('div', 'revamp-planning-summary');
            summary.id = 'revamp-planning-summary';
            const tabs = make('div', 'revamp-planning-tabs');
            tabs.id = 'revamp-planning-tabs';
            tabs.role = 'tablist';
            tabs.setAttribute('aria-label', 'Áreas do planejamento');
            controls.append(summary, tabs);
            view.insertBefore(controls, hub);
        }

        const snapshot = planningSnapshot();
        const summary = document.getElementById('revamp-planning-summary');
        if (summary) {
            summary.replaceChildren();
            const state = snapshot || {
                totalReserved: 0,
                recurringExpense: 0,
                recurringIncome: 0,
                upcomingExpenseTotal: 0,
                upcomingExpenseCount: 0
            };
            summary.append(
                planningMetric('Reservado', money(state.totalReserved), 'metas + reservas separadas', 'ph-vault'),
                planningMetric('Fixos por mês', money(state.recurringExpense), `${snapshot?.recurringCount || 0} recorrência${snapshot?.recurringCount === 1 ? '' : 's'} cadastrada${snapshot?.recurringCount === 1 ? '' : 's'}`, 'ph-repeat'),
                planningMetric('Renda recorrente', money(state.recurringIncome), 'base mensal cadastrada', 'ph-trend-up'),
                planningMetric('Próximos 45 dias', money(state.upcomingExpenseTotal), `${state.upcomingExpenseCount} saída${state.upcomingExpenseCount === 1 ? '' : 's'} prevista${state.upcomingExpenseCount === 1 ? '' : 's'}`, 'ph-calendar-dots')
            );
        }

        const tabs = document.getElementById('revamp-planning-tabs');
        if (tabs) {
            tabs.replaceChildren();
            const counts = {
                overview: null,
                recurring: snapshot?.recurringCount || 0,
                goals: snapshot?.objectiveCount || 0,
                household: snapshot?.householdCount || 0
            };
            PLANNING_TABS.forEach(tab => tabs.appendChild(planningTabButton(tab, counts[tab.id])));
        }
    }

    function markPlanningPanel(hub, formSelector, section, className) {
        const form = hub.querySelector(formSelector);
        const card = form?.closest('.card');
        const wrapper = card?.parentElement;
        const panel = wrapper?.classList?.contains('col-12') ? wrapper : card;
        if (!panel) return null;
        panel.dataset.revampPlanningSection = section;
        if (className) panel.classList.add(className);
        return panel;
    }

    function classifyPlanningPanels(view, hub) {
        const grid = hub.querySelector(':scope > .row');
        if (grid) grid.classList.add('revamp-planning-grid');

        markPlanningPanel(hub, '#product-recurring-form', 'recurring', 'revamp-planning-panel-recurring');
        markPlanningPanel(hub, '#product-goal-form', 'goals', 'revamp-planning-panel-goals');
        markPlanningPanel(hub, '#product-reserve-form', 'goals', 'revamp-planning-panel-goals');
        markPlanningPanel(hub, '#product-category-rule-form', 'household', 'revamp-planning-panel-household');
        markPlanningPanel(hub, '#product-member-form', 'household', 'revamp-planning-panel-household');

        const calendarCard = hub.querySelector('.product-calendar')?.closest('.card');
        if (calendarCard) {
            calendarCard.dataset.revampPlanningSection = 'overview';
            calendarCard.classList.add('revamp-planning-calendar');
        }

        const directChildren = [...view.children];
        const projectionIntro = directChildren.find(node => node !== hub && node.classList?.contains('card') && node.classList.contains('bg-glass'));
        if (projectionIntro) projectionIntro.classList.add('revamp-projection-intro');
        const projectionRow = directChildren.find(node => node.classList?.contains('row') && node.querySelector?.('#projectionChart'));
        if (projectionRow) {
            projectionRow.dataset.revampPlanningSection = 'overview';
            projectionRow.classList.add('revamp-projection-row');
        }
    }

    function applyPlanningTab(view, tab) {
        if (!view) return;
        const valid = PLANNING_TABS.some(item => item.id === tab) ? tab : 'overview';
        activePlanningTab = valid;
        view.dataset.planningTab = valid;
        const wideLayout = typeof root.matchMedia === 'function' ? root.matchMedia('(min-width: 768px)').matches : true;

        view.querySelectorAll('.revamp-planning-tab').forEach(button => {
            button.setAttribute('aria-selected', button.dataset.planningTab === valid ? 'true' : 'false');
        });
        view.querySelectorAll('[data-revamp-planning-section]').forEach(panel => {
            panel.hidden = wideLayout ? panel.dataset.revampPlanningSection !== valid : false;
        });

        const grid = view.querySelector('#product-planning-hub > .revamp-planning-grid');
        if (grid) grid.hidden = wideLayout ? valid === 'overview' : false;
    }

    function decoratePlanning() {
        const view = document.getElementById('projecao-view');
        const hub = document.getElementById('product-planning-hub');
        if (!view) return;
        view.classList.add('revamp-planning');
        if (!hub) return;
        ensurePlanningControls(view, hub);
        classifyPlanningPanels(view, hub);
        applyPlanningTab(view, activePlanningTab);
    }

    function decorateViews() {
        decorateDashboard();
        document.getElementById('movimentacao-view')?.classList.add('revamp-movements');
        decoratePlanning();
        document.getElementById('accounts-view')?.classList.add('revamp-accounts');
        document.getElementById('backup-view')?.classList.add('revamp-backup');
    }

    function observeViews() {
        if (pageObserver) pageObserver.disconnect();
        pageObserver = new MutationObserver(syncPage);
        document.querySelectorAll('.content-view').forEach(view => {
            pageObserver.observe(view, { attributes: true, attributeFilter: ['class'] });
        });

        const dashboard = document.getElementById('dashboard-view');
        if (dashboard) {
            if (dashboardObserver) dashboardObserver.disconnect();
            dashboardObserver = new MutationObserver(decorateDashboard);
            dashboardObserver.observe(dashboard, { childList: true });
        }

        const planningHub = document.getElementById('product-planning-hub');
        if (planningHub) {
            if (planningObserver) planningObserver.disconnect();
            planningObserver = new MutationObserver(() => window.setTimeout(decoratePlanning, 0));
            planningObserver.observe(planningHub, { childList: true, subtree: true });
        }
    }

    function init() {
        if (initialized || typeof document === 'undefined') return;
        initialized = true;
        ensureViewStyles();
        buildShell();
        decorateViews();
        syncPage();
        observeViews();
        root.addEventListener?.('plannke:data-changed', () => window.setTimeout(decorateViews, 0));
        root.addEventListener?.('resize', () => window.setTimeout(() => {
            const planning = document.getElementById('projecao-view');
            if (planning) applyPlanningTab(planning, activePlanningTab);
        }, 0));
    }

    root.PlannkeRevamp = { init, navigate, syncPage, applyPlanningTab, pages: PAGES, planningTabs: PLANNING_TABS };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})(typeof globalThis !== 'undefined' ? globalThis : window);
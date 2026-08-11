/* Plannke canonical presentation layer.
   Keeps finance logic untouched and decorates the shell owned by app-shell.js. */
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
            label: 'Dados',
            icon: 'ph-database',
            eyebrow: 'Dados locais',
            title: 'Dados e relatórios',
            subtitle: 'Exporte relatórios e importe extratos para revisão sem conectar seu banco.'
        }
    };
    const VIEW_STYLES = ['revamp-dashboard.css', 'revamp-movements.css', 'revamp-planning.css', 'revamp-accounts.css'];
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
    let accountsObserver = null;
    let planningDecorateScheduled = false;
    let accountsDecorateScheduled = false;
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

    function addClassOnce(element, className) {
        if (element && !element.classList.contains(className)) element.classList.add(className);
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

    function navigate(target) {
        if (typeof root._navigateTo !== 'function') return;
        root._navigateTo(target);
        window.setTimeout(syncPage, 0);
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
        addClassOnce(pulse, 'revamp-financial-pulse');
        addClassOnce(insights, 'revamp-smart-insights');
    }

    function decorateDashboard() {
        const dashboard = document.getElementById('dashboard-view');
        if (!dashboard) return;
        addClassOnce(dashboard, 'revamp-dashboard');
        arrangeDashboardPrimary(dashboard);

        const rows = [...dashboard.children].filter(node => node.classList?.contains('row'));
        const names = [
            'revamp-dashboard-accounts',
            'revamp-dashboard-analysis',
            'revamp-dashboard-activity',
            'revamp-dashboard-comparison'
        ];
        rows.forEach((row, index) => {
            if (names[index]) addClassOnce(row, names[index]);
        });

        const balanceLabel = dashboard.querySelector('.balance-label');
        if (balanceLabel && balanceLabel.textContent !== 'Saldo nas contas') balanceLabel.textContent = 'Saldo nas contas';
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
        if (panel.dataset.revampPlanningSection !== section) panel.dataset.revampPlanningSection = section;
        if (className) addClassOnce(panel, className);
        return panel;
    }

    function classifyPlanningPanels(view, hub) {
        const grid = hub.querySelector(':scope > .row');
        addClassOnce(grid, 'revamp-planning-grid');

        markPlanningPanel(hub, '#product-recurring-form', 'recurring', 'revamp-planning-panel-recurring');
        markPlanningPanel(hub, '#product-goal-form', 'goals', 'revamp-planning-panel-goals');
        markPlanningPanel(hub, '#product-reserve-form', 'goals', 'revamp-planning-panel-goals');
        markPlanningPanel(hub, '#product-category-rule-form', 'household', 'revamp-planning-panel-household');
        markPlanningPanel(hub, '#product-member-form', 'household', 'revamp-planning-panel-household');

        const calendarCard = hub.querySelector('.product-calendar')?.closest('.card');
        if (calendarCard) {
            if (calendarCard.dataset.revampPlanningSection !== 'overview') calendarCard.dataset.revampPlanningSection = 'overview';
            addClassOnce(calendarCard, 'revamp-planning-calendar');
        }

        const directChildren = [...view.children];
        const projectionIntro = directChildren.find(node => node !== hub && node.classList?.contains('card') && node.classList.contains('bg-glass'));
        addClassOnce(projectionIntro, 'revamp-projection-intro');
        const projectionRow = directChildren.find(node => node.classList?.contains('row') && node.querySelector?.('#projectionChart'));
        if (projectionRow) {
            if (projectionRow.dataset.revampPlanningSection !== 'overview') projectionRow.dataset.revampPlanningSection = 'overview';
            addClassOnce(projectionRow, 'revamp-projection-row');
        }
    }

    function applyPlanningTab(view, tab) {
        if (!view) return;
        const valid = PLANNING_TABS.some(item => item.id === tab) ? tab : 'overview';
        activePlanningTab = valid;
        if (view.dataset.planningTab !== valid) view.dataset.planningTab = valid;
        const wideLayout = typeof root.matchMedia === 'function' ? root.matchMedia('(min-width: 768px)').matches : true;

        view.querySelectorAll('.revamp-planning-tab').forEach(button => {
            const selected = button.dataset.planningTab === valid ? 'true' : 'false';
            if (button.getAttribute('aria-selected') !== selected) button.setAttribute('aria-selected', selected);
        });
        view.querySelectorAll('[data-revamp-planning-section]').forEach(panel => {
            const shouldHide = wideLayout ? panel.dataset.revampPlanningSection !== valid : false;
            if (panel.hidden !== shouldHide) panel.hidden = shouldHide;
        });

        const grid = view.querySelector('#product-planning-hub > .revamp-planning-grid');
        if (grid) {
            const shouldHideGrid = wideLayout ? valid === 'overview' : false;
            if (grid.hidden !== shouldHideGrid) grid.hidden = shouldHideGrid;
        }
    }

    function decoratePlanning() {
        const view = document.getElementById('projecao-view');
        const hub = document.getElementById('product-planning-hub');
        if (!view) return;
        addClassOnce(view, 'revamp-planning');
        if (!hub) return;
        ensurePlanningControls(view, hub);
        classifyPlanningPanels(view, hub);
        applyPlanningTab(view, activePlanningTab);
    }

    function schedulePlanningDecoration() {
        if (planningDecorateScheduled) return;
        planningDecorateScheduled = true;
        window.setTimeout(() => {
            planningDecorateScheduled = false;
            decoratePlanning();
        }, 0);
    }

    function accountSnapshot() {
        try {
            const data = typeof root.getData === 'function' ? root.getData() : null;
            if (!data) return null;
            const accounts = Array.isArray(data.accounts) ? data.accounts : [];
            const cards = Array.isArray(data.cards) ? data.cards : [];
            const accountBalance = accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
            const cardLimit = cards.reduce((sum, card) => sum + Number(card.limit || 0), 0);
            const cardOutstanding = cards.reduce((sum, card) => {
                const value = typeof root.getOutstandingCardBalance === 'function'
                    ? root.getOutstandingCardBalance(data, card.id)
                    : 0;
                return sum + Number(value || 0);
            }, 0);
            const cardAvailable = cardLimit - cardOutstanding;
            const afterCards = accountBalance - cardOutstanding;
            const utilization = cardLimit > 0 ? cardOutstanding / cardLimit * 100 : 0;
            return {
                accountBalance,
                cardOutstanding,
                cardLimit,
                cardAvailable,
                afterCards,
                utilization,
                accountCount: accounts.length,
                cardCount: cards.length
            };
        } catch (error) {
            console.warn('Resumo de contas indisponível:', error);
            return null;
        }
    }

    function accountsMetric(label, value, note, iconName, tone = '') {
        const card = make('article', `revamp-accounts-metric${tone ? ` ${tone}` : ''}`);
        const head = make('div', 'revamp-accounts-metric-head');
        const iconWrap = make('span', 'revamp-accounts-metric-icon');
        iconWrap.appendChild(makeIcon(iconName));
        head.append(make('span', '', label), iconWrap);
        const copy = make('div');
        copy.append(make('strong', 'revamp-accounts-metric-value', value), make('small', '', note));
        card.append(head, copy);
        return card;
    }

    function ensureAccountsOverview(view) {
        let overview = document.getElementById('revamp-accounts-overview');
        if (!overview) {
            overview = make('section', 'revamp-accounts-overview');
            overview.id = 'revamp-accounts-overview';
            const summary = make('div', 'revamp-accounts-summary');
            summary.id = 'revamp-accounts-summary';
            const context = make('div', 'revamp-accounts-context');
            context.id = 'revamp-accounts-context';
            overview.append(summary, context);
            view.prepend(overview);
        }

        const snapshot = accountSnapshot() || {
            accountBalance: 0,
            cardOutstanding: 0,
            cardLimit: 0,
            cardAvailable: 0,
            afterCards: 0,
            utilization: 0,
            accountCount: 0,
            cardCount: 0
        };
        const summary = document.getElementById('revamp-accounts-summary');
        if (summary) {
            summary.replaceChildren(
                accountsMetric('Saldo nas contas', money(snapshot.accountBalance), `${snapshot.accountCount} conta${snapshot.accountCount === 1 ? '' : 's'} bancária${snapshot.accountCount === 1 ? '' : 's'}`, 'ph-bank', 'primary'),
                accountsMetric('Faturas pendentes', money(snapshot.cardOutstanding), `${snapshot.cardCount} cartão${snapshot.cardCount === 1 ? '' : 'ões'} · ${Math.round(snapshot.utilization)}% do limite`, 'ph-receipt', snapshot.utilization >= 80 ? 'warning' : ''),
                accountsMetric('Limite disponível', money(snapshot.cardAvailable), `de ${money(snapshot.cardLimit)} em limites`, 'ph-credit-card'),
                accountsMetric('Após cartões', money(snapshot.afterCards), 'saldo atual menos faturas não pagas', 'ph-scales', snapshot.afterCards < 0 ? 'warning' : '')
            );
        }

        const context = document.getElementById('revamp-accounts-context');
        if (context) {
            context.replaceChildren();
            const warning = snapshot.afterCards < 0 && snapshot.cardOutstanding > 0;
            context.classList.toggle('warning', warning);
            context.appendChild(makeIcon(warning ? 'ph-warning-circle' : 'ph-info'));
            let message = 'Nenhuma fatura pendente. O saldo nas contas está totalmente livre de cartões.';
            if (warning) {
                message = `As faturas pendentes superam o saldo atual nas contas em ${money(Math.abs(snapshot.afterCards))}.`;
            } else if (snapshot.cardOutstanding > 0) {
                message = `Se você separar agora o valor das faturas pendentes, restam ${money(snapshot.afterCards)} nas contas.`;
            } else if (!snapshot.accountCount && !snapshot.cardCount) {
                message = 'Adicione uma conta ou cartão para começar a montar sua visão patrimonial.';
            }
            context.appendChild(make('span', '', message));
        }
    }

    function decorateAccounts() {
        const view = document.getElementById('accounts-view');
        if (!view) return;
        addClassOnce(view, 'revamp-accounts');
        ensureAccountsOverview(view);

        const accountsGrid = document.getElementById('accounts-grid');
        const cardsGrid = document.getElementById('cards-grid');
        const accountHead = accountsGrid?.previousElementSibling;
        const cardHead = cardsGrid?.previousElementSibling;
        [accountHead, cardHead].forEach(head => {
            if (!head) return;
            addClassOnce(head, 'revamp-entity-section-head');
            const button = head.querySelector('button');
            addClassOnce(button, 'revamp-add-entity');
        });
        addClassOnce(accountsGrid, 'revamp-account-grid');
        addClassOnce(cardsGrid, 'revamp-card-grid');
    }

    function scheduleAccountsDecoration() {
        if (accountsDecorateScheduled) return;
        accountsDecorateScheduled = true;
        window.setTimeout(() => {
            accountsDecorateScheduled = false;
            decorateAccounts();
        }, 0);
    }

    function decorateViews() {
        decorateDashboard();
        addClassOnce(document.getElementById('movimentacao-view'), 'revamp-movements');
        decoratePlanning();
        decorateAccounts();
        addClassOnce(document.getElementById('backup-view'), 'revamp-backup');
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
            planningObserver = new MutationObserver(schedulePlanningDecoration);
            planningObserver.observe(planningHub, { childList: true });
        }

        const accountsGrid = document.getElementById('accounts-grid');
        const cardsGrid = document.getElementById('cards-grid');
        if (accountsGrid || cardsGrid) {
            if (accountsObserver) accountsObserver.disconnect();
            accountsObserver = new MutationObserver(scheduleAccountsDecoration);
            if (accountsGrid) accountsObserver.observe(accountsGrid, { childList: true });
            if (cardsGrid) accountsObserver.observe(cardsGrid, { childList: true });
        }
    }

    function init() {
        if (initialized || typeof document === 'undefined') return;
        initialized = true;
        ensureViewStyles();
        decorateViews();
        syncPage();
        observeViews();
        root.addEventListener?.('plannke:data-changed', () => window.setTimeout(decorateViews, 0));
        root.addEventListener?.('resize', () => window.setTimeout(() => {
            const planning = document.getElementById('projecao-view');
            if (planning) applyPlanningTab(planning, activePlanningTab);
        }, 0));
    }

    root.PlannkeRevamp = {
        init,
        navigate,
        syncPage,
        applyPlanningTab,
        accountSnapshot,
        pages: PAGES,
        planningTabs: PLANNING_TABS
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})(typeof globalThis !== 'undefined' ? globalThis : window);
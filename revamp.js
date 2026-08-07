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

    let initialized = false;
    let pageObserver = null;
    let dashboardObserver = null;

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
        if (document.querySelector('link[data-plannke-revamp-dashboard]')) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'revamp-dashboard.css';
        link.dataset.plannkeRevampDashboard = 'true';
        document.head.appendChild(link);
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

    function decorateViews() {
        decorateDashboard();
        document.getElementById('movimentacao-view')?.classList.add('revamp-movements');
        document.getElementById('projecao-view')?.classList.add('revamp-planning');
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
    }

    root.PlannkeRevamp = { init, navigate, syncPage, pages: PAGES };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})(typeof globalThis !== 'undefined' ? globalThis : window);

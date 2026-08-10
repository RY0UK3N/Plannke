/* Plannke canonical movement navigation, filters and flow visualizations. */
(function (root) {
    'use strict';

    let currentMonth = null;
    let availableMonths = [];
    let fluxoChart = null;
    let movementViewMode = 'list';
    let resizeAttached = false;

    function byId(id) {
        return document.getElementById(id);
    }

    function localMonth() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    function formatCurrency(value) {
        return typeof root.formatCurrency === 'function'
            ? root.formatCurrency(Number(value || 0))
            : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
    }

    function appendOption(parent, value, label, selected = false) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        option.selected = selected;
        parent.appendChild(option);
        return option;
    }

    function populateMovementFilters(data) {
        const categorySelect = byId('tx-filter-category');
        const accountSelect = byId('tx-filter-account');
        if (!categorySelect || !accountSelect) return;

        const previousCategory = categorySelect.value || 'all';
        const previousAccount = accountSelect.value || 'all';
        const categories = [...new Set(
            (data?.transactions || [])
                .filter(tx => tx.category && tx.type !== 'transfer')
                .map(tx => String(tx.category))
        )].sort((a, b) => a.localeCompare(b, 'pt-BR'));

        categorySelect.replaceChildren();
        appendOption(categorySelect, 'all', 'Categoria', previousCategory === 'all');
        categories.forEach(category => appendOption(categorySelect, category, category, category === previousCategory));
        if (!categories.includes(previousCategory)) categorySelect.value = 'all';

        accountSelect.replaceChildren();
        appendOption(accountSelect, 'all', 'Conta', previousAccount === 'all');

        if (data?.accounts?.length) {
            const accounts = document.createElement('optgroup');
            accounts.label = 'Contas Bancárias';
            data.accounts.forEach(account => appendOption(accounts, account.id, account.name, account.id === previousAccount));
            accountSelect.appendChild(accounts);
        }
        if (data?.cards?.length) {
            const cards = document.createElement('optgroup');
            cards.label = 'Cartões de Crédito';
            data.cards.forEach(card => appendOption(cards, card.id, card.name, card.id === previousAccount));
            accountSelect.appendChild(cards);
        }

        const knownEntity = [...(data?.accounts || []), ...(data?.cards || [])].some(entity => entity.id === previousAccount);
        if (previousAccount !== 'all' && !knownEntity) accountSelect.value = 'all';
    }

    function monthSet(data) {
        const months = new Set();
        (data?.transactions || []).forEach(tx => {
            const value = String(tx.date || '').slice(0, 7);
            if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) months.add(value);
        });
        if (!months.size) months.add(localMonth());
        return [...months].sort();
    }

    function updateMonthNavigator(month) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))) return;
        const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const [year, monthNumber] = month.split('-');
        const label = `${months[Number(monthNumber) - 1]} ${year}`;
        document.querySelectorAll('.month-text, .fluxo-month-text').forEach(node => { node.textContent = label; });
    }

    function renderMonthTabs(data) {
        availableMonths = monthSet(data);
        if (!currentMonth || !availableMonths.includes(currentMonth)) {
            const today = localMonth();
            currentMonth = availableMonths.includes(today) ? today : availableMonths[availableMonths.length - 1];
        }
        updateMonthNavigator(currentMonth);
        return currentMonth;
    }

    function clearTxSearch() {
        const input = byId('tx-search');
        if (input) {
            input.value = '';
            input.focus();
        }
        byId('tx-search-clear')?.classList.add('hidden');
        renderMovimentacao(root.getData?.());
    }

    function filterDashboardToTransactions(filter = 'all') {
        const input = byId('tx-filter');
        if (input) input.value = ['income', 'expense', 'transfer'].includes(filter) ? filter : 'all';
        movementViewMode = 'list';
        root._navigateTo?.('movimentacao');
    }

    function setMovViewMode(mode) {
        if (!['list', 'sankey', 'sunburst'].includes(mode)) return;
        movementViewMode = mode;
        ['list', 'sankey', 'sunburst'].forEach(candidate => {
            const button = byId(`btn-mov-${candidate}`);
            if (!button) return;
            const active = candidate === mode;
            button.classList.toggle('active', active);
            button.classList.toggle('btn-primary', active);
            button.classList.toggle('btn-outline-light', !active);
        });
        root.renderAll?.();
    }

    function changeMonth(direction) {
        if (!availableMonths.length) renderMonthTabs(root.getData?.());
        const index = availableMonths.indexOf(currentMonth);
        const next = Math.max(0, Math.min(availableMonths.length - 1, index + Number(direction || 0)));
        if (next === index || next < 0) return;
        currentMonth = availableMonths[next];
        renderMovimentacao(root.getData?.());
        updateMonthNavigator(currentMonth);
    }

    function movementTransactions(data, month = currentMonth || localMonth()) {
        return (data?.transactions || []).filter(tx => String(tx.date || '').startsWith(month));
    }

    function buildSankeyModel(data, month = currentMonth || localMonth()) {
        const transactions = movementTransactions(data, month);
        const incomes = transactions.filter(tx => tx.type === 'income');
        const expenses = transactions.filter(tx => tx.type === 'expense');
        const nodes = [{ name: 'Budget' }];
        const links = [];
        const nodeNames = new Set(['Budget']);

        const addCategory = name => {
            if (nodeNames.has(name)) return;
            nodes.push({ name });
            nodeNames.add(name);
        };

        const incomeByCategory = new Map();
        incomes.forEach(tx => {
            const category = tx.category || 'Outros Rendimentos';
            incomeByCategory.set(category, (incomeByCategory.get(category) || 0) + Number(tx.amount || 0));
        });
        incomeByCategory.forEach((value, category) => {
            addCategory(category);
            links.push({ source: category, target: 'Budget', value });
        });

        const expenseByCategory = new Map();
        expenses.forEach(tx => {
            const category = tx.category || 'Outras Despesas';
            expenseByCategory.set(category, (expenseByCategory.get(category) || 0) + Number(tx.amount || 0));
        });
        expenseByCategory.forEach((value, category) => {
            addCategory(category);
            links.push({ source: 'Budget', target: category, value });
        });

        return { nodes, links, empty: !incomes.length && !expenses.length };
    }

    function categoryColor(category) {
        return typeof root._getCatColor === 'function' ? root._getCatColor(category) : '#475569';
    }

    function buildSunburstModel(data, month = currentMonth || localMonth()) {
        const transactions = movementTransactions(data, month);
        const expenses = transactions.filter(tx => tx.type === 'expense');
        const incomeCount = transactions.filter(tx => tx.type === 'income').length;
        const categories = new Map();
        let totalExpense = 0;

        expenses.forEach(tx => {
            const category = tx.category || 'Outros';
            const amount = Number(tx.amount || 0);
            if (!categories.has(category)) categories.set(category, { total: 0, items: [] });
            const bucket = categories.get(category);
            bucket.total += amount;
            bucket.items.push({ name: tx.description || 'Sem descrição', value: amount });
            totalExpense += amount;
        });

        return {
            totalExpense,
            empty: !incomeCount && !expenses.length,
            categories: [...categories.entries()].map(([name, value]) => ({ name, ...value }))
        };
    }

    function getFluxoChart(chartDom) {
        if (!root.echarts || !chartDom) return null;
        if (fluxoChart) {
            try { fluxoChart.resize(); }
            catch (_) {
                try { fluxoChart.dispose(); } catch (_) {}
                fluxoChart = null;
            }
        }
        if (!fluxoChart) {
            fluxoChart = root.echarts.init(chartDom, null, { renderer: 'canvas' });
            if (!resizeAttached) {
                root.addEventListener?.('resize', () => fluxoChart?.resize());
                resizeAttached = true;
            }
        }
        return fluxoChart;
    }

    function disposeChart() {
        if (!fluxoChart) return;
        try { fluxoChart.dispose(); } catch (_) {}
        fluxoChart = null;
    }

    function setFlowEmpty(chart, message) {
        chart?.setOption({
            backgroundColor: 'transparent',
            graphic: [{
                type: 'text', left: 'center', top: 'middle',
                style: { text: message, fill: '#64748b', fontSize: 14, fontFamily: 'Inter, sans-serif' }
            }],
            series: []
        }, true);
    }

    function renderSankey(data) {
        const chart = getFluxoChart(byId('sankeyChart'));
        if (!chart) return;
        const month = currentMonth || renderMonthTabs(data);
        updateMonthNavigator(month);
        const model = buildSankeyModel(data, month);
        if (model.empty) return setFlowEmpty(chart, 'Nenhum dado para este mês.');

        chart.setOption({
            backgroundColor: 'transparent',
            graphic: [],
            tooltip: {
                trigger: 'item', triggerOn: 'mousemove', renderMode: 'richText',
                backgroundColor: '#1e1e2a', borderColor: 'rgba(255,255,255,0.1)',
                textStyle: { color: '#f1f5f9' },
                formatter: params => params.dataType === 'node'
                    ? `${params.name}: ${formatCurrency(params.value)}`
                    : `${params.data.source} → ${params.data.target}\n${formatCurrency(params.value)}`
            },
            series: [{
                type: 'sankey', layout: 'none', emphasis: { focus: 'adjacency' },
                data: model.nodes, links: model.links,
                lineStyle: { color: 'gradient', curveness: 0.5 },
                label: { color: '#f1f5f9', fontWeight: 'bold' },
                itemStyle: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }
            }]
        }, true);
    }

    function renderSunburst(data) {
        const chart = getFluxoChart(byId('sankeyChart'));
        if (!chart) return;
        const month = currentMonth || renderMonthTabs(data);
        updateMonthNavigator(month);
        const model = buildSunburstModel(data, month);
        if (model.empty) return setFlowEmpty(chart, 'Nenhum dado para este mês.');

        const dark = document.documentElement.getAttribute('data-bs-theme') !== 'light';
        const labelColor = dark ? '#94a3b8' : '#334155';
        const tooltipBg = dark ? '#1c1c22' : '#ffffff';
        const tooltipBorder = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)';
        const tooltipText = dark ? '#f1f5f9' : '#0f172a';
        const borderColor = dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.8)';

        const seriesData = model.categories.map(category => ({
            name: category.name,
            value: category.total,
            itemStyle: { color: categoryColor(category.name), borderColor, borderWidth: 2 },
            label: { color: labelColor },
            children: category.items.map(item => ({
                name: item.name,
                value: item.value,
                itemStyle: { opacity: 0.75, borderColor, borderWidth: 1 },
                label: { color: labelColor }
            }))
        }));

        chart.setOption({
            backgroundColor: 'transparent',
            graphic: [],
            tooltip: {
                renderMode: 'richText', backgroundColor: tooltipBg, borderColor: tooltipBorder,
                borderWidth: 1, textStyle: { color: tooltipText, fontSize: 13 },
                formatter: params => {
                    const percent = model.totalExpense > 0 ? ((Number(params.value || 0) / model.totalExpense) * 100).toFixed(1) : '0.0';
                    return `${params.name}\n${formatCurrency(params.value)} (${percent}%)`;
                }
            },
            series: [{
                type: 'sunburst', data: seriesData, radius: [0, '95%'], sort: 'desc',
                emphasis: { focus: 'ancestor' }, nodeClick: 'link',
                levels: [
                    {},
                    { r0: '15%', r: '48%', label: { rotate: 'tangential', fontSize: 11, fontWeight: 'bold', color: labelColor }, itemStyle: { borderWidth: 2, borderColor } },
                    { r0: '48%', r: '78%', label: { position: 'outside', padding: 3, silent: false, fontSize: 10, color: labelColor }, itemStyle: { borderWidth: 1, borderColor, opacity: 0.82 } }
                ]
            }]
        }, true);
    }

    function renderMovimentacao(data) {
        const view = byId('movimentacao-view');
        if (!view || view.classList.contains('hidden')) return;
        data = data || root.getData?.();
        if (!data) return;
        if (!currentMonth) renderMonthTabs(data);

        const list = byId('mov-list-container');
        const chart = byId('mov-chart-container');
        const title = byId('mov-chart-title');
        if (!list || !chart) return;

        if (movementViewMode === 'list') {
            list.classList.remove('hidden');
            chart.classList.add('hidden');
            root.renderTransactions?.(data);
        } else {
            list.classList.add('hidden');
            chart.classList.remove('hidden');
            if (title) title.textContent = movementViewMode === 'sankey' ? 'Fluxo de Caminhos (Sankey)' : 'Distribuição Solar (Hierarquia)';
            if (movementViewMode === 'sankey') renderSankey(data);
            else renderSunburst(data);
        }
        updateMonthNavigator(currentMonth);
    }

    const api = {
        get currentMonth() { return currentMonth; },
        get availableMonths() { return [...availableMonths]; },
        get viewMode() { return movementViewMode; },
        populateMovementFilters,
        renderMonthTabs,
        renderMovimentacao,
        renderSankey,
        renderSunburst,
        buildSankeyModel,
        buildSunburstModel,
        setMovViewMode,
        changeMonth,
        clearTxSearch,
        filterDashboardToTransactions,
        updateMonthNavigator,
        disposeChart
    };

    root._populateMovFilters = populateMovementFilters;
    root.renderMonthTabs = renderMonthTabs;
    root.renderMovimentacao = renderMovimentacao;
    root.renderSankey = renderSankey;
    root.renderSunburst = renderSunburst;
    root.setMovViewMode = setMovViewMode;
    root.changeMonth = changeMonth;
    root.clearTxSearch = clearTxSearch;
    root.filterDashboardToTransactions = filterDashboardToTransactions;
    root.updateMonthNavigator = updateMonthNavigator;
    root.PlannkeMovements = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* Plannke canonical 12-month projection runtime. */
(function (root) {
    'use strict';

    let projectionChart = null;
    let resizeAttached = false;

    function make(tag, className, textValue) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (textValue !== undefined && textValue !== null) node.textContent = String(textValue);
        return node;
    }

    function icon(name) {
        return make('i', `ph ${name}`);
    }

    function localDateString(date = new Date()) {
        if (root.PlannkeCore?.localDateString) return root.PlannkeCore.localDateString(date);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function parseLocalDate(dateString) {
        const match = String(dateString || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;
        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function number(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function money(value) {
        if (typeof root.formatCurrency === 'function') return root.formatCurrency(number(value));
        return root.PlannkeMoney.formatMoney(number(value));
    }

    function projectionMonths(today, count = 12) {
        const base = parseLocalDate(today) || new Date();
        const months = [];
        for (let index = 0; index < count; index++) {
            const date = new Date(base.getFullYear(), base.getMonth() + index, 1);
            months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
        }
        return months;
    }

    function historicalAverage(transactions, today) {
        const base = parseLocalDate(today) || new Date();
        const months = [];
        for (let index = 1; index <= 3; index++) {
            const date = new Date(base.getFullYear(), base.getMonth() - index, 1);
            months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
        }
        let income = 0;
        let expense = 0;
        let countedMonths = 0;
        months.forEach(month => {
            const monthly = transactions.filter(tx => String(tx.date || '').startsWith(month) && tx.type !== 'transfer');
            if (!monthly.length) return;
            countedMonths += 1;
            monthly.forEach(tx => {
                if (tx.type === 'income') income += number(tx.amount);
                if (tx.type === 'expense') expense += number(tx.amount);
            });
        });
        return {
            income: countedMonths ? income / countedMonths : 0,
            expense: countedMonths ? expense / countedMonths : 0,
            countedMonths
        };
    }

    function buildProjectionModel(data, today = localDateString()) {
        const transactions = Array.isArray(data?.transactions) ? data.transactions : [];
        const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
        const initialBalance = accounts.reduce((sum, account) => sum + number(account.balance), 0);
        const months = projectionMonths(today, 12);
        const future = Object.fromEntries(months.map(month => [month, { income: 0, expense: 0 }]));
        const legacyRecurring = transactions.filter(tx => tx.recurring && String(tx.date || '') <= today && tx.type !== 'transfer');
        const syntheticRecurring = transactions.filter(tx => tx.synthetic && tx.ruleId && tx.type !== 'transfer');
        const legacyRecurringIncome = legacyRecurring.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + number(tx.amount), 0);
        const legacyRecurringExpense = legacyRecurring.filter(tx => tx.type === 'expense').reduce((sum, tx) => sum + number(tx.amount), 0);

        transactions.filter(tx => tx.type !== 'transfer' && !tx.recurring).forEach(tx => {
            const date = String(tx.date || '');
            const month = date.slice(0, 7);
            if (!future[month]) return;
            if (month === months[0] && date <= today) return;
            if (tx.type === 'income') future[month].income += number(tx.amount);
            if (tx.type === 'expense') future[month].expense += number(tx.amount);
        });

        const hasLegacyRecurring = legacyRecurring.length > 0;
        const hasPlannedRecurring = syntheticRecurring.length > 0;
        const average = !hasLegacyRecurring && !hasPlannedRecurring
            ? historicalAverage(transactions, today)
            : { income: 0, expense: 0, countedMonths: 0 };
        const baselineIncome = hasLegacyRecurring ? legacyRecurringIncome : average.income;
        const baselineExpense = hasLegacyRecurring ? legacyRecurringExpense : average.expense;
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const labels = [], balances = [], incomes = [], expenses = [];
        let runningBalance = initialBalance;

        months.forEach((month, index) => {
            const [year, monthNumber] = month.split('-').map(Number);
            labels.push(`${monthNames[monthNumber - 1]}/${String(year).slice(2)}`);
            const baseIncome = index === 0 || hasPlannedRecurring ? 0 : baselineIncome;
            const baseExpense = index === 0 || hasPlannedRecurring ? 0 : baselineExpense;
            const projectedIncome = baseIncome + future[month].income;
            const projectedExpense = baseExpense + future[month].expense;
            incomes.push(Math.round(projectedIncome));
            expenses.push(Math.round(projectedExpense));
            runningBalance = Math.round(runningBalance + projectedIncome - projectedExpense);
            balances.push(runningBalance);
        });

        const finalBalance = balances.at(-1) ?? initialBalance;
        const balanceDelta = finalBalance - initialBalance;
        const bestMonthIndex = balances.length ? balances.indexOf(Math.max(...balances)) : 0;
        return {
            today, months, labels, balances, incomes, expenses, initialBalance, finalBalance,
            totalIncome: incomes.reduce((sum, value) => sum + value, 0),
            totalExpense: expenses.reduce((sum, value) => sum + value, 0),
            balanceDelta,
            averageMonthlyDelta: balanceDelta / 12,
            bestMonth: labels[bestMonthIndex] || '',
            negativeMonths: balances.filter(balance => balance < 0).length,
            source: hasPlannedRecurring
                ? { mode: 'planned-recurring', count: new Set(syntheticRecurring.map(tx => tx.ruleId)).size }
                : hasLegacyRecurring
                    ? { mode: 'legacy-recurring', count: legacyRecurring.length }
                    : average.countedMonths
                        ? { mode: 'history', count: average.countedMonths }
                        : { mode: 'none', count: 0 }
        };
    }

    function dispose() {
        if (!projectionChart) return;
        try { projectionChart.dispose(); } catch (_) {}
        projectionChart = null;
    }

    function renderChart(model) {
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
                    return [params[0].name, ...params.map(item => '● ' + item.seriesName + ': ' + money(item.value))].join('\n');
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
                axisLabel: { color: '#94a3b8', fontSize: 10, formatter: value => {
                    const reais = root.PlannkeMoney.centsToReais(Math.round(Number(value)));
                    return Math.abs(reais) >= 1000 ? 'BRL ' + (reais / 1000).toFixed(0) + 'k' : 'BRL ' + reais.toFixed(0);
                } },
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

    const api = { buildProjectionModel, renderProjection, renderSummary, dispose, localDateString };
    root.PlannkeProjection = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

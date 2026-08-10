(function (root, factory) {
    const api = factory(root?.PlannkeCore);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.PlannkeInsights = api;

    if (typeof document !== 'undefined') {
        const init = () => {
            const render = () => {
                try {
                    if (typeof getData === 'function') api.renderInsights(getData());
                } catch (error) {
                    console.warn('Insights indisponíveis:', error);
                }
            };
            render();
            globalThis.addEventListener?.('plannke:data-changed', () => setTimeout(render, 0));
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
        else init();

        if (!root.PlannkeShell && !document.querySelector('script[data-plannke-shell]')) {
            const shell = document.createElement('script');
            shell.src = './app-shell.js';
            shell.dataset.plannkeShell = 'true';
            shell.defer = true;
            document.head.appendChild(shell);
        }
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
    'use strict';

    const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
    const pct = value => `${Math.round(Math.abs(Number(value || 0)))}%`;

    function localDateString(date = new Date()) {
        if (C?.localDateString) return C.localDateString(date);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function parseISO(value) {
        if (C?.parseISO) return C.parseISO(value);
        const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;
        return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }

    function addDays(value, days) {
        if (C?.addDays) return C.addDays(value, days);
        const date = parseISO(value); if (!date) return value;
        date.setDate(date.getDate() + days); return localDateString(date);
    }

    function previousComparableRange(today) {
        const date = parseISO(today);
        if (!date) return null;
        const prevYear = date.getMonth() === 0 ? date.getFullYear() - 1 : date.getFullYear();
        const prevMonthIndex = (date.getMonth() + 11) % 12;
        const lastDay = new Date(prevYear, prevMonthIndex + 1, 0).getDate();
        const endDay = Math.min(date.getDate(), lastDay);
        return {
            currentStart: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`,
            currentEnd: today,
            previousStart: `${prevYear}-${String(prevMonthIndex + 1).padStart(2, '0')}-01`,
            previousEnd: `${prevYear}-${String(prevMonthIndex + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
        };
    }

    function realized(tx, endDate) {
        return tx && tx.status !== 'planned' && tx.date && tx.date <= endDate;
    }

    function total(txs, predicate) {
        return (txs || []).filter(predicate).reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);
    }

    function categoryTotals(data, start, end) {
        const out = {};
        (data.transactions || []).filter(tx => tx.type === 'expense' && realized(tx, end) && tx.date >= start).forEach(tx => {
            const category = String(tx.category || 'Outros');
            out[category] = (out[category] || 0) + Math.abs(Number(tx.amount || 0));
        });
        return out;
    }

    function recurringMonthly(data) {
        const planning = C?.ensurePlanning ? C.ensurePlanning(data) : (data.planning || {});
        const rules = Array.isArray(planning.recurringRules) ? planning.recurringRules.filter(rule => rule.active !== false) : [];
        return {
            income: rules.filter(rule => rule.type === 'income').reduce((sum, rule) => sum + Number(rule.amount || 0), 0),
            expense: rules.filter(rule => rule.type === 'expense').reduce((sum, rule) => sum + Number(rule.amount || 0), 0)
        };
    }

    function upcomingExpenses(data, today, days = 7) {
        const start = addDays(today, 1);
        const end = addDays(today, days);
        const calendar = C?.buildFinancialCalendar ? C.buildFinancialCalendar(data, start, end) : (data.transactions || []).filter(tx => tx.status === 'planned' && tx.date >= start && tx.date <= end);
        const expenses = calendar.filter(item => item.type === 'expense');
        return { total: expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0), count: expenses.length, start, end };
    }

    function cardUsageInsight(data) {
        let best = null;
        (data.cards || []).forEach(card => {
            const used = C?.outstandingCardBalance
                ? C.outstandingCardBalance(data, card.id)
                : total(data.transactions, tx => tx.type === 'expense' && tx.accountId === card.id);
            const limit = Number(card.limit || 0);
            if (limit <= 0) return;
            const ratio = used / limit * 100;
            if (!best || ratio > best.ratio) best = { card, used, limit, ratio };
        });
        return best;
    }

    function buildInsights(data, today = localDateString()) {
        if (!data || typeof data !== 'object') return [];
        const txs = Array.isArray(data.transactions) ? data.transactions : [];
        const range = previousComparableRange(today);
        const insights = [];

        if (range) {
            const currentExpenses = total(txs, tx => tx.type === 'expense' && realized(tx, range.currentEnd) && tx.date >= range.currentStart);
            const previousExpenses = total(txs, tx => tx.type === 'expense' && realized(tx, range.previousEnd) && tx.date >= range.previousStart);
            if (previousExpenses > 0 && currentExpenses > 0) {
                const delta = (currentExpenses - previousExpenses) / previousExpenses * 100;
                if (Math.abs(delta) >= 8) {
                    insights.push({
                        id: 'month-comparison',
                        kind: delta > 0 ? 'warning' : 'good',
                        icon: delta > 0 ? 'ph-trend-up' : 'ph-trend-down',
                        priority: delta > 0 ? 85 : 55,
                        title: delta > 0 ? 'Ritmo de gastos maior' : 'Ritmo de gastos menor',
                        text: `Você gastou ${pct(delta)} ${delta > 0 ? 'a mais' : 'a menos'} que no mesmo período do mês passado.`
                    });
                }
            }

            const currentIncome = total(txs, tx => tx.type === 'income' && realized(tx, range.currentEnd) && tx.date >= range.currentStart);
            if (currentIncome > 0) {
                const currentExpenses = total(txs, tx => tx.type === 'expense' && realized(tx, range.currentEnd) && tx.date >= range.currentStart);
                const saved = currentIncome - currentExpenses;
                const rate = saved / currentIncome * 100;
                insights.push({
                    id: 'savings-rate', kind: rate >= 10 ? 'good' : rate < 0 ? 'warning' : 'info', icon: 'ph-piggy-bank', priority: rate < 0 ? 90 : 45,
                    title: rate >= 0 ? 'Margem do mês' : 'Saídas acima das entradas',
                    text: rate >= 0 ? `${pct(rate)} das entradas realizadas ainda não foram consumidas por gastos.` : `Os gastos realizados superam as entradas do mês em ${money(Math.abs(saved))}.`
                });
            }

            const categories = categoryTotals(data, range.currentStart, range.currentEnd);
            const entries = Object.entries(categories).sort((a, b) => b[1] - a[1]);
            const expenseTotal = entries.reduce((sum, [, value]) => sum + value, 0);
            if (entries.length && expenseTotal > 0) {
                const [name, value] = entries[0];
                const share = value / expenseTotal * 100;
                if (share >= 30) insights.push({ id: 'top-category', kind: 'info', icon: 'ph-chart-pie-slice', priority: 35, title: `${name} concentra seus gastos`, text: `${pct(share)} das despesas realizadas do mês estão nessa categoria (${money(value)}).` });
            }

            const budgets = data.settings?.budgets || {};
            Object.entries(budgets).forEach(([category, limit]) => {
                const spent = categories[category] || 0;
                const budget = Number(limit || 0);
                if (budget <= 0 || spent / budget < 0.8) return;
                const ratio = spent / budget * 100;
                insights.push({
                    id: `budget-${category}`, kind: ratio >= 100 ? 'warning' : 'info', icon: 'ph-gauge', priority: ratio >= 100 ? 100 : 80,
                    title: ratio >= 100 ? `Orçamento de ${category} ultrapassado` : `${category} perto do limite`,
                    text: ratio >= 100 ? `Você passou ${money(spent - budget)} do limite de ${money(budget)}.` : `Você já usou ${pct(ratio)} do orçamento de ${money(budget)}.`
                });
            });
        }

        const upcoming = upcomingExpenses(data, today, 7);
        if (upcoming.total > 0) insights.push({ id: 'upcoming-week', kind: 'info', icon: 'ph-calendar-dots', priority: 75, title: `${money(upcoming.total)} nos próximos 7 dias`, text: `${upcoming.count} compromisso${upcoming.count === 1 ? '' : 's'} de saída previsto${upcoming.count === 1 ? '' : 's'} até ${upcoming.end.split('-').reverse().slice(0, 2).join('/')}.` });

        const recurring = recurringMonthly(data);
        if (recurring.income > 0 && recurring.expense > 0) {
            const ratio = recurring.expense / recurring.income * 100;
            if (ratio >= 50) insights.push({ id: 'fixed-load', kind: ratio >= 80 ? 'warning' : 'info', icon: 'ph-repeat', priority: ratio >= 80 ? 88 : 60, title: 'Renda comprometida com fixos', text: `Seus compromissos recorrentes equivalem a ${pct(ratio)} da renda recorrente cadastrada.` });
        }

        const card = cardUsageInsight(data);
        if (card && card.ratio >= 60) insights.push({ id: 'card-usage', kind: card.ratio >= 85 ? 'warning' : 'info', icon: 'ph-credit-card', priority: card.ratio >= 85 ? 92 : 65, title: `${card.card.name} com ${pct(card.ratio)} do limite comprometido`, text: `${money(card.used)} de ${money(card.limit)} estão em faturas ainda não pagas.` });

        return insights.sort((a, b) => b.priority - a.priority).slice(0, 5);
    }

    function make(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function insightHeader(subtitle, compact = false) {
        const header = make('div', `product-card-title${compact ? ' mb-0 pb-0 border-0' : ''}`);
        const title = make('div');
        const icon = make('i', 'ph ph-sparkle');
        title.append(icon, make('strong', '', 'Insights locais'));
        header.append(title, make('small', '', subtitle));
        return header;
    }

    function insightRow(item) {
        const row = make('div', `product-insight-row ${item.kind}`);
        const iconWrap = make('span', 'product-insight-icon');
        iconWrap.appendChild(make('i', `ph ${item.icon}`));
        const copy = make('div');
        copy.append(make('strong', '', item.title), make('small', '', item.text));
        row.append(iconWrap, copy);
        return row;
    }

    function renderInsights(data) {
        const dashboard = document.getElementById('dashboard-view');
        if (!dashboard) return;
        let section = document.getElementById('product-smart-insights');
        if (!section) {
            section = document.createElement('section');
            section.id = 'product-smart-insights';
            section.className = 'card mb-3 product-insights-card';
            const pulse = document.getElementById('financial-pulse');
            if (pulse) pulse.after(section); else dashboard.prepend(section);
        }

        const insights = buildInsights(data);
        const body = make('div', 'card-body p-3 p-md-4');
        section.replaceChildren(body);

        if (!insights.length) {
            body.appendChild(insightHeader('Cadastre mais movimentações para o Plannke encontrar padrões úteis.', true));
            return;
        }

        body.appendChild(insightHeader('Calculados neste dispositivo, sem IA externa'));
        const list = make('div', 'product-insights-list');
        insights.forEach(item => list.appendChild(insightRow(item)));
        body.appendChild(list);
    }

    return { previousComparableRange, categoryTotals, recurringMonthly, upcomingExpenses, buildInsights, renderInsights };
});
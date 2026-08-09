/* Plannke canonical dashboard charts. User-data DOM stays in safe-renderers.js. */
(function (root) {
    'use strict';

    let summaryChart = null;
    let comparisonChart = null;

    function localToday() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    function categoryColor(category) {
        return typeof root._getCatColor === 'function' ? root._getCatColor(category) : '#475569';
    }

    function ensureSummaryCanvas() {
        const existing = document.getElementById('summaryChart');
        const wrapper = existing?.parentElement || document.querySelector('.chart-donut-wrap');
        if (!wrapper) return { wrapper: null, canvas: null, empty: null };

        let canvas = existing;
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'summaryChart';
            wrapper.appendChild(canvas);
        }

        let empty = wrapper.querySelector('.chart-empty-msg');
        if (!empty) {
            empty = document.createElement('div');
            empty.className = 'chart-empty-msg text-muted small position-absolute top-50 start-50 translate-middle text-center';
            empty.textContent = 'Nenhum gasto neste mês.';
            wrapper.appendChild(empty);
        }
        return { wrapper, canvas, empty };
    }

    function renderChart(data) {
        if (!root.Chart) return;
        const { canvas, empty } = ensureSummaryCanvas();
        if (!canvas || !empty) return;

        const month = localToday().slice(0, 7);
        const totals = new Map();
        let totalExpense = 0;
        (data?.transactions || [])
            .filter(tx => tx.type === 'expense' && String(tx.date || '').startsWith(month))
            .forEach(tx => {
                const category = tx.category || 'Outros';
                const amount = Number(tx.amount || 0);
                totals.set(category, (totals.get(category) || 0) + amount);
                totalExpense += amount;
            });

        const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
        const labels = sorted.map(([label]) => label);
        const values = sorted.map(([, value]) => value);

        if (!values.length) {
            summaryChart?.destroy();
            summaryChart = null;
            canvas.style.display = 'none';
            empty.style.display = '';
            return;
        }

        canvas.style.display = '';
        empty.style.display = 'none';
        const colors = labels.map(categoryColor);

        if (summaryChart) {
            summaryChart.data.labels = labels;
            summaryChart.data.datasets[0].data = values;
            summaryChart.data.datasets[0].backgroundColor = colors;
            summaryChart._totalExpense = totalExpense;
            summaryChart.update('active');
            return;
        }

        summaryChart = new root.Chart(canvas, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: 'transparent',
                    hoverOffset: 10,
                    offset: 0,
                    cutout: '68%'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { animateRotate: true, animateScale: false },
                layout: { padding: { top: 6, bottom: 6 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e1e2a',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        padding: 10,
                        cornerRadius: 10,
                        callbacks: {
                            label: context => {
                                const pct = totalExpense > 0 ? ((context.raw / totalExpense) * 100).toFixed(1) : '0.0';
                                return ` ${context.label}: ${root.formatCurrency(context.raw)} (${pct}%)`;
                            }
                        }
                    }
                }
            },
            plugins: [{
                id: 'plannkeCenterText',
                beforeDraw(chart) {
                    const { ctx, chartArea } = chart;
                    if (!chartArea) return;
                    const total = chart._totalExpense ?? chart.data.datasets[0].data.reduce((sum, value) => sum + Number(value || 0), 0);
                    const dark = document.documentElement.getAttribute('data-bs-theme') !== 'light';
                    const cx = chartArea.left + chartArea.width / 2;
                    const cy = chartArea.top + chartArea.height / 2;
                    ctx.save();
                    ctx.font = 'bold 11px Inter, sans-serif';
                    ctx.fillStyle = dark ? '#64748b' : '#94a3b8';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('TOTAL', cx, cy - 10);
                    ctx.font = 'bold 15px Inter, sans-serif';
                    ctx.fillStyle = dark ? '#f1f5f9' : '#1e293b';
                    ctx.fillText(root.formatCurrency(total), cx, cy + 8);
                    ctx.restore();
                }
            }]
        });
        summaryChart._totalExpense = totalExpense;
        root.requestAnimationFrame?.(() => root.setTimeout?.(() => summaryChart?.resize(), 0));
    }

    function renderComparisonChart(data) {
        const canvas = document.getElementById('monthlyComparisonChart');
        if (!canvas || !root.Chart) return;

        const today = new Date();
        const monthLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const labels = [];
        const incomes = [];
        const expenses = [];

        for (let offset = 5; offset >= 0; offset--) {
            const date = new Date(today.getFullYear(), today.getMonth() - offset, 1);
            const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            labels.push(`${monthLabels[date.getMonth()]}/${String(date.getFullYear()).slice(2)}`);

            let income = 0;
            let expense = 0;
            (data?.transactions || []).forEach(tx => {
                if (!String(tx.date || '').startsWith(month)) return;
                if (tx.type === 'income') income += Number(tx.amount || 0);
                if (tx.type === 'expense') expense += Number(tx.amount || 0);
            });
            incomes.push(Number(income.toFixed(2)));
            expenses.push(Number(expense.toFixed(2)));
        }

        comparisonChart?.destroy();
        comparisonChart = new root.Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Receitas',
                        data: incomes,
                        backgroundColor: 'rgba(0,200,150,0.75)',
                        borderRadius: 6,
                        borderSkipped: false
                    },
                    {
                        label: 'Despesas',
                        data: expenses,
                        backgroundColor: 'rgba(255,77,109,0.75)',
                        borderRadius: 6,
                        borderSkipped: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        labels: {
                            color: '#94a3b8',
                            usePointStyle: true,
                            pointStyle: 'circle',
                            font: { size: 11 },
                            padding: 16
                        }
                    },
                    tooltip: {
                        backgroundColor: '#1e1e2a',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        padding: 10,
                        cornerRadius: 10,
                        callbacks: {
                            label: context => ` ${context.dataset.label}: ${root.formatCurrency(context.raw)}`,
                            afterBody: items => {
                                const income = items.find(item => item.dataset.label === 'Receitas')?.raw || 0;
                                const expense = items.find(item => item.dataset.label === 'Despesas')?.raw || 0;
                                const balance = income - expense;
                                return [`Saldo: ${balance >= 0 ? '+' : ''}${root.formatCurrency(balance)}`];
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            color: '#64748b',
                            font: { size: 10 },
                            callback: value => Math.abs(value) >= 1000 ? `R$${(value / 1000).toFixed(0)}k` : `R$${Number(value).toFixed(0)}`
                        }
                    }
                }
            }
        });
    }

    function refreshTheme() {
        summaryChart?.update('none');
        comparisonChart?.update('none');
    }

    const legacyApplyTheme = root.applyTheme;
    if (typeof legacyApplyTheme === 'function') {
        root.applyTheme = function applyThemeWithCanonicalDashboard(theme) {
            const result = legacyApplyTheme.call(root, theme);
            refreshTheme();
            return result;
        };
    }

    root.renderChart = renderChart;
    root.renderComparisonChart = renderComparisonChart;
    root.PlannkeDashboard = {
        renderChart,
        renderComparisonChart,
        refreshTheme
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);

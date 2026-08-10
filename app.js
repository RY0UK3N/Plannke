/* ============================================================
   INIT
   ============================================================ */
function initApp() {
    setupNavigation();
    setupModalEvents();
    setupForms();
    setupCurrencyInput();
    setupKeyboardShortcuts();
    applyTheme(getSettings().theme || 'dark');
    renderAll();
    _navigateTo('dashboard');
}

/* ============================================================
   CAMPO DE VALOR FORMATADO (R$ 0,00)
   ============================================================ */
const AMOUNT_FIELDS = ['tx-amount', 'acc-balance', 'card-limit'];

function setupCurrencyInput() {
    AMOUNT_FIELDS.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.addEventListener('input', handleCurrencyInput);
    });
}

function handleCurrencyInput(e) {
    const input = e.target;
    const digits = input.value.replace(/\D/g, '');
    if (!digits) { input.value = ''; input.dataset.rawValue = ''; updateInstallmentHelper(); return; }
    const reais = parseInt(digits, 10) / 100;
    input.value = reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    input.dataset.rawValue = String(reais);
    if (input.id === 'tx-amount') updateInstallmentHelper();
}

function getCurrencyValue(id) {
    const input = document.getElementById(id);
    if (!input) return 0;
    if (input.dataset.rawValue) return parseFloat(input.dataset.rawValue) || 0;
    const digits = input.value.replace(/\D/g, '');
    return digits ? parseInt(digits, 10) / 100 : 0;
}

function setCurrencyValue(id, val) {
    const input = document.getElementById(id);
    if (!input) return;
    const num = parseFloat(val) || 0;
    input.value = num > 0 ? num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
    input.dataset.rawValue = String(num);
}

/* ============================================================
   MODAL SYSTEM
   ============================================================ */
function openModal(modalId) {
    if (modalId === 'transactionModal') {
        openTxModal(null);
        return;
    }
    bootstrap.Modal.getOrCreateInstance(document.getElementById(modalId)).show();
}

function closeModal(modalId) {
    const modal = bootstrap.Modal.getInstance(document.getElementById(modalId));
    if (modal) modal.hide();
}

/* ============================================================
   FEEDBACK
   ============================================================ */
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const id = 'toast-' + Date.now();
    const color = type === 'success' ? 'var(--color-primary)' : (type === 'info' ? '#7c83fd' : 'var(--color-expense)');
    const icon = type === 'success' ? 'ph-check-circle' : (type === 'info' ? 'ph-info' : 'ph-warning-circle');
    const el = document.createElement('div');
    el.id = id; el.className = 'planner-toast';
    el.style.borderLeftColor = color;
    el.innerHTML = `<i class="ph ${icon}" style="color:${color};font-size:1.1rem;flex-shrink:0;"></i><span>${message}</span>`;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, 3200);
}

function showFormError(msg) {
    const el = document.getElementById('tx-form-error');
    if (!el) return;
    el.textContent = msg; el.classList.remove('hidden');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => el.classList.add('hidden'), 5000);
}

function clearFormError() {
    document.getElementById('tx-form-error')?.classList.add('hidden');
}

/* ============================================================
   CRUD WRAPPERS
   ============================================================ */
/* ── Rich delete confirmation ── */
function _showDeleteConfirm(title, desc, value, onConfirm) {
    document.getElementById('delete-confirm-title').textContent = title;
    document.getElementById('delete-confirm-desc').textContent = desc;
    document.getElementById('delete-confirm-value').textContent = value || '';
    const btn = document.getElementById('delete-confirm-btn');
    // Clone to remove old listeners
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
        bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal'))?.hide();
        onConfirm();
    });
    bootstrap.Modal.getOrCreateInstance(document.getElementById('deleteConfirmModal')).show();
}

/* ============================================================
   RENDER ALL
   ============================================================ */
function renderAll() {
    const data = getData();
    renderTransactions(data);
    renderDashboard(data);
    renderAccounts(data);
    renderCards(data);
    renderMovimentacao(data);
    renderProjection(data);
    _populateMovFilters(data);
    renderSettingsView(); // only renders if view is visible

    // Refresh detail modal if open
    if (window._detailContext?.id) {
        const modalEl = document.getElementById('entityDetailModal');
        const isVisible = modalEl.classList.contains('show');
        if (isVisible) {
            if (window._detailContext.type === 'account') {
                viewAccountStatement(window._detailContext.id, true);
            } else {
                viewCardInvoice(window._detailContext.id, window._detailContext.period, true);
            }
        }
    }
}

/* ============================================================
   PROJEÇÃO — Previsão de Patrimônio (12 meses)
   ============================================================ */
let _projectionChart = null;

function renderProjection(data) {
    const view = document.getElementById('projecao-view');
    if (!view || view.classList.contains('hidden')) return;
    if (!data) data = getData();

    // ── 1. Saldo inicial ──
    const initialBalance = data.accounts.reduce((s, a) => s + a.balance, 0);

    const todayDate = new Date();
    const todayStr  = todayDate.toISOString().split('T')[0];

    // ── 2. Janela de 12 meses ──
    const months = [];
    for (let i = 0; i < 12; i++) {
        const d = new Date(todayDate.getFullYear(), todayDate.getMonth() + i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    // ── 3. Transações RECORRENTES marcadas explicitamente ──
    // Agrupa por tipo → soma do valor mensal recorrente
    let recurIncome  = 0;
    let recurExpense = 0;
    data.transactions
        .filter(t => t.recurring && t.date <= todayStr)
        .forEach(t => {
            if (t.type === 'income')  recurIncome  += t.amount;
            if (t.type === 'expense') recurExpense += t.amount;
        });

    // ── 4. Transações futuras/parceladas já registradas ──
    const futureMonthMap = {};
    months.forEach(m => { futureMonthMap[m] = { income: 0, expense: 0 }; });

    data.transactions
        .filter(t => t.type !== 'transfer' && !t.recurring)
        .forEach(tx => {
            const txMonth = tx.date.slice(0, 7);
            if (!futureMonthMap[txMonth]) return;
            const isCurrentMonth = txMonth === months[0];
            if (isCurrentMonth && tx.date <= todayStr) return; // já aconteceu
            if (tx.type === 'income')  futureMonthMap[txMonth].income  += tx.amount;
            if (tx.type === 'expense') futureMonthMap[txMonth].expense += tx.amount;
        });

    // ── 5. Média dos últimos 3 meses como fallback (só se NÃO houver recorrentes) ──
    let avgIncome = recurIncome, avgExpense = recurExpense, countedMonths = 0;
    const hasRecurring = recurIncome > 0 || recurExpense > 0;

    if (!hasRecurring) {
        const last3 = [];
        for (let i = 1; i <= 3; i++) {
            const d = new Date(todayDate.getFullYear(), todayDate.getMonth() - i, 1);
            last3.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
        let sumIncome = 0, sumExpense = 0;
        last3.forEach(m => {
            const txs = data.transactions.filter(t => t.date.startsWith(m) && t.type !== 'transfer');
            if (!txs.length) return;
            countedMonths++;
            txs.forEach(t => {
                if (t.type === 'income')  sumIncome  += t.amount;
                if (t.type === 'expense') sumExpense += t.amount;
            });
        });
        if (countedMonths > 0) { avgIncome = sumIncome / countedMonths; avgExpense = sumExpense / countedMonths; }
    }

    // ── 6. Calcular saldo projetado mês a mês ──
    const balances = [], incomes = [], expenses = [], labels = [];
    const monthNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    let runningBalance = initialBalance;

    months.forEach((m, idx) => {
        const [y, mo] = m.split('-').map(Number);
        labels.push(`${monthNames[mo - 1]}/${String(y).slice(2)}`);

        const knownIncome  = futureMonthMap[m].income;
        const knownExpense = futureMonthMap[m].expense;

        // Mês atual: só transações futuras; demais meses: recorrentes + pontuais já lançadas
        const baseIncome  = idx === 0 ? 0 : avgIncome;
        const baseExpense = idx === 0 ? 0 : avgExpense;

        const projIncome  = baseIncome  + knownIncome;
        const projExpense = baseExpense + knownExpense;

        incomes.push(parseFloat(projIncome.toFixed(2)));
        expenses.push(parseFloat(projExpense.toFixed(2)));
        runningBalance += projIncome - projExpense;
        balances.push(parseFloat(runningBalance.toFixed(2)));
    });

    // ── 7. Gráfico ECharts ──
    const chartDom = document.getElementById('projectionChart');
    if (!chartDom || typeof echarts === 'undefined') return;

    if (_projectionChart) {
        try { _projectionChart.resize(); } catch (_) { _projectionChart.dispose(); _projectionChart = null; }
    }
    if (!_projectionChart) {
        _projectionChart = echarts.init(chartDom, null, { renderer: 'canvas' });
        window.addEventListener('resize', () => _projectionChart?.resize());
    }

    _projectionChart.setOption({
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: '#1e1e2a',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            textStyle: { color: '#f1f5f9', fontSize: 12 },
            formatter: (params) => {
                let html = `<div style="font-weight:600;margin-bottom:6px;">${params[0].name}</div>`;
                params.forEach(p => {
                    const color = p.color?.colorStops ? p.color.colorStops[0].color : p.color;
                    html += `<div style="display:flex;justify-content:space-between;gap:16px;">
                        <span style="color:${color};">&#9679; ${p.seriesName}</span>
                        <span style="font-weight:600;">${formatCurrency(p.value)}</span>
                    </div>`;
                });
                return html;
            }
        },
        legend: {
            data: ['Saldo Acumulado','Receitas','Despesas'],
            textStyle: { color: '#94a3b8', fontSize: 11 }, top: 0
        },
        grid: { left: '3%', right: '4%', bottom: '8%', top: '14%', containLabel: true },
        xAxis: {
            type: 'category', data: labels,
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
            axisLabel: { color: '#94a3b8', fontSize: 11 }
        },
        yAxis: {
            type: 'value',
            axisLabel: {
                color: '#94a3b8', fontSize: 10,
                formatter: v => Math.abs(v) >= 1000 ? `R$${(v/1000).toFixed(0)}k` : `R$${v.toFixed(0)}`
            },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } }
        },
        series: [
            {
                name: 'Saldo Acumulado', type: 'line', data: balances,
                smooth: true, symbol: 'circle', symbolSize: 6,
                lineStyle: { width: 3 },
                areaStyle: {
                    color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(99,102,241,0.35)' },
                            { offset: 1, color: 'rgba(99,102,241,0.02)' }
                        ]
                    }
                },
                itemStyle: { color: '#6366f1' },
                markLine: {
                    silent: true,
                    lineStyle: { color: 'rgba(255,255,255,0.15)', type: 'dashed' },
                    label: { show: false },
                    data: [{ yAxis: 0 }]
                }
            },
            {
                name: 'Receitas', type: 'bar', data: incomes, barMaxWidth: 18,
                itemStyle: {
                    color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [{ offset: 0, color: '#10b981' }, { offset: 1, color: '#059669' }]
                    },
                    borderRadius: [4,4,0,0]
                }
            },
            {
                name: 'Despesas', type: 'bar', data: expenses, barMaxWidth: 18,
                itemStyle: {
                    color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [{ offset: 0, color: '#ef4444' }, { offset: 1, color: '#b91c1c' }]
                    },
                    borderRadius: [4,4,0,0]
                }
            }
        ]
    }, true);

    // ── 8. Painel lateral de resumo ──
    const summaryEl = document.getElementById('projection-summary-list');
    if (!summaryEl) return;

    const finalBalance = balances[balances.length - 1];
    const totalIncome  = incomes.reduce((s, v) => s + v, 0);
    const totalExpense = expenses.reduce((s, v) => s + v, 0);
    const balanceDelta = finalBalance - initialBalance;
    const bestMonthIdx = balances.indexOf(Math.max(...balances));
    const bestMonth    = labels[bestMonthIdx];
    const negMonths    = balances.filter(b => b < 0).length;
    const avgMonthSave = balanceDelta / 12;
    const deltaColor   = balanceDelta >= 0 ? 'var(--color-primary)' : 'var(--color-expense)';
    const deltaIcon    = balanceDelta >= 0 ? 'ph-trend-up' : 'ph-trend-down';
    const deltaLabel   = balanceDelta >= 0 ? 'Crescimento projetado' : 'Queda projetada';

    const sourceNote = hasRecurring
        ? `Projeção baseada em <b>${data.transactions.filter(t => t.recurring).length} lançamentos recorrentes</b> marcados.`
        : countedMonths > 0
            ? `Sem recorrentes marcados — usando média dos últimos ${countedMonths} meses.`
            : 'Marque lançamentos como <b>Recorrente</b> para projeções precisas.';

    summaryEl.innerHTML = `
    <div class="proj-summary-item">
        <div class="proj-summary-label"><i class="ph ph-wallet me-1 opacity-75"></i>Saldo Atual</div>
        <div class="proj-summary-value" style="color:var(--color-primary);">${formatCurrency(initialBalance)}</div>
    </div>
    <div class="proj-summary-item">
        <div class="proj-summary-label"><i class="ph ${deltaIcon} me-1 opacity-75"></i>${deltaLabel}</div>
        <div class="proj-summary-value" style="color:${deltaColor};">${balanceDelta >= 0 ? '+' : ''}${formatCurrency(balanceDelta)}</div>
    </div>
    <div class="proj-summary-item">
        <div class="proj-summary-label"><i class="ph ph-calendar-check me-1 opacity-75"></i>Saldo em ${labels[11]}</div>
        <div class="proj-summary-value" style="color:${finalBalance >= 0 ? 'var(--color-primary)' : 'var(--color-expense)'};">${formatCurrency(finalBalance)}</div>
    </div>
    <div class="proj-summary-divider"></div>
    <div class="proj-summary-item">
        <div class="proj-summary-label"><i class="ph ph-arrow-circle-up me-1 opacity-75"></i>Total receitas (12m)</div>
        <div class="proj-summary-value" style="color:#10b981;">${formatCurrency(totalIncome)}</div>
    </div>
    <div class="proj-summary-item">
        <div class="proj-summary-label"><i class="ph ph-arrow-circle-down me-1 opacity-75"></i>Total despesas (12m)</div>
        <div class="proj-summary-value" style="color:var(--color-expense);">${formatCurrency(totalExpense)}</div>
    </div>
    <div class="proj-summary-item">
        <div class="proj-summary-label"><i class="ph ph-piggy-bank me-1 opacity-75"></i>Economia/mês (média)</div>
        <div class="proj-summary-value" style="color:${avgMonthSave >= 0 ? 'var(--color-primary)' : 'var(--color-expense)'};">${avgMonthSave >= 0 ? '+' : ''}${formatCurrency(avgMonthSave)}</div>
    </div>
    <div class="proj-summary-divider"></div>
    <div class="proj-summary-item">
        <div class="proj-summary-label"><i class="ph ph-star me-1 opacity-75"></i>Melhor mês previsto</div>
        <div class="proj-summary-value">${bestMonth}</div>
    </div>
    <div class="proj-summary-item">
        <div class="proj-summary-label"><i class="ph ph-warning me-1 opacity-75"></i>Meses no negativo</div>
        <div class="proj-summary-value" style="color:${negMonths > 0 ? 'var(--color-expense)' : '#10b981'};">${negMonths === 0 ? 'Nenhum &#10003;' : negMonths + ' m' + (negMonths > 1 ? 'eses' : 'es')}</div>
    </div>
    <div class="proj-summary-divider"></div>
    <div class="tiny text-muted mt-2" style="line-height:1.6;">
        <i class="ph ph-info me-1"></i>${sourceNote}
    </div>`;

}

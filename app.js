let _currentMonth = null;
let _fluxoChart = null;
let _fluxoMode = 'sankey';
let _movViewMode = 'list'; // 'list', 'sankey', 'sunburst'

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
   BUSCA DE TRANSAÇÕES
   ============================================================ */
function clearTxSearch() {
    const input = document.getElementById('tx-search');
    if (input) { input.value = ''; input.focus(); }
    const clearBtn = document.getElementById('tx-search-clear');
    if (clearBtn) clearBtn.classList.add('hidden');
    renderMovimentacao(getData());
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

function filterDashboardToTransactions(type) {
    _navigateTo('movimentacao');
    document.getElementById('tx-filter').value = type;
    renderMovimentacao(getData());
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
   FILTROS DA MOVIMENTAÇÃO — categoria + conta
   ============================================================ */
function _populateMovFilters(data) {
    const catSel = document.getElementById('tx-filter-category');
    const accSel = document.getElementById('tx-filter-account');
    if (!catSel || !accSel) return;

    // Preserva seleção atual
    const prevCat = catSel.value;
    const prevAcc = accSel.value;

    // Categorias únicas das transações do mês atual
    const cats = [...new Set(
        data.transactions
            .filter(t => t.category && t.type !== 'transfer')
            .map(t => t.category)
    )].sort();

    catSel.innerHTML = '<option value="all">Categoria</option>' +
        cats.map(c => `<option value="${c}" ${c === prevCat ? 'selected' : ''}>${c}</option>`).join('');

    // Contas + cartões sem ícones
    let accHtml = '<option value="all">Conta</option>';
    if (data.accounts.length) {
        accHtml += '<optgroup label="─── Contas Bancárias">';
        data.accounts.forEach(a => {
            accHtml += `<option value="${a.id}" ${a.id === prevAcc ? 'selected' : ''}>${a.name}</option>`;
        });
        accHtml += '</optgroup>';
    }
    if (data.cards.length) {
        accHtml += '<optgroup label="─── Cartões de Crédito">';
        data.cards.forEach(c => {
            accHtml += `<option value="${c.id}" ${c.id === prevAcc ? 'selected' : ''}>${c.name}</option>`;
        });
        accHtml += '</optgroup>';
    }
    accSel.innerHTML = accHtml;

    // Restaura seleção
    if (prevCat && cats.includes(prevCat)) catSel.value = prevCat;
    if (prevAcc) accSel.value = prevAcc;
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

/* ============================================================
   DASHBOARD / NAVIGATION HELPERS
   ============================================================ */
function filterDashboardToTransactions(filter) {
    const filterEl = document.getElementById('tx-filter');
    if (filterEl) filterEl.value = filter;
    
    // Switch to list view and navigate
    _movViewMode = 'list';
    const navItem = document.querySelector('[data-target="movimentacao"]');
    if (navItem) navItem.click();
}

/* ============================================================
   MONTH NAVIGATION
   ============================================================ */
function renderMonthTabs(data) {
    const monthsSet = new Set();
    data.transactions.forEach(t => monthsSet.add(t.date.slice(0, 7)));
    if (!monthsSet.size) monthsSet.add(new Date().toISOString().slice(0, 7));

    const sorted = Array.from(monthsSet).sort();
    window._availableMonths = sorted;

    if (!_currentMonth || !sorted.includes(_currentMonth)) {
        const todayM = new Date().toISOString().slice(0, 7);
        _currentMonth = sorted.includes(todayM) ? todayM : sorted[sorted.length - 1];
    }
    updateMonthNavigator(_currentMonth);
}

function setMovViewMode(mode) {
    _movViewMode = mode;
    // Update button classes
    const modes = ['list', 'sankey', 'sunburst'];
    modes.forEach(m => {
        const btn = document.getElementById(`btn-mov-${m}`);
        if (!btn) return;
        btn.classList.toggle('active', mode === m);
        btn.classList.toggle('btn-primary', mode === m);
        btn.classList.toggle('btn-outline-light', mode !== m);
    });
    
    // Internal flux logic sync
    if (mode === 'sankey' || mode === 'sunburst') {
        _fluxoMode = mode;
    }

    renderAll();
}

function renderMovimentacao(data) {
    const view = document.getElementById('movimentacao-view');
    if (!view || view.classList.contains('hidden')) return;

    const listCont = document.getElementById('mov-list-container');
    const chartCont = document.getElementById('mov-chart-container');
    const chartTitle = document.getElementById('mov-chart-title');

    if (_movViewMode === 'list') {
        listCont.classList.remove('hidden');
        chartCont.classList.add('hidden');
        renderTransactions(data);
    } else {
        listCont.classList.add('hidden');
        chartCont.classList.remove('hidden');
        chartTitle.textContent = _movViewMode === 'sankey' ? 'Fluxo de Caminhos (Sankey)' : 'Distribuição Solar (Hierarquia)';
        
        if (_movViewMode === 'sankey') renderSankey(data);
        else renderSunburst(data);
    }
    
    // Sync navigator text
    const mStr = _currentMonth || new Date().toISOString().slice(0, 7);
    updateMonthNavigator(mStr);
}

// Keep renderSankey and renderSunburst but they no longer handle visibility themselves
// (Previous code had renderFluxo as dispatcher)

/* ── ECharts: obtém/recria instância de forma segura ── */
function _getFluxoChart(chartDom) {
    // Se o container foi re-renderizado pelo DOM (troca de view), a instância
    // fica órfã. Descarta e recria.
    if (_fluxoChart) {
        try { _fluxoChart.resize(); } // lança se container não é mais filho do DOM
        catch (_) { _fluxoChart.dispose(); _fluxoChart = null; }
    }
    if (!_fluxoChart) {
        _fluxoChart = echarts.init(chartDom, null, { renderer: 'canvas' });
        // Garante apenas um listener de resize
        if (!window._echartsResizeAttached) {
            window.addEventListener('resize', () => _fluxoChart?.resize());
            window._echartsResizeAttached = true;
        }
    }
    return _fluxoChart;
}

/* ── Mensagem de vazio para ECharts (sem tocar no innerHTML do container) ── */
function _setFluxoEmpty(chart, msg) {
    chart.setOption({
        backgroundColor: 'transparent',
        graphic: [{
            type: 'text',
            left: 'center', top: 'middle',
            style: { text: msg, fill: '#64748b', fontSize: 14, fontFamily: 'Inter, sans-serif' }
        }],
        series: []
    }, true); // true = substitui opção anterior por completo
}

function renderSankey(data) {
    const chartDom = document.getElementById('sankeyChart');
    if (!chartDom || typeof echarts === 'undefined') return;

    const mStr = _currentMonth || new Date().toISOString().slice(0, 7);
    const monthsFull = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const [y, m] = mStr.split('-');
    document.querySelectorAll('.fluxo-month-text').forEach(el => {
        el.textContent = `${monthsFull[parseInt(m)-1]} ${y}`;
    });

    const chart = _getFluxoChart(chartDom);

    const txs = data.transactions.filter(t => t.date.startsWith(mStr));
    const incomeTxs  = txs.filter(t => t.type === 'income');
    const expenseTxs = txs.filter(t => t.type === 'expense');

    if (!incomeTxs.length && !expenseTxs.length) {
        _setFluxoEmpty(chart, 'Nenhum dado para este mês.');
        return;
    }

    const nodes = [{ name: 'Budget' }];
    const links = [];
    const nodeSet = new Set(['Budget']);

    const incomeByCat = {};
    incomeTxs.forEach(t => {
        const cat = t.category || 'Outros Rendimentos';
        incomeByCat[cat] = (incomeByCat[cat] || 0) + t.amount;
    });
    Object.entries(incomeByCat).forEach(([cat, val]) => {
        if (!nodeSet.has(cat)) { nodes.push({ name: cat }); nodeSet.add(cat); }
        links.push({ source: cat, target: 'Budget', value: val });
    });

    const expenseByCat = {};
    expenseTxs.forEach(t => {
        const cat = t.category || 'Outras Despesas';
        expenseByCat[cat] = (expenseByCat[cat] || 0) + t.amount;
    });
    Object.entries(expenseByCat).forEach(([cat, val]) => {
        if (!nodeSet.has(cat)) { nodes.push({ name: cat }); nodeSet.add(cat); }
        links.push({ source: 'Budget', target: cat, value: val });
    });

    chart.setOption({
        backgroundColor: 'transparent',
        graphic: [],   // limpa mensagem de vazio anterior
        tooltip: {
            trigger: 'item', triggerOn: 'mousemove',
            backgroundColor: '#1e1e2a',
            borderColor: 'rgba(255,255,255,0.1)',
            textStyle: { color: '#f1f5f9' },
            formatter: (params) => {
                const val = formatCurrency(params.value);
                if (params.dataType === 'node') return `<b>${params.name}</b>: ${val}`;
                return `${params.data.source} → ${params.data.target}<br/><b>${val}</b>`;
            }
        },
        series: [{
            type: 'sankey', layout: 'none',
            emphasis: { focus: 'adjacency' },
            data: nodes, links,
            lineStyle: { color: 'gradient', curveness: 0.5 },
            label: { color: '#f1f5f9', fontWeight: 'bold' },
            itemStyle: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }
        }]
    }, true); // true = replace option (evita acúmulo de séries)
}

function renderSunburst(data) {
    const chartDom = document.getElementById('sankeyChart');
    if (!chartDom || typeof echarts === 'undefined') return;

    const mStr = _currentMonth || new Date().toISOString().slice(0, 7);
    const monthsFull = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const [y, m] = mStr.split('-');
    document.querySelectorAll('.fluxo-month-text').forEach(el => el.textContent = `${monthsFull[parseInt(m)-1]} ${y}`);

    const chart = _getFluxoChart(chartDom);

    // Theme-aware colors
    const isDark = document.documentElement.getAttribute('data-bs-theme') !== 'light';
    const labelColor  = isDark ? '#94a3b8' : '#334155';
    const tooltipBg   = isDark ? '#1c1c22' : '#ffffff';
    const tooltipBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)';
    const tooltipText = isDark ? '#f1f5f9' : '#0f172a';
    const borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.8)';

    const txs = data.transactions.filter(t => t.date.startsWith(mStr));
    const expenseTxs = txs.filter(t => t.type === 'expense');
    const totalMthExp = expenseTxs.reduce((s, t) => s + t.amount, 0);

    if (!txs.filter(t => t.type === 'income').length && !expenseTxs.length) {
        _setFluxoEmpty(chart, 'Nenhum dado para este mês.');
        return;
    }

    const categoriesMap = {};
    expenseTxs.forEach(t => {
        const cat = t.category || 'Outros';
        if (!categoriesMap[cat]) categoriesMap[cat] = { total: 0, items: [] };
        categoriesMap[cat].total += t.amount;
        categoriesMap[cat].items.push({ name: t.description, value: t.amount });
    });

    const sunburstData = Object.entries(categoriesMap).map(([cat, info]) => ({
        name: cat, value: info.total,
        itemStyle: { color: COLOR_MAP[cat] || '#475569', borderColor, borderWidth: 2 },
        label: { color: labelColor },
        children: info.items.map(it => ({
            name: it.name, value: it.value,
            itemStyle: { opacity: 0.75, borderColor, borderWidth: 1 },
            label: { color: labelColor }
        }))
    }));

    chart.setOption({
        backgroundColor: 'transparent',
        graphic: [],
        tooltip: {
            backgroundColor: tooltipBg,
            borderColor: tooltipBorder,
            borderWidth: 1,
            textStyle: { color: tooltipText, fontSize: 13 },
            formatter: (params) => {
                const val = formatCurrency(params.value);
                const pct = totalMthExp > 0 ? ((params.value / totalMthExp) * 100).toFixed(1) : '0';
                return `<b>${params.name}</b><br/>${val} (${pct}%)`;
            }
        },
        series: [{
            type: 'sunburst', data: sunburstData,
            radius: [0, '95%'], sort: 'desc',
            emphasis: { focus: 'ancestor' }, nodeClick: 'link',
            levels: [
                {},
                {
                    r0: '15%', r: '48%',
                    label: { rotate: 'tangential', fontSize: 11, fontWeight: 'bold', color: labelColor },
                    itemStyle: { borderWidth: 2, borderColor }
                },
                {
                    r0: '48%', r: '78%',
                    label: { position: 'outside', padding: 3, silent: false, fontSize: 10, color: labelColor },
                    itemStyle: { borderWidth: 1, borderColor, opacity: 0.82 }
                }
            ]
        }]
    }, true);
}

function updateMonthNavigator(mStr) {
    const monthsFull = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const [y, m] = mStr.split('-');
    const text = `${monthsFull[parseInt(m)-1]} ${y}`;
    document.querySelectorAll('.month-text').forEach(el => el.textContent = text);
}

function changeMonth(dir) {
    if (!window._availableMonths?.length) return;
    const idx = window._availableMonths.indexOf(_currentMonth);
    const newIdx = Math.max(0, Math.min(window._availableMonths.length - 1, idx + dir));
    if (idx !== newIdx) {
        _currentMonth = window._availableMonths[newIdx];
        const data = getData();
        renderMovimentacao(data);
        updateMonthNavigator(_currentMonth);
    }
}

/* ============================================================
   CHART
   ============================================================ */
// COLOR_MAP is now dynamic — uses _getCatColor which reads from data.settings
const COLOR_MAP = new Proxy({}, {
    get: (_, catName) => _getCatColor(catName)
});

/* ============================================================
   EXCEL — Memory Card (Enhanced Export)
   ============================================================ */
function exportToExcel() {
    if (typeof XLSX === 'undefined') { alert('Aguarde a biblioteca carregar.'); return; }
    const data = getData();

    const wb = XLSX.utils.book_new();

    /* ── Shared style helpers ─────────────────────────────────── */
    const ST = {
        headerGreen:  { font: { bold: true, color: { rgb: '000000' }, sz: 11 }, fill: { fgColor: { rgb: '00C896' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: _border() },
        headerPurple: { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }, fill: { fgColor: { rgb: '7C83FD' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: _border() },
        headerBlue:   { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }, fill: { fgColor: { rgb: '3B82F6' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: _border() },
        headerGray:   { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }, fill: { fgColor: { rgb: '334155' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: _border() },
        income:  { font: { color: { rgb: '00C896' }, bold: true }, fill: { fgColor: { rgb: '0D2B22' } }, alignment: { horizontal: 'right' }, border: _border('thin') },
        expense: { font: { color: { rgb: 'FF4D6D' }, bold: true }, fill: { fgColor: { rgb: '2B0D14' } }, alignment: { horizontal: 'right' }, border: _border('thin') },
        transfer:{ font: { color: { rgb: '7C83FD' }, bold: true }, fill: { fgColor: { rgb: '12122B' } }, alignment: { horizontal: 'right' }, border: _border('thin') },
        cell:    { font: { color: { rgb: 'E2E8F0' } }, fill: { fgColor: { rgb: '16161F' } }, border: _border('thin'), alignment: { vertical: 'center' } },
        cellAlt: { font: { color: { rgb: 'E2E8F0' } }, fill: { fgColor: { rgb: '1E1E2A' } }, border: _border('thin'), alignment: { vertical: 'center' } },
        titleBig:{ font: { bold: true, sz: 16, color: { rgb: '00C896' } }, fill: { fgColor: { rgb: '0D0D14' } }, alignment: { horizontal: 'center', vertical: 'center' } },
        subtitle:{ font: { bold: true, sz: 12, color: { rgb: '94A3B8' } }, fill: { fgColor: { rgb: '0D0D14' } }, alignment: { horizontal: 'center', vertical: 'center' } },
        kpiLabel:{ font: { sz: 10, color: { rgb: '94A3B8' } }, fill: { fgColor: { rgb: '16161F' } }, alignment: { horizontal: 'center', vertical: 'bottom' }, border: _border('thin') },
        kpiGreen:{ font: { bold: true, sz: 14, color: { rgb: '00C896' } }, fill: { fgColor: { rgb: '0D2B22' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: _border('thin') },
        kpiRed:  { font: { bold: true, sz: 14, color: { rgb: 'FF4D6D' } }, fill: { fgColor: { rgb: '2B0D14' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: _border('thin') },
        kpiBlue: { font: { bold: true, sz: 14, color: { rgb: '7C83FD' } }, fill: { fgColor: { rgb: '12122B' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: _border('thin') },
        numFmt:  'R$ #,##0.00',
        dateFmt: 'DD/MM/YYYY',
    };
    function _border(w = 'medium') { const s = { style: w, color: { rgb: '334155' } }; return { top: s, bottom: s, left: s, right: s }; }
    function _c(v, s, t = null) { const o = { v, s }; if (t) o.t = t; if ((t === 'n' || typeof v === 'number') && !t) o.t = 'n'; if (t === 'd') { o.t = 'n'; o.z = ST.dateFmt; } return o; }
    function _money(v, s) { return { v: v || 0, t: 'n', z: ST.numFmt, s }; }
    function _applySheet(ws, data2d) {
        data2d.forEach((row, r) => row.forEach((cell, c) => { if (cell !== null) ws[XLSX.utils.encode_cell({ r, c })] = cell; }));
        return ws;
    }

    /* ── 1. RESUMO sheet ──────────────────────────────────────── */
    const today = new Date().toISOString().split('T')[0];
    const curMonth = today.slice(0, 7);
    const allIncome = data.transactions.filter(t => t.type === 'income');
    const allExpense = data.transactions.filter(t => t.type === 'expense');
    const mthIncome = allIncome.filter(t => t.date.startsWith(curMonth)).reduce((s, t) => s + t.amount, 0);
    const mthExpense = allExpense.filter(t => t.date.startsWith(curMonth)).reduce((s, t) => s + t.amount, 0);
    const totalBalance = data.accounts.reduce((s, a) => s + a.balance, 0);
    const totalIncome = allIncome.reduce((s, t) => s + t.amount, 0);
    const totalExpense = allExpense.reduce((s, t) => s + t.amount, 0);

    // Category breakdown for current month
    const catMap = {};
    allExpense.filter(t => t.date.startsWith(curMonth)).forEach(t => {
        catMap[t.category || 'Outros'] = (catMap[t.category || 'Outros'] || 0) + t.amount;
    });
    const catRows = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

    const ws1 = { '!ref': 'A1:J50' };
    const rows1 = [];
    const exportDate = `Exportado em: ${formatDate(today)}`;

    rows1[0] = [_c('PLANNER FINANCEIRO PESSOAL', ST.titleBig), null, null, null, null, null, null, null, null, null];
    rows1[1] = [_c(exportDate, ST.subtitle), null, null, null, null, null, null, null, null, null];
    rows1[2] = Array(10).fill(_c('', { fill: { fgColor: { rgb: '0D0D14' } } }));

    rows1[3] = [
        _c('INDICADORES DO MÊS ATUAL', ST.headerGreen), null, null,
        _c('PATRIMÔNIO TOTAL', ST.headerGreen), null, null,
        _c('HISTÓRICO GERAL', ST.headerGreen), null, null, null
    ];
    rows1[4] = [
        _c('Entradas', ST.kpiLabel), _c('Saídas', ST.kpiLabel), _c('Saldo do Mês', ST.kpiLabel),
        _c('Contas Bancárias', ST.kpiLabel), _c('Cartões Pendentes', ST.kpiLabel), _c('Patrimônio Líquido', ST.kpiLabel),
        _c('Total Entradas', ST.kpiLabel), _c('Total Saídas', ST.kpiLabel), _c('Resultado', ST.kpiLabel), null
    ];
    const cardPendente = data.cards.reduce((s, card) => {
        const billing = getAllCardBillings(data, card.id).find(b => !b.isPaid && b.total > 0);
        return s + (billing?.total || 0);
    }, 0);
    const netWorth = totalBalance - cardPendente;
    rows1[5] = [
        _money(mthIncome, ST.kpiGreen), _money(mthExpense, ST.kpiRed), _money(mthIncome - mthExpense, mthIncome - mthExpense >= 0 ? ST.kpiGreen : ST.kpiRed),
        _money(totalBalance, ST.kpiGreen), _money(cardPendente, ST.kpiRed), _money(netWorth, netWorth >= 0 ? ST.kpiGreen : ST.kpiRed),
        _money(totalIncome, ST.kpiGreen), _money(totalExpense, ST.kpiRed), _money(totalIncome - totalExpense, (totalIncome-totalExpense) >= 0 ? ST.kpiGreen : ST.kpiRed), null
    ];

    rows1[6] = Array(10).fill(_c('', { fill: { fgColor: { rgb: '0D0D14' } } }));

    rows1[7] = [_c('GASTOS POR CATEGORIA — MÊS ATUAL', ST.headerPurple), null, null, null, null, null, null, null, null, null];
    rows1[8] = [_c('Categoria', ST.headerGray), _c('Valor (R$)', ST.headerGray), _c('% do Total', ST.headerGray), null, null, null, null, null, null, null];

    catRows.forEach(([cat, val], i) => {
        const pct = mthExpense > 0 ? (val / mthExpense * 100).toFixed(1) + '%' : '0%';
        rows1[9 + i] = [
            _c(cat, i % 2 === 0 ? ST.cell : ST.cellAlt),
            _money(val, { ...( i % 2 === 0 ? ST.cell : ST.cellAlt ), font: { color: { rgb: 'FF4D6D' }, bold: true }, alignment: { horizontal: 'right' } }),
            _c(pct, i % 2 === 0 ? ST.cell : ST.cellAlt),
            null, null, null, null, null, null, null
        ];
    });

    // Fill blank rows
    for (let r = 9 + catRows.length; r < 50; r++) {
        rows1[r] = Array(10).fill(null);
    }

    _applySheet(ws1, rows1);

    // Merge cells
    ws1['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 9 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: 2 } },
        { s: { r: 3, c: 3 }, e: { r: 3, c: 5 } },
        { s: { r: 3, c: 6 }, e: { r: 3, c: 9 } },
        { s: { r: 6, c: 0 }, e: { r: 6, c: 9 } },
        { s: { r: 7, c: 0 }, e: { r: 7, c: 9 } },
    ];
    ws1['!rows'] = [{ hpt: 36 }, { hpt: 20 }, { hpt: 10 }, { hpt: 28 }, { hpt: 22 }, { hpt: 40 }];
    ws1['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 8 }];

    XLSX.utils.book_append_sheet(wb, ws1, '📊 Resumo');

    /* ── 2. TRANSAÇÕES sheet ─────────────────────────────────── */
    const txHeaders = ['ID', 'Tipo', 'Descrição', 'Categoria', 'Valor', 'Data', 'Conta/Cartão', 'Destino', 'Parcela', 'Total Parcelas', 'GrupoID'];
    const txRows = data.transactions.map(t => {
        const accName = data.accounts.find(a => a.id === t.accountId)?.name || data.cards.find(c => c.id === t.accountId)?.name || t.accountId;
        const destName = data.accounts.find(a => a.id === t.destinationId)?.name || data.cards.find(c => c.id === t.destinationId)?.name || t.destinationId || '';
        return [t.id, t.type === 'income' ? 'Entrada' : (t.type === 'expense' ? 'Gasto' : 'Transferência'), t.description, t.category || '', t.amount, t.date, accName, destName, t.currentInstallment || 1, t.totalInstallments || 1, t.groupId || ''];
    });

    const ws2 = XLSX.utils.aoa_to_sheet([txHeaders, ...txRows]);

    // Style header row
    txHeaders.forEach((_, c) => {
        const addr = XLSX.utils.encode_cell({ r: 0, c });
        if (ws2[addr]) ws2[addr].s = ST.headerGreen;
    });

    // Style data rows
    txRows.forEach((row, r) => {
        const type = row[1];
        const amtStyle = type === 'Entrada' ? ST.income : (type === 'Gasto' ? ST.expense : ST.transfer);
        const base = r % 2 === 0 ? ST.cell : ST.cellAlt;
        row.forEach((_, c) => {
            const addr = XLSX.utils.encode_cell({ r: r + 1, c });
            if (!ws2[addr]) return;
            if (c === 4) { ws2[addr].s = amtStyle; ws2[addr].z = ST.numFmt; ws2[addr].t = 'n'; }
            else if (c === 5) { ws2[addr].s = { ...base, font: { color: { rgb: '94A3B8' } } }; }
            else ws2[addr].s = base;
        });
    });

    // Autofilter on header row
    ws2['!autofilter'] = { ref: `A1:K1` };
    ws2['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 35 }, { wch: 28 }, { wch: 16 }, { wch: 13 }, { wch: 22 }, { wch: 22 }, { wch: 9 }, { wch: 14 }, { wch: 14 }];
    ws2['!rows'] = [{ hpt: 24 }];

    XLSX.utils.book_append_sheet(wb, ws2, '💸 Transações');

    /* ── 3. CONTAS sheet ─────────────────────────────────────── */
    const accHeaders = ['ID', 'Nome da Conta', 'Saldo Atual'];
    const accRows = data.accounts.map(a => [a.id, a.name, a.balance]);
    const ws3 = XLSX.utils.aoa_to_sheet([accHeaders, ...accRows]);
    accHeaders.forEach((_, c) => { const addr = XLSX.utils.encode_cell({ r: 0, c }); if (ws3[addr]) ws3[addr].s = ST.headerBlue; });
    accRows.forEach((row, r) => {
        const base = r % 2 === 0 ? ST.cell : ST.cellAlt;
        row.forEach((_, c) => {
            const addr = XLSX.utils.encode_cell({ r: r + 1, c });
            if (!ws3[addr]) return;
            if (c === 2) { ws3[addr].s = { ...ST.kpiGreen, font: { color: { rgb: '00C896' }, bold: true } }; ws3[addr].z = ST.numFmt; ws3[addr].t = 'n'; }
            else ws3[addr].s = base;
        });
    });
    ws3['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 18 }];
    ws3['!rows'] = [{ hpt: 24 }];
    XLSX.utils.book_append_sheet(wb, ws3, '🏦 Contas');

    /* ── 4. CARTÕES sheet ────────────────────────────────────── */
    const cardHeaders = ['ID', 'Nome do Cartão', 'Limite', 'Dia Fechamento', 'Dia Vencimento', 'Fatura Atual', 'Disponível', 'Status'];
    const today2 = new Date().toISOString().split('T')[0];
    const cardRows = data.cards.map(c => {
        const period = getBillingPeriod(today2, c.closingDay || 1);
        const billing = getCardBilling(data, c.id, period);
        const fatura = billing?.total || 0;
        const avail = c.limit - fatura;
        return [c.id, c.name, c.limit, c.closingDay || 1, c.dueDay, fatura, avail, billing?.isPaid ? 'Paga' : (fatura > 0 ? 'Pendente' : 'Em aberto')];
    });
    const ws4 = XLSX.utils.aoa_to_sheet([cardHeaders, ...cardRows]);
    cardHeaders.forEach((_, c) => { const addr = XLSX.utils.encode_cell({ r: 0, c }); if (ws4[addr]) ws4[addr].s = ST.headerPurple; });
    cardRows.forEach((row, r) => {
        const base = r % 2 === 0 ? ST.cell : ST.cellAlt;
        row.forEach((_, c) => {
            const addr = XLSX.utils.encode_cell({ r: r + 1, c });
            if (!ws4[addr]) return;
            if (c === 2) { ws4[addr].s = { ...base, font: { color: { rgb: '94A3B8' } } }; ws4[addr].z = ST.numFmt; ws4[addr].t = 'n'; }
            else if (c === 5) { ws4[addr].s = ST.expense; ws4[addr].z = ST.numFmt; ws4[addr].t = 'n'; }
            else if (c === 6) { ws4[addr].s = ST.income; ws4[addr].z = ST.numFmt; ws4[addr].t = 'n'; }
            else if (c === 7) {
                const isPaid = row[7] === 'Paga';
                const isPending = row[7] === 'Pendente';
                ws4[addr].s = { ...base, font: { color: { rgb: isPaid ? '00C896' : (isPending ? 'FF4D6D' : '94A3B8') }, bold: isPaid || isPending } };
            }
            else ws4[addr].s = base;
        });
    });
    ws4['!cols'] = [{ wch: 14 }, { wch: 25 }, { wch: 14 }, { wch: 16 }, { wch: 17 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
    ws4['!rows'] = [{ hpt: 24 }];
    ws4['!autofilter'] = { ref: 'A1:H1' };
    XLSX.utils.book_append_sheet(wb, ws4, '💳 Cartões');

    /* ── 5. FATURAS sheet ────────────────────────────────────── */
    const billHeaders = ['Cartão', 'Período', 'Status', 'Valor', 'Data Pagamento', 'Conta Débito', 'Valor Pago'];
    const billRows = (data.cardBillings || []).map(b => {
        const cardName = data.cards.find(c => c.id === b.cardId)?.name || b.cardId;
        const accName = data.accounts.find(a => a.id === b.fromAccountId)?.name || b.fromAccountId || '';
        return [cardName, b.period, b.isPaid ? 'Paga' : 'Pendente', b.paidAmount || 0, b.paidAt || '', accName, b.paidAmount || 0];
    });
    const ws5 = XLSX.utils.aoa_to_sheet([billHeaders, ...billRows]);
    billHeaders.forEach((_, c) => { const addr = XLSX.utils.encode_cell({ r: 0, c }); if (ws5[addr]) ws5[addr].s = ST.headerGray; });
    ws5['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 14 }];
    ws5['!rows'] = [{ hpt: 24 }];
    XLSX.utils.book_append_sheet(wb, ws5, '🧾 Faturas');

    /* ── Also keep raw import-compatible sheets ──────────────── */
    const rawTxSheet = data.transactions.map(t => ({ 'ID': t.id, 'Tipo': t.type === 'income' ? 'Entrada' : (t.type === 'expense' ? 'Gasto' : 'Transferência'), 'Descrição': t.description, 'Categoria': t.category || '', 'Valor': t.amount, 'Data': t.date, 'Recorrente': t.recurring ? 'Sim' : 'Não', 'ContaID': t.accountId || '', 'DestinoID': t.destinationId || '', 'Parcela Atual': t.currentInstallment || 1, 'Total Parcelas': t.totalInstallments || 1, 'GrupoID': t.groupId || '' }));
    const rawAccSheet = data.accounts.map(a => ({ 'ID': a.id, 'Nome': a.name, 'Saldo': a.balance }));
    const rawCardSheet = data.cards.map(c => ({ 'ID': c.id, 'Nome': c.name, 'Limite': c.limit, 'Fechamento': c.closingDay || 1, 'Vencimento': c.dueDay }));
    const rawBillSheet = (data.cardBillings || []).map(b => ({ 'CartaoID': b.cardId, 'Periodo': b.period, 'Pago': b.isPaid ? 'Sim' : 'Não', 'ValorPago': b.paidAmount || '', 'DataPagamento': b.paidAt || '', 'ContaDebitoID': b.fromAccountId || '' }));
    const settingsSheet = [{ 'Configuracoes': JSON.stringify(data.settings || {}) }];

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawTxSheet.length ? rawTxSheet : [{}]), 'Transacoes');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawAccSheet.length ? rawAccSheet : [{}]), 'Contas');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawCardSheet.length ? rawCardSheet : [{}]), 'Cartoes');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawBillSheet.length ? rawBillSheet : [{}]), 'FaturasCartao');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(settingsSheet), 'Configuracoes');

    /* ── Planilha de uso offline — amigável para o usuário ──── */
    const allCats = _getAllExpenseCats();
    const accNames = data.accounts.map(a => a.name);
    const cardNames = data.cards.map(c => c.name);
    const allAccountNames = [...accNames, ...cardNames];

    // Instruções
    const wsGuide = { '!ref': 'A1:C20' };
    const guideStyle = { font: { color: { rgb: 'E2E8F0' } }, fill: { fgColor: { rgb: '16161F' } }, alignment: { wrapText: true, vertical: 'top' } };
    const guideTitle = { font: { bold: true, sz: 13, color: { rgb: '00C896' } }, fill: { fgColor: { rgb: '0D0D14' } } };
    const guideHead  = { font: { bold: true, color: { rgb: 'F1F5F9' } }, fill: { fgColor: { rgb: '1E293B' } }, border: _border('thin') };
    const guideInst  = [
        ['📋 COMO ADICIONAR DADOS OFFLINE', null, null],
        [null, null, null],
        ['PASSO 1', 'Vá para a aba "✏️ Nova Transação" abaixo', null],
        ['PASSO 2', 'Preencha uma linha por transação. Todos os campos marcados com * são obrigatórios.', null],
        ['PASSO 3', 'Salve o arquivo e importe-o no app (Backup → Carregar Planilha)', null],
        [null, null, null],
        ['CAMPO', 'O QUE PREENCHER', 'EXEMPLOS'],
        ['Tipo *', '"Entrada", "Gasto" ou "Transferência"', 'Gasto'],
        ['Descrição *', 'Nome do lançamento', 'Mercado, Salário, Netflix'],
        ['Categoria *', 'Uma das categorias da lista', allCats.slice(0,3).join(', ') + '...'],
        ['Valor *', 'Número com ponto decimal', '150.90'],
        ['Data *', 'Formato AAAA-MM-DD', today],
        ['ContaID *', 'ID da conta (veja aba Contas)', accNames[0] ? '(copie o ID da aba Contas)' : '(crie contas no app primeiro)'],
        ['Recorrente', '"Sim" se se repete todo mês', 'Sim ou Não'],
        [null, null, null],
        ['⚠️ ATENÇÃO', 'Não altere as abas "Transacoes", "Contas", "Cartoes", "FaturasCartao" e "Configuracoes" — elas são usadas pelo app para importar.', null],
    ];
    guideInst.forEach((row, r) => {
        row.forEach((val, c) => {
            const addr = XLSX.utils.encode_cell({ r, c });
            wsGuide[addr] = {
                v: val ?? '',
                s: r === 0 ? guideTitle : r === 6 ? guideHead : guideStyle
            };
        });
    });
    wsGuide['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
        ...guideInst.slice(2, 6).map((_, i) => ({ s: { r: i + 2, c: 1 }, e: { r: i + 2, c: 2 } })),
        { s: { r: 15, c: 1 }, e: { r: 15, c: 2 } },
    ];
    wsGuide['!cols'] = [{ wch: 16 }, { wch: 48 }, { wch: 32 }];
    XLSX.utils.book_append_sheet(wb, wsGuide, '📋 Como usar');

    // Aba de entrada de novas transações
    const entryHeaders = ['Tipo *', 'Descrição *', 'Categoria *', 'Valor *', 'Data *', 'ContaID *', 'Recorrente'];
    const hStyle = { font: { bold: true, color: { rgb: '000000' }, sz: 11 }, fill: { fgColor: { rgb: '00C896' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: _border() };
    const hintStyle = { font: { italic: true, color: { rgb: '64748B' }, sz: 10 }, fill: { fgColor: { rgb: '1E293B' } }, alignment: { horizontal: 'center' } };
    const emptyStyle = { fill: { fgColor: { rgb: '16161F' } }, border: _border('thin') };

    const entryHints = [
        'Entrada / Gasto / Transferência',
        'Nome do lançamento',
        allCats.slice(0,2).join(' / ') + '...',
        'Ex: 149.90',
        'Ex: ' + today,
        accNames[0] ? 'Veja ID na aba Contas' : 'Crie contas no app',
        'Sim ou Não'
    ];

    const wsEntry = XLSX.utils.aoa_to_sheet([entryHeaders, entryHints, ...Array(50).fill(entryHeaders.map(() => ''))]);
    entryHeaders.forEach((_, c) => {
        const hAddr = XLSX.utils.encode_cell({ r: 0, c });
        if (wsEntry[hAddr]) wsEntry[hAddr].s = hStyle;
        const iAddr = XLSX.utils.encode_cell({ r: 1, c });
        if (wsEntry[iAddr]) wsEntry[iAddr].s = hintStyle;
    });
    for (let r = 2; r < 52; r++) {
        entryHeaders.forEach((_, c) => {
            const addr = XLSX.utils.encode_cell({ r, c });
            if (!wsEntry[addr]) wsEntry[addr] = { v: '', s: emptyStyle };
            else wsEntry[addr].s = emptyStyle;
        });
    }
    wsEntry['!autofilter'] = { ref: 'A1:G1' };
    wsEntry['!cols'] = [{ wch: 16 }, { wch: 32 }, { wch: 26 }, { wch: 12 }, { wch: 13 }, { wch: 22 }, { wch: 13 }];
    wsEntry['!rows'] = [{ hpt: 26 }, { hpt: 18 }];
    wsEntry['!freeze'] = { xSplit: 0, ySplit: 2 };
    XLSX.utils.book_append_sheet(wb, wsEntry, '✏️ Nova Transação');

    XLSX.writeFile(wb, `Planner_MemoryCard_${today}.xlsx`);
    _backupDone = true;
    showToast('Memory Card salvo! 💾');
}

function importFromExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (typeof XLSX === 'undefined') { alert('Aguarde a biblioteca carregar.'); return; }

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const sheetTx      = wb.Sheets['Transacoes']     || wb.Sheets['Transações']  || null;
            const sheetAcc     = wb.Sheets['Contas']          || null;
            const sheetCard    = wb.Sheets['Cartoes']         || wb.Sheets['Cartões']     || null;
            const sheetBill    = wb.Sheets['FaturasCartao']   || null;
            const sheetConfig  = wb.Sheets['Configuracoes']   || null;
            const sheetEntry   = wb.Sheets['✏️ Nova Transação'] || null;

            if (!sheetTx && !sheetAcc && !sheetCard) {
                alert('Arquivo inválido! Use um backup gerado por este app.'); return;
            }

            const rawTx   = sheetTx   ? XLSX.utils.sheet_to_json(sheetTx)   : [];
            const rawAcc  = sheetAcc  ? XLSX.utils.sheet_to_json(sheetAcc)  : [];
            const rawCard = sheetCard ? XLSX.utils.sheet_to_json(sheetCard) : [];
            const rawBill = sheetBill ? XLSX.utils.sheet_to_json(sheetBill) : [];

            const transactions = rawTx.map(r => ({
                id: r['ID'] || generateId(),
                type: r['Tipo'] === 'Entrada' ? 'income' : (r['Tipo'] === 'Gasto' ? 'expense' : 'transfer'),
                description: r['Descrição'] || r['Descricao'] || '',
                category: r['Categoria'] || 'Outros',
                amount: parseFloat(r['Valor']) || 0,
                date: String(r['Data']) || '',
                recurring: r['Recorrente'] === 'Sim',
                accountId: r['ContaID'] || '',
                destinationId: r['DestinoID'] || null,
                currentInstallment: parseInt(r['Parcela Atual']) || 1,
                totalInstallments: parseInt(r['Total Parcelas']) || 1,
                groupId: r['GrupoID'] || null
            }));

            const accounts = rawAcc.map(r => ({ id: r['ID'] || generateId(), name: r['Nome'] || '', balance: parseFloat(r['Saldo']) || 0 }));

            const cards = rawCard.map(r => ({
                id: r['ID'] || generateId(), name: r['Nome'] || '',
                limit: parseFloat(r['Limite']) || 0,
                closingDay: parseInt(r['Fechamento']) || 1,
                dueDay: parseInt(r['Vencimento']) || 1
            }));

            const cardBillings = rawBill.map(r => ({
                cardId: r['CartaoID'] || '', period: r['Periodo'] || '',
                isPaid: r['Pago'] === 'Sim', paidAmount: parseFloat(r['ValorPago']) || 0,
                paidAt: r['DataPagamento'] || null, fromAccountId: r['ContaDebitoID'] || null
            }));

            // Restore settings if present
            let settings = null;
            if (sheetConfig) {
                try {
                    const rawConf = XLSX.utils.sheet_to_json(sheetConfig);
                    if (rawConf[0]?.['Configuracoes']) settings = JSON.parse(rawConf[0]['Configuracoes']);
                } catch(_) {}
            }

            // Merge entries added offline via the ✏️ Nova Transação sheet
            if (sheetEntry) {
                try {
                    const rawEntry = XLSX.utils.sheet_to_json(sheetEntry, { defval: '' });
                    // skip the hints row (row 2) — it has no valid date
                    rawEntry
                        .filter(r => r['Tipo *'] && r['Descrição *'] && r['Valor *'] && r['Data *'] && String(r['Data *']).match(/^\d{4}-\d{2}-\d{2}$/))
                        .forEach(r => {
                            const tipo = String(r['Tipo *']).trim();
                            const type = tipo === 'Entrada' ? 'income' : tipo === 'Gasto' ? 'expense' : 'transfer';
                            transactions.push({
                                id: generateId(),
                                type,
                                description: String(r['Descrição *'] || '').trim(),
                                category: String(r['Categoria *'] || 'Outros').trim(),
                                amount: parseFloat(String(r['Valor *']).replace(',', '.')) || 0,
                                date: String(r['Data *']).trim(),
                                recurring: String(r['Recorrente'] || '').toLowerCase() === 'sim',
                                accountId: String(r['ContaID *'] || '').trim(),
                                destinationId: null,
                                currentInstallment: 1,
                                totalInstallments: 1,
                                groupId: null
                            });
                        });
                } catch(_) {}
            }

            if (!confirm(`Importar ${transactions.length} transações, ${accounts.length} contas e ${cards.length} cartões?\n\nDados atuais serão substituídos.`)) {
                event.target.value = ''; return;
            }

            const importData = { transactions, accounts, cards, cardBillings };
            if (settings) importData.settings = settings;
            saveData(importData);
            if (settings?.theme) applyTheme(settings.theme);
            _currentMonth = null;
            _backupDone = true; // Importar conta como backup realizado/atualizado
            
            // Fecha o welcome modal se estiver aberto
            const welcomeModal = bootstrap.Modal.getInstance(document.getElementById('welcomeModal'));
            if (welcomeModal) welcomeModal.hide();

            renderAll();
            showToast('Memory Card carregado! ✓');
        } catch (err) {
            console.error(err);
            alert('Erro ao carregar o arquivo. Verifique se é um backup válido.');
        }
        event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}

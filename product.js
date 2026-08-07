/* Plannke product layer — general-audience experience */
(function () {
    'use strict';

    const C = globalThis.PlannkeCore;
    if (!C) { console.error('PlannkeCore não carregado.'); return; }
    let initialized = false;

    function money(value) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
    }

    function text(value, max = 160) {
        return C.cleanText(value, max);
    }

    function escapeAttr(value) {
        return text(value, 200).replace(/"/g, '&quot;');
    }

    function planningData(data) {
        C.ensurePlanning(data);
        data.planning = C.sanitizePlanning(data.planning);
        return data.planning;
    }

    function recurringSignature(rule) {
        return [rule.type, text(rule.description).toLowerCase(), text(rule.category).toLowerCase(), Number(rule.amount).toFixed(2), rule.accountId].join('|');
    }

    function convertLegacyRecurring(data) {
        const p = planningData(data);
        const signatures = new Set(p.recurringRules.map(recurringSignature));
        let changed = false;
        (data.transactions || []).forEach(tx => {
            if (!tx.recurring || tx.type === 'transfer') return;
            const rule = {
                id: C.safeId('', 'rule'),
                type: tx.type,
                description: tx.description,
                category: tx.category || 'Outros',
                amount: Number(tx.amount || 0),
                dayOfMonth: Number(String(tx.date || '').slice(8, 10)) || 1,
                accountId: tx.accountId,
                startDate: tx.date,
                endDate: '',
                active: true
            };
            const sig = recurringSignature(rule);
            if (!signatures.has(sig)) {
                p.recurringRules.push(rule);
                signatures.add(sig);
            }
            tx.recurring = false;
            changed = true;
        });
        if (changed) data.planning = C.sanitizePlanning(p);
        return changed;
    }

    function applyRulesToGenericCategories(data) {
        const p = planningData(data);
        let changed = false;
        (data.transactions || []).forEach(tx => {
            if (tx.type === 'transfer') return;
            if (!['Outros', 'Sem Categoria', '', null, undefined].includes(tx.category)) return;
            const next = C.applyCategoryRules(tx.description, tx.category || 'Outros', p.categoryRules);
            if (next && next !== tx.category) { tx.category = next; changed = true; }
        });
        return changed;
    }

    function installLedgerHooks() {
        const originalSaveData = globalThis.saveData;
        if (typeof originalSaveData !== 'function' || originalSaveData.__productWrapped) return;

        function enhancedSaveData(data) {
            if (!data || typeof data !== 'object') return originalSaveData(data);
            planningData(data);
            convertLegacyRecurring(data);
            applyRulesToGenericCategories(data);
            C.migrateLedger(data, C.localDateString());
            data.planning = C.sanitizePlanning(data.planning);
            return originalSaveData(data);
        }
        enhancedSaveData.__productWrapped = true;
        globalThis.saveData = enhancedSaveData;

        const originalSaveAccount = globalThis.saveAccount;
        globalThis.saveAccount = function (id, name, balance) {
            const data = getData();
            C.migrateLedger(data, C.localDateString());
            const desired = Number(balance || 0);
            if (id) {
                const account = data.accounts.find(a => a.id === id);
                if (!account) return originalSaveAccount(id, name, balance);
                const delta = desired - Number(account.balance || 0);
                account.name = text(name, 120);
                account.openingBalance = Number(account.openingBalance || 0) + delta;
            } else {
                data.accounts.push({
                    id: typeof generateId === 'function' ? generateId() : C.safeId('', 'account'),
                    name: text(name, 120),
                    openingBalance: desired,
                    balance: desired
                });
            }
            globalThis.saveData(data);
        };

        const originalSaveTransaction = globalThis.saveTransaction;
        globalThis.saveTransaction = function (...args) {
            originalSaveTransaction(...args);
            const [id, type, description, amount, date, accountId, category, currentInstallment, totalInstallments, groupId] = args;
            const data = getData();
            const desiredStatus = document.getElementById('tx-status')?.value || 'auto';
            const tagsRaw = document.getElementById('tx-tags')?.value || '';
            let tx = id ? data.transactions.find(t => t.id === id) : null;
            if (!tx) {
                const candidates = [...data.transactions].reverse();
                tx = candidates.find(t =>
                    t.type === type && t.description === text(description, 300) &&
                    Math.abs(Number(t.amount) - Number(amount)) < 0.005 &&
                    t.accountId === accountId &&
                    (!groupId || t.groupId === groupId) &&
                    (!currentInstallment || Number(t.currentInstallment) === Number(currentInstallment))
                );
            }
            if (tx) {
                tx.status = desiredStatus === 'completed' || desiredStatus === 'planned'
                    ? desiredStatus
                    : (String(tx.date) > C.localDateString() ? 'planned' : 'completed');
                tx.tags = tagsRaw.split(',').map(t => text(t, 40)).filter(Boolean).slice(0, 10);

                const recurringRequested = !!args[11] && type !== 'transfer';
                if (recurringRequested) {
                    const p = planningData(data);
                    const rule = {
                        id: C.safeId('', 'rule'), type, description: tx.description,
                        category: category || 'Outros', amount: Number(amount),
                        dayOfMonth: Number(String(date).slice(8, 10)) || 1,
                        accountId, startDate: date, endDate: '', active: true
                    };
                    const sig = recurringSignature(rule);
                    if (!p.recurringRules.some(r => recurringSignature(r) === sig)) p.recurringRules.push(rule);
                    tx.recurring = false;
                    data.planning = C.sanitizePlanning(p);
                }
                globalThis.saveData(data);
            }
        };

        // Migrate the current browser data once, preserving the authoritative current balance.
        const existing = getData();
        const legacyRecurringChanged = convertLegacyRecurring(existing);
        const migrated = C.migrateLedger(existing, C.localDateString());
        if (legacyRecurringChanged || migrated.changed) globalThis.saveData(existing);
    }

    function injectAssets() {
        if (!document.querySelector('link[href="product.css"]')) {
            const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'product.css'; document.head.appendChild(css);
        }
        if (!document.querySelector('link[rel="manifest"]')) {
            const manifest = document.createElement('link'); manifest.rel = 'manifest'; manifest.href = 'manifest.webmanifest'; document.head.appendChild(manifest);
        }
        if ('serviceWorker' in navigator && location.protocol !== 'file:') {
            navigator.serviceWorker.register('./sw.js').catch(err => console.warn('PWA indisponível:', err));
        }
    }

    function simplifyNavigation() {
        const names = { dashboard: 'Início', movimentacao: 'Movimentações', projecao: 'Planejamento', accounts: 'Contas', backup: 'Backup' };
        document.querySelectorAll('.planner-pill-nav [data-target]').forEach(link => {
            const name = names[link.dataset.target]; if (name) link.textContent = name;
        });
        const shortcut = [...document.querySelectorAll('.shortcut-row span')];
        shortcut.forEach(el => {
            el.textContent = el.textContent.replace('Dashboard', 'Início').replace('Lançamentos (Movimentação)', 'Movimentações');
        });
    }

    function injectTransactionFields() {
        const dateGroup = document.getElementById('tx-date')?.closest('.mb-3');
        if (!dateGroup || document.getElementById('tx-status')) return;
        const box = document.createElement('div');
        box.className = 'row g-2 mb-3 product-tx-extra';
        box.innerHTML = `
            <div class="col-12 col-sm-5">
                <label for="tx-status" class="form-label text-muted small fw-semibold text-uppercase">Situação</label>
                <select id="tx-status" class="form-select">
                    <option value="auto">Automático pela data</option>
                    <option value="completed">Realizada</option>
                    <option value="planned">Prevista</option>
                </select>
            </div>
            <div class="col-12 col-sm-7">
                <label for="tx-tags" class="form-label text-muted small fw-semibold text-uppercase">Tags</label>
                <input id="tx-tags" class="form-control" placeholder="viagem, trabalho, férias" autocomplete="off">
            </div>`;
        dateGroup.after(box);

        document.getElementById('tx-desc')?.addEventListener('blur', () => {
            const desc = document.getElementById('tx-desc')?.value || '';
            const select = document.getElementById('tx-category');
            if (!select || !desc) return;
            const p = planningData(getData());
            const suggested = C.applyCategoryRules(desc, select.value || 'Outros', p.categoryRules);
            if ([...select.options].some(o => o.value === suggested)) select.value = suggested;
        });

        const originalEdit = globalThis.edTx;
        globalThis.edTx = function (id) {
            originalEdit(id);
            const tx = getData().transactions.find(t => t.id === id);
            if (!tx) return;
            const status = document.getElementById('tx-status');
            const tags = document.getElementById('tx-tags');
            if (status) status.value = tx.status || 'auto';
            if (tags) tags.value = Array.isArray(tx.tags) ? tx.tags.join(', ') : '';
        };

        const originalDup = globalThis.dupTx;
        globalThis.dupTx = function (id) {
            originalDup(id);
            const status = document.getElementById('tx-status');
            const tags = document.getElementById('tx-tags');
            if (status) status.value = 'auto';
            const tx = getData().transactions.find(t => t.id === id);
            if (tags) tags.value = Array.isArray(tx?.tags) ? tx.tags.join(', ') : '';
        };

        document.getElementById('transactionModal')?.addEventListener('hidden.bs.modal', () => {
            const status = document.getElementById('tx-status'); if (status) status.value = 'auto';
            const tags = document.getElementById('tx-tags'); if (tags) tags.value = '';
        });
    }

    function patchRenderers() {
        const originalRenderDashboard = globalThis.renderDashboard;
        if (typeof originalRenderDashboard === 'function') {
            globalThis.renderDashboard = function (data) {
                originalRenderDashboard(data);
                const today = C.localDateString();
                const completed = (data.transactions || []).filter(t => t.status !== 'planned' && t.date <= today);
                const month = today.slice(0, 7);
                const income = completed.filter(t => t.type === 'income' && t.date.startsWith(month)).reduce((s, t) => s + Number(t.amount), 0);
                const expense = completed.filter(t => t.type === 'expense' && t.date.startsWith(month)).reduce((s, t) => s + Number(t.amount), 0);
                const incEl = document.getElementById('total-income'); if (incEl) incEl.textContent = money(income);
                const expEl = document.getElementById('total-expense'); if (expEl) expEl.textContent = money(expense);
                renderFinancialPulse(data);
            };
        }

        const originalRenderChart = globalThis.renderChart;
        if (typeof originalRenderChart === 'function') {
            globalThis.renderChart = function (data) {
                const today = C.localDateString();
                const filtered = { ...data, transactions: (data.transactions || []).filter(t => t.status !== 'planned' && t.date <= today) };
                return originalRenderChart(filtered);
            };
        }

        const originalRenderBudgets = globalThis.renderBudgets;
        if (typeof originalRenderBudgets === 'function') {
            globalThis.renderBudgets = function (data) {
                const today = C.localDateString();
                return originalRenderBudgets({ ...data, transactions: (data.transactions || []).filter(t => t.status !== 'planned' && t.date <= today) });
            };
        }

        const originalProjection = globalThis.renderProjection;
        if (typeof originalProjection === 'function') {
            globalThis.renderProjection = function (data) {
                const actual = data || getData();
                const p = planningData(actual);
                const today = C.localDateString();
                const future = C.recurringOccurrences(p.recurringRules, C.addDays(today, 1), C.addDays(today, 370));
                const enriched = { ...actual, transactions: [...(actual.transactions || []), ...future.map(t => ({ ...t, recurring: false }))] };
                const result = originalProjection(enriched);
                renderPlanningHub(actual);
                return result;
            };
        }

        const originalRenderTransactions = globalThis.renderTransactions;
        if (typeof originalRenderTransactions === 'function') {
            globalThis.renderTransactions = function (data) {
                const result = originalRenderTransactions(data);
                decorateTransactionStatuses(data || getData());
                return result;
            };
        }
    }

    function renderFinancialPulse(data) {
        const dashboard = document.getElementById('dashboard-view');
        if (!dashboard) return;
        let section = document.getElementById('financial-pulse');
        if (!section) {
            section = document.createElement('section');
            section.id = 'financial-pulse';
            section.className = 'product-pulse mb-3';
            dashboard.prepend(section);
        }
        const pulse = C.getFinancialPulse(data, C.localDateString());
        const horizonLabel = formatDate(pulse.horizon);
        const freeClass = pulse.free >= 0 ? 'good' : 'bad';
        let insight;
        if (pulse.free < 0) insight = `Se todos os compromissos forem mantidos, faltam ${money(Math.abs(pulse.free))} até ${horizonLabel}.`;
        else if (pulse.nextIncome) insight = `Você tem cerca de ${money(pulse.daily)} por dia livres até a próxima entrada em ${horizonLabel}.`;
        else insight = `Sem próxima entrada cadastrada; o cálculo usa o fim do mês (${horizonLabel}).`;

        section.innerHTML = `
            <div class="product-section-heading">
                <div><span class="product-eyebrow">Visão rápida</span><h5>Seu dinheiro hoje</h5></div>
                <span class="product-privacy"><i class="ph ph-device-mobile"></i> dados locais</span>
            </div>
            <div class="product-pulse-grid">
                <div class="product-metric"><span>Saldo atual</span><strong>${money(pulse.balance)}</strong><small>nas contas bancárias</small></div>
                <div class="product-metric"><span>Comprometido</span><strong>${money(pulse.committed)}</strong><small>cartões, reservas e previstos</small></div>
                <div class="product-metric ${freeClass}"><span>Dinheiro livre</span><strong>${money(pulse.free)}</strong><small>até ${horizonLabel}</small></div>
                <div class="product-metric"><span>Livre por dia</span><strong>${money(pulse.daily)}</strong><small>${pulse.days} dia${pulse.days === 1 ? '' : 's'} no horizonte</small></div>
            </div>
            <div class="product-insight"><i class="ph ph-sparkle"></i><span>${insight}</span></div>`;
    }

    function decorateTransactionStatuses(data) {
        const statusByDescription = new Map();
        (data.transactions || []).forEach(tx => statusByDescription.set(`${tx.description}|${formatDate(tx.date)}|${money(tx.amount)}`, tx.status));
        document.querySelectorAll('.tx-item, #all-transactions-body tr, .tx-mobile-card').forEach(row => {
            if (row.querySelector('.product-status-badge')) return;
            const raw = row.textContent || '';
            const planned = (data.transactions || []).find(tx => tx.status === 'planned' && raw.includes(tx.description) && raw.includes(formatDate(tx.date)));
            if (!planned) return;
            const target = row.querySelector('.tx-item-tags, td:first-child .mt-1, .tx-mobile-info .d-flex');
            if (!target) return;
            const badge = document.createElement('span');
            badge.className = 'tag product-status-badge'; badge.textContent = 'Prevista'; target.appendChild(badge);
        });
    }

    function accountOptions(data, selected = '') {
        return (data.accounts || []).map(a => `<option value="${escapeAttr(a.id)}" ${a.id === selected ? 'selected' : ''}>${text(a.name)} · ${money(a.balance)}</option>`).join('');
    }

    function expenseCategoryOptions() {
        try {
            const cats = typeof _getAllExpenseCats === 'function' ? _getAllExpenseCats() : [];
            return cats.map(c => `<option value="${escapeAttr(c)}">${text(c)}</option>`).join('');
        } catch (_) { return '<option value="Outros">Outros</option>'; }
    }

    function renderPlanningHub(data) {
        const view = document.getElementById('projecao-view');
        if (!view) return;
        let hub = document.getElementById('product-planning-hub');
        if (!hub) {
            hub = document.createElement('section'); hub.id = 'product-planning-hub';
            view.prepend(hub);
        }
        const p = planningData(data);
        const today = C.localDateString();
        const calendar = C.buildFinancialCalendar(data, today, C.addDays(today, 45)).slice(0, 14);
        const recurring = p.recurringRules;
        const totalReserved = p.reserves.reduce((s, r) => s + r.amount, 0) + p.goals.reduce((s, g) => s + g.currentAmount, 0);

        const recurringRows = recurring.map(r => `
            <div class="product-list-row">
                <div><strong>${text(r.description)}</strong><small>${r.type === 'income' ? 'Entrada' : 'Saída'} · dia ${r.dayOfMonth} · ${text(r.category)}</small></div>
                <div class="product-row-value ${r.type}">${r.type === 'income' ? '+' : '-'}${money(r.amount)} <button data-action="delete-rule" data-id="${escapeAttr(r.id)}" aria-label="Excluir"><i class="ph ph-trash"></i></button></div>
            </div>`).join('') || '<p class="text-muted small mb-0">Nenhum compromisso recorrente cadastrado.</p>';

        const goalRows = p.goals.map(g => {
            const pct = Math.min(100, g.targetAmount ? (g.currentAmount / g.targetAmount) * 100 : 0);
            return `<div class="product-goal">
                <div class="d-flex justify-content-between gap-2"><div><strong>${text(g.name)}</strong><small>${g.targetDate ? `até ${formatDate(g.targetDate)}` : 'sem prazo'}</small></div><button data-action="delete-goal" data-id="${escapeAttr(g.id)}"><i class="ph ph-trash"></i></button></div>
                <div class="product-progress"><span style="width:${pct}%"></span></div>
                <div class="d-flex align-items-center gap-2"><input class="form-control form-control-sm" type="number" min="0" step="0.01" data-goal-current="${escapeAttr(g.id)}" value="${Number(g.currentAmount).toFixed(2)}"><span class="tiny text-muted">de ${money(g.targetAmount)}</span><button class="btn btn-sm btn-outline-primary" data-action="save-goal-current" data-id="${escapeAttr(g.id)}">Atualizar</button></div>
            </div>`;
        }).join('') || '<p class="text-muted small mb-0">Crie uma meta para separar dinheiro de um objetivo.</p>';

        const reserveRows = p.reserves.map(r => `<div class="product-list-row"><div><strong>${text(r.name)}</strong><small>Reserva separada do dinheiro livre</small></div><div class="product-row-value">${money(r.amount)} <button data-action="delete-reserve" data-id="${escapeAttr(r.id)}"><i class="ph ph-trash"></i></button></div></div>`).join('') || '<p class="text-muted small mb-0">Nenhuma reserva definida.</p>';

        const ruleRows = p.categoryRules.map(r => `<div class="product-chip-rule"><span>“${text(r.contains)}” → <strong>${text(r.category)}</strong></span><button data-action="delete-cat-rule" data-id="${escapeAttr(r.id)}"><i class="ph ph-x"></i></button></div>`).join('') || '<p class="text-muted small mb-0">Ex.: UBER → Transporte / Combustível.</p>';

        const calendarRows = calendar.map(item => `<div class="product-calendar-row"><span class="product-calendar-date">${formatDate(item.date).slice(0,5)}</span><div><strong>${text(item.description)}</strong><small>${item.synthetic ? 'Recorrente' : 'Prevista'} · ${text(item.category || '')}</small></div><span class="product-calendar-value ${item.type}">${item.type === 'income' ? '+' : item.type === 'expense' ? '-' : ''}${money(item.amount)}</span></div>`).join('') || '<p class="text-muted small mb-0">Nenhum compromisso previsto nos próximos 45 dias.</p>';

        hub.innerHTML = `
            <div class="product-section-heading mb-3"><div><span class="product-eyebrow">Planejamento</span><h4>Organize antes de gastar</h4></div><span class="product-total-reserved">Reservado: <strong>${money(totalReserved)}</strong></span></div>
            <div class="row g-3 mb-4">
                <div class="col-12 col-lg-6"><div class="card h-100"><div class="card-body">
                    <div class="product-card-title"><div><i class="ph ph-repeat"></i><strong>Fixos e recorrentes</strong></div><small>Entram automaticamente nas previsões</small></div>
                    <div class="product-list mb-3">${recurringRows}</div>
                    <details class="product-details"><summary>Adicionar recorrência</summary>
                        <form id="product-recurring-form" class="product-inline-form mt-3">
                            <select name="type" class="form-select"><option value="expense">Saída</option><option value="income">Entrada</option></select>
                            <input name="description" class="form-control" placeholder="Ex.: Aluguel" required>
                            <input name="amount" class="form-control" type="number" step="0.01" min="0.01" placeholder="Valor" required>
                            <input name="day" class="form-control" type="number" min="1" max="31" placeholder="Dia" required>
                            <select name="accountId" class="form-select" required><option value="">Conta...</option>${accountOptions(data)}</select>
                            <input name="category" class="form-control" placeholder="Categoria" value="Outros">
                            <button class="btn btn-primary" type="submit">Adicionar</button>
                        </form>
                    </details>
                </div></div></div>
                <div class="col-12 col-lg-6"><div class="card h-100"><div class="card-body">
                    <div class="product-card-title"><div><i class="ph ph-target"></i><strong>Metas</strong></div><small>O valor guardado deixa de aparecer como dinheiro livre</small></div>
                    <div class="product-goals mb-3">${goalRows}</div>
                    <details class="product-details"><summary>Nova meta</summary>
                        <form id="product-goal-form" class="product-inline-form mt-3">
                            <input name="name" class="form-control" placeholder="Ex.: Viagem" required>
                            <input name="targetAmount" class="form-control" type="number" step="0.01" min="0.01" placeholder="Objetivo R$" required>
                            <input name="currentAmount" class="form-control" type="number" step="0.01" min="0" placeholder="Já guardado">
                            <input name="targetDate" class="form-control" type="date">
                            <button class="btn btn-primary" type="submit">Criar</button>
                        </form>
                    </details>
                </div></div></div>
                <div class="col-12 col-lg-6"><div class="card h-100"><div class="card-body">
                    <div class="product-card-title"><div><i class="ph ph-vault"></i><strong>Reservas</strong></div><small>Emergência, impostos, manutenção...</small></div>
                    <div class="product-list mb-3">${reserveRows}</div>
                    <form id="product-reserve-form" class="product-inline-form compact"><input name="name" class="form-control" placeholder="Nome" required><input name="amount" class="form-control" type="number" step="0.01" min="0.01" placeholder="Valor" required><button class="btn btn-outline-primary" type="submit">Reservar</button></form>
                </div></div></div>
                <div class="col-12 col-lg-6"><div class="card h-100"><div class="card-body">
                    <div class="product-card-title"><div><i class="ph ph-magic-wand"></i><strong>Categorização automática</strong></div><small>Regras ficam apenas no seu dispositivo</small></div>
                    <div class="product-rule-list mb-3">${ruleRows}</div>
                    <form id="product-category-rule-form" class="product-inline-form compact"><input name="contains" class="form-control" placeholder="Texto, ex.: UBER" required><input name="category" class="form-control" placeholder="Categoria" required><button class="btn btn-outline-primary" type="submit">Criar regra</button></form>
                </div></div></div>
            </div>
            <div class="card mb-4"><div class="card-body"><div class="product-card-title"><div><i class="ph ph-calendar-dots"></i><strong>Calendário financeiro — próximos 45 dias</strong></div><small>Transações previstas + recorrências</small></div><div class="product-calendar">${calendarRows}</div></div></div>`;

        attachPlanningEvents(hub);
    }

    function attachPlanningEvents(hub) {
        function save(mutator) {
            const data = getData(); const p = planningData(data); mutator(p, data); data.planning = C.sanitizePlanning(p); globalThis.saveData(data); renderAll();
        }
        hub.querySelector('#product-recurring-form')?.addEventListener('submit', e => {
            e.preventDefault(); const f = new FormData(e.currentTarget);
            save(p => p.recurringRules.push({ id: C.safeId('', 'rule'), type: f.get('type'), description: text(f.get('description')), amount: Number(f.get('amount')), dayOfMonth: Number(f.get('day')), accountId: String(f.get('accountId')), category: text(f.get('category') || 'Outros'), startDate: C.localDateString(), endDate: '', active: true }));
            showToast?.('Recorrência adicionada.');
        });
        hub.querySelector('#product-goal-form')?.addEventListener('submit', e => {
            e.preventDefault(); const f = new FormData(e.currentTarget);
            save(p => p.goals.push({ id: C.safeId('', 'goal'), name: text(f.get('name')), targetAmount: Number(f.get('targetAmount')), currentAmount: Number(f.get('currentAmount') || 0), targetDate: String(f.get('targetDate') || '') }));
            showToast?.('Meta criada.');
        });
        hub.querySelector('#product-reserve-form')?.addEventListener('submit', e => {
            e.preventDefault(); const f = new FormData(e.currentTarget);
            save(p => p.reserves.push({ id: C.safeId('', 'reserve'), name: text(f.get('name')), amount: Number(f.get('amount')) }));
            showToast?.('Reserva criada.');
        });
        hub.querySelector('#product-category-rule-form')?.addEventListener('submit', e => {
            e.preventDefault(); const f = new FormData(e.currentTarget);
            save(p => p.categoryRules.push({ id: C.safeId('', 'catrule'), contains: text(f.get('contains')).toLowerCase(), category: text(f.get('category')) }));
            showToast?.('Regra de categoria criada.');
        });
        hub.addEventListener('click', e => {
            const button = e.target.closest('[data-action]'); if (!button) return;
            const id = button.dataset.id; const action = button.dataset.action;
            save(p => {
                if (action === 'delete-rule') p.recurringRules = p.recurringRules.filter(x => x.id !== id);
                if (action === 'delete-goal') p.goals = p.goals.filter(x => x.id !== id);
                if (action === 'delete-reserve') p.reserves = p.reserves.filter(x => x.id !== id);
                if (action === 'delete-cat-rule') p.categoryRules = p.categoryRules.filter(x => x.id !== id);
                if (action === 'save-goal-current') {
                    const input = hub.querySelector(`[data-goal-current="${CSS.escape(id)}"]`);
                    const goal = p.goals.find(x => x.id === id); if (goal && input) goal.currentAmount = Math.max(0, Number(input.value || 0));
                }
            });
        });
    }

    function injectBankImport() {
        const backup = document.getElementById('backup-view');
        if (!backup || document.getElementById('product-bank-import')) return;
        const row = backup.querySelector('.row');
        const card = document.createElement('div');
        card.className = 'col-12 col-md-7 col-lg-5 mt-3'; card.id = 'product-bank-import';
        card.innerHTML = `<div class="card"><div class="card-body p-4"><div class="product-card-title"><div><i class="ph ph-file-arrow-up"></i><strong>Importar extrato bancário</strong></div><small>OFX ou CSV — sem conexão com seu banco</small></div><p class="small text-muted">O arquivo é lido no navegador. O Plannke tenta evitar duplicatas e aplica suas regras de categoria.</p><select id="product-bank-account" class="form-select mb-2"><option value="">Escolha a conta...</option>${accountOptions(getData())}</select><label class="btn btn-outline-primary w-100">Selecionar OFX / CSV<input id="product-bank-file" class="d-none" type="file" accept=".ofx,.csv,text/csv"></label><div id="product-bank-result" class="tiny text-muted mt-2"></div></div></div>`;
        row.appendChild(card);
        card.querySelector('#product-bank-file').addEventListener('change', importBankFile);

        const copy = backup.querySelector('.card.text-center p.text-muted');
        if (copy) copy.innerHTML = 'Seus dados ficam no <strong>navegador</strong> e o Excel funciona como seu backup portátil — o seu “Memory Card”.';
        const info = backup.querySelector('.card.text-center .tiny.text-muted');
        if (info) info.innerHTML = '<i class="ph ph-info me-1"></i> O autosave local persiste entre sessões. Faça backups externos regularmente.';
    }

    function importBankFile(event) {
        const file = event.target.files?.[0]; const accountId = document.getElementById('product-bank-account')?.value;
        if (!file || !accountId) { showToast?.('Escolha a conta antes do arquivo.', 'error'); event.target.value = ''; return; }
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = getData(); const p = planningData(data);
                const incoming = file.name.toLowerCase().endsWith('.ofx')
                    ? C.parseOfxBank(reader.result, accountId, p.categoryRules)
                    : C.parseCsvBank(reader.result, accountId, p.categoryRules);
                const fresh = C.dedupeImported(data.transactions, incoming);
                if (!incoming.length) { showToast?.('Não consegui identificar as colunas/transações desse extrato.', 'error'); return; }
                if (!fresh.length) { showToast?.('Nenhuma transação nova encontrada.', 'info'); return; }
                if (!confirm(`Foram encontradas ${incoming.length} movimentações e ${fresh.length} são novas. Importar?`)) return;
                data.transactions.push(...fresh); globalThis.saveData(data); renderAll();
                const result = document.getElementById('product-bank-result'); if (result) result.textContent = `${fresh.length} movimentações importadas.`;
                showToast?.(`${fresh.length} movimentações importadas.`);
            } catch (err) { console.error(err); showToast?.('Erro ao ler o extrato.', 'error'); }
            event.target.value = '';
        };
        reader.readAsText(file, 'windows-1252');
    }

    function improveWelcome() {
        const modal = document.getElementById('welcomeModal'); if (!modal) return;
        const tagline = modal.querySelector('.welcome-tagline'); if (tagline) tagline.textContent = 'Seu dinheiro, sob seu controle.';
        const intro = modal.querySelector('.welcome-header .text-muted'); if (intro) intro.textContent = 'Como você quer começar?';
        const options = modal.querySelector('.welcome-options');
        if (options && !options.querySelector('.product-import-option')) {
            const item = document.createElement('div'); item.className = 'welcome-option-card product-import-option';
            item.innerHTML = '<div class="opt-icon browser"><i class="ph ph-file-arrow-up"></i></div><div class="opt-text"><h6>Importar extrato</h6><p>Começar com um arquivo OFX ou CSV do banco</p></div>';
            item.addEventListener('click', () => {
                bootstrap.Modal.getInstance(modal)?.hide();
                _navigateTo?.('backup');
                setTimeout(() => document.getElementById('product-bank-file')?.click(), 200);
            });
            options.appendChild(item);
        }
    }

    function init() {
        if (initialized) return; initialized = true;
        injectAssets();
        installLedgerHooks();
        simplifyNavigation();
        injectTransactionFields();
        patchRenderers();
        injectBankImport();
        improveWelcome();
        try { renderAll(); } catch (err) { console.warn('Atualização visual do produto:', err); }
        globalThis.addEventListener('plannke:data-changed', () => {
            setTimeout(() => { injectBankImport(); }, 0);
        });
    }

    globalThis.PlannkeProduct = { init };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();

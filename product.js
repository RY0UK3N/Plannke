/* Plannke product layer — general-audience experience */
(function () {
    'use strict';

    const C = globalThis.PlannkeCore;
    if (!C) { console.error('PlannkeCore não carregado.'); return; }
    let initialized = false;

    const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
    const text = (value, max = 160) => C.cleanText(value, max);
    const escapeAttr = value => text(value, 200).replace(/"/g, '&quot;');
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    function planningData(data) {
        C.ensurePlanning(data);
        data.planning = C.sanitizePlanning(data.planning);
        return data.planning;
    }

    function householdData(data) {
        if (!data.settings || typeof data.settings !== 'object') data.settings = {};
        const raw = data.settings.household && typeof data.settings.household === 'object' ? data.settings.household : {};
        const ids = new Set();
        const members = (Array.isArray(raw.members) ? raw.members : []).map((member, index) => {
            let id = C.safeId(member?.id, `member${index + 1}`);
            while (ids.has(id)) id = C.safeId('', 'member');
            ids.add(id);
            return { id, name: text(member?.name || `Pessoa ${index + 1}`, 80) };
        }).filter(m => m.name);
        data.settings.household = { enabled: !!raw.enabled || members.length > 0, members };
        return data.settings.household;
    }

    function sharedMeta(data) {
        if (!data.settings || typeof data.settings !== 'object') data.settings = {};
        if (!data.settings.sharedTransactionMeta || typeof data.settings.sharedTransactionMeta !== 'object') data.settings.sharedTransactionMeta = {};
        return data.settings.sharedTransactionMeta;
    }

    function restoreSharedMeta(data) {
        const meta = sharedMeta(data);
        let changed = false;
        (data.transactions || []).forEach(tx => {
            const saved = meta[tx.id];
            if (!saved || typeof saved !== 'object') return;
            if (!tx.paidByMemberId && saved.paidByMemberId) { tx.paidByMemberId = saved.paidByMemberId; changed = true; }
            if ((!Array.isArray(tx.sharedWithMemberIds) || !tx.sharedWithMemberIds.length) && Array.isArray(saved.sharedWithMemberIds)) {
                tx.sharedWithMemberIds = saved.sharedWithMemberIds.slice(0, 12); changed = true;
            }
        });
        return changed;
    }

    function snapshotSharedMeta(data) {
        const meta = {};
        (data.transactions || []).forEach(tx => {
            if (!tx.paidByMemberId && (!Array.isArray(tx.sharedWithMemberIds) || !tx.sharedWithMemberIds.length)) return;
            meta[tx.id] = {
                paidByMemberId: tx.paidByMemberId || null,
                sharedWithMemberIds: Array.isArray(tx.sharedWithMemberIds) ? tx.sharedWithMemberIds.slice(0, 12) : []
            };
        });
        data.settings.sharedTransactionMeta = meta;
        householdData(data);
        return data;
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
                id: C.safeId('', 'rule'), type: tx.type, description: tx.description,
                category: tx.category || 'Outros', amount: Number(tx.amount || 0),
                dayOfMonth: Number(String(tx.date || '').slice(8, 10)) || 1,
                accountId: tx.accountId, startDate: tx.date, endDate: '', active: true
            };
            const sig = recurringSignature(rule);
            if (!signatures.has(sig)) { p.recurringRules.push(rule); signatures.add(sig); }
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
            if (tx.type === 'transfer' || !['Outros', 'Sem Categoria', '', null, undefined].includes(tx.category)) return;
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
            householdData(data);
            restoreSharedMeta(data);
            convertLegacyRecurring(data);
            applyRulesToGenericCategories(data);
            C.migrateLedger(data, C.localDateString());
            data.planning = C.sanitizePlanning(data.planning);
            snapshotSharedMeta(data);
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
                data.accounts.push({ id: generateId(), name: text(name, 120), openingBalance: desired, balance: desired });
            }
            globalThis.saveData(data);
        };

        const originalSaveTransaction = globalThis.saveTransaction;
        globalThis.saveTransaction = function (...args) {
            originalSaveTransaction(...args);
            const [id, type, description, amount, date, accountId, category, currentInstallment, , groupId] = args;
            const data = getData();
            const desiredStatus = document.getElementById('tx-status')?.value || 'auto';
            const tagsRaw = document.getElementById('tx-tags')?.value || '';
            let tx = id ? data.transactions.find(t => t.id === id) : null;
            if (!tx) {
                tx = [...data.transactions].reverse().find(t =>
                    t.type === type && t.description === text(description, 300) &&
                    Math.abs(Number(t.amount) - Number(amount)) < 0.005 && t.accountId === accountId &&
                    (!groupId || t.groupId === groupId) && (!currentInstallment || Number(t.currentInstallment) === Number(currentInstallment))
                );
            }
            if (!tx) return;
            tx.status = ['completed', 'planned'].includes(desiredStatus) ? desiredStatus : (String(tx.date) > C.localDateString() ? 'planned' : 'completed');
            tx.tags = tagsRaw.split(',').map(t => text(t, 40)).filter(Boolean).slice(0, 10);
            tx.paidByMemberId = document.getElementById('tx-paid-by')?.value || null;
            tx.sharedWithMemberIds = [...(document.getElementById('tx-shared-with')?.selectedOptions || [])].map(o => o.value).filter(Boolean).slice(0, 12);

            const recurringRequested = !!args[11] && type !== 'transfer';
            if (recurringRequested) {
                const p = planningData(data);
                const rule = {
                    id: C.safeId('', 'rule'), type, description: tx.description, category: category || 'Outros',
                    amount: Number(amount), dayOfMonth: Number(String(date).slice(8, 10)) || 1,
                    accountId, startDate: date, endDate: '', active: true
                };
                if (!p.recurringRules.some(r => recurringSignature(r) === recurringSignature(rule))) p.recurringRules.push(rule);
                tx.recurring = false;
            }
            globalThis.saveData(data);
        };

        const existing = getData();
        const legacyRecurringChanged = convertLegacyRecurring(existing);
        const sharedChanged = restoreSharedMeta(existing);
        const migrated = C.migrateLedger(existing, C.localDateString());
        if (legacyRecurringChanged || sharedChanged || migrated.changed) globalThis.saveData(existing);
    }

    function injectAssets() {
        if (!document.querySelector('link[href="product.css"]')) {
            const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'product.css'; document.head.appendChild(css);
        }
        if (!document.querySelector('link[rel="manifest"]')) {
            const manifest = document.createElement('link'); manifest.rel = 'manifest'; manifest.href = 'manifest.webmanifest'; document.head.appendChild(manifest);
        }
        if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(err => console.warn('PWA indisponível:', err));
    }

    function simplifyNavigation() {
        const names = { dashboard: 'Início', movimentacao: 'Movimentações', projecao: 'Planejamento', accounts: 'Contas', backup: 'Backup' };
        document.querySelectorAll('.planner-pill-nav [data-target]').forEach(link => { if (names[link.dataset.target]) link.textContent = names[link.dataset.target]; });
    }

    function memberOptions(data, selected = '', includeEmpty = true) {
        const h = householdData(data);
        return `${includeEmpty ? '<option value="">Só eu / não dividir</option>' : ''}${h.members.map(m => `<option value="${escapeAttr(m.id)}" ${m.id === selected ? 'selected' : ''}>${text(m.name)}</option>`).join('')}`;
    }

    function injectTransactionFields() {
        const dateGroup = document.getElementById('tx-date')?.closest('.mb-3');
        if (!dateGroup || document.getElementById('tx-status')) return;
        const box = document.createElement('div');
        box.className = 'product-tx-extra';
        box.innerHTML = `
            <div class="row g-2 mb-3">
                <div class="col-12 col-sm-5"><label class="form-label text-muted small fw-semibold text-uppercase">Situação</label><select id="tx-status" class="form-select"><option value="auto">Automático pela data</option><option value="completed">Realizada</option><option value="planned">Prevista</option></select></div>
                <div class="col-12 col-sm-7"><label class="form-label text-muted small fw-semibold text-uppercase">Tags</label><input id="tx-tags" class="form-control" placeholder="viagem, trabalho, férias" autocomplete="off"></div>
            </div>
            <details id="tx-sharing-details" class="product-sharing-details mb-3"><summary><i class="ph ph-users-three me-1"></i>Dividir este gasto</summary><div class="row g-2 mt-1"><div class="col-12 col-sm-5"><label class="form-label small text-muted">Pago por</label><select id="tx-paid-by" class="form-select"></select></div><div class="col-12 col-sm-7"><label class="form-label small text-muted">Dividir igualmente com</label><select id="tx-shared-with" class="form-select" multiple size="3"></select></div></div></details>`;
        dateGroup.after(box);

        const refreshMembers = () => {
            const data = getData();
            const paid = document.getElementById('tx-paid-by');
            const shared = document.getElementById('tx-shared-with');
            if (paid) paid.innerHTML = memberOptions(data);
            if (shared) shared.innerHTML = memberOptions(data, '', false);
            const details = document.getElementById('tx-sharing-details');
            if (details) details.classList.toggle('d-none', householdData(data).members.length < 2);
        };
        refreshMembers();

        document.getElementById('tx-desc')?.addEventListener('blur', () => {
            const desc = document.getElementById('tx-desc')?.value || '';
            const select = document.getElementById('tx-category');
            if (!select || !desc) return;
            const suggested = C.applyCategoryRules(desc, select.value || 'Outros', planningData(getData()).categoryRules);
            if ([...select.options].some(o => o.value === suggested)) select.value = suggested;
        });

        const originalEdit = globalThis.edTx;
        globalThis.edTx = function (id) {
            originalEdit(id); refreshMembers();
            const tx = getData().transactions.find(t => t.id === id); if (!tx) return;
            document.getElementById('tx-status').value = tx.status || 'auto';
            document.getElementById('tx-tags').value = Array.isArray(tx.tags) ? tx.tags.join(', ') : '';
            document.getElementById('tx-paid-by').value = tx.paidByMemberId || '';
            const selected = new Set(tx.sharedWithMemberIds || []);
            [...document.getElementById('tx-shared-with').options].forEach(o => { o.selected = selected.has(o.value); });
        };

        const originalDup = globalThis.dupTx;
        globalThis.dupTx = function (id) {
            originalDup(id); refreshMembers();
            const tx = getData().transactions.find(t => t.id === id);
            document.getElementById('tx-status').value = 'auto';
            document.getElementById('tx-tags').value = Array.isArray(tx?.tags) ? tx.tags.join(', ') : '';
        };

        document.getElementById('transactionModal')?.addEventListener('show.bs.modal', refreshMembers);
        document.getElementById('transactionModal')?.addEventListener('hidden.bs.modal', () => {
            document.getElementById('tx-status').value = 'auto'; document.getElementById('tx-tags').value = '';
        });
    }

    function accountName(data, id) {
        return data.accounts.find(a => a.id === id)?.name || data.cards.find(c => c.id === id)?.name || '';
    }

    function previousMonth(month) {
        const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 2, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    function searchTransactions(data, query) {
        const q = normalize(query).trim();
        if (!q) return data.transactions || [];
        let items = [...(data.transactions || [])];
        const today = C.localDateString();
        const thisMonth = today.slice(0, 7);
        const tokens = q.match(/"[^"]+"|\S+/g) || [];
        const free = [];

        tokens.forEach(raw => {
            const token = raw.replace(/^"|"$/g, '');
            if (['gasto', 'gastos', 'despesa', 'despesas'].includes(token)) { items = items.filter(t => t.type === 'expense'); return; }
            if (['entrada', 'entradas', 'receita', 'receitas'].includes(token)) { items = items.filter(t => t.type === 'income'); return; }
            if (['transferencia', 'transferencias'].includes(token)) { items = items.filter(t => t.type === 'transfer'); return; }
            if (['prevista', 'previstas', 'pendente', 'pendentes'].includes(token)) { items = items.filter(t => t.status === 'planned'); return; }
            if (['realizada', 'realizadas', 'pago', 'pagos'].includes(token)) { items = items.filter(t => t.status !== 'planned'); return; }
            if (token === 'hoje') { items = items.filter(t => t.date === today); return; }
            if (token === 'ontem') { items = items.filter(t => t.date === C.addDays(today, -1)); return; }
            if (token === 'mes-atual' || token === 'estemes') { items = items.filter(t => t.date.startsWith(thisMonth)); return; }
            if (token === 'mes-passado') { const m = previousMonth(thisMonth); items = items.filter(t => t.date.startsWith(m)); return; }
            if (token.startsWith('#')) { const tag = token.slice(1); items = items.filter(t => (t.tags || []).some(x => normalize(x) === tag || normalize(x).includes(tag))); return; }
            if (token.startsWith('categoria:')) { const v = token.slice(10); items = items.filter(t => normalize(t.category).includes(v)); return; }
            if (token.startsWith('conta:')) { const v = token.slice(6); items = items.filter(t => normalize(accountName(data, t.accountId)).includes(v) || normalize(accountName(data, t.destinationId)).includes(v)); return; }
            const amount = token.match(/^(>=|<=|>|<)(\d+(?:[.,]\d+)?)$/);
            if (amount) {
                const val = Number(amount[2].replace(',', '.'));
                items = items.filter(t => amount[1] === '>' ? Number(t.amount) > val : amount[1] === '<' ? Number(t.amount) < val : amount[1] === '>=' ? Number(t.amount) >= val : Number(t.amount) <= val);
                return;
            }
            free.push(token);
        });

        if (q.includes('este mes')) items = items.filter(t => t.date.startsWith(thisMonth));
        if (q.includes('mes passado')) { const m = previousMonth(thisMonth); items = items.filter(t => t.date.startsWith(m)); }
        const months = q.match(/ultimos?\s+(\d+)\s+mes/);
        if (months) {
            const n = Math.max(1, Math.min(60, Number(months[1]))); const [y, m] = thisMonth.split('-').map(Number);
            const d = new Date(y, m - n, 1); const min = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
            items = items.filter(t => t.date >= min && t.date <= today);
        }
        const noise = new Set(['este', 'mes', 'passado', 'ultimos', 'ultimo', 'com', 'de', 'do', 'da', 'em']);
        const words = free.filter(w => !noise.has(w) && !/^\d+$/.test(w));
        if (words.length) items = items.filter(t => {
            const hay = normalize([t.description, t.category, accountName(data, t.accountId), ...(t.tags || [])].join(' '));
            return words.every(word => hay.includes(word));
        });
        return items;
    }

    function isSmartSearch(query) {
        const q = normalize(query);
        return /(^|\s)(#\S+|categoria:|conta:|[<>]=?\d|gastos?|despesas?|entradas?|receitas?|previstas?|realizadas?|hoje|ontem|mes passado|este mes|ultimos? \d+ mes)/.test(q);
    }

    function injectSearchHelp() {
        const input = document.getElementById('tx-search'); if (!input || document.getElementById('product-search-help')) return;
        input.placeholder = 'Buscar ou filtrar: #viagem, gastos >200, mês passado…';
        const help = document.createElement('div'); help.id = 'product-search-help'; help.className = 'product-search-help tiny text-muted mt-2';
        help.innerHTML = '<i class="ph ph-magic-wand me-1"></i>Exemplos: <button type="button" data-query="gastos >200">gastos &gt;200</button><button type="button" data-query="#viagem">#viagem</button><button type="button" data-query="previstas este mes">previstas este mês</button><button type="button" data-query="categoria:supermercado mes passado">supermercado mês passado</button>';
        input.parentElement?.after(help);
        help.addEventListener('click', e => { const b = e.target.closest('[data-query]'); if (!b) return; input.value = b.dataset.query; renderMovimentacao(getData()); });
    }

    function patchRenderers() {
        const originalDashboard = globalThis.renderDashboard;
        if (typeof originalDashboard === 'function') globalThis.renderDashboard = function (data) {
            originalDashboard(data);
            const today = C.localDateString(); const completed = (data.transactions || []).filter(t => t.status !== 'planned' && t.date <= today); const month = today.slice(0, 7);
            const income = completed.filter(t => t.type === 'income' && t.date.startsWith(month)).reduce((s,t) => s + Number(t.amount), 0);
            const expense = completed.filter(t => t.type === 'expense' && t.date.startsWith(month)).reduce((s,t) => s + Number(t.amount), 0);
            document.getElementById('total-income').textContent = money(income); document.getElementById('total-expense').textContent = money(expense); renderFinancialPulse(data);
        };

        const originalChart = globalThis.renderChart;
        if (typeof originalChart === 'function') globalThis.renderChart = data => originalChart({ ...data, transactions: (data.transactions || []).filter(t => t.status !== 'planned' && t.date <= C.localDateString()) });
        const originalBudgets = globalThis.renderBudgets;
        if (typeof originalBudgets === 'function') globalThis.renderBudgets = data => originalBudgets({ ...data, transactions: (data.transactions || []).filter(t => t.status !== 'planned' && t.date <= C.localDateString()) });

        const originalProjection = globalThis.renderProjection;
        if (typeof originalProjection === 'function') globalThis.renderProjection = function (data) {
            const actual = data || getData(); const p = planningData(actual); const today = C.localDateString();
            const future = C.recurringOccurrences(p.recurringRules, C.addDays(today, 1), C.addDays(today, 370));
            const result = originalProjection({ ...actual, transactions: [...(actual.transactions || []), ...future.map(t => ({ ...t, recurring: false }))] }); renderPlanningHub(actual); return result;
        };

        const originalTransactions = globalThis.renderTransactions;
        if (typeof originalTransactions === 'function') globalThis.renderTransactions = function (data) {
            const input = document.getElementById('tx-search'); const query = input?.value || ''; let renderData = data || getData(); let restore = null;
            if (query && isSmartSearch(query)) {
                renderData = { ...renderData, transactions: searchTransactions(renderData, query) };
                restore = query; input.value = '';
            }
            const result = originalTransactions(renderData);
            if (restore !== null) { input.value = restore; document.getElementById('tx-search-clear')?.classList.remove('hidden'); const badge = document.getElementById('tx-result-count'); if (badge) { badge.classList.remove('hidden'); badge.textContent = `${renderData.transactions.length} resultado${renderData.transactions.length === 1 ? '' : 's'}`; } }
            decorateTransactionStatuses(renderData); return result;
        };
    }

    function renderFinancialPulse(data) {
        const dashboard = document.getElementById('dashboard-view'); if (!dashboard) return;
        let section = document.getElementById('financial-pulse');
        if (!section) { section = document.createElement('section'); section.id = 'financial-pulse'; section.className = 'product-pulse mb-3'; dashboard.prepend(section); }
        const pulse = C.getFinancialPulse(data, C.localDateString()); const horizon = formatDate(pulse.horizon); const freeClass = pulse.free >= 0 ? 'good' : 'bad';
        const insight = pulse.free < 0 ? `Se todos os compromissos forem mantidos, faltam ${money(Math.abs(pulse.free))} até ${horizon}.` : pulse.nextIncome ? `Você tem cerca de ${money(pulse.daily)} por dia livres até a próxima entrada em ${horizon}.` : `Sem próxima entrada cadastrada; o cálculo usa o fim do mês (${horizon}).`;
        section.innerHTML = `<div class="product-section-heading"><div><span class="product-eyebrow">Visão rápida</span><h5>Seu dinheiro hoje</h5></div><span class="product-privacy"><i class="ph ph-device-mobile"></i> dados locais</span></div><div class="product-pulse-grid"><div class="product-metric"><span>Saldo atual</span><strong>${money(pulse.balance)}</strong><small>nas contas bancárias</small></div><div class="product-metric"><span>Comprometido</span><strong>${money(pulse.committed)}</strong><small>cartões, reservas e previstos</small></div><div class="product-metric ${freeClass}"><span>Dinheiro livre</span><strong>${money(pulse.free)}</strong><small>até ${horizon}</small></div><div class="product-metric"><span>Livre por dia</span><strong>${money(pulse.daily)}</strong><small>${pulse.days} dia${pulse.days === 1 ? '' : 's'} no horizonte</small></div></div><div class="product-insight"><i class="ph ph-sparkle"></i><span>${insight}</span></div>`;
    }

    function decorateTransactionStatuses(data) {
        document.querySelectorAll('.tx-item, #all-transactions-body tr, .tx-mobile-card').forEach(row => {
            if (row.querySelector('.product-status-badge')) return;
            const raw = row.textContent || ''; const planned = (data.transactions || []).find(tx => tx.status === 'planned' && raw.includes(tx.description) && raw.includes(formatDate(tx.date))); if (!planned) return;
            const target = row.querySelector('.tx-item-tags, td:first-child .mt-1, .tx-mobile-info .d-flex'); if (!target) return;
            const badge = document.createElement('span'); badge.className = 'tag product-status-badge'; badge.textContent = 'Prevista'; target.appendChild(badge);
        });
    }

    function accountOptions(data, selected = '') { return (data.accounts || []).map(a => `<option value="${escapeAttr(a.id)}" ${a.id === selected ? 'selected' : ''}>${text(a.name)} · ${money(a.balance)}</option>`).join(''); }

    function householdBalances(data) {
        const h = householdData(data); const balances = Object.fromEntries(h.members.map(m => [m.id, 0]));
        (data.transactions || []).filter(tx => tx.type === 'expense' && tx.status !== 'planned' && tx.paidByMemberId && Array.isArray(tx.sharedWithMemberIds) && tx.sharedWithMemberIds.length).forEach(tx => {
            const participants = [...new Set([tx.paidByMemberId, ...tx.sharedWithMemberIds])].filter(id => id in balances); if (participants.length < 2) return;
            const share = Number(tx.amount || 0) / participants.length;
            balances[tx.paidByMemberId] += Number(tx.amount || 0) - share;
            participants.filter(id => id !== tx.paidByMemberId).forEach(id => { balances[id] -= share; });
        });
        return balances;
    }

    function renderPlanningHub(data) {
        const view = document.getElementById('projecao-view'); if (!view) return;
        let hub = document.getElementById('product-planning-hub'); if (!hub) { hub = document.createElement('section'); hub.id = 'product-planning-hub'; view.prepend(hub); }
        const p = planningData(data); const h = householdData(data); const today = C.localDateString(); const calendar = C.buildFinancialCalendar(data, today, C.addDays(today, 45)).slice(0, 14);
        const totalReserved = p.reserves.reduce((s,r) => s + r.amount, 0) + p.goals.reduce((s,g) => s + g.currentAmount, 0);
        const recurringRows = p.recurringRules.map(r => `<div class="product-list-row"><div><strong>${text(r.description)}</strong><small>${r.type === 'income' ? 'Entrada' : 'Saída'} · dia ${r.dayOfMonth} · ${text(r.category)}</small></div><div class="product-row-value ${r.type}">${r.type === 'income' ? '+' : '-'}${money(r.amount)} <button data-action="delete-rule" data-id="${escapeAttr(r.id)}"><i class="ph ph-trash"></i></button></div></div>`).join('') || '<p class="text-muted small mb-0">Nenhum compromisso recorrente cadastrado.</p>';
        const goalRows = p.goals.map(g => { const pct = Math.min(100, g.targetAmount ? g.currentAmount / g.targetAmount * 100 : 0); return `<div class="product-goal"><div class="d-flex justify-content-between"><div><strong>${text(g.name)}</strong><small>${g.targetDate ? `até ${formatDate(g.targetDate)}` : 'sem prazo'}</small></div><button data-action="delete-goal" data-id="${escapeAttr(g.id)}"><i class="ph ph-trash"></i></button></div><div class="product-progress"><span style="width:${pct}%"></span></div><div class="d-flex align-items-center gap-2"><input class="form-control form-control-sm" type="number" min="0" step="0.01" data-goal-current="${escapeAttr(g.id)}" value="${Number(g.currentAmount).toFixed(2)}"><span class="tiny text-muted">de ${money(g.targetAmount)}</span><button class="btn btn-sm btn-outline-primary" data-action="save-goal-current" data-id="${escapeAttr(g.id)}">Atualizar</button></div></div>`; }).join('') || '<p class="text-muted small mb-0">Crie uma meta para separar dinheiro de um objetivo.</p>';
        const reserveRows = p.reserves.map(r => `<div class="product-list-row"><div><strong>${text(r.name)}</strong><small>Reserva separada do dinheiro livre</small></div><div class="product-row-value">${money(r.amount)} <button data-action="delete-reserve" data-id="${escapeAttr(r.id)}"><i class="ph ph-trash"></i></button></div></div>`).join('') || '<p class="text-muted small mb-0">Nenhuma reserva definida.</p>';
        const ruleRows = p.categoryRules.map(r => `<div class="product-chip-rule"><span>“${text(r.contains)}” → <strong>${text(r.category)}</strong></span><button data-action="delete-cat-rule" data-id="${escapeAttr(r.id)}"><i class="ph ph-x"></i></button></div>`).join('') || '<p class="text-muted small mb-0">Ex.: UBER → Transporte.</p>';
        const calendarRows = calendar.map(item => `<div class="product-calendar-row"><span class="product-calendar-date">${formatDate(item.date).slice(0,5)}</span><div><strong>${text(item.description)}</strong><small>${item.synthetic ? 'Recorrente' : 'Prevista'} · ${text(item.category || '')}</small></div><span class="product-calendar-value ${item.type}">${item.type === 'income' ? '+' : item.type === 'expense' ? '-' : ''}${money(item.amount)}</span></div>`).join('') || '<p class="text-muted small mb-0">Nenhum compromisso previsto nos próximos 45 dias.</p>';
        const balances = householdBalances(data); const memberRows = h.members.map(m => `<div class="product-list-row"><div><strong>${text(m.name)}</strong><small>${balances[m.id] > 0 ? 'tem a receber' : balances[m.id] < 0 ? 'deve ao grupo' : 'está em dia'}</small></div><div class="product-row-value ${balances[m.id] >= 0 ? 'income' : 'expense'}">${money(Math.abs(balances[m.id]))} <button data-action="delete-member" data-id="${escapeAttr(m.id)}"><i class="ph ph-trash"></i></button></div></div>`).join('') || '<p class="text-muted small mb-0">Adicione pelo menos duas pessoas para dividir gastos.</p>';

        hub.innerHTML = `<div class="product-section-heading mb-3"><div><span class="product-eyebrow">Planejamento</span><h4>Organize antes de gastar</h4></div><span class="product-total-reserved">Reservado: <strong>${money(totalReserved)}</strong></span></div><div class="row g-3 mb-4">
        <div class="col-12 col-lg-6"><div class="card h-100"><div class="card-body"><div class="product-card-title"><div><i class="ph ph-repeat"></i><strong>Fixos e recorrentes</strong></div><small>Entram automaticamente nas previsões</small></div><div class="product-list mb-3">${recurringRows}</div><details class="product-details"><summary>Adicionar recorrência</summary><form id="product-recurring-form" class="product-inline-form mt-3"><select name="type" class="form-select"><option value="expense">Saída</option><option value="income">Entrada</option></select><input name="description" class="form-control" placeholder="Ex.: Aluguel" required><input name="amount" class="form-control" type="number" step="0.01" min="0.01" placeholder="Valor" required><input name="day" class="form-control" type="number" min="1" max="31" placeholder="Dia" required><select name="accountId" class="form-select" required><option value="">Conta...</option>${accountOptions(data)}</select><input name="category" class="form-control" placeholder="Categoria" value="Outros"><button class="btn btn-primary" type="submit">Adicionar</button></form></details></div></div></div>
        <div class="col-12 col-lg-6"><div class="card h-100"><div class="card-body"><div class="product-card-title"><div><i class="ph ph-target"></i><strong>Metas</strong></div><small>O valor guardado deixa de aparecer como dinheiro livre</small></div><div class="product-goals mb-3">${goalRows}</div><details class="product-details"><summary>Nova meta</summary><form id="product-goal-form" class="product-inline-form mt-3"><input name="name" class="form-control" placeholder="Ex.: Viagem" required><input name="targetAmount" class="form-control" type="number" step="0.01" min="0.01" placeholder="Objetivo R$" required><input name="currentAmount" class="form-control" type="number" step="0.01" min="0" placeholder="Já guardado"><input name="targetDate" class="form-control" type="date"><button class="btn btn-primary" type="submit">Criar</button></form></details></div></div></div>
        <div class="col-12 col-lg-6"><div class="card h-100"><div class="card-body"><div class="product-card-title"><div><i class="ph ph-vault"></i><strong>Reservas</strong></div><small>Emergência, impostos, manutenção...</small></div><div class="product-list mb-3">${reserveRows}</div><form id="product-reserve-form" class="product-inline-form compact"><input name="name" class="form-control" placeholder="Nome" required><input name="amount" class="form-control" type="number" step="0.01" min="0.01" placeholder="Valor" required><button class="btn btn-outline-primary" type="submit">Reservar</button></form></div></div></div>
        <div class="col-12 col-lg-6"><div class="card h-100"><div class="card-body"><div class="product-card-title"><div><i class="ph ph-magic-wand"></i><strong>Categorização automática</strong></div><small>Regras ficam no seu dispositivo</small></div><div class="product-rule-list mb-3">${ruleRows}</div><form id="product-category-rule-form" class="product-inline-form compact"><input name="contains" class="form-control" placeholder="Texto, ex.: UBER" required><input name="category" class="form-control" placeholder="Categoria" required><button class="btn btn-outline-primary" type="submit">Criar regra</button></form></div></div></div>
        <div class="col-12"><div class="card"><div class="card-body"><div class="product-card-title"><div><i class="ph ph-users-three"></i><strong>Casa / casal</strong></div><small>Divida gastos sem criar outra conta bancária</small></div><div class="product-list mb-3">${memberRows}</div><form id="product-member-form" class="product-inline-form compact"><input name="name" class="form-control" placeholder="Nome da pessoa" required><button class="btn btn-outline-primary" type="submit">Adicionar pessoa</button></form><p class="tiny text-muted mt-2 mb-0">Ao lançar um gasto, use “Dividir este gasto” para indicar quem pagou e com quem dividir igualmente.</p></div></div></div></div>
        <div class="card mb-4"><div class="card-body"><div class="product-card-title"><div><i class="ph ph-calendar-dots"></i><strong>Calendário financeiro — próximos 45 dias</strong></div><small>Transações previstas + recorrências</small></div><div class="product-calendar">${calendarRows}</div></div></div>`;
        attachPlanningEvents(hub);
    }

    function attachPlanningEvents(hub) {
        function save(mutator) { const data = getData(); const p = planningData(data); mutator(p, data); data.planning = C.sanitizePlanning(p); globalThis.saveData(data); renderAll(); }
        hub.querySelector('#product-recurring-form')?.addEventListener('submit', e => { e.preventDefault(); const f = new FormData(e.currentTarget); save(p => p.recurringRules.push({ id:C.safeId('','rule'), type:f.get('type'), description:text(f.get('description')), amount:Number(f.get('amount')), dayOfMonth:Number(f.get('day')), accountId:String(f.get('accountId')), category:text(f.get('category')||'Outros'), startDate:C.localDateString(), endDate:'', active:true })); showToast?.('Recorrência adicionada.'); });
        hub.querySelector('#product-goal-form')?.addEventListener('submit', e => { e.preventDefault(); const f=new FormData(e.currentTarget); save(p => p.goals.push({ id:C.safeId('','goal'), name:text(f.get('name')), targetAmount:Number(f.get('targetAmount')), currentAmount:Number(f.get('currentAmount')||0), targetDate:String(f.get('targetDate')||'') })); showToast?.('Meta criada.'); });
        hub.querySelector('#product-reserve-form')?.addEventListener('submit', e => { e.preventDefault(); const f=new FormData(e.currentTarget); save(p => p.reserves.push({ id:C.safeId('','reserve'), name:text(f.get('name')), amount:Number(f.get('amount')) })); showToast?.('Reserva criada.'); });
        hub.querySelector('#product-category-rule-form')?.addEventListener('submit', e => { e.preventDefault(); const f=new FormData(e.currentTarget); save(p => p.categoryRules.push({ id:C.safeId('','catrule'), contains:text(f.get('contains')).toLowerCase(), category:text(f.get('category')) })); showToast?.('Regra criada.'); });
        hub.querySelector('#product-member-form')?.addEventListener('submit', e => { e.preventDefault(); const f=new FormData(e.currentTarget); save((p,data) => { const h=householdData(data); h.members.push({id:C.safeId('','member'),name:text(f.get('name'),80)}); h.enabled=true; }); showToast?.('Pessoa adicionada.'); });
        hub.addEventListener('click', e => { const b=e.target.closest('[data-action]'); if(!b)return; const id=b.dataset.id; const action=b.dataset.action; save((p,data)=>{ if(action==='delete-rule')p.recurringRules=p.recurringRules.filter(x=>x.id!==id); if(action==='delete-goal')p.goals=p.goals.filter(x=>x.id!==id); if(action==='delete-reserve')p.reserves=p.reserves.filter(x=>x.id!==id); if(action==='delete-cat-rule')p.categoryRules=p.categoryRules.filter(x=>x.id!==id); if(action==='save-goal-current'){const input=hub.querySelector(`[data-goal-current="${CSS.escape(id)}"]`);const goal=p.goals.find(x=>x.id===id);if(goal&&input)goal.currentAmount=Math.max(0,Number(input.value||0));} if(action==='delete-member'){const h=householdData(data);h.members=h.members.filter(x=>x.id!==id);(data.transactions||[]).forEach(tx=>{if(tx.paidByMemberId===id)tx.paidByMemberId=null;tx.sharedWithMemberIds=(tx.sharedWithMemberIds||[]).filter(x=>x!==id);});} }); });
    }

    function injectBankImport() {
        const backup=document.getElementById('backup-view'); if(!backup||document.getElementById('product-bank-import'))return; const row=backup.querySelector('.row'); const card=document.createElement('div'); card.className='col-12 col-md-7 col-lg-5 mt-3'; card.id='product-bank-import'; card.innerHTML=`<div class="card"><div class="card-body p-4"><div class="product-card-title"><div><i class="ph ph-file-arrow-up"></i><strong>Importar extrato bancário</strong></div><small>OFX ou CSV — sem conexão com seu banco</small></div><p class="small text-muted">O arquivo é lido no navegador. O Plannke evita duplicatas e aplica regras de categoria.</p><select id="product-bank-account" class="form-select mb-2"><option value="">Escolha a conta...</option>${accountOptions(getData())}</select><label class="btn btn-outline-primary w-100">Selecionar OFX / CSV<input id="product-bank-file" class="d-none" type="file" accept=".ofx,.csv,text/csv"></label><div id="product-bank-result" class="tiny text-muted mt-2"></div></div></div>`; row.appendChild(card); card.querySelector('#product-bank-file').addEventListener('change', importBankFile);
        const copy=backup.querySelector('.card.text-center p.text-muted'); if(copy)copy.innerHTML='Seus dados ficam no <strong>navegador</strong> e o Excel funciona como seu backup portátil — o seu “Memory Card”.'; const info=backup.querySelector('.card.text-center .tiny.text-muted'); if(info)info.innerHTML='<i class="ph ph-info me-1"></i> O autosave local persiste entre sessões. Faça backups externos regularmente.';
    }

    function importBankFile(event) {
        const file=event.target.files?.[0]; const accountId=document.getElementById('product-bank-account')?.value; if(!file||!accountId){showToast?.('Escolha a conta antes do arquivo.','error');event.target.value='';return;} const reader=new FileReader(); reader.onload=()=>{try{const data=getData();const p=planningData(data);const incoming=file.name.toLowerCase().endsWith('.ofx')?C.parseOfxBank(reader.result,accountId,p.categoryRules):C.parseCsvBank(reader.result,accountId,p.categoryRules);const fresh=C.dedupeImported(data.transactions,incoming);if(!incoming.length){showToast?.('Não consegui identificar as colunas/transações desse extrato.','error');return;}if(!fresh.length){showToast?.('Nenhuma transação nova encontrada.','info');return;}if(!confirm(`Foram encontradas ${incoming.length} movimentações e ${fresh.length} são novas. Importar?`))return;data.transactions.push(...fresh);globalThis.saveData(data);renderAll();const result=document.getElementById('product-bank-result');if(result)result.textContent=`${fresh.length} movimentações importadas.`;showToast?.(`${fresh.length} movimentações importadas.`);}catch(err){console.error(err);showToast?.('Erro ao ler o extrato.','error');}event.target.value='';}; reader.readAsText(file,'windows-1252');
    }

    function onboardingModal() {
        if (document.getElementById('productOnboardingModal')) return document.getElementById('productOnboardingModal');
        const el=document.createElement('div'); el.className='modal fade'; el.id='productOnboardingModal'; el.tabIndex=-1; el.innerHTML=`<div class="modal-dialog modal-dialog-centered"><div class="modal-content product-onboarding"><div class="modal-body p-4 p-md-5"><div class="product-onboarding-icon"><i class="ph ph-wallet"></i></div><span class="product-eyebrow">Primeiros passos</span><h3 class="fw-bold mt-1">Prepare seu Plannke</h3><p class="text-muted small">Com três informações o Início já consegue calcular saldo, compromissos e dinheiro livre.</p><form id="product-onboarding-form"><div class="mb-3"><label class="form-label small fw-semibold">Sua conta principal</label><input name="accountName" class="form-control mb-2" placeholder="Ex.: Nubank" value="Conta principal" required><div class="input-group"><span class="input-group-text">R$</span><input name="balance" class="form-control" type="number" step="0.01" placeholder="Saldo de hoje" required></div></div><div class="mb-3"><label class="form-label small fw-semibold">Renda mensal <span class="text-muted fw-normal">(opcional)</span></label><div class="row g-2"><div class="col-8"><div class="input-group"><span class="input-group-text">R$</span><input name="salary" class="form-control" type="number" step="0.01" min="0" placeholder="Salário / renda"></div></div><div class="col-4"><input name="salaryDay" class="form-control" type="number" min="1" max="31" placeholder="Dia"></div></div></div><details class="product-details mb-3"><summary>Também uso cartão de crédito</summary><div class="mt-2"><input name="cardName" class="form-control mb-2" placeholder="Nome do cartão"><div class="row g-2"><div class="col-6"><input name="cardLimit" class="form-control" type="number" step="0.01" min="0" placeholder="Limite"></div><div class="col-3"><input name="closingDay" class="form-control" type="number" min="1" max="31" placeholder="Fecha"></div><div class="col-3"><input name="dueDay" class="form-control" type="number" min="1" max="31" placeholder="Vence"></div></div></div></details><button class="btn btn-primary w-100 rounded-pill py-2 fw-bold" type="submit">Começar</button></form><button type="button" class="btn btn-link text-muted w-100 mt-2" data-bs-dismiss="modal">Configurar depois</button></div></div></div>`; document.body.appendChild(el);
        el.querySelector('#product-onboarding-form').addEventListener('submit', e=>{e.preventDefault();const f=new FormData(e.currentTarget);const data=getData();const p=planningData(data);const accountId=generateId();const balance=Number(f.get('balance')||0);data.accounts.push({id:accountId,name:text(f.get('accountName')||'Conta principal',120),openingBalance:balance,balance});const salary=Number(f.get('salary')||0);const salaryDay=Math.min(31,Math.max(1,Number(f.get('salaryDay')||1)));if(salary>0)p.recurringRules.push({id:C.safeId('','rule'),type:'income',description:'Renda mensal',category:'Salário',amount:salary,dayOfMonth:salaryDay,accountId,startDate:C.localDateString(),endDate:'',active:true});const cardName=text(f.get('cardName'),120);const limit=Number(f.get('cardLimit')||0);if(cardName&&limit>0)data.cards.push({id:generateId(),name:cardName,limit,closingDay:Math.min(31,Math.max(1,Number(f.get('closingDay')||1))),dueDay:Math.min(31,Math.max(1,Number(f.get('dueDay')||1)))});p.onboardingComplete=true;data.planning=C.sanitizePlanning(p);globalThis.saveData(data);bootstrap.Modal.getInstance(el)?.hide();renderAll();showToast?.('Plannke configurado.');});
        el.addEventListener('hidden.bs.modal',()=>{const data=getData();const p=planningData(data);if(data.accounts.length&&!p.onboardingComplete){p.onboardingComplete=true;data.planning=C.sanitizePlanning(p);globalThis.saveData(data);}});
        return el;
    }

    function maybeShowOnboarding() {
        const data=getData();const p=planningData(data);if(data.accounts.length){if(!p.onboardingComplete){p.onboardingComplete=true;data.planning=C.sanitizePlanning(p);globalThis.saveData(data);}return;}if(p.onboardingComplete)return;const welcome=document.getElementById('welcomeModal');const show=()=>bootstrap.Modal.getOrCreateInstance(onboardingModal()).show();if(welcome){welcome.addEventListener('hidden.bs.modal',()=>setTimeout(()=>{if(!getData().accounts.length&&!planningData(getData()).onboardingComplete)show();},150),{once:true});}else setTimeout(show,400);
    }

    function improveWelcome() {
        const modal=document.getElementById('welcomeModal'); if(!modal)return; const tagline=modal.querySelector('.welcome-tagline');if(tagline)tagline.textContent='Seu dinheiro, sob seu controle.';const intro=modal.querySelector('.welcome-header .text-muted');if(intro)intro.textContent='Como você quer começar?';const options=modal.querySelector('.welcome-options');if(options&&!options.querySelector('.product-import-option')){const item=document.createElement('div');item.className='welcome-option-card product-import-option';item.innerHTML='<div class="opt-icon browser"><i class="ph ph-file-arrow-up"></i></div><div class="opt-text"><h6>Importar extrato</h6><p>Começar com um arquivo OFX ou CSV do banco</p></div>';item.addEventListener('click',()=>{bootstrap.Modal.getInstance(modal)?.hide();_navigateTo?.('backup');setTimeout(()=>document.getElementById('product-bank-file')?.click(),200);});options.appendChild(item);}
    }

    function init() {
        if(initialized)return;initialized=true;injectAssets();installLedgerHooks();simplifyNavigation();injectTransactionFields();patchRenderers();injectSearchHelp();injectBankImport();improveWelcome();maybeShowOnboarding();try{renderAll();}catch(err){console.warn('Atualização visual do produto:',err);}globalThis.addEventListener('plannke:data-changed',()=>setTimeout(()=>{injectBankImport();injectSearchHelp();},0));
    }

    globalThis.PlannkeProduct={init,searchTransactions,householdBalances};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

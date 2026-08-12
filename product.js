/* Plannke product layer — general-audience experience */
(function () {
    'use strict';

    const C = globalThis.PlannkeCore;
    if (!C) { console.error('PlannkeCore não carregado.'); return; }
    let initialized = false;

    const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
    const text = (value, max = 160) => C.cleanText(value, max);
    const escapeAttr = value => text(value, 200).replace(/"/g, '&quot;');

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
        if (!document.querySelector('script[src="insights.js"]')) {
            const script = document.createElement('script');
            script.src = 'insights.js';
            script.defer = true;
            document.body.appendChild(script);
        }
        if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(err => console.warn('PWA indisponível:', err));
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

    }

    function renderFinancialPulse(data) {
        const dashboard = document.getElementById('dashboard-view'); if (!dashboard) return;
        let section = document.getElementById('financial-pulse');
        if (!section) { section = document.createElement('section'); section.id = 'financial-pulse'; section.className = 'product-pulse mb-3'; dashboard.prepend(section); }
        const pulse = C.getFinancialPulse(data, C.localDateString()); const horizon = formatDate(pulse.horizon); const freeClass = pulse.free >= 0 ? 'good' : 'bad';
        const insight = pulse.free < 0 ? `Se todos os compromissos forem mantidos, faltam ${money(Math.abs(pulse.free))} até ${horizon}.` : pulse.nextIncome ? `Você tem cerca de ${money(pulse.daily)} por dia livres até a próxima entrada em ${horizon}.` : `Sem próxima entrada cadastrada; o cálculo usa o fim do mês (${horizon}).`;
        section.innerHTML = `<div class="product-section-heading"><div><span class="product-eyebrow">Visão rápida</span><h5>Seu dinheiro hoje</h5></div><span class="product-privacy"><i class="ph ph-device-mobile"></i> dados locais</span></div><div class="product-pulse-grid"><div class="product-metric"><span>Saldo atual</span><strong>${money(pulse.balance)}</strong><small>nas contas bancárias</small></div><div class="product-metric"><span>Comprometido</span><strong>${money(pulse.committed)}</strong><small>cartões, reservas e previstos</small></div><div class="product-metric ${freeClass}"><span>Dinheiro livre</span><strong>${money(pulse.free)}</strong><small>até ${horizon}</small></div><div class="product-metric"><span>Livre por dia</span><strong>${money(pulse.daily)}</strong><small>${pulse.days} dia${pulse.days === 1 ? '' : 's'} no horizonte</small></div></div><div class="product-insight"><i class="ph ph-sparkle"></i><span>${insight}</span></div>`;
    }


    function accountOptions(data, selected = '') { return (data.accounts || []).map(a => `<option value="${escapeAttr(a.id)}" ${a.id === selected ? 'selected' : ''}>${text(a.name)} · ${money(a.balance)}</option>`).join(''); }

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
        if(initialized)return;initialized=true;injectAssets();installLedgerHooks();injectTransactionFields();patchRenderers();injectBankImport();improveWelcome();maybeShowOnboarding();try{renderAll();}catch(err){console.warn('Atualização visual do produto:',err);}globalThis.addEventListener('plannke:data-changed',()=>setTimeout(()=>{injectBankImport();},0));
    }

    globalThis.PlannkeProduct={init};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

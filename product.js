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


    function init() {
        if(initialized)return;initialized=true;patchRenderers();maybeShowOnboarding();try{renderAll();}catch(err){console.warn('Atualização visual do produto:',err);}
    }

    globalThis.PlannkeProduct={init};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

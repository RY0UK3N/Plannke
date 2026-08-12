/* Plannke canonical planning runtime. */
(function (root) {
    'use strict';

    let C = root.PlannkeCore || null;

    function make(tag, className, textValue) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (textValue !== undefined && textValue !== null) node.textContent = String(textValue);
        return node;
    }

    function textNode(value) {
        return document.createTextNode(String(value ?? ''));
    }

    function icon(name) {
        return make('i', `ph ${name}`);
    }

    function button(label, className = 'btn btn-sm btn-outline-primary', iconName = '') {
        const node = make('button', className);
        node.type = 'button';
        if (iconName) node.appendChild(icon(iconName));
        if (label) node.appendChild(textNode(iconName ? ` ${label}` : label));
        return node;
    }

    function actionButton(action, id, iconName, label) {
        const node = button('', '', iconName);
        node.className = '';
        node.dataset.action = action;
        node.dataset.id = id;
        node.title = label;
        node.setAttribute('aria-label', label);
        return node;
    }

    function input(name, type, placeholder, options = {}) {
        const node = make('input', options.className || 'form-control');
        if (name) node.name = name;
        node.type = type;
        if (placeholder) node.placeholder = placeholder;
        if (options.required) node.required = true;
        if (options.min !== undefined) node.min = String(options.min);
        if (options.max !== undefined) node.max = String(options.max);
        if (options.step !== undefined) node.step = String(options.step);
        if (options.value !== undefined) node.value = String(options.value);
        return node;
    }

    function appendOption(select, value, label, selected = false) {
        const option = make('option', '', label);
        option.value = value;
        option.selected = selected;
        select.appendChild(option);
        return option;
    }

    function empty(message) {
        return make('p', 'text-muted small mb-0', message);
    }

    function clean(value, max = 160) {
        return C?.cleanText ? C.cleanText(value, max) : String(value ?? '').trim().slice(0, max);
    }

    function money(value) {
        if (typeof root.formatCurrency === 'function') return root.formatCurrency(Number(value || 0));
        return root.PlannkeMoney.formatMoney(Number(value || 0));
    }

    function dateLabel(value) {
        return typeof root.formatDate === 'function' ? root.formatDate(value) : String(value || '');
    }

    function waitForCore() {
        if (root.PlannkeCore) return Promise.resolve(root.PlannkeCore);
        if (typeof document === 'undefined') return Promise.resolve(null);
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const check = () => {
                if (root.PlannkeCore) return resolve(root.PlannkeCore);
                if (++attempts >= 200) return reject(new Error('PlannkeCore não inicializou para o Planejamento.'));
                root.setTimeout(check, 10);
            };
            check();
        });
    }

    function planningData(data) {
        if (!C) throw new Error('PlannkeCore indisponível.');
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
            return { id, name: clean(member?.name || `Pessoa ${index + 1}`, 80) };
        }).filter(member => member.name);
        data.settings.household = { enabled: !!raw.enabled || members.length > 0, members };
        return data.settings.household;
    }

    function householdBalances(data) {
        const household = householdData(data);
        const balances = Object.fromEntries(household.members.map(member => [member.id, 0]));
        (data.transactions || [])
            .filter(tx => tx.type === 'expense' && tx.status !== 'planned' && tx.paidByMemberId && Array.isArray(tx.sharedWithMemberIds) && tx.sharedWithMemberIds.length)
            .forEach(tx => {
                const participants = [...new Set([tx.paidByMemberId, ...tx.sharedWithMemberIds])].filter(id => id in balances);
                if (participants.length < 2) return;
                const share = Number(tx.amount || 0) / participants.length;
                balances[tx.paidByMemberId] += Number(tx.amount || 0) - share;
                participants.filter(id => id !== tx.paidByMemberId).forEach(id => { balances[id] -= share; });
            });
        return balances;
    }

    function buildProjectionData(data, today = C.localDateString()) {
        const planning = planningData(data);
        const recurring = C.recurringOccurrences(planning.recurringRules, C.addDays(today, 1), C.addDays(today, 370));
        return {
            ...data,
            transactions: [...(data.transactions || []), ...recurring.map(tx => ({ ...tx, recurring: false }))]
        };
    }

    function saveMutation(mutator, message) {
        const data = root.getData();
        const planning = planningData(data);
        mutator(planning, data);
        data.planning = C.sanitizePlanning(planning);
        C.snapshotProductState?.(data);
        root.saveData(data);
        root.renderAll?.();
        if (message) root.showToast?.(message);
    }

    function cardTitle(iconName, title, subtitle) {
        const wrap = make('div', 'product-card-title');
        const titleWrap = make('div');
        titleWrap.append(icon(iconName), make('strong', '', title));
        wrap.append(titleWrap, make('small', '', subtitle));
        return wrap;
    }

    function planningCard(iconName, title, subtitle, ...children) {
        const col = make('div', 'col-12 col-lg-6');
        const card = make('div', 'card h-100');
        const body = make('div', 'card-body');
        body.append(cardTitle(iconName, title, subtitle), ...children);
        card.appendChild(body);
        col.appendChild(card);
        return col;
    }

    function recurringList(planning) {
        const list = make('div', 'product-list mb-3');
        if (!planning.recurringRules.length) return list.appendChild(empty('Nenhum compromisso recorrente cadastrado.')), list;
        planning.recurringRules.forEach(rule => {
            const row = make('div', 'product-list-row');
            const info = make('div');
            info.append(make('strong', '', rule.description), make('small', '', `${rule.type === 'income' ? 'Entrada' : 'Saída'} · dia ${rule.dayOfMonth} · ${rule.category}`));
            const value = make('div', `product-row-value ${rule.type}`);
            value.append(textNode(`${rule.type === 'income' ? '+' : '-'}${money(rule.amount)} `), actionButton('delete-rule', rule.id, 'ph-trash', 'Excluir recorrência'));
            row.append(info, value);
            list.appendChild(row);
        });
        return list;
    }

    function recurringForm(data) {
        const details = make('details', 'product-details');
        details.appendChild(make('summary', '', 'Adicionar recorrência'));
        const form = make('form', 'product-inline-form mt-3');
        form.id = 'product-recurring-form';
        const type = make('select', 'form-select');
        type.name = 'type';
        appendOption(type, 'expense', 'Saída');
        appendOption(type, 'income', 'Entrada');
        const account = make('select', 'form-select');
        account.name = 'accountId';
        account.required = true;
        appendOption(account, '', 'Conta...');
        (data.accounts || []).filter(item => item.status !== 'archived').forEach(item => appendOption(account, item.id, `${item.name} · ${money(item.balance)}`));
        form.append(type, input('description', 'text', 'Ex.: Aluguel', { required: true }), input('amount', 'number', 'Valor', { required: true, min: 0.01, step: 0.01 }), input('day', 'number', 'Dia', { required: true, min: 1, max: 31 }), account, input('category', 'text', 'Categoria', { value: 'Outros' }));
        const submit = button('Adicionar', 'btn btn-primary');
        submit.type = 'submit';
        form.appendChild(submit);
        form.addEventListener('submit', event => {
            event.preventDefault();
            const values = new FormData(form);
            saveMutation(planning => planning.recurringRules.push({
                id: C.safeId('', 'rule'),
                type: values.get('type'),
                description: clean(values.get('description')),
                amount: root.PlannkeMoney.reaisToCents(Number(values.get('amount'))),
                dayOfMonth: Number(values.get('day')),
                accountId: String(values.get('accountId') || ''),
                category: clean(values.get('category') || 'Outros'),
                startDate: C.localDateString(),
                endDate: '',
                active: true
            }), 'Recorrência adicionada.');
        });
        details.appendChild(form);
        return details;
    }

    function goalsList(planning) {
        const list = make('div', 'product-goals mb-3');
        if (!planning.goals.length) return list.appendChild(empty('Crie uma meta para separar dinheiro de um objetivo.')), list;
        planning.goals.forEach(goal => {
            const item = make('div', 'product-goal');
            const header = make('div', 'd-flex justify-content-between');
            const labels = make('div');
            labels.append(make('strong', '', goal.name), make('small', '', goal.targetDate ? `até ${dateLabel(goal.targetDate)}` : 'sem prazo'));
            header.append(labels, actionButton('delete-goal', goal.id, 'ph-trash', 'Excluir meta'));
            const progress = make('div', 'product-progress');
            const fill = make('span');
            fill.style.width = `${Math.max(0, Math.min(100, goal.targetAmount ? goal.currentAmount / goal.targetAmount * 100 : 0))}%`;
            progress.appendChild(fill);
            const update = make('div', 'd-flex align-items-center gap-2');
            const current = input('', 'number', '', { className: 'form-control form-control-sm', min: 0, step: 0.01, value: root.PlannkeMoney.centsToReais(Number(goal.currentAmount)).toFixed(2) });
            current.dataset.goalCurrent = goal.id;
            const updateButton = button('Atualizar', 'btn btn-sm btn-outline-primary');
            updateButton.dataset.action = 'save-goal-current';
            updateButton.dataset.id = goal.id;
            update.append(current, make('span', 'tiny text-muted', `de ${money(goal.targetAmount)}`), updateButton);
            item.append(header, progress, update);
            list.appendChild(item);
        });
        return list;
    }

    function goalForm() {
        const details = make('details', 'product-details');
        details.appendChild(make('summary', '', 'Nova meta'));
        const form = make('form', 'product-inline-form mt-3');
        form.id = 'product-goal-form';
        form.append(input('name', 'text', 'Ex.: Viagem', { required: true }), input('targetAmount', 'number', 'Objetivo R$', { required: true, min: 0.01, step: 0.01 }), input('currentAmount', 'number', 'Já guardado', { min: 0, step: 0.01 }), input('targetDate', 'date', ''));
        const submit = button('Criar', 'btn btn-primary');
        submit.type = 'submit';
        form.appendChild(submit);
        form.addEventListener('submit', event => {
            event.preventDefault();
            const values = new FormData(form);
            saveMutation(planning => planning.goals.push({ id: C.safeId('', 'goal'), name: clean(values.get('name')), targetAmount: root.PlannkeMoney.reaisToCents(Number(values.get('targetAmount'))), currentAmount: root.PlannkeMoney.reaisToCents(Number(values.get('currentAmount') || 0)), targetDate: String(values.get('targetDate') || '') }), 'Meta criada.');
        });
        details.appendChild(form);
        return details;
    }

    function reservesList(planning) {
        const list = make('div', 'product-list mb-3');
        if (!planning.reserves.length) return list.appendChild(empty('Nenhuma reserva definida.')), list;
        planning.reserves.forEach(reserve => {
            const row = make('div', 'product-list-row');
            const info = make('div');
            info.append(make('strong', '', reserve.name), make('small', '', 'Reserva separada do dinheiro livre'));
            const value = make('div', 'product-row-value');
            value.append(textNode(`${money(reserve.amount)} `), actionButton('delete-reserve', reserve.id, 'ph-trash', 'Excluir reserva'));
            row.append(info, value);
            list.appendChild(row);
        });
        return list;
    }

    function reserveForm() {
        const form = make('form', 'product-inline-form compact');
        form.id = 'product-reserve-form';
        form.append(input('name', 'text', 'Nome', { required: true }), input('amount', 'number', 'Valor', { required: true, min: 0.01, step: 0.01 }));
        const submit = button('Reservar', 'btn btn-outline-primary');
        submit.type = 'submit';
        form.appendChild(submit);
        form.addEventListener('submit', event => {
            event.preventDefault();
            const values = new FormData(form);
            saveMutation(planning => planning.reserves.push({ id: C.safeId('', 'reserve'), name: clean(values.get('name')), amount: root.PlannkeMoney.reaisToCents(Number(values.get('amount'))) }), 'Reserva criada.');
        });
        return form;
    }

    function categoryRulesList(planning) {
        const list = make('div', 'product-rule-list mb-3');
        if (!planning.categoryRules.length) return list.appendChild(empty('Ex.: UBER → Transporte.')), list;
        planning.categoryRules.forEach(rule => {
            const row = make('div', 'product-chip-rule');
            const label = make('span');
            label.append(textNode(`“${rule.contains}” → `), make('strong', '', rule.category));
            row.append(label, actionButton('delete-cat-rule', rule.id, 'ph-x', 'Excluir regra'));
            list.appendChild(row);
        });
        return list;
    }

    function categoryRuleForm() {
        const form = make('form', 'product-inline-form compact');
        form.id = 'product-category-rule-form';
        form.append(input('contains', 'text', 'Texto, ex.: UBER', { required: true }), input('category', 'text', 'Categoria', { required: true }));
        const submit = button('Criar regra', 'btn btn-outline-primary');
        submit.type = 'submit';
        form.appendChild(submit);
        form.addEventListener('submit', event => {
            event.preventDefault();
            const values = new FormData(form);
            saveMutation(planning => planning.categoryRules.push({ id: C.safeId('', 'catrule'), contains: clean(values.get('contains')).toLowerCase(), category: clean(values.get('category')) }), 'Regra criada.');
        });
        return form;
    }

    function householdList(data) {
        const household = householdData(data);
        const balances = householdBalances(data);
        const list = make('div', 'product-list mb-3');
        if (!household.members.length) return list.appendChild(empty('Adicione pelo menos duas pessoas para dividir gastos.')), list;
        household.members.forEach(member => {
            const balance = Number(balances[member.id] || 0);
            const row = make('div', 'product-list-row');
            const info = make('div');
            info.append(make('strong', '', member.name), make('small', '', balance > 0 ? 'tem a receber' : balance < 0 ? 'deve ao grupo' : 'está em dia'));
            const value = make('div', `product-row-value ${balance >= 0 ? 'income' : 'expense'}`);
            value.append(textNode(`${money(Math.abs(balance))} `), actionButton('delete-member', member.id, 'ph-trash', 'Excluir pessoa'));
            row.append(info, value);
            list.appendChild(row);
        });
        return list;
    }

    function memberForm() {
        const form = make('form', 'product-inline-form compact');
        form.id = 'product-member-form';
        form.appendChild(input('name', 'text', 'Nome da pessoa', { required: true }));
        const submit = button('Adicionar pessoa', 'btn btn-outline-primary');
        submit.type = 'submit';
        form.appendChild(submit);
        form.addEventListener('submit', event => {
            event.preventDefault();
            const values = new FormData(form);
            saveMutation((planning, data) => {
                const household = householdData(data);
                household.members.push({ id: C.safeId('', 'member'), name: clean(values.get('name'), 80) });
                household.enabled = true;
            }, 'Pessoa adicionada.');
        });
        return form;
    }

    function calendarList(data) {
        const today = C.localDateString();
        const items = C.buildFinancialCalendar(data, today, C.addDays(today, 45)).slice(0, 14);
        const list = make('div', 'product-calendar');
        if (!items.length) return list.appendChild(empty('Nenhum compromisso previsto nos próximos 45 dias.')), list;
        items.forEach(item => {
            const row = make('div', 'product-calendar-row');
            const info = make('div');
            info.append(make('strong', '', item.description), make('small', '', `${item.synthetic ? 'Recorrente' : 'Prevista'} · ${item.category || ''}`));
            const sign = item.type === 'income' ? '+' : item.type === 'expense' ? '-' : '';
            row.append(make('span', 'product-calendar-date', dateLabel(item.date).slice(0, 5)), info, make('span', `product-calendar-value ${item.type}`, `${sign}${money(item.amount)}`));
            list.appendChild(row);
        });
        return list;
    }

    function handlePlanningAction(action, id, hub) {
        saveMutation((planning, data) => {
            if (action === 'delete-rule') planning.recurringRules = planning.recurringRules.filter(item => item.id !== id);
            else if (action === 'delete-goal') planning.goals = planning.goals.filter(item => item.id !== id);
            else if (action === 'delete-reserve') planning.reserves = planning.reserves.filter(item => item.id !== id);
            else if (action === 'delete-cat-rule') planning.categoryRules = planning.categoryRules.filter(item => item.id !== id);
            else if (action === 'save-goal-current') {
                const goal = planning.goals.find(item => item.id === id);
                const current = [...hub.querySelectorAll('[data-goal-current]')].find(node => node.dataset.goalCurrent === id);
                if (goal && current) goal.currentAmount = Math.max(0, root.PlannkeMoney.reaisToCents(Number(current.value || 0)));
            } else if (action === 'delete-member') {
                const household = householdData(data);
                household.members = household.members.filter(member => member.id !== id);
                household.enabled = household.members.length > 0;
                (data.transactions || []).forEach(tx => {
                    if (tx.paidByMemberId === id) tx.paidByMemberId = null;
                    tx.sharedWithMemberIds = (tx.sharedWithMemberIds || []).filter(memberId => memberId !== id);
                });
                const sharedMeta = data.settings?.sharedTransactionMeta;
                if (sharedMeta && typeof sharedMeta === 'object') {
                    Object.values(sharedMeta).forEach(meta => {
                        if (!meta || typeof meta !== 'object') return;
                        if (meta.paidByMemberId === id) meta.paidByMemberId = null;
                        if (Array.isArray(meta.sharedWithMemberIds)) meta.sharedWithMemberIds = meta.sharedWithMemberIds.filter(memberId => memberId !== id);
                    });
                }
            }
        });
    }

    function renderPlanningHub(data) {
        if (typeof document === 'undefined' || !C) return;
        const view = document.getElementById('projecao-view');
        if (!view) return;
        let hub = document.getElementById('product-planning-hub');
        if (!hub) {
            hub = make('section');
            hub.id = 'product-planning-hub';
            view.prepend(hub);
        }
        hub.replaceChildren();

        const planning = planningData(data);
        const totalReserved = planning.reserves.reduce((sum, reserve) => sum + Number(reserve.amount || 0), 0) + planning.goals.reduce((sum, goal) => sum + Number(goal.currentAmount || 0), 0);
        const heading = make('div', 'product-section-heading mb-3');
        const titles = make('div');
        titles.append(make('span', 'product-eyebrow', 'Planejamento'), make('h4', '', 'Organize antes de gastar'));
        const reserved = make('span', 'product-total-reserved');
        reserved.append(textNode('Reservado: '), make('strong', '', money(totalReserved)));
        heading.append(titles, reserved);

        const grid = make('div', 'row g-3 mb-4');
        grid.append(
            planningCard('ph-repeat', 'Fixos e recorrentes', 'Entram automaticamente nas previsões', recurringList(planning), recurringForm(data)),
            planningCard('ph-target', 'Metas', 'O valor guardado deixa de aparecer como dinheiro livre', goalsList(planning), goalForm()),
            planningCard('ph-vault', 'Reservas', 'Emergência, impostos, manutenção...', reservesList(planning), reserveForm()),
            planningCard('ph-magic-wand', 'Categorização automática', 'Regras ficam no seu dispositivo', categoryRulesList(planning), categoryRuleForm())
        );

        const householdCol = make('div', 'col-12');
        const householdCard = make('div', 'card');
        const householdBody = make('div', 'card-body');
        householdBody.append(cardTitle('ph-users-three', 'Casa / casal', 'Divida gastos sem criar outra conta bancária'), householdList(data), memberForm(), make('p', 'tiny text-muted mt-2 mb-0', 'Ao lançar um gasto, use “Dividir este gasto” para indicar quem pagou e com quem dividir igualmente.'));
        householdCard.appendChild(householdBody);
        householdCol.appendChild(householdCard);
        grid.appendChild(householdCol);

        const calendarCard = make('div', 'card mb-4');
        const calendarBody = make('div', 'card-body');
        calendarBody.append(cardTitle('ph-calendar-dots', 'Calendário financeiro — próximos 45 dias', 'Transações previstas + recorrências'), calendarList(data));
        calendarCard.appendChild(calendarBody);

        hub.append(heading, grid, calendarCard);
        hub.onclick = event => {
            const target = event.target.closest?.('[data-action]');
            if (!target) return;
            handlePlanningAction(target.dataset.action, target.dataset.id, hub);
        };
    }

    function canonicalRenderProjection(data) {
        const actual = data || root.getData?.();
        if (!actual) return;
        const result = root.PlannkeProjection?.renderProjection?.(buildProjectionData(actual));
        renderPlanningHub(actual);
        return result;
    }
    canonicalRenderProjection.__plannkeCanonicalPlanning = true;

    function onboardingModal() {
        if (typeof document === 'undefined') return null;
        const existing = document.getElementById('productOnboardingModal');
        if (existing) return existing;

        const modal = make('div', 'modal fade');
        modal.id = 'productOnboardingModal';
        modal.tabIndex = -1;
        const dialog = make('div', 'modal-dialog modal-dialog-centered');
        const content = make('div', 'modal-content product-onboarding');
        const body = make('div', 'modal-body p-4 p-md-5');
        const badge = make('div', 'product-onboarding-icon');
        badge.appendChild(icon('ph-wallet'));
        body.append(
            badge,
            make('span', 'product-eyebrow', 'Primeiros passos'),
            make('h3', 'fw-bold mt-1', 'Prepare seu Plannke'),
            make('p', 'text-muted small', 'Com três informações o Início já consegue calcular saldo, compromissos e dinheiro livre.')
        );

        const form = make('form');
        form.id = 'product-onboarding-form';

        const accountGroup = make('div', 'mb-3');
        accountGroup.appendChild(make('label', 'form-label small fw-semibold', 'Sua conta principal'));
        const accountName = input('accountName', 'text', 'Ex.: Nubank', { className: 'form-control mb-2', value: 'Conta principal', required: true });
        const balanceGroup = make('div', 'input-group');
        balanceGroup.append(make('span', 'input-group-text', 'R$'), input('balance', 'number', 'Saldo de hoje', { step: '0.01', required: true }));
        accountGroup.append(accountName, balanceGroup);

        const incomeGroup = make('div', 'mb-3');
        const incomeLabel = make('label', 'form-label small fw-semibold');
        incomeLabel.append(document.createTextNode('Renda mensal '), make('span', 'text-muted fw-normal', '(opcional)'));
        const incomeRow = make('div', 'row g-2');
        const incomeValueCol = make('div', 'col-8');
        const incomeValueGroup = make('div', 'input-group');
        incomeValueGroup.append(make('span', 'input-group-text', 'R$'), input('salary', 'number', 'Salário / renda', { min: 0, step: '0.01' }));
        incomeValueCol.appendChild(incomeValueGroup);
        const incomeDayCol = make('div', 'col-4');
        incomeDayCol.appendChild(input('salaryDay', 'number', 'Dia', { min: 1, max: 31 }));
        incomeRow.append(incomeValueCol, incomeDayCol);
        incomeGroup.append(incomeLabel, incomeRow);

        const cardDetails = make('details', 'product-details mb-3');
        cardDetails.appendChild(make('summary', '', 'Também uso cartão de crédito'));
        const cardWrap = make('div', 'mt-2');
        cardWrap.appendChild(input('cardName', 'text', 'Nome do cartão', { className: 'form-control mb-2' }));
        const cardRow = make('div', 'row g-2');
        const limitCol = make('div', 'col-6');
        limitCol.appendChild(input('cardLimit', 'number', 'Limite', { min: 0, step: '0.01' }));
        const closingCol = make('div', 'col-3');
        closingCol.appendChild(input('closingDay', 'number', 'Fecha', { min: 1, max: 31 }));
        const dueCol = make('div', 'col-3');
        dueCol.appendChild(input('dueDay', 'number', 'Vence', { min: 1, max: 31 }));
        cardRow.append(limitCol, closingCol, dueCol);
        cardWrap.appendChild(cardRow);
        cardDetails.appendChild(cardWrap);

        const submit = make('button', 'btn btn-primary w-100 rounded-pill py-2 fw-bold', 'Começar');
        submit.type = 'submit';
        const later = make('button', 'btn btn-link text-muted w-100 mt-2', 'Configurar depois');
        later.type = 'button';
        later.dataset.bsDismiss = 'modal';
        form.append(accountGroup, incomeGroup, cardDetails, submit);
        body.append(form, later);
        content.appendChild(body);
        dialog.appendChild(content);
        modal.appendChild(dialog);
        document.body.appendChild(modal);

        form.addEventListener('submit', event => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            const data = root.getData();
            const planning = planningData(data);
            const accountId = root.generateId?.() || C.safeId('', 'account');
            const balance = root.PlannkeMoney.reaisToCents(Number(values.get('balance') || 0));
            data.accounts.push({
                id: accountId,
                name: clean(values.get('accountName') || 'Conta principal', 120),
                openingBalance: balance,
                balance
            });

            const salary = root.PlannkeMoney.reaisToCents(Number(values.get('salary') || 0));
            const salaryDay = Math.min(31, Math.max(1, Number(values.get('salaryDay') || 1)));
            if (salary > 0) {
                planning.recurringRules.push({
                    id: C.safeId('', 'rule'),
                    type: 'income',
                    description: 'Renda mensal',
                    category: 'Salário',
                    amount: salary,
                    dayOfMonth: salaryDay,
                    accountId,
                    startDate: C.localDateString(),
                    endDate: '',
                    active: true
                });
            }

            const cardName = clean(values.get('cardName'), 120);
            const limit = root.PlannkeMoney.reaisToCents(Number(values.get('cardLimit') || 0));
            if (cardName && limit > 0) {
                data.cards.push({
                    id: root.generateId?.() || C.safeId('', 'card'),
                    name: cardName,
                    limit,
                    closingDay: Math.min(31, Math.max(1, Number(values.get('closingDay') || 1))),
                    dueDay: Math.min(31, Math.max(1, Number(values.get('dueDay') || 1)))
                });
            }

            planning.onboardingComplete = true;
            data.planning = C.sanitizePlanning(planning);
            root.saveData(data);
            root.bootstrap?.Modal.getInstance(modal)?.hide();
            root.renderAll?.();
            root.showToast?.('Plannke configurado.');
        });

        modal.addEventListener('hidden.bs.modal', () => {
            const data = root.getData();
            const planning = planningData(data);
            if (data.accounts.length && !planning.onboardingComplete) {
                planning.onboardingComplete = true;
                data.planning = C.sanitizePlanning(planning);
                root.saveData(data);
            }
        });
        return modal;
    }

    function maybeShowOnboarding() {
        if (typeof document === 'undefined' || !C || typeof root.getData !== 'function') return;
        const data = root.getData();
        const planning = planningData(data);
        if (data.accounts.length) {
            if (!planning.onboardingComplete) {
                planning.onboardingComplete = true;
                data.planning = C.sanitizePlanning(planning);
                root.saveData(data);
            }
            return;
        }
        if (planning.onboardingComplete) return;
        root.setTimeout?.(() => {
            const modal = onboardingModal();
            if (modal) root.bootstrap?.Modal.getOrCreateInstance(modal)?.show();
        }, 400);
    }

    const api = {
        get ready() { return ready; },
        planningData,
        householdData,
        householdBalances,
        buildProjectionData,
        renderPlanningHub,
        handlePlanningAction,
        onboardingModal,
        maybeShowOnboarding,
        renderProjection: canonicalRenderProjection
    };

    const ready = waitForCore().then(core => {
        if (!core) throw new Error('PlannkeCore indisponível para o Planejamento.');
        if (!root.PlannkeProjection?.renderProjection) throw new Error('Runtime canônico de Projeção indisponível para o Planejamento.');
        C = core;
        root.renderProjection = canonicalRenderProjection;
        return api;
    });

    root.PlannkePlanning = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

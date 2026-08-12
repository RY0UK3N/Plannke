/* Plannke canonical transaction form and handlers. */
(function (root) {
    'use strict';

    let formsBound = false;
    let modalEventsBound = false;
    let controlsBound = false;

    function byId(id) {
        return document.getElementById(id);
    }

    function todayLocal() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function daysInMonth(year, month1Based) {
        return new Date(year, month1Based, 0).getDate();
    }

    function addMonthsClampedLocal(dateStr, offset) {
        if (typeof root.addMonthsClamped === 'function') {
            return root.addMonthsClamped(dateStr, offset);
        }
        const match = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return dateStr;
        const absoluteMonth = Number(match[1]) * 12 + Number(match[2]) - 1 + Number(offset || 0);
        const year = Math.floor(absoluteMonth / 12);
        const month = ((absoluteMonth % 12) + 12) % 12 + 1;
        const day = Math.min(Number(match[3]), daysInMonth(year, month));
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function buildInstallmentDates(dateStr, count) {
        const total = Math.max(parseInt(count, 10) || 1, 1);
        return Array.from({ length: total }, (_, index) => addMonthsClampedLocal(dateStr, index));
    }

    function appendOption(parent, value, label, selected) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        option.selected = !!selected;
        parent.appendChild(option);
        return option;
    }

    function cleanProductText(value, max = 160) {
        const core = root.PlannkeCore;
        return core?.cleanText ? core.cleanText(value, max) : String(value ?? '').trim().slice(0, max);
    }

    function getHouseholdMembers() {
        const data = root.getData();
        const core = root.PlannkeCore;
        if (core?.normalizeHousehold) return core.normalizeHousehold(data).members || [];
        return Array.isArray(data.settings?.household?.members) ? data.settings.household.members : [];
    }

    function ensureTransactionMetadataFields() {
        if (typeof document === 'undefined' || byId('tx-status')) return;
        const dateGroup = byId('tx-date')?.closest('.mb-3');
        if (!dateGroup) return;
    
        const box = document.createElement('div');
        box.className = 'product-tx-extra';
    
        const row = document.createElement('div');
        row.className = 'row g-2 mb-3';
    
        const statusCol = document.createElement('div');
        statusCol.className = 'col-12 col-sm-5';
        const statusLabel = document.createElement('label');
        statusLabel.className = 'form-label text-muted small fw-semibold text-uppercase';
        statusLabel.textContent = 'Situação';
        const status = document.createElement('select');
        status.id = 'tx-status';
        status.className = 'form-select';
        appendOption(status, 'auto', 'Automático pela data');
        appendOption(status, 'completed', 'Realizada');
        appendOption(status, 'planned', 'Prevista');
        statusCol.append(statusLabel, status);
    
        const tagsCol = document.createElement('div');
        tagsCol.className = 'col-12 col-sm-7';
        const tagsLabel = document.createElement('label');
        tagsLabel.className = 'form-label text-muted small fw-semibold text-uppercase';
        tagsLabel.textContent = 'Tags';
        const tags = document.createElement('input');
        tags.id = 'tx-tags';
        tags.className = 'form-control';
        tags.placeholder = 'viagem, trabalho, férias';
        tags.autocomplete = 'off';
        tagsCol.append(tagsLabel, tags);
        row.append(statusCol, tagsCol);
    
        const details = document.createElement('details');
        details.id = 'tx-sharing-details';
        details.className = 'product-sharing-details mb-3';
        const summary = document.createElement('summary');
        const usersIcon = document.createElement('i');
        usersIcon.className = 'ph ph-users-three me-1';
        summary.append(usersIcon, document.createTextNode('Dividir este gasto'));
    
        const sharingRow = document.createElement('div');
        sharingRow.className = 'row g-2 mt-1';
        const paidCol = document.createElement('div');
        paidCol.className = 'col-12 col-sm-5';
        const paidLabel = document.createElement('label');
        paidLabel.className = 'form-label small text-muted';
        paidLabel.textContent = 'Pago por';
        const paid = document.createElement('select');
        paid.id = 'tx-paid-by';
        paid.className = 'form-select';
        paidCol.append(paidLabel, paid);
    
        const sharedCol = document.createElement('div');
        sharedCol.className = 'col-12 col-sm-7';
        const sharedLabel = document.createElement('label');
        sharedLabel.className = 'form-label small text-muted';
        sharedLabel.textContent = 'Dividir igualmente com';
        const shared = document.createElement('select');
        shared.id = 'tx-shared-with';
        shared.className = 'form-select';
        shared.multiple = true;
        shared.size = 3;
        sharedCol.append(sharedLabel, shared);
        sharingRow.append(paidCol, sharedCol);
        details.append(summary, sharingRow);
    
        box.append(row, details);
        dateGroup.after(box);
    }

    function refreshTransactionMemberFields(transaction = null, mode = 'new') {
        ensureTransactionMetadataFields();
        const paid = byId('tx-paid-by');
        const shared = byId('tx-shared-with');
        if (!paid || !shared) return;
        const members = getHouseholdMembers();
        paid.replaceChildren();
        shared.replaceChildren();
        appendOption(paid, '', 'Só eu / não dividir');
        members.forEach(member => {
            appendOption(paid, member.id, member.name);
            appendOption(shared, member.id, member.name);
        });
        const details = byId('tx-sharing-details');
        details?.classList.toggle('d-none', members.length < 2);
        if (mode === 'edit' && transaction) {
            paid.value = transaction.paidByMemberId || '';
            const selected = new Set(Array.isArray(transaction.sharedWithMemberIds) ? transaction.sharedWithMemberIds : []);
            [...shared.options].forEach(option => { option.selected = selected.has(option.value); });
        } else {
            paid.value = '';
            [...shared.options].forEach(option => { option.selected = false; });
        }
    }

    function resetTransactionMetadataFields() {
        ensureTransactionMetadataFields();
        if (byId('tx-status')) byId('tx-status').value = 'auto';
        if (byId('tx-tags')) byId('tx-tags').value = '';
        refreshTransactionMemberFields();
    }

    function populateTransactionMetadataFields(transaction, mode) {
        ensureTransactionMetadataFields();
        if (byId('tx-status')) byId('tx-status').value = mode === 'edit' ? (transaction?.status || 'auto') : 'auto';
        if (byId('tx-tags')) byId('tx-tags').value = Array.isArray(transaction?.tags) ? transaction.tags.join(', ') : '';
        refreshTransactionMemberFields(transaction, mode);
    }

    function applyCategorySuggestion() {
        const description = byId('tx-desc')?.value || '';
        const select = byId('tx-category');
        const core = root.PlannkeCore;
        if (!description || !select || !core?.applyCategoryRules) return;
        const data = root.getData();
        const planning = core.ensurePlanning(data);
        const suggested = core.applyCategoryRules(description, select.value || 'Outros', planning.categoryRules);
        if ([...select.options].some(option => option.value === suggested)) select.value = suggested;
    }

    function readTransactionMetadata() {
        ensureTransactionMetadataFields();
        return {
            status: byId('tx-status')?.value || 'auto',
            tags: String(byId('tx-tags')?.value || '').split(',').map(tag => cleanProductText(tag, 40)).filter(Boolean).slice(0, 10),
            paidByMemberId: byId('tx-paid-by')?.value || null,
            sharedWithMemberIds: [...(byId('tx-shared-with')?.selectedOptions || [])].map(option => option.value).filter(Boolean).slice(0, 12)
        };
    }

    function findSavedTransaction(data, args) {
        const [id, type, description, amount, , accountId, , currentInstallment, , groupId] = args;
        if (id) return data.transactions.find(transaction => transaction.id === id) || null;
        const core = root.PlannkeCore;
        const safeDescription = core?.cleanText ? core.cleanText(description, 300) : String(description || '').trim();
        return [...data.transactions].reverse().find(transaction =>
            transaction.type === type && transaction.description === safeDescription &&
            Math.abs(Number(transaction.amount) - Number(amount)) < 0.005 && transaction.accountId === accountId &&
            (!groupId || transaction.groupId === groupId) &&
            (!currentInstallment || Number(transaction.currentInstallment) === Number(currentInstallment))
        ) || null;
    }

    function applySavedTransactionMetadata(args, metadata) {
        const data = root.getData();
        const transaction = findSavedTransaction(data, args);
        if (!transaction) return;
        const core = root.PlannkeCore;
        const today = core?.localDateString ? core.localDateString() : todayLocal();
        transaction.status = ['completed', 'planned'].includes(metadata.status)
            ? metadata.status
            : (String(transaction.date || '') > today ? 'planned' : 'completed');
        transaction.tags = metadata.tags.slice(0, 10);
        transaction.paidByMemberId = metadata.paidByMemberId;
        transaction.sharedWithMemberIds = metadata.sharedWithMemberIds.slice(0, 12);
        if (args[11] && args[1] !== 'transfer') core?.migrateLegacyRecurring?.(data);
        root.saveData(data);
    }

    function populateEntitySelect(select, data, selectedValue = '') {
        if (!select) return;
        select.replaceChildren();

        const placeholder = appendOption(select, '', 'Selecione...', !selectedValue);
        placeholder.disabled = true;

        if (data.accounts.length) {
            const accounts = document.createElement('optgroup');
            accounts.label = 'Contas Bancárias';
            data.accounts.forEach(account => appendOption(accounts, account.id, account.name, account.id === selectedValue));
            select.appendChild(accounts);
        }

        if (data.cards.length) {
            const cards = document.createElement('optgroup');
            cards.label = 'Cartões de Crédito';
            data.cards.forEach(card => appendOption(cards, card.id, card.name, card.id === selectedValue));
            select.appendChild(cards);
        }

        if (!data.accounts.length && !data.cards.length) {
            select.replaceChildren();
            const empty = appendOption(select, '', 'Crie uma conta primeiro', true);
            empty.disabled = true;
        }
    }

    function populateCategorySelect(type, selectedValue = '') {
        const select = byId('tx-category');
        if (!select) return;
        select.replaceChildren();

        const placeholder = appendOption(select, '', 'Selecione a categoria...', !selectedValue);
        placeholder.disabled = true;
        const categories = root._loadCategories?.();
        if (!categories) return;

        if (type === 'income') {
            (categories.income || []).forEach(category => appendOption(select, category, category, category === selectedValue));
            return;
        }

        Object.entries(categories.expense || {}).forEach(([groupName, groupCategories]) => {
            const group = document.createElement('optgroup');
            group.label = groupName;
            groupCategories.forEach(category => appendOption(group, category, category, category === selectedValue));
            select.appendChild(group);
        });
    }

    function populateAccountDropdowns(accountValue = '', destinationValue = '') {
        const data = root.getData();
        populateEntitySelect(byId('tx-account'), data, accountValue);
        populateEntitySelect(byId('tx-destination'), data, destinationValue);
    }

    function updateInstallmentHelper() {
        const amount = root.getCurrencyValue('tx-amount');
        const installments = parseInt(byId('tx-installments')?.value, 10) || 1;
        const isInstallment = !!byId('tx-is-installment')?.checked;
        const helper = byId('tx-installment-helper');
        if (!helper) return;

        helper.replaceChildren();
        if (!amount || amount <= 0 || !isInstallment || installments <= 1) {
            helper.classList.add('hidden');
            return;
        }

        const preview = document.createElement('div');
        preview.className = 'inst-preview';
        const icon = document.createElement('i');
        icon.className = 'ph ph-info';
        const copy = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = `${installments}x de ${root.formatCurrency(amount / installments)}`;
        const total = document.createElement('span');
        total.className = 'text-muted small';
        total.textContent = ` · Total: ${root.formatCurrency(amount)}`;
        copy.append(strong, total);
        preview.append(icon, copy);
        helper.appendChild(preview);
        helper.classList.remove('hidden');
    }

    function toggleInstallmentField() {
        const checked = document.querySelector('input[name="type"]:checked');
        if (!checked) return;

        const type = checked.value;
        ensureTransactionMetadataFields();
        const installmentMark = byId('tx-is-installment-group');
        const installments = byId('tx-installments-group');
        const categoryGroup = byId('tx-category-group');
        const destinationGroup = byId('tx-destination-group');
        const accountLabel = byId('tx-account-label');
        const categorySelect = byId('tx-category');
        const destination = byId('tx-destination');
        const isInstallment = !!byId('tx-is-installment')?.checked;
        const previousCategory = categorySelect?.value || '';

        byId('tx-fields-wrapper')?.classList.remove('hidden');
        if (accountLabel) accountLabel.textContent = 'Conta ou Cartão';

        if (type === 'transfer') {
            installmentMark?.classList.add('hidden');
            installments?.classList.add('hidden');
            categoryGroup?.classList.add('hidden');
            destinationGroup?.classList.remove('hidden');
            if (accountLabel) accountLabel.textContent = 'Conta de Origem';
            categorySelect?.removeAttribute('required');
            destination?.setAttribute('required', 'true');
        } else {
            categoryGroup?.classList.remove('hidden');
            destinationGroup?.classList.add('hidden');
            categorySelect?.setAttribute('required', 'true');
            destination?.removeAttribute('required');

            if (type === 'income') {
                installmentMark?.classList.add('hidden');
                installments?.classList.add('hidden');
            } else {
                installmentMark?.classList.remove('hidden');
                installments?.classList.toggle('hidden', !isInstallment);
            }
            populateCategorySelect(type, previousCategory);
        }
        updateInstallmentHelper();
    }

    function openTxModal(preType) {
        if (byId('tx-id')) byId('tx-id').value = '';
        populateAccountDropdowns();
        resetTransactionMetadataFields();
        if (byId('tx-date')) byId('tx-date').value = todayLocal();

        if (preType) {
            document.querySelectorAll('input[name="type"]').forEach(radio => {
                radio.checked = radio.value === preType;
            });
            byId('tx-fields-wrapper')?.classList.remove('hidden');
            toggleInstallmentField();
        } else {
            document.querySelectorAll('input[name="type"]').forEach(radio => { radio.checked = false; });
            byId('tx-fields-wrapper')?.classList.add('hidden');
        }

        byId('tx-installment-helper')?.replaceChildren();
        root.bootstrap.Modal.getOrCreateInstance(byId('transactionModal')).show();
        root.setTimeout(() => byId('tx-desc')?.focus(), 350);
    }

    function resetTransactionModal() {
        byId('transactionForm')?.reset();
        if (byId('tx-id')) byId('tx-id').value = '';
        if (byId('tx-modal-title')) byId('tx-modal-title').textContent = 'Nova Transação';
        byId('tx-fields-wrapper')?.classList.add('hidden');
        byId('tx-installment-helper')?.replaceChildren();
        resetTransactionMetadataFields();
        root.clearFormError?.();
    }

    function bindTransactionControls() {
        if (controlsBound || typeof document === 'undefined') return;
        controlsBound = true;
        ensureTransactionMetadataFields();
        refreshTransactionMemberFields();

        ['type-income', 'type-expense', 'type-transfer', 'tx-is-installment', 'tx-account'].forEach(id => {
            byId(id)?.addEventListener('change', toggleInstallmentField);
        });
        byId('tx-installments')?.addEventListener('input', updateInstallmentHelper);
        byId('tx-manage-categories')?.addEventListener('click', () => root.openCategoryManager?.());
        byId('tx-date')?.addEventListener('click', event => {
            try { event.currentTarget?.showPicker?.(); } catch (_) {}
        });
        byId('tx-desc')?.addEventListener('blur', applyCategorySuggestion);
    }

    function setupModalEvents() {
        if (modalEventsBound) return;
        modalEventsBound = true;
        byId('transactionModal')?.addEventListener('show.bs.modal', () => refreshTransactionMemberFields());
        byId('transactionModal')?.addEventListener('hidden.bs.modal', resetTransactionModal);
    }

    function saveTransactionForm() {
        root.clearFormError?.();
        const typeInput = document.querySelector('input[name="type"]:checked');
        if (!typeInput) { root.showFormError('Selecione o tipo de transação.'); return; }

        const id = byId('tx-id')?.value || '';
        const type = typeInput.value;
        const description = byId('tx-desc')?.value.trim() || '';
        const category = type === 'transfer' ? 'Transferência' : (byId('tx-category')?.value || '');
        const amount = root.getCurrencyValue('tx-amount');
        const isInstallment = !!byId('tx-is-installment')?.checked;
        const isRecurring = !!byId('tx-is-recurring')?.checked && type !== 'transfer';
        const installments = isInstallment && type === 'expense' ? (parseInt(byId('tx-installments')?.value, 10) || 1) : 1;
        const date = byId('tx-date')?.value || '';
        const account = byId('tx-account')?.value || '';
        const destination = type === 'transfer' ? (byId('tx-destination')?.value || '') : null;

        if (!description) { root.showFormError('Informe a descrição.'); return; }
        if (type !== 'transfer' && !category) { root.showFormError('Selecione uma categoria.'); return; }
        if (!amount || amount <= 0) { root.showFormError('Informe um valor válido.'); return; }
        if (!date) { root.showFormError('Informe a data.'); return; }
        if (!account) { root.showFormError('Selecione uma conta ou cartão.'); return; }
        if (type === 'transfer' && !destination) { root.showFormError('Selecione a conta de destino.'); return; }
        if (type === 'transfer' && account === destination) { root.showFormError('Origem e destino iguais.'); return; }

        const metadata = readTransactionMetadata();
        const persistTransaction = (...args) => {
            root.saveTransaction(...args);
            applySavedTransactionMetadata(args, metadata);
        };

        try {
            if (id) {
                persistTransaction(id, type, description, amount, date, account, category, 1, 1, null, destination, isRecurring);
                root.showToast('Transação atualizada ✓');
            } else if (installments > 1 && type === 'expense') {
                const groupId = root.generateId();
                const partValue = amount / installments;
                buildInstallmentDates(date, installments).forEach((installmentDate, index) => {
                    persistTransaction(
                        null,
                        type,
                        description,
                        partValue,
                        installmentDate,
                        account,
                        category,
                        index + 1,
                        installments,
                        groupId,
                        null,
                        false
                    );
                });
                root.showToast(`${installments}x de ${root.formatCurrency(partValue)} salvas! 📅`);
            } else {
                persistTransaction(null, type, description, amount, date, account, category, 1, 1, null, destination, isRecurring);
                const verb = type === 'income' ? '✅ Entrada' : (type === 'transfer' ? '🔀 Transferência' : '💸 Gasto');
                root.showToast(`${verb} de ${root.formatCurrency(amount)} salvo!${isRecurring ? ' 🔁' : ''}`);
            }
            root.closeModal('transactionModal');
            root.renderAll();
        } catch (error) {
            console.error(error);
            root.showFormError('Erro inesperado. Verifique o console (F12).');
        }
    }

    function setupForms() {
        if (formsBound) return;
        formsBound = true;
        byId('transactionForm')?.addEventListener('submit', event => {
            event.preventDefault();
            saveTransactionForm();
        });
    }

    function loadTransactionIntoForm(transaction, mode) {
        if (!transaction) return;
        const type = ['income', 'expense', 'transfer'].includes(transaction.type) ? transaction.type : 'expense';

        if (byId('tx-id')) byId('tx-id').value = mode === 'edit' ? transaction.id : '';
        if (byId('tx-desc')) byId('tx-desc').value = transaction.description || '';
        root.setCurrencyValue('tx-amount', transaction.amount);
        if (byId('tx-date')) byId('tx-date').value = mode === 'edit' ? transaction.date : todayLocal();

        const radio = document.querySelector(`input[name="type"][value="${type}"]`);
        if (radio) radio.checked = true;

        populateAccountDropdowns(transaction.accountId, transaction.destinationId || '');
        byId('tx-fields-wrapper')?.classList.remove('hidden');
        toggleInstallmentField();

        if (byId('tx-account')) byId('tx-account').value = transaction.accountId || '';
        if (type === 'transfer' && byId('tx-destination')) byId('tx-destination').value = transaction.destinationId || '';
        if (transaction.category && transaction.category !== 'Transferência' && byId('tx-category')) {
            populateCategorySelect(type, transaction.category);
            byId('tx-category').value = transaction.category;
        }
        if (byId('tx-is-recurring')) byId('tx-is-recurring').checked = !!transaction.recurring;
        populateTransactionMetadataFields(transaction, mode);
        if (byId('tx-modal-title')) byId('tx-modal-title').textContent = mode === 'edit' ? 'Editar Transação' : 'Duplicar Transação';

        byId('tx-installments-group')?.classList.add('hidden');
        root.bootstrap.Modal.getOrCreateInstance(byId('transactionModal')).show();
    }

    function dupTx(id) {
        loadTransactionIntoForm(root.getData().transactions.find(transaction => transaction.id === id), 'duplicate');
    }

    function edTx(id) {
        loadTransactionIntoForm(root.getData().transactions.find(transaction => transaction.id === id), 'edit');
    }

    function delTx(id) {
        const transaction = root.getData().transactions.find(candidate => candidate.id === id);
        if (!transaction) return;
        const typeLabel = transaction.type === 'income' ? 'entrada' : transaction.type === 'expense' ? 'gasto' : 'transferência';

        root._showDeleteConfirm(
            'Excluir transação?',
            `${transaction.description} · ${typeLabel} de ${root.formatDate(transaction.date)}`,
            root.formatCurrency(transaction.amount),
            () => {
                root.deleteTransaction(id);
                root.renderAll();
                root.showToast('Transação excluída', 'error');
            }
        );
    }

    const api = {
        setupForms,
        setupModalEvents,
        bindTransactionControls,
        openTxModal,
        populateAccountDropdowns,
        toggleInstallmentField,
        updateInstallmentHelper,
        saveTransactionForm,
        ensureTransactionMetadataFields,
        refreshTransactionMemberFields,
        readTransactionMetadata,
        applySavedTransactionMetadata,
        buildInstallmentDates,
        dupTx,
        edTx,
        delTx
    };

    root.setupForms = setupForms;
    root.setupModalEvents = setupModalEvents;
    root.openTxModal = openTxModal;
    root._populateAccountDropdowns = populateAccountDropdowns;
    root.toggleInstallmentField = toggleInstallmentField;
    root.updateInstallmentHelper = updateInstallmentHelper;
    root.dupTx = dupTx;
    root.edTx = edTx;
    root.delTx = delTx;
    root.PlannkeTransactions = api;
    bindTransactionControls();
})(typeof globalThis !== 'undefined' ? globalThis : this);

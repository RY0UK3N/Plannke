/* Plannke canonical transaction form and handlers. */
(function (root) {
    'use strict';

    let formsBound = false;
    let modalEventsBound = false;

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
        root.clearFormError?.();
    }

    function setupModalEvents() {
        if (modalEventsBound) return;
        modalEventsBound = true;

        byId('transactionModal')?.addEventListener('hidden.bs.modal', resetTransactionModal);
        byId('accountModal')?.addEventListener('hidden.bs.modal', () => {
            byId('accountForm')?.reset();
            if (byId('acc-id')) byId('acc-id').value = '';
            if (byId('acc-modal-title')) byId('acc-modal-title').textContent = 'Nova Conta';
        });
        byId('cardModal')?.addEventListener('hidden.bs.modal', () => {
            byId('cardForm')?.reset();
            if (byId('card-id')) byId('card-id').value = '';
            if (byId('card-modal-title')) byId('card-modal-title').textContent = 'Novo Cartão de Crédito';
        });
        byId('entityDetailModal')?.addEventListener('hidden.bs.modal', () => {
            root._detailContext = { id: null, type: 'account' };
        });
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

        try {
            if (id) {
                root.saveTransaction(id, type, description, amount, date, account, category, 1, 1, null, destination, isRecurring);
                root.showToast('Transação atualizada ✓');
            } else if (installments > 1 && type === 'expense') {
                const groupId = root.generateId();
                const partValue = amount / installments;
                buildInstallmentDates(date, installments).forEach((installmentDate, index) => {
                    root.saveTransaction(
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
                root.saveTransaction(null, type, description, amount, date, account, category, 1, 1, null, destination, isRecurring);
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

        byId('accountForm')?.addEventListener('submit', event => {
            event.preventDefault();
            root.saveAccount(byId('acc-id').value, byId('acc-name').value, root.getCurrencyValue('acc-balance'));
            root.closeModal('accountModal');
            root.renderAll();
            root.showToast('Conta salva!');
        });

        byId('cardForm')?.addEventListener('submit', event => {
            event.preventDefault();
            root.saveCard(
                byId('card-id').value,
                byId('card-name').value,
                root.getCurrencyValue('card-limit'),
                byId('card-closing').value,
                byId('card-due').value
            );
            root.closeModal('cardModal');
            root.renderAll();
            root.showToast('Cartão salvo!');
        });

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
        openTxModal,
        populateAccountDropdowns,
        toggleInstallmentField,
        updateInstallmentHelper,
        saveTransactionForm,
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
})(typeof globalThis !== 'undefined' ? globalThis : this);

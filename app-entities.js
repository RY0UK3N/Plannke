/* Plannke canonical accounts, cards and statement/invoice runtime. */
(function (root) {
    'use strict';

    let formsBound = false;
    let modalEventsBound = false;

    function byId(id) {
        return document.getElementById(id);
    }

    function localToday() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    function icon(name) {
        const node = document.createElement('i');
        node.className = `ph ${name}`;
        return node;
    }

    function option(value, label, selected = false) {
        const node = document.createElement('option');
        node.value = value;
        node.textContent = String(label ?? '');
        node.selected = selected;
        return node;
    }

    function replaceButton(button) {
        if (!button?.parentNode) return button;
        const fresh = button.cloneNode(true);
        button.parentNode.replaceChild(fresh, button);
        return fresh;
    }

    function showEntityDetail() {
        const modal = byId('entityDetailModal');
        if (modal) root.bootstrap?.Modal?.getOrCreateInstance(modal)?.show();
    }

    function setDetailIdentity(title, subtitle, iconName, card = false) {
        const titleNode = byId('detail-title');
        const subtitleNode = byId('detail-subtitle');
        const iconNode = byId('detail-icon');
        if (titleNode) titleNode.textContent = title;
        if (subtitleNode) subtitleNode.textContent = subtitle;
        if (iconNode) {
            iconNode.replaceChildren(icon(iconName));
            iconNode.className = card ? 'entity-icon card-type' : 'entity-icon';
        }
    }

    function fillDetailPeriods(periods, selectedPeriod) {
        const select = byId('detail-period-select');
        if (!select) return;
        select.replaceChildren();
        periods.forEach(period => select.appendChild(option(period, root.formatPeriod(period), period === selectedPeriod)));
    }

    function renderDetailTransactions(transactions, data, emptyMessage) {
        const list = byId('detail-tx-list');
        const count = byId('detail-tx-count');
        if (count) count.textContent = `${transactions.length} transações`;
        if (!list) return;
        list.replaceChildren();

        if (!transactions.length) {
            const empty = document.createElement('li');
            empty.className = 'py-4 text-center text-muted small';
            empty.textContent = emptyMessage;
            list.appendChild(empty);
            return;
        }
        transactions.forEach(transaction => root._renderTxItem?.(list, transaction, data));
    }

    function viewAccountStatement(accountId, period = null, skipShow = false) {
        const data = root.getData();
        const account = data.accounts.find(item => item.id === accountId);
        if (!account) return;

        const months = [...new Set((data.transactions || [])
            .filter(transaction => transaction.accountId === accountId || transaction.destinationId === accountId)
            .map(transaction => String(transaction.date || '').slice(0, 7))
            .filter(value => /^\d{4}-\d{2}$/.test(value)))]
            .sort()
            .reverse();

        const selectedPeriod = period || months[0] || localToday().slice(0, 7);
        const availablePeriods = months.length ? months : [selectedPeriod];

        root._detailContext = {
            id: accountId,
            type: 'account',
            period: selectedPeriod,
            onPeriodChange: next => viewAccountStatement(accountId, next, true)
        };

        setDetailIdentity(account.name, 'Conta Bancária', 'ph-bank');
        if (byId('summary-label')) byId('summary-label').textContent = 'Saldo Disponível';
        if (byId('summary-amount')) {
            byId('summary-amount').textContent = root.formatCurrency(account.balance);
            byId('summary-amount').style.color = 'var(--color-primary)';
        }
        byId('card-period-wrapper')?.classList.remove('d-none');
        byId('detail-footer-pay')?.classList.add('d-none');
        fillDetailPeriods(availablePeriods, selectedPeriod);

        const transactions = (data.transactions || [])
            .filter(transaction => {
                const belongs = transaction.accountId === accountId || transaction.destinationId === accountId;
                return belongs && String(transaction.date || '').startsWith(selectedPeriod);
            })
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

        renderDetailTransactions(
            transactions,
            data,
            `Nenhuma transação nesta conta em ${root.formatPeriod(selectedPeriod)}.`
        );
        if (!skipShow) showEntityDetail();
    }

    function paymentAccountSelect(data) {
        const select = byId('detail-pay-acc-select');
        if (!select) return null;
        select.replaceChildren(option('', 'Debitar de...'));
        data.accounts.forEach(account => {
            select.appendChild(option(account.id, `${account.name} (${root.formatCurrency(account.balance)})`));
        });
        return select;
    }

    function configureInvoiceFooter(data, card, billing, period) {
        const footer = byId('detail-footer-pay');
        const status = byId('detail-pay-status');
        let button = replaceButton(byId('detail-pay-btn'));
        const select = paymentAccountSelect(data);
        if (!footer || !status || !button || !select) return;

        button.disabled = false;
        button.style.opacity = '';

        if (!billing.isPaid && Number(billing.total || 0) > 0) {
            footer.classList.remove('d-none');
            status.textContent = 'Pendente';
            status.className = 'badge bg-danger p-1 px-2';
            button.addEventListener('click', () => {
                const fromId = select.value;
                if (!fromId) {
                    root.showToast?.('Selecione uma conta.', 'error');
                    return;
                }
                const account = data.accounts.find(item => item.id === fromId);
                const approved = typeof root.confirm !== 'function' || root.confirm(
                    `Pagar fatura de ${root.formatCurrency(billing.total)} com ${account?.name || 'esta conta'}?`
                );
                if (!approved) return;
                root.payCardBilling(card.id, period, fromId, billing.total);
                root.showToast?.('Fatura paga com sucesso!');
                viewCardInvoice(card.id, period, true);
                root.renderAll?.();
            });
            return;
        }

        if (billing.isPaid) {
            footer.classList.remove('d-none');
            status.textContent = 'Paga';
            status.className = 'badge bg-success p-1 px-2';
            select.replaceChildren(option('', `Paga em ${root.formatDate(billing.paidAt)}`, true));
            select.disabled = true;
            button.disabled = true;
            button.style.opacity = '0.5';
            return;
        }

        footer.classList.add('d-none');
    }

    function viewCardInvoice(cardId, period = null, skipShow = false) {
        const data = root.getData();
        const card = data.cards.find(item => item.id === cardId);
        if (!card) return;

        const selectedPeriod = period || root.getBillingPeriod(localToday(), card.closingDay);
        const allBillings = root.getAllCardBillings(data, cardId) || [];
        const periods = allBillings.map(item => item.period);
        if (!periods.includes(selectedPeriod)) periods.unshift(selectedPeriod);
        const billing = root.getCardBilling(data, cardId, selectedPeriod);
        if (!billing) return;

        root._detailContext = {
            id: cardId,
            type: 'card',
            period: selectedPeriod,
            onPeriodChange: next => viewCardInvoice(cardId, next, true)
        };

        setDetailIdentity(card.name, 'Cartão de Crédito', 'ph-credit-card', true);
        if (byId('summary-label')) byId('summary-label').textContent = `Fatura ${root.formatPeriod(selectedPeriod)}`;
        if (byId('summary-amount')) {
            byId('summary-amount').textContent = root.formatCurrency(billing.total);
            byId('summary-amount').style.color = 'var(--color-expense)';
        }
        byId('card-period-wrapper')?.classList.remove('d-none');
        fillDetailPeriods(periods, selectedPeriod);
        configureInvoiceFooter(data, card, billing, selectedPeriod);
        renderDetailTransactions(billing.transactions || [], data, 'Nenhum gasto neste período.');
        if (!skipShow) showEntityDetail();
    }

    function handlePayFatura(cardId, period, total) {
        const data = root.getData();
        const select = byId(`pay-acc-${cardId}`);
        const fromId = select?.value || '';
        if (!fromId) {
            root.showToast?.('Selecione uma conta.', 'error');
            return;
        }
        const account = data.accounts.find(item => item.id === fromId);
        const approved = typeof root.confirm !== 'function' || root.confirm(
            `Pagar fatura de ${root.formatCurrency(total)} com ${account?.name || 'esta conta'}?`
        );
        if (!approved) return;
        root.payCardBilling(cardId, period, fromId, total);
        root.showToast?.('Fatura paga com sucesso!');
        root.renderAll?.();
    }

    function setupForms() {
        if (formsBound) return;
        formsBound = true;

        byId('accountForm')?.addEventListener('submit', event => {
            event.preventDefault();
            root.saveAccount(
                byId('acc-id')?.value || '',
                byId('acc-name')?.value || '',
                root.getCurrencyValue('acc-balance')
            );
            root.closeModal?.('accountModal');
            root.renderAll?.();
            root.showToast?.('Conta salva!');
        });

        byId('cardForm')?.addEventListener('submit', event => {
            event.preventDefault();
            root.saveCard(
                byId('card-id')?.value || '',
                byId('card-name')?.value || '',
                root.getCurrencyValue('card-limit'),
                byId('card-closing')?.value || 1,
                byId('card-due')?.value || 1
            );
            root.closeModal?.('cardModal');
            root.renderAll?.();
            root.showToast?.('Cartão salvo!');
        });
    }

    function setupModalEvents() {
        if (modalEventsBound) return;
        modalEventsBound = true;

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
            root._detailContext = { id: null, type: 'account', period: null };
        });
    }

    function edAcc(id) {
        const account = root.getData().accounts.find(item => item.id === id);
        if (!account) return;
        if (byId('acc-id')) byId('acc-id').value = account.id;
        if (byId('acc-name')) byId('acc-name').value = account.name;
        root.setCurrencyValue('acc-balance', account.balance);
        if (byId('acc-modal-title')) byId('acc-modal-title').textContent = 'Editar Conta';
        root.bootstrap?.Modal?.getOrCreateInstance(byId('accountModal'))?.show();
    }

    function edCard(id) {
        const card = root.getData().cards.find(item => item.id === id);
        if (!card) return;
        if (byId('card-id')) byId('card-id').value = card.id;
        if (byId('card-name')) byId('card-name').value = card.name;
        root.setCurrencyValue('card-limit', card.limit);
        if (byId('card-closing')) byId('card-closing').value = card.closingDay || 1;
        if (byId('card-due')) byId('card-due').value = card.dueDay || 1;
        if (byId('card-modal-title')) byId('card-modal-title').textContent = 'Editar Cartão';
        root.bootstrap?.Modal?.getOrCreateInstance(byId('cardModal'))?.show();
    }

    function delAcc(id) {
        const account = root.getData().accounts.find(item => item.id === id);
        if (!account) return;
        root._showDeleteConfirm?.(
            'Apagar conta?',
            account.name,
            `Saldo: ${root.formatCurrency(account.balance)}`,
            () => {
                root.deleteAccount(id);
                root.renderAll?.();
                root.showToast?.('Conta removida', 'error');
            }
        );
    }

    function delCard(id) {
        const card = root.getData().cards.find(item => item.id === id);
        if (!card) return;
        root._showDeleteConfirm?.(
            'Apagar cartão?',
            card.name,
            `Limite: ${root.formatCurrency(card.limit)}`,
            () => {
                root.deleteCard(id);
                root.renderAll?.();
                root.showToast?.('Cartão removido', 'error');
            }
        );
    }

    const api = {
        setupForms,
        setupModalEvents,
        viewAccountStatement,
        viewCardInvoice,
        handlePayFatura,
        edAcc,
        edCard,
        delAcc,
        delCard
    };

    root.viewAccountStatement = viewAccountStatement;
    root.viewCardInvoice = viewCardInvoice;
    root.handlePayFatura = handlePayFatura;
    root.edAcc = edAcc;
    root.edCard = edCard;
    root.delAcc = delAcc;
    root.delCard = delCard;
    root.PlannkeEntities = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

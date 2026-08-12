/* Transitional DOM-safe renderers for the legacy shell.
   These keep the current visual language while removing HTML-string rendering
   from the most sensitive, user-data-heavy surfaces ahead of the visual revamp. */
(function (root) {
    'use strict';

    function make(tag, className, textValue) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (textValue !== undefined && textValue !== null) node.textContent = String(textValue);
        return node;
    }

    function icon(classes) {
        return make('i', `ph ${classes}`);
    }

    function localToday() {
        if (root.PlannkeCore?.localDateString) return root.PlannkeCore.localDateString();
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function empty(container, textValue, className = 'text-muted small') {
        container.replaceChildren(make('p', className, textValue));
    }

    function actionButton(iconClass, title, callback, danger = false) {
        const button = make('button', danger ? 'btn-icon danger' : 'btn-icon');
        button.type = 'button';
        button.title = title;
        button.setAttribute('aria-label', title);
        button.appendChild(icon(iconClass));
        button.addEventListener('click', callback);
        return button;
    }

    function categoryBadge(category) {
        if (!category) return null;
        const color = typeof _getCatColor === 'function' ? _getCatColor(category) : '#475569';
        const r = parseInt(color.slice(1, 3), 16) || 71;
        const g = parseInt(color.slice(3, 5), 16) || 85;
        const b = parseInt(color.slice(5, 7), 16) || 105;
        const badge = make('span', 'tag', category);
        badge.dataset.cat = category;
        badge.style.background = `rgba(${r},${g},${b},0.12)`;
        badge.style.color = color;
        badge.style.borderColor = `rgba(${r},${g},${b},0.25)`;
        return badge;
    }

    function installmentBadge(tx) {
        if (Number(tx.totalInstallments || 1) <= 1) return null;
        return make('span', 'tag installments', `${tx.currentInstallment || 1}/${tx.totalInstallments}`);
    }

    function recurringBadge(tx) {
        if (!tx.recurring) return null;
        return make('span', 'tag recurring', '↻');
    }

    function statusBadge(tx) {
        if (tx.status !== 'planned') return null;
        return make('span', 'tag product-status-badge', 'Prevista');
    }

    function appendBadges(container, tx) {
        [categoryBadge(tx.category), installmentBadge(tx), recurringBadge(tx), statusBadge(tx)]
            .filter(Boolean)
            .forEach(node => container.appendChild(node));
    }

    function accountLabel(data, tx) {
        const source = data.accounts.find(a => a.id === tx.accountId)?.name
            || data.cards.find(c => c.id === tx.accountId)?.name || '—';
        const destination = data.accounts.find(a => a.id === tx.destinationId)?.name
            || data.cards.find(c => c.id === tx.destinationId)?.name || '';
        return tx.type === 'transfer' && destination ? `${source} → ${destination}` : source;
    }

    function transactionVisual(tx) {
        const income = tx.type === 'income';
        const transfer = tx.type === 'transfer';
        return {
            iconClass: income ? 'ph-arrow-up-right' : transfer ? 'ph-arrows-left-right' : 'ph-arrow-down-left',
            color: income ? 'var(--color-primary)' : transfer ? 'var(--color-transfer)' : 'var(--color-expense)',
            sign: income ? '+' : transfer ? '' : '-'
        };
    }

    function transactionActions(tx) {
        const actions = make('div', 'tx-item-actions');
        actions.append(
            actionButton('ph-copy', 'Duplicar', () => root.dupTx?.(tx.id)),
            actionButton('ph-pencil-simple', 'Editar', () => root.edTx?.(tx.id)),
            actionButton('ph-trash', 'Excluir', () => root.delTx?.(tx.id), true)
        );
        return actions;
    }

    function safeRenderTxItem(container, tx, data) {
        const visual = transactionVisual(tx);
        const item = make('li', 'tx-item');

        const iconWrap = make('div', 'tx-item-icon');
        const txIcon = make('div', `tx-icon ${tx.type}`);
        txIcon.appendChild(icon(visual.iconClass));
        iconWrap.appendChild(txIcon);

        const body = make('div', 'tx-item-body');
        const top = make('div', 'tx-item-top');
        top.appendChild(make('span', 'tx-item-desc', tx.description || 'Sem descrição'));
        const amount = make('span', 'tx-item-amount', `${visual.sign}${formatCurrency(Number(tx.amount || 0))}`);
        amount.style.color = visual.color;
        top.appendChild(amount);

        const bottom = make('div', 'tx-item-bottom');
        const tags = make('div', 'tx-item-tags');
        appendBadges(tags, tx);
        const meta = make('div', 'tx-item-meta');
        meta.appendChild(make('span', 'tx-item-date', formatDate(tx.date)));
        meta.appendChild(transactionActions(tx));
        bottom.append(tags, meta);
        body.append(top, bottom);
        item.append(iconWrap, body);
        container.appendChild(item);
        return item;
    }

    function desktopTransactionRow(tx, data) {
        const visual = transactionVisual(tx);
        const row = make('tr');

        const detailCell = make('td');
        const detailWrap = make('div', 'd-flex align-items-center gap-2');
        const txIcon = icon(visual.iconClass);
        txIcon.style.fontSize = '1.1rem';
        txIcon.style.color = visual.color;
        const info = make('div');
        const heading = make('div', 'd-flex align-items-center gap-2 flex-wrap');
        heading.append(
            make('span', 'fw-semibold small', tx.description || 'Sem descrição'),
            make('span', 'text-muted', formatDate(tx.date))
        );
        heading.lastElementChild.style.fontSize = '0.72rem';
        const badges = make('div', 'mt-1');
        appendBadges(badges, tx);
        info.append(heading, badges);
        detailWrap.append(txIcon, info);
        detailCell.appendChild(detailWrap);

        const accountCell = make('td', 'text-muted small', accountLabel(data, tx));
        const amountCell = make('td', 'fw-semibold small', `${visual.sign} ${formatCurrency(Number(tx.amount || 0))}`);
        amountCell.style.color = visual.color;
        const actionCell = make('td', 'text-end');
        const actionWrap = make('div', 'd-flex justify-content-end gap-1');
        actionWrap.append(
            actionButton('ph-copy', 'Duplicar', () => root.dupTx?.(tx.id)),
            actionButton('ph-pencil-simple', 'Editar', () => root.edTx?.(tx.id)),
            actionButton('ph-trash', 'Excluir', () => root.delTx?.(tx.id), true)
        );
        actionCell.appendChild(actionWrap);
        row.append(detailCell, accountCell, amountCell, actionCell);
        return row;
    }

    function mobileTransactionCard(tx, data) {
        const visual = transactionVisual(tx);
        const card = make('li', 'tx-mobile-card');
        const left = make('div', 'tx-mobile-left');
        const txIcon = make('div', `tx-icon ${tx.type}`);
        txIcon.appendChild(icon(visual.iconClass));
        const info = make('div', 'tx-mobile-info');
        const heading = make('div', 'd-flex align-items-center gap-2 flex-wrap');
        heading.appendChild(make('span', 'tx-mobile-desc', tx.description || 'Sem descrição'));
        appendBadges(heading, tx);
        const meta = make('div', 'tx-mobile-meta');
        const acc = make('span', 'tx-mobile-acc');
        acc.append(icon('ph-bank'), document.createTextNode(` ${accountLabel(data, tx)}`));
        meta.append(acc, make('span', 'tx-mobile-date', formatDate(tx.date)));
        info.append(heading, meta);
        left.append(txIcon, info);

        const right = make('div', 'tx-mobile-right');
        const amount = make('span', 'tx-mobile-amount', `${visual.sign}${formatCurrency(Number(tx.amount || 0))}`);
        amount.style.color = visual.color;
        const actions = make('div', 'tx-mobile-actions');
        actions.append(
            actionButton('ph-copy', 'Duplicar', () => root.dupTx?.(tx.id)),
            actionButton('ph-pencil-simple', 'Editar', () => root.edTx?.(tx.id)),
            actionButton('ph-trash', 'Excluir', () => root.delTx?.(tx.id), true)
        );
        right.append(amount, actions);
        card.append(left, right);
        return card;
    }

    function safeRenderTransactions(data) {
        if (!data) data = getData();
        const searchRaw = document.getElementById('tx-search')?.value || '';
        const searchTerm = searchRaw.toLowerCase().trim();
        const movementSearch = root.PlannkeMovements;
        const smartSearch = !!searchTerm && !!movementSearch?.isSmartSearch?.(searchRaw);
        const renderData = smartSearch
            ? { ...data, transactions: movementSearch.searchTransactions(data, searchRaw) }
            : data;

        root.renderMonthTabs?.(renderData);
        const tbody = document.getElementById('all-transactions-body');
        const mobileList = document.getElementById('all-transactions-mobile');
        if (!tbody || !mobileList) return;
        tbody.replaceChildren();
        mobileList.replaceChildren();

        const filter = document.getElementById('tx-filter')?.value || 'all';
        const filterCat = document.getElementById('tx-filter-category')?.value || 'all';
        const filterAcc = document.getElementById('tx-filter-account')?.value || 'all';
        document.getElementById('tx-search-clear')?.classList.toggle('hidden', !searchTerm);

        let filtered = Array.isArray(renderData.transactions) ? renderData.transactions : [];
        if (filter !== 'all') filtered = filtered.filter(t => t.type === filter);
        if (filterCat !== 'all') filtered = filtered.filter(t => t.category === filterCat);
        if (filterAcc !== 'all') filtered = filtered.filter(t => t.accountId === filterAcc || t.destinationId === filterAcc);
        const currentMonth = root.PlannkeMovements?.currentMonth || '';
        if (currentMonth) filtered = filtered.filter(t => String(t.date || '').startsWith(currentMonth));
        if (searchTerm && !smartSearch) filtered = filtered.filter(t => String(t.description || '').toLowerCase().includes(searchTerm));

        const countBadge = document.getElementById('tx-result-count');
        const hasFilter = filter !== 'all' || filterCat !== 'all' || filterAcc !== 'all' || !!searchTerm;
        if (countBadge) {
            countBadge.classList.toggle('hidden', !hasFilter);
            if (hasFilter) countBadge.textContent = `${filtered.length} resultado${filtered.length === 1 ? '' : 's'}`;
        }

        const sorted = [...filtered].sort((a, b) => String(b.date).localeCompare(String(a.date)));
        if (!sorted.length) {
            const message = searchTerm ? `Nenhuma transação encontrada para “${searchRaw}”.`
                : (filterCat !== 'all' || filterAcc !== 'all') ? 'Nenhuma transação com os filtros aplicados.'
                    : 'Nenhuma transação encontrada.';
            const row = make('tr');
            const cell = make('td', 'text-center text-muted py-4 small', message);
            cell.colSpan = 4;
            row.appendChild(cell);
            tbody.appendChild(row);
            mobileList.appendChild(make('li', 'tx-mobile-empty', message));
            return;
        }

        const desktop = document.createDocumentFragment();
        const mobile = document.createDocumentFragment();
        sorted.forEach(tx => {
            desktop.appendChild(desktopTransactionRow(tx, data));
            mobile.appendChild(mobileTransactionCard(tx, data));
        });
        tbody.appendChild(desktop);
        mobileList.appendChild(mobile);
    }

    function safeRenderAccounts(data) {
        const grid = document.getElementById('accounts-grid');
        if (!grid) return;
        grid.replaceChildren();
        if (!data.accounts?.length) {
            const col = make('div', 'col-12');
            col.appendChild(make('p', 'text-muted small', 'Nenhuma conta cadastrada.'));
            grid.appendChild(col);
            return;
        }
        const fragment = document.createDocumentFragment();
        data.accounts.forEach(acc => {
            const col = make('div', 'col-12 col-sm-6 col-lg-4');
            const card = make('div', 'card entity-card h-100');
            const body = make('div', 'card-body');
            const actions = make('div', 'd-flex justify-content-end gap-1 mb-3');
            actions.append(
                actionButton('ph-pencil-simple', 'Editar conta', () => root.edAcc?.(acc.id)),
                actionButton('ph-trash', 'Excluir conta', () => root.delAcc?.(acc.id), true)
            );
            const header = make('div', 'd-flex align-items-center gap-3 mb-3');
            const entityIcon = make('div', 'entity-icon'); entityIcon.appendChild(icon('ph-bank'));
            const labels = make('div');
            labels.append(make('h6', 'mb-0 fw-bold', acc.name), make('div', 'small text-muted', 'Conta Bancária'));
            header.append(entityIcon, labels);
            const balanceLabel = make('div', 'small text-muted', 'Saldo Disponível');
            const footer = make('div', 'd-flex justify-content-between align-items-end');
            const balance = make('div', 'fs-4 fw-bold mt-1', formatCurrency(Number(acc.balance || 0)));
            balance.style.color = 'var(--color-primary)';
            const statement = make('button', 'btn btn-sm btn-outline-primary rounded-pill px-3 py-1 fw-semibold', 'Ver Extrato');
            statement.type = 'button'; statement.style.fontSize = '0.75rem';
            statement.addEventListener('click', () => root.viewAccountStatement?.(acc.id));
            footer.append(balance, statement);
            body.append(actions, header, balanceLabel, footer);
            card.appendChild(body); col.appendChild(card); fragment.appendChild(col);
        });
        grid.appendChild(fragment);
    }

    function option(value, label, selected = false) {
        const opt = make('option', '', label);
        opt.value = value;
        opt.selected = selected;
        return opt;
    }

    function safeRenderCards(data) {
        const grid = document.getElementById('cards-grid');
        if (!grid) return;
        grid.replaceChildren();
        if (!data.cards?.length) {
            const col = make('div', 'col-12');
            col.appendChild(make('p', 'text-muted small', 'Nenhum cartão cadastrado.'));
            grid.appendChild(col);
            return;
        }
        const today = localToday();
        const fragment = document.createDocumentFragment();

        data.cards.forEach(cardData => {
            const allBillings = getAllCardBillings(data, cardData.id);
            const currentPeriod = getBillingPeriod(today, cardData.closingDay || 1);
            const currentBilling = allBillings.find(b => b.period === currentPeriod) || { total: 0, isPaid: false };
            const currentInvoice = Number(currentBilling.total || 0);
            const outstanding = typeof getOutstandingCardBalance === 'function'
                ? Number(getOutstandingCardBalance(data, cardData.id) || 0)
                : currentInvoice;
            const available = Number(cardData.limit || 0) - outstanding;
            const pct = cardData.limit > 0 ? Math.min((outstanding / cardData.limit) * 100, 100) : 0;
            const barColor = pct >= 90 ? 'var(--color-expense)' : pct >= 70 ? '#f59e0b' : 'var(--color-primary)';

            const col = make('div', 'col-12 col-sm-6 col-lg-4');
            const card = make('div', 'card entity-card card-type h-100');
            const body = make('div', 'card-body');
            const header = make('div', 'd-flex justify-content-between align-items-start mb-3');
            const identity = make('div', 'd-flex align-items-center gap-2');
            const entityIcon = make('div', 'entity-icon card-type'); entityIcon.appendChild(icon('ph-credit-card'));
            const textWrap = make('div');
            textWrap.append(
                make('h6', 'mb-0 fw-bold', cardData.name),
                make('div', 'tiny text-muted', `Fecha dia ${cardData.closingDay || '—'} · Vence dia ${cardData.dueDay || '—'}`)
            );
            identity.append(entityIcon, textWrap);
            const actions = make('div', 'd-flex gap-1');
            actions.append(
                actionButton('ph-pencil-simple', 'Editar cartão', () => root.edCard?.(cardData.id)),
                actionButton('ph-trash', 'Excluir cartão', () => root.delCard?.(cardData.id), true)
            );
            header.append(identity, actions);

            const invoiceLine = make('div', 'd-flex justify-content-between mb-1');
            invoiceLine.append(
                make('span', 'small text-muted', `Fatura ${formatPeriod(currentPeriod)}`),
                make('span', 'small fw-bold', formatCurrency(currentInvoice))
            );
            invoiceLine.lastElementChild.style.color = 'var(--color-expense)';

            const progress = make('div', 'progress mb-1');
            progress.style.height = '5px'; progress.style.borderRadius = '3px'; progress.style.background = 'rgba(255,255,255,0.08)';
            const bar = make('div');
            bar.style.width = `${pct}%`; bar.style.background = barColor; bar.style.height = '100%'; bar.style.borderRadius = '3px'; bar.style.transition = 'width 0.4s';
            progress.appendChild(bar);

            const usageLine = make('div', 'd-flex justify-content-between mb-3');
            usageLine.append(
                make('span', 'tiny text-muted', `${Math.round(pct)}% do limite comprometido`),
                make('span', 'tiny text-muted', `Disp. ${formatCurrency(available)}`)
            );

            const history = make('div', 'billing-history mb-3');
            history.appendChild(make('div', 'tiny text-muted fw-semibold text-uppercase mb-1', 'Histórico de Faturas'));
            const recent = allBillings.slice(0, 3);
            if (!recent.length) history.appendChild(make('div', 'tiny text-muted', 'Sem histórico ainda.'));
            recent.forEach(billing => {
                const row = make('div', `billing-row${billing.period === currentPeriod ? ' current' : ''}`);
                const value = make('span', 'tiny fw-semibold', formatCurrency(Number(billing.total || 0)));
                value.style.color = billing.isPaid ? 'var(--color-primary)' : billing.total > 0 ? 'var(--color-expense)' : 'var(--color-muted)';
                const state = billing.isPaid ? icon('ph-check-circle') : billing.total > 0 ? icon('ph-clock') : icon('ph-minus');
                state.style.color = billing.isPaid ? 'var(--color-primary)' : billing.total > 0 ? '#f59e0b' : 'var(--color-muted)';
                row.append(make('span', 'tiny text-muted', formatPeriod(billing.period)), value, state);
                history.appendChild(row);
            });

            body.append(header, invoiceLine, progress, usageLine, history);

            if (!currentBilling.isPaid && currentInvoice > 0) {
                const pay = make('div', 'pay-fatura-section');
                pay.appendChild(make('div', 'tiny text-muted fw-semibold text-uppercase mb-1', 'Pagar Fatura'));
                const payRow = make('div', 'd-flex gap-2 align-items-center');
                const select = make('select', 'form-select form-select-sm pay-acc-select');
                select.id = `pay-acc-${cardData.id}`;
                select.appendChild(option('', 'Debitar de...'));
                data.accounts.filter(acc => acc.status !== 'archived').forEach(acc => select.appendChild(option(acc.id, `${acc.name} (${formatCurrency(Number(acc.balance || 0))})`)));
                const payButton = make('button', 'btn btn-sm btn-pay'); payButton.type = 'button';
                payButton.append(icon('ph-check'), document.createTextNode(' Pagar'));
                payButton.addEventListener('click', () => root.handlePayFatura?.(cardData.id, currentPeriod, currentInvoice));
                payRow.append(select, payButton); pay.appendChild(payRow); body.appendChild(pay);
            } else if (currentBilling.isPaid && currentInvoice > 0) {
                const paid = make('div', 'paid-badge');
                paid.append(icon('ph-check-circle'), document.createTextNode(` Fatura paga em ${formatDate(currentBilling.paidAt)}`));
                body.appendChild(paid);
            }

            const footer = make('div', 'd-flex justify-content-between align-items-center mt-3 pt-3 border-top');
            footer.appendChild(make('span', 'tiny text-muted fw-semibold text-uppercase', `Comprometido: ${formatCurrency(outstanding)}`));
            const detail = make('button', 'btn btn-sm btn-outline-primary rounded-pill px-3 py-1 fw-semibold', 'Ver Fatura Detalhada');
            detail.type = 'button'; detail.style.fontSize = '0.75rem';
            detail.addEventListener('click', () => root.viewCardInvoice?.(cardData.id));
            footer.appendChild(detail); body.appendChild(footer);

            card.appendChild(body); col.appendChild(card); fragment.appendChild(col);
        });
        grid.appendChild(fragment);
    }

    function safeRenderBudgets(data) {
        const list = document.getElementById('budget-list');
        if (!list) return;
        list.replaceChildren();
        const budgets = _loadBudgets();
        if (!Object.keys(budgets).length) {
            list.appendChild(make('p', 'text-muted small mb-0', 'Nenhum orçamento definido. Clique em Gerenciar para configurar.'));
            return;
        }
        const month = localToday().slice(0, 7);
        const spent = {};
        (data.transactions || []).filter(t => t.type === 'expense' && String(t.date || '').startsWith(month))
            .forEach(t => { spent[t.category] = (spent[t.category] || 0) + Number(t.amount || 0); });

        Object.entries(budgets).forEach(([category, limitRaw]) => {
            const limit = Number(limitRaw || 0);
            if (limit <= 0) return;
            const used = spent[category] || 0;
            const pct = Math.min((used / limit) * 100, 100);
            const over = used > limit;
            const warn = pct >= 80 && !over;
            const catColor = _getCatColor(category);
            const color = over ? 'var(--color-expense)' : warn ? '#f59e0b' : catColor;
            const item = make('div', 'budget-item');
            const header = make('div', 'budget-item-header');
            const left = make('div', 'd-flex align-items-center gap-2');
            const stateIcon = icon(over ? 'ph-warning-circle' : warn ? 'ph-warning' : 'ph-check-circle');
            stateIcon.style.color = color; stateIcon.style.fontSize = '1rem'; stateIcon.style.flexShrink = '0';
            left.append(stateIcon, make('span', 'small fw-semibold', category));
            if (over) left.appendChild(make('span', 'badge-budget-alert', 'Excedido'));
            else if (warn) left.appendChild(make('span', 'badge-budget-warn', 'Atenção'));
            const amount = make('span', 'small fw-bold');
            amount.style.color = color;
            amount.append(document.createTextNode(formatCurrency(used)), make('span', 'text-muted fw-normal', ` / ${formatCurrency(limit)}`));
            header.append(left, amount);
            const barBg = make('div', 'budget-bar-bg');
            const fill = make('div', 'budget-bar-fill');
            fill.style.width = `${pct}%`; fill.style.background = color;
            barBg.appendChild(fill);
            item.append(header, barBg); list.appendChild(item);
        });
    }

    function safeRenderBudgetManager() {
        const budgets = _loadBudgets();
        const categories = _getAllExpenseCats();
        const data = getData();
        data.transactions.filter(t => t.type === 'expense' && t.category).forEach(t => {
            if (!categories.includes(t.category)) categories.push(t.category);
        });
        const list = document.getElementById('budget-manager-list');
        if (!list) return;
        list.replaceChildren();
        if (!categories.length) {
            list.appendChild(make('p', 'text-muted small', 'Crie categorias de gasto primeiro.'));
            return;
        }
        categories.forEach(category => {
            const row = make('div', 'budget-manager-row');
            const name = make('span', 'budget-cat-name');
            const badge = categoryBadge(category); if (badge) name.appendChild(badge);
            const group = make('div', 'input-group input-group-sm budget-input-group');
            const prefix = make('span', 'input-group-text currency-prefix', 'R$'); prefix.style.fontSize = '0.75rem';
            const input = make('input', 'form-control budget-input');
            input.type = 'text'; input.inputMode = 'numeric'; input.placeholder = 'Sem limite'; input.dataset.cat = category;
            const value = Number(budgets[category] || 0);
            if (value > 0) {
                const reais = root.PlannkeMoney.centsToReais(value);
                input.value = reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                input.dataset.rawValue = String(reais);
            }
            input.addEventListener('input', () => handleBudgetInput(input));
            input.addEventListener('change', () => saveBudgetEntry(category, input.dataset.rawValue || input.value));
            group.append(prefix, input); row.append(name, group); list.appendChild(row);
        });
    }

    function quickAccountItem(name, value, isCard, subtitle) {
        const item = make('li', 'qa-item');
        const left = make('div', 'd-flex align-items-center gap-2');
        const qIcon = make('div', `qa-icon${isCard ? ' card-type' : ''}`); qIcon.appendChild(icon(isCard ? 'ph-credit-card' : 'ph-bank'));
        if (subtitle) {
            const label = make('div'); label.append(make('span', 'small fw-medium d-block', name), make('span', 'tiny text-muted', subtitle)); left.append(qIcon, label);
        } else left.append(qIcon, make('span', 'small fw-medium', name));
        item.append(left, value);
        return item;
    }

    function completedDashboardData(data) {
        const today = localToday();
        return {
            ...data,
            transactions: (data?.transactions || []).filter(tx => tx.status !== 'planned' && String(tx.date || '') <= today)
        };
    }

    function pulseMetric(label, value, detail, stateClass = '') {
        const metric = make('div', `product-metric${stateClass ? ` ${stateClass}` : ''}`);
        metric.append(
            make('span', '', label),
            make('strong', '', value),
            make('small', '', detail)
        );
        return metric;
    }

    function renderFinancialPulse(data) {
        const dashboard = document.getElementById('dashboard-view');
        const core = root.PlannkeCore;
        if (!dashboard || typeof core?.getFinancialPulse !== 'function') return;

        let section = document.getElementById('financial-pulse');
        if (!section) {
            section = make('section', 'product-pulse mb-3');
            section.id = 'financial-pulse';
            dashboard.prepend(section);
        }

        const pulse = core.getFinancialPulse(data, localToday());
        const horizon = formatDate(pulse.horizon);
        const freeClass = Number(pulse.free || 0) >= 0 ? 'good' : 'bad';
        const insightText = Number(pulse.free || 0) < 0
            ? `Se todos os compromissos forem mantidos, faltam ${formatCurrency(Math.abs(pulse.free))} até ${horizon}.`
            : pulse.nextIncome
                ? `Você tem cerca de ${formatCurrency(pulse.daily)} por dia livres até a próxima entrada em ${horizon}.`
                : `Sem próxima entrada cadastrada; o cálculo usa o fim do mês (${horizon}).`;

        const heading = make('div', 'product-section-heading');
        const title = make('div');
        title.append(make('span', 'product-eyebrow', 'Visão rápida'), make('h5', '', 'Seu dinheiro hoje'));
        const privacy = make('span', 'product-privacy');
        privacy.append(icon('ph-device-mobile'), document.createTextNode(' dados locais'));
        heading.append(title, privacy);

        const grid = make('div', 'product-pulse-grid');
        grid.append(
            pulseMetric('Saldo atual', formatCurrency(pulse.balance), 'nas contas bancárias'),
            pulseMetric('Comprometido', formatCurrency(pulse.committed), 'cartões, reservas e previstos'),
            pulseMetric('Dinheiro livre', formatCurrency(pulse.free), `até ${horizon}`, freeClass),
            pulseMetric('Livre por dia', formatCurrency(pulse.daily), `${pulse.days} dia${pulse.days === 1 ? '' : 's'} no horizonte`)
        );

        const insight = make('div', 'product-insight');
        insight.append(icon('ph-sparkle'), make('span', '', insightText));
        section.replaceChildren(heading, grid, insight);
    }

    function safeRenderDashboard(data) {
        const completedData = completedDashboardData(data);
        const month = localToday().slice(0, 7);
        const monthly = completedData.transactions.filter(tx => String(tx.date || '').startsWith(month));
        const income = monthly.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
        const expense = monthly.filter(tx => tx.type === 'expense').reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
        const balance = (data.accounts || []).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);
        const balanceCard = document.querySelector('.balance-card');
        const balanceEl = document.getElementById('total-balance');
        if (balanceEl) { balanceEl.textContent = formatCurrency(balance); balanceEl.style.color = balance < 0 ? '#ffffff' : ''; }
        balanceCard?.classList.toggle('negative-balance', balance < 0);
        const incomeEl = document.getElementById('total-income'); if (incomeEl) incomeEl.textContent = formatCurrency(income);
        const expenseEl = document.getElementById('total-expense'); if (expenseEl) expenseEl.textContent = formatCurrency(expense);

        const qa = document.getElementById('quick-accounts-list');
        if (qa) {
            qa.replaceChildren();
            data.accounts.forEach(acc => {
                const value = make('span', 'small fw-semibold', formatCurrency(Number(acc.balance || 0))); value.style.color = 'var(--color-primary)';
                qa.appendChild(quickAccountItem(acc.name, value, false));
            });
            data.cards.forEach(card => {
                const period = getBillingPeriod(localToday(), card.closingDay || 1);
                const billing = getCardBilling(data, card.id, period);
                const outstanding = typeof getOutstandingCardBalance === 'function' ? getOutstandingCardBalance(data, card.id) : Number(billing?.total || 0);
                const available = Number(card.limit || 0) - Number(outstanding || 0);
                const value = make('div', 'text-end');
                const invoice = make('div', 'small fw-semibold', formatCurrency(Number(billing?.total || 0))); invoice.style.color = 'var(--color-expense)';
                value.append(invoice, make('div', 'tiny text-muted', `Disp. ${formatCurrency(available)}`));
                qa.appendChild(quickAccountItem(card.name, value, true, `Fatura ${formatPeriod(period)}`));
            });
            if (!data.accounts.length && !data.cards.length) qa.appendChild(make('li', 'py-2 small text-muted', 'Nenhuma conta cadastrada.'));
        }

        renderChart(completedData);
        renderComparisonChart(data);
        renderBudgets(completedData);
        renderFinancialPulse(data);

        const today = localToday();
        const recentList = document.getElementById('recent-transactions');
        if (recentList) {
            recentList.replaceChildren();
            const past = [...(data.transactions || [])].filter(t => t.date <= today).sort((a, b) => String(b.date).localeCompare(String(a.date)));
            const seen = new Set(); const recent = [];
            for (const tx of past) {
                if (recent.length >= 5) break;
                if (tx.groupId && seen.has(tx.groupId)) continue;
                if (tx.groupId) seen.add(tx.groupId);
                recent.push(tx);
            }
            if (!recent.length) recentList.appendChild(make('li', 'tx-item', 'Nenhuma transação ainda.'));
            recent.forEach(tx => safeRenderTxItem(recentList, tx, data));
        }

        const upcomingList = document.getElementById('upcoming-expenses');
        if (upcomingList) {
            upcomingList.replaceChildren();
            const future = (data.transactions || []).filter(t => t.type === 'expense' && t.date > today).sort((a, b) => String(a.date).localeCompare(String(b.date)));
            const seen = new Set(); const upcoming = [];
            for (const tx of future) {
                if (upcoming.length >= 4) break;
                if (tx.groupId && seen.has(tx.groupId)) continue;
                if (tx.groupId) seen.add(tx.groupId);
                upcoming.push(tx);
            }
            if (!upcoming.length) upcomingList.appendChild(make('li', 'tx-item', 'Nenhuma conta futura.'));
            upcoming.forEach(tx => {
                const item = make('li', 'tx-item upcoming-item');
                const left = make('div'); left.appendChild(make('div', 'small fw-semibold', tx.description || 'Sem descrição'));
                const meta = make('div', 'mt-1'); const installment = installmentBadge(tx); if (installment) meta.appendChild(installment);
                meta.appendChild(make('span', 'text-muted tiny', `Vence: ${formatDate(tx.date)}`)); left.appendChild(meta);
                const amount = make('span', 'fw-bold small', formatCurrency(Number(tx.amount || 0))); amount.style.color = 'var(--color-expense)';
                item.append(left, amount); upcomingList.appendChild(item);
            });
        }
    }

    root._renderTxItem = safeRenderTxItem;
    root.renderTransactions = safeRenderTransactions;
    root.renderAccounts = safeRenderAccounts;
    root.renderCards = safeRenderCards;
    root.renderBudgets = safeRenderBudgets;
    root.renderBudgetManager = safeRenderBudgetManager;
    root.renderDashboard = safeRenderDashboard;
    root.PlannkeSafeRenderers = {
        renderTransactions: safeRenderTransactions,
        renderAccounts: safeRenderAccounts,
        renderCards: safeRenderCards,
        renderBudgets: safeRenderBudgets,
        renderDashboard: safeRenderDashboard,
        renderFinancialPulse
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);

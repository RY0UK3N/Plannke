/* Plannke canonical desktop presentation layer.
   Keeps finance/storage handlers intact while adapting the web preview to the desktop app direction. */
(function (root) {
    'use strict';

    let initialized = false;
    let backupObserver = null;
    let dashboardObserver = null;
    let entityObserver = null;
    let planningObserver = null;
    let planningRepairScheduled = false;
    let planningRepairEventPending = false;

    function make(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function icon(name) {
        return make('i', `ph ${name}`);
    }

    function money(value) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
    }

    function formatLocalDate(value) {
        if (typeof root.formatDate === 'function') return root.formatDate(value);
        const parts = String(value || '').split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(value || '—');
    }

    function getDataSafe() {
        try {
            return typeof root.getData === 'function' ? root.getData() : null;
        } catch (_) {
            return null;
        }
    }

    function hasExistingData() {
        const data = getDataSafe();
        return !!(data && ((data.accounts?.length || 0) + (data.cards?.length || 0) + (data.transactions?.length || 0) > 0));
    }

    function markAutosaveAsPrimary() {
        const status = document.querySelector('.presentation-local-status');
        if (status) {
            const label = status.querySelector('span');
            if (label && label.textContent !== 'Salvo automaticamente') label.textContent = 'Salvo automaticamente';
            status.title = 'As alterações são salvas localmente neste dispositivo.';
        }

        /* Temporary bridge until StorageAdapter/SQLite replaces legacy persistence. */
        try {
            if (typeof _backupDone !== 'undefined') _backupDone = true;
        } catch (_) {}

        const welcome = document.getElementById('welcomeModal');
        if (welcome && hasExistingData() && !welcome.dataset.desktopAutosaveGuard) {
            welcome.dataset.desktopAutosaveGuard = 'true';
            welcome.addEventListener('show.bs.modal', event => event.preventDefault());
        }
    }

    function modalHeading(modalId, subtitle) {
        const modal = document.getElementById(modalId);
        const header = modal?.querySelector('.modal-header');
        const title = header?.querySelector('.modal-title');
        if (!modal || !header || !title || header.querySelector('.presentation-modal-heading')) return;

        const heading = make('div', 'presentation-modal-heading');
        header.insertBefore(heading, title);
        heading.appendChild(title);
        heading.appendChild(make('p', 'presentation-modal-subtitle', subtitle));
    }

    function decorateForms() {
        modalHeading('transactionModal', 'Registre a movimentação sem sair do contexto atual.');
        modalHeading('accountModal', 'Identifique a conta e informe o saldo disponível de hoje.');
        modalHeading('cardModal', 'Configure o cartão para acompanhar limite, fechamento e vencimento.');

        document.getElementById('transactionForm')?.classList.add('presentation-desktop-form');
        document.getElementById('accountForm')?.classList.add('presentation-desktop-form');
        document.getElementById('cardForm')?.classList.add('presentation-desktop-form');
        document.getElementById('entityDetailModal')?.classList.add('presentation-detail-modal');
    }

    function decorateDetailWorkspace() {
        const modal = document.getElementById('entityDetailModal');
        if (!modal) return;
        modal.classList.add('presentation-detail-modal');
        const identity = modal.querySelector('.modal-header > .d-flex');
        if (identity && !identity.querySelector('.presentation-detail-kicker')) {
            const titleWrap = document.getElementById('detail-title')?.parentElement;
            if (titleWrap) titleWrap.insertBefore(make('span', 'presentation-detail-kicker', 'Área de revisão'), titleWrap.firstChild);
        }

        const type = root._detailContext?.type === 'card' ? 'card' : 'account';
        modal.dataset.detailType = type;
        const kicker = modal.querySelector('.presentation-detail-kicker');
        const historyTitle = modal.querySelector('.modal-body .px-4.pb-4 h6');
        if (kicker) kicker.textContent = type === 'card' ? 'Fatura do cartão' : 'Extrato da conta';
        if (historyTitle) historyTitle.textContent = type === 'card' ? 'Compras e lançamentos da fatura' : 'Movimentações do período';
        const periodLabel = modal.querySelector('#card-period-wrapper label');
        if (periodLabel) periodLabel.textContent = type === 'card' ? 'Período da fatura' : 'Período do extrato';
    }

    function emptyDashboardState(listId, iconName, title, subtitle) {
        const list = document.getElementById(listId);
        if (!list || list.children.length !== 1) return;
        const only = list.firstElementChild;
        const realTransaction = only.querySelector?.('.tx-item-body') || only.classList.contains('upcoming-item');
        if (realTransaction || !/Nenhum|Nenhuma/i.test(only.textContent || '')) return;
        if (only.classList.contains('presentation-dashboard-empty')) return;

        only.className = 'presentation-dashboard-empty';
        const badge = make('span', 'presentation-dashboard-empty-icon');
        badge.appendChild(icon(iconName));
        const copy = make('div', 'presentation-dashboard-empty-copy');
        copy.append(make('strong', '', title), make('span', '', subtitle));
        only.replaceChildren(badge, copy);
    }

    function decorateDashboardEmptyStates() {
        emptyDashboardState('recent-transactions', 'ph-clock-counter-clockwise', 'Nenhuma transação registrada', 'Suas movimentações mais recentes aparecerão aqui.');
        emptyDashboardState('upcoming-expenses', 'ph-calendar-check', 'Nenhuma conta futura', 'Os próximos compromissos cadastrados aparecerão aqui.');
    }

    function accountActivity(data, accountId) {
        const items = (data.transactions || []).filter(tx => tx.accountId === accountId || tx.destinationId === accountId);
        items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        return { count: items.length, lastDate: items[0]?.date || '' };
    }

    function decorateEntityCards() {
        const data = getDataSafe();
        if (!data) return;
        const accountsGrid = document.getElementById('accounts-grid');
        const cardsGrid = document.getElementById('cards-grid');

        [...(accountsGrid?.children || [])].forEach((column, index) => {
            const card = column.querySelector('.entity-card');
            const body = card?.querySelector('.card-body');
            const account = data.accounts?.[index];
            if (!card || !body || !account) return;
            card.classList.add('presentation-entity-unified', 'presentation-account-card');

            const actions = body.querySelector(':scope > .d-flex.justify-content-end');
            actions?.classList.add('presentation-entity-actions');
            const header = body.querySelector(':scope > .d-flex.align-items-center.gap-3');
            header?.classList.add('presentation-entity-header');
            const footer = body.querySelector(':scope > .d-flex.justify-content-between.align-items-end');
            footer?.classList.add('presentation-entity-footer');

            let meta = body.querySelector('.presentation-account-meta');
            if (!meta) {
                meta = make('div', 'presentation-account-meta');
                const activity = accountActivity(data, account.id);
                const count = make('div', 'presentation-account-meta-item');
                count.append(make('span', '', 'Movimentações'), make('strong', '', activity.count));
                const last = make('div', 'presentation-account-meta-item');
                last.append(make('span', '', 'Última atividade'), make('strong', '', activity.lastDate ? formatLocalDate(activity.lastDate) : 'Sem lançamentos'));
                meta.append(count, last);
                if (footer) body.insertBefore(meta, footer);
                else body.appendChild(meta);
            } else {
                const activity = accountActivity(data, account.id);
                const values = meta.querySelectorAll('strong');
                if (values[0]) values[0].textContent = String(activity.count);
                if (values[1]) values[1].textContent = activity.lastDate ? formatLocalDate(activity.lastDate) : 'Sem lançamentos';
            }
        });

        [...(cardsGrid?.children || [])].forEach(column => {
            const card = column.querySelector('.entity-card.card-type');
            if (!card) return;
            card.classList.add('presentation-entity-unified', 'presentation-credit-card');
            card.querySelector('.card-body > .d-flex.justify-content-between.align-items-start')?.classList.add('presentation-entity-header');
            card.querySelector('.billing-history')?.classList.add('presentation-card-history');
            card.querySelector('.pay-fatura-section')?.classList.add('presentation-card-payment');
            card.querySelector('.card-body > .border-top')?.classList.add('presentation-entity-footer');
        });
    }

    function replaceActionContent(element, iconName, label) {
        if (!element || element.dataset.revampDesktopLabel === label) return;
        const fileInput = element.querySelector('input[type="file"]');
        element.replaceChildren(icon(iconName), document.createTextNode(` ${label}`));
        if (fileInput) element.appendChild(fileInput);
        element.dataset.revampDesktopLabel = label;
    }

    function dataSummaryNode() {
        const data = getDataSafe() || { accounts: [], cards: [], transactions: [] };
        const wrap = make('div', 'presentation-data-summary');
        [
            ['Contas', data.accounts?.length || 0],
            ['Cartões', data.cards?.length || 0],
            ['Movimentações', data.transactions?.length || 0]
        ].forEach(([label, value]) => {
            const item = make('div', 'presentation-data-summary-item');
            item.append(make('span', '', label), make('strong', '', value));
            wrap.appendChild(item);
        });
        return wrap;
    }

    function decorateBackup() {
        const view = document.getElementById('backup-view');
        const row = view?.querySelector(':scope > .row');
        if (!view || !row) return;

        view.classList.add('presentation-backup-desktop');
        row.classList.add('presentation-backup-grid');

        let status = document.getElementById('presentation-backup-status');
        if (!status) {
            status = make('section', 'presentation-backup-status');
            status.id = 'presentation-backup-status';
            const badgeIcon = make('div', 'presentation-backup-status-icon');
            badgeIcon.appendChild(icon('ph-check-circle'));
            const copy = make('div');
            copy.append(
                make('strong', '', 'Salvamento automático ativo'),
                make('small', '', 'As alterações são gravadas localmente. O próximo ciclo substituirá esta persistência temporária por SQLite no aplicativo desktop.')
            );
            status.append(badgeIcon, copy, make('span', 'presentation-backup-status-badge', 'Dados locais'));
            view.insertBefore(status, row);
        }

        const primaryColumn = [...row.children].find(node => node.id !== 'product-bank-import');
        const primary = primaryColumn?.querySelector('.card.text-center, .card');
        if (primary) {
            primary.classList.add('presentation-backup-primary');
            const iconWrap = primary.querySelector('.backup-icon-wrap');
            if (iconWrap && !iconWrap.dataset.revampDesktopIcon) {
                iconWrap.replaceChildren(icon('ph-database'));
                iconWrap.dataset.revampDesktopIcon = 'database';
            }
            const title = primary.querySelector('h4');
            if (title) title.textContent = 'Dados e relatórios';
            const description = primary.querySelector('.card-body > p.text-muted');
            if (description) description.textContent = 'Consulte o volume de dados registrado no Plannke e gere uma planilha apenas quando quiser auditar ou analisar as informações fora do aplicativo.';

            let summary = primary.querySelector('.presentation-data-summary');
            const nextSummary = dataSummaryNode();
            if (summary) summary.replaceWith(nextSummary);
            else description?.after(nextSummary);

            const exportButton = primary.querySelector('button[data-plannke-onclick*="exportToExcel"], button[onclick*="exportToExcel"]');
            replaceActionContent(exportButton, 'ph-file-xls', 'Exportar relatório Excel');
            exportButton?.classList.add('presentation-report-export');

            const importLabel = primary.querySelector('label:has(#excelUpload)');
            if (importLabel) {
                importLabel.hidden = true;
                importLabel.setAttribute('aria-hidden', 'true');
            }
            const info = primary.querySelector('.tiny.text-muted');
            if (info) {
                info.replaceChildren(icon('ph-info'), document.createTextNode(' A planilha é somente um relatório externo; não é o banco nem o mecanismo de backup do Plannke.'));
            }
        }

        const bank = document.getElementById('product-bank-import');
        if (bank) {
            bank.classList.add('presentation-bank-import-panel');
            const copy = bank.querySelector('.small.text-muted');
            if (copy) copy.textContent = 'Selecione a conta e um OFX/CSV. Nada entra no histórico antes da revisão: duplicatas são removidas e categorias podem ser corrigidas ou memorizadas.';
            const label = bank.querySelector('label:has(#product-bank-file)');
            replaceActionContent(label, 'ph-file-arrow-up', 'Selecionar extrato para revisar');
        }

        renderBankImportReview();
    }

    function categoryOptions(data, type, selected) {
        const defaults = type === 'income'
            ? ['Salário', 'Freelance', 'Rendimentos', 'Reembolso', 'Outros']
            : ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Lazer', 'Compras', 'Assinaturas', 'Educação', 'Outros'];
        const fromApp = type === 'income' && typeof root._getAllIncomeCats === 'function'
            ? root._getAllIncomeCats()
            : type !== 'income' && typeof root._getAllExpenseCats === 'function'
                ? root._getAllExpenseCats()
                : [];
        const used = (data.transactions || []).filter(tx => tx.type === type).map(tx => tx.category).filter(Boolean);
        return [...new Set([...fromApp, ...used, selected, ...defaults].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }

    function renderBankImportReview(options = {}) {
        const bankImport = root.PlannkeDataActions;
        const pendingBankImport = bankImport?.getPendingBankImport?.();
        const existing = document.getElementById('presentation-import-review');
        if (!pendingBankImport) {
            existing?.remove();
            return;
        }
        const view = document.getElementById('backup-view');
        if (!view) return;
        const data = getDataSafe() || { transactions: [] };
        const review = existing || make('section', 'presentation-import-review');
        review.id = 'presentation-import-review';
        review.replaceChildren();

        const header = make('div', 'presentation-import-review-header');
        const copy = make('div');
        copy.append(
            make('span', 'presentation-import-eyebrow', 'Pré-importação'),
            make('h3', '', 'Revisar movimentações'),
            make('p', '', `${pendingBankImport.items.length} lançamento${pendingBankImport.items.length === 1 ? '' : 's'} novo${pendingBankImport.items.length === 1 ? '' : 's'} encontrado${pendingBankImport.items.length === 1 ? '' : 's'} em ${pendingBankImport.fileName}. Ajuste as categorias antes de confirmar.`)
        );
        header.append(copy, make('span', 'presentation-import-count', `${pendingBankImport.items.length} novas`));

        const tableWrap = make('div', 'presentation-import-table-wrap');
        const table = make('div', 'presentation-import-table');
        const tableHead = make('div', 'presentation-import-row presentation-import-row-head');
        ['Importar', 'Data', 'Descrição', 'Valor', 'Categoria', 'Regra'].forEach(label => tableHead.appendChild(make('span', '', label)));
        table.appendChild(tableHead);

        pendingBankImport.items.forEach((item, index) => {
            const row = make('div', 'presentation-import-row');
            const includeCell = make('label', 'presentation-import-check');
            const include = make('input');
            include.type = 'checkbox';
            include.checked = item.include;
            include.addEventListener('change', () => { bankImport?.updateBankImportItem?.(index, { include: include.checked }); row.classList.toggle('excluded', !include.checked); });
            includeCell.append(include, make('span', '', '')); 

            const date = make('span', 'presentation-import-date', formatLocalDate(item.transaction.date));
            const description = make('div', 'presentation-import-description');
            description.append(make('strong', '', item.transaction.description || 'Sem descrição'));
            const suggestion = item.suggested ? 'Categoria sugerida por regra existente' : 'Categoria precisa de revisão';
            description.append(make('small', '', suggestion));

            const value = make('span', `presentation-import-value ${item.transaction.type || 'expense'}`, money(item.transaction.amount));
            const category = make('select', 'form-select form-select-sm presentation-import-category');
            categoryOptions(data, item.transaction.type, item.category).forEach(name => {
                const option = make('option', '', name);
                option.value = name;
                option.selected = name === item.category;
                category.appendChild(option);
            });
            category.addEventListener('change', () => {
                bankImport?.updateBankImportItem?.(index, { category: category.value });
                remember.disabled = !bankImport?.merchantRuleKey?.(item.transaction.description);
            });

            const rememberCell = make('label', 'presentation-import-remember');
            const remember = make('input');
            remember.type = 'checkbox';
            remember.checked = item.remember;
            remember.disabled = !bankImport?.merchantRuleKey?.(item.transaction.description);
            remember.addEventListener('change', () => { bankImport?.updateBankImportItem?.(index, { remember: remember.checked }); });
            rememberCell.append(remember, make('span', '', 'Lembrar'));

            row.append(includeCell, date, description, value, category, rememberCell);
            row.dataset.importIndex = String(index);
            table.appendChild(row);
        });
        tableWrap.appendChild(table);

        const footer = make('div', 'presentation-import-review-footer');
        const hint = make('div', 'presentation-import-review-hint');
        hint.append(icon('ph-magic-wand'), make('span', '', 'Marque “Lembrar” para criar uma regra local baseada no estabelecimento e reutilizar a categoria em próximos extratos.'));
        const actions = make('div', 'presentation-import-actions');
        const cancel = make('button', 'btn btn-outline-secondary', 'Cancelar');
        cancel.type = 'button';
        cancel.addEventListener('click', () => bankImport?.cancelBankImport?.());
        const confirm = make('button', 'btn btn-primary');
        confirm.type = 'button';
        confirm.append(icon('ph-check-circle'), document.createTextNode(' Confirmar selecionadas'));
        confirm.addEventListener('click', () => bankImport?.confirmBankImport?.());
        actions.append(cancel, confirm);
        footer.append(hint, actions);
        review.append(header, tableWrap, footer);
        if (!existing) view.appendChild(review);
        if (options.focus) review.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function updateDesktopCopy() {
        document.body.dataset.plannkeTarget = 'desktop';
        const brandSub = document.querySelector('.presentation-brand-copy span');
        if (brandSub) brandSub.textContent = 'Central financeira';

        const pages = root.PlannkePresentation?.pages;
        if (pages?.backup) {
            pages.backup.label = 'Dados';
            pages.backup.eyebrow = 'Dados locais';
            pages.backup.title = 'Dados e importação';
            pages.backup.subtitle = 'Salvamento local, relatórios e importação assistida de extratos.';
        }
        const backupNav = document.querySelector('.presentation-nav-item[data-target="backup"] .presentation-nav-label');
        if (backupNav) backupNav.textContent = 'Dados';
        root.PlannkePresentation?.syncPage?.();
    }

    function ensurePlanningNavigation() {
        const nav = document.querySelector('.presentation-nav');
        if (!nav) return;
        let button = nav.querySelector('.presentation-nav-item[data-target="projecao"]');
        if (button) {
            button.hidden = false;
            return;
        }
        button = make('button', 'presentation-nav-item');
        button.type = 'button';
        button.dataset.target = 'projecao';
        button.setAttribute('aria-label', 'Planejamento');
        button.append(icon('ph-target'), make('span', 'presentation-nav-label', 'Planejamento'));
        button.addEventListener('click', () => root.PlannkePresentation?.navigate?.('projecao') || root._navigateTo?.('projecao'));
        const accounts = nav.querySelector('[data-target="accounts"]');
        nav.insertBefore(button, accounts || null);
    }

    function repairPlanningWorkspace() {
        planningRepairScheduled = false;
        ensurePlanningNavigation();
        const view = document.getElementById('projecao-view');
        if (!view || view.classList.contains('hidden')) return;

        if (!document.getElementById('product-planning-hub')) {
            try { root.renderProjection?.(getDataSafe()); } catch (error) { console.warn('Planejamento ainda não disponível:', error); }
        }

        window.setTimeout(() => {
            const hub = document.getElementById('product-planning-hub');
            const controls = document.getElementById('presentation-planning-overview');
            if (hub && !controls && !planningRepairEventPending) {
                planningRepairEventPending = true;
                root.dispatchEvent?.(new CustomEvent('plannke:data-changed', { detail: { source: 'desktop-planning-repair' } }));
                window.setTimeout(() => {
                    planningRepairEventPending = false;
                    const current = document.getElementById('projecao-view');
                    if (current && !current.classList.contains('hidden')) {
                        root.PlannkePresentation?.applyPlanningTab?.(current, current.dataset.planningTab || 'overview');
                    }
                }, 40);
                return;
            }
            if (controls) controls.hidden = false;
            root.PlannkePresentation?.applyPlanningTab?.(view, view.dataset.planningTab || 'overview');
        }, 0);
    }

    function schedulePlanningRepair() {
        if (planningRepairScheduled) return;
        planningRepairScheduled = true;
        window.setTimeout(repairPlanningWorkspace, 0);
    }

    function observeDynamicAreas() {
        const backupRow = document.querySelector('#backup-view > .row');
        if (backupRow && !backupObserver) {
            backupObserver = new MutationObserver(() => window.setTimeout(decorateBackup, 0));
            backupObserver.observe(backupRow, { childList: true });
        }

        const recent = document.getElementById('recent-transactions');
        const upcoming = document.getElementById('upcoming-expenses');
        if ((recent || upcoming) && !dashboardObserver) {
            dashboardObserver = new MutationObserver(() => window.setTimeout(decorateDashboardEmptyStates, 0));
            if (recent) dashboardObserver.observe(recent, { childList: true });
            if (upcoming) dashboardObserver.observe(upcoming, { childList: true });
        }

        const accounts = document.getElementById('accounts-grid');
        const cards = document.getElementById('cards-grid');
        if ((accounts || cards) && !entityObserver) {
            entityObserver = new MutationObserver(() => window.setTimeout(decorateEntityCards, 0));
            if (accounts) entityObserver.observe(accounts, { childList: true });
            if (cards) entityObserver.observe(cards, { childList: true });
        }

        const planning = document.getElementById('projecao-view');
        if (planning && !planningObserver) {
            planningObserver = new MutationObserver(schedulePlanningRepair);
            planningObserver.observe(planning, { attributes: true, attributeFilter: ['class'], childList: true });
        }
    }

    function init() {
        if (initialized || typeof document === 'undefined') return;
        initialized = true;
        document.getElementById('entityDetailModal')?.addEventListener('show.bs.modal', () => window.setTimeout(decorateDetailWorkspace, 0));

        markAutosaveAsPrimary();
        decorateForms();
        decorateDetailWorkspace();
        decorateDashboardEmptyStates();
        decorateEntityCards();
        decorateBackup();
        updateDesktopCopy();
        ensurePlanningNavigation();
        observeDynamicAreas();
        schedulePlanningRepair();

        root.addEventListener?.('plannke:data-changed', event => {
            if (event?.detail?.source !== 'desktop-planning-repair') schedulePlanningRepair();
            window.setTimeout(() => {
                markAutosaveAsPrimary();
                decorateDashboardEmptyStates();
                decorateEntityCards();
                decorateBackup();
                observeDynamicAreas();
            }, 0);
        });
    }

    root.PlannkePresentationDesktop = {
        init,
        decorateBackup,
        decorateForms,
        decorateEntityCards,
        decorateDashboardEmptyStates,
        repairPlanningWorkspace,
        renderBankImportReview
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})(typeof globalThis !== 'undefined' ? globalThis : window);

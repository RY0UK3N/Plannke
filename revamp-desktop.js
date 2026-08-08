/* Final desktop-only product polish.
   Keeps existing finance/storage handlers intact and only adjusts composition/copy. */
(function (root) {
    'use strict';

    let initialized = false;
    let backupObserver = null;

    function make(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function icon(name) {
        return make('i', `ph ${name}`);
    }

    function hasExistingData() {
        try {
            const data = typeof root.getData === 'function' ? root.getData() : null;
            return !!(data && ((data.accounts?.length || 0) + (data.cards?.length || 0) + (data.transactions?.length || 0) > 0));
        } catch (_) {
            return false;
        }
    }

    function markAutosaveAsPrimary() {
        const status = document.querySelector('.revamp-local-status');
        if (status) {
            const label = status.querySelector('span');
            if (label && label.textContent !== 'Salvo automaticamente') label.textContent = 'Salvo automaticamente';
            status.title = 'As alterações são salvas localmente neste dispositivo.';
        }

        /* Temporary bridge until StorageAdapter/SQLite replaces the legacy persistence layer.
           Current app already mirrors saveData into localStorage, so an Excel backup is no longer
           required to close the app safely. */
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
        if (!modal || !header || !title || header.querySelector('.revamp-modal-heading')) return;

        const heading = make('div', 'revamp-modal-heading');
        header.insertBefore(heading, title);
        heading.appendChild(title);
        heading.appendChild(make('p', 'revamp-modal-subtitle', subtitle));
    }

    function decorateForms() {
        modalHeading('transactionModal', 'Registre uma entrada, gasto ou transferência com todos os detalhes em uma única tela.');
        modalHeading('accountModal', 'Cadastre a conta e informe o saldo disponível no momento.');
        modalHeading('cardModal', 'Configure limite, fechamento e vencimento para acompanhar as faturas corretamente.');

        document.getElementById('transactionForm')?.classList.add('revamp-desktop-form');
        document.getElementById('accountForm')?.classList.add('revamp-desktop-form');
        document.getElementById('cardForm')?.classList.add('revamp-desktop-form');
        document.getElementById('entityDetailModal')?.classList.add('revamp-detail-modal');
    }

    function replaceActionContent(element, iconName, label) {
        if (!element || element.dataset.revampDesktopLabel === label) return;
        const fileInput = element.querySelector('input[type="file"]');
        element.replaceChildren(icon(iconName), document.createTextNode(` ${label}`));
        if (fileInput) element.appendChild(fileInput);
        element.dataset.revampDesktopLabel = label;
    }

    function decorateBackup() {
        const view = document.getElementById('backup-view');
        const row = view?.querySelector(':scope > .row');
        if (!view || !row) return;

        view.classList.add('revamp-backup-desktop');
        row.classList.add('revamp-backup-grid');

        let status = document.getElementById('revamp-backup-status');
        if (!status) {
            status = make('section', 'revamp-backup-status');
            status.id = 'revamp-backup-status';
            const badgeIcon = make('div', 'revamp-backup-status-icon');
            badgeIcon.appendChild(icon('ph-check-circle'));
            const copy = make('div');
            copy.append(
                make('strong', '', 'Salvamento automático ativo'),
                make('small', '', 'As alterações são gravadas localmente neste dispositivo. Use os arquivos abaixo para portabilidade e cópias externas.')
            );
            status.append(badgeIcon, copy, make('span', 'revamp-backup-status-badge', 'Dados locais'));
            view.insertBefore(status, row);
        }

        const primaryColumn = [...row.children].find(node => node.id !== 'product-bank-import');
        const primary = primaryColumn?.querySelector('.card.text-center, .card');
        if (primary) {
            primary.classList.add('revamp-backup-primary');
            const iconWrap = primary.querySelector('.backup-icon-wrap');
            if (iconWrap && !iconWrap.dataset.revampDesktopIcon) {
                iconWrap.replaceChildren(icon('ph-archive'));
                iconWrap.dataset.revampDesktopIcon = 'archive';
            }
            const title = primary.querySelector('h4');
            if (title && title.textContent !== 'Backup e portabilidade') title.textContent = 'Backup e portabilidade';
            const description = primary.querySelector('.card-body > p.text-muted');
            const descriptionText = 'O Plannke já salva automaticamente neste dispositivo. O Excel funciona como uma cópia externa e portátil para abrir, guardar ou levar seus dados.';
            if (description && description.textContent.trim() !== descriptionText) {
                description.replaceChildren(
                    document.createTextNode('O Plannke já salva automaticamente neste dispositivo. O Excel funciona como uma '),
                    make('strong', '', 'cópia externa e portátil'),
                    document.createTextNode(' para abrir, guardar ou levar seus dados.')
                );
            }
            const exportButton = primary.querySelector('button[data-plannke-onclick*="exportToExcel"], button[onclick*="exportToExcel"]');
            const importLabel = primary.querySelector('label:has(#excelUpload)');
            replaceActionContent(exportButton, 'ph-file-xls', 'Exportar Excel');
            replaceActionContent(importLabel, 'ph-upload-simple', 'Importar Excel');
            const info = primary.querySelector('.tiny.text-muted');
            const infoText = 'Excel não é mais o armazenamento principal; ele é uma cópia de segurança e interoperabilidade.';
            if (info && info.textContent.trim() !== infoText) {
                info.replaceChildren(icon('ph-info'), document.createTextNode(` ${infoText}`));
            }
        }

        const bank = document.getElementById('product-bank-import');
        if (bank) {
            bank.classList.add('revamp-bank-import-panel');
            const copy = bank.querySelector('.small.text-muted');
            const bankText = 'Importe movimentações de OFX ou CSV para a conta selecionada. O arquivo é processado localmente e duplicatas são ignoradas.';
            if (copy && copy.textContent.trim() !== bankText) copy.textContent = bankText;
        }
    }

    function updateDesktopCopy() {
        document.body.dataset.plannkeTarget = 'desktop';
        const brandSub = document.querySelector('.revamp-brand-copy span');
        if (brandSub) brandSub.textContent = 'Central financeira';

        const pages = root.PlannkeRevamp?.pages;
        if (pages?.backup) {
            pages.backup.eyebrow = 'Segurança';
            pages.backup.title = 'Backup e importação';
            pages.backup.subtitle = 'Auto-save local, cópias externas e importação de extratos em um só lugar.';
        }
        root.PlannkeRevamp?.syncPage?.();
    }

    function observeBackup() {
        const row = document.querySelector('#backup-view > .row');
        if (!row || backupObserver) return;
        backupObserver = new MutationObserver(() => window.setTimeout(decorateBackup, 0));
        backupObserver.observe(row, { childList: true });
    }

    function init() {
        if (initialized || typeof document === 'undefined') return;
        initialized = true;
        markAutosaveAsPrimary();
        decorateForms();
        decorateBackup();
        updateDesktopCopy();
        observeBackup();

        root.addEventListener?.('plannke:data-changed', () => window.setTimeout(() => {
            markAutosaveAsPrimary();
            decorateBackup();
        }, 0));
    }

    root.PlannkeDesktop = { init, decorateBackup, decorateForms };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})(typeof globalThis !== 'undefined' ? globalThis : window);

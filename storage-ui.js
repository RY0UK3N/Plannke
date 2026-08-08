(function (root) {
    'use strict';

    const REASON_LABELS = {
        manual: 'Criado manualmente',
        daily: 'Ponto diário',
        'before-destructive-change': 'Antes de uma exclusão',
        'before-bulk-change': 'Antes de alteração em lote',
        'before-bank-import': 'Antes de importar extrato',
        'before-restore': 'Antes de uma restauração'
    };

    function make(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function icon(name) {
        return make('i', `ph ${name}`);
    }

    function formatDateTime(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Data indisponível';
        return new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }

    function setTextOnce(node, text) {
        if (node && node.textContent !== text) node.textContent = text;
    }

    function setClassOnce(node, className) {
        if (node && node.className !== className) node.className = className;
    }

    function setAttributeOnce(node, name, value) {
        if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
    }

    function updateStatus(detail) {
        const status = document.querySelector('.revamp-local-status');
        if (!status) return;
        const label = status.querySelector('span');
        const statusIcon = status.querySelector('i');
        const state = detail?.state || (root.PlannkeStorage?.getStatus?.().error ? 'error' : 'saved');
        const labelText = state === 'saving'
            ? 'Salvando…'
            : state === 'error'
                ? 'Erro ao salvar'
                : 'Salvo localmente';
        const iconClass = state === 'saving'
            ? 'ph ph-circle-notch'
            : state === 'error'
                ? 'ph ph-warning-circle'
                : 'ph ph-shield-check';
        const titleText = state === 'error'
            ? (detail?.error || 'Não foi possível persistir os dados neste dispositivo.')
            : 'As alterações são persistidas automaticamente neste dispositivo.';

        if (status.dataset.storageState !== state) status.dataset.storageState = state;
        setTextOnce(label, labelText);
        setClassOnce(statusIcon, iconClass);
        setAttributeOnce(status, 'title', titleText);
    }

    function snapshotReason(reason) {
        return REASON_LABELS[reason] || 'Ponto de recuperação';
    }

    function renderSnapshotList(panel) {
        const list = panel.querySelector('.plannke-recovery-list');
        const storage = root.PlannkeStorage;
        if (!list || !storage) return;
        list.replaceChildren();

        const snapshots = storage.listSnapshots();
        if (!snapshots.length) {
            const empty = make('div', 'plannke-recovery-empty');
            empty.append(icon('ph-clock-counter-clockwise'), make('span', '', 'Nenhum ponto de recuperação criado ainda.'));
            list.appendChild(empty);
            return;
        }

        snapshots.forEach(snapshot => {
            const row = make('div', 'plannke-recovery-item');
            const copy = make('div', 'plannke-recovery-item-copy');
            copy.append(
                make('strong', '', snapshotReason(snapshot.reason)),
                make('span', '', formatDateTime(snapshot.createdAt))
            );

            const restore = make('button', 'btn btn-sm btn-outline-secondary plannke-recovery-restore', 'Restaurar');
            restore.type = 'button';
            restore.addEventListener('click', () => {
                const ok = root.confirm?.('Restaurar este ponto de recuperação? O estado atual será preservado em um novo ponto antes da restauração.');
                if (ok === false) return;
                try {
                    storage.restoreSnapshot(snapshot.id);
                    root.renderAll?.();
                    root.showToast?.('Ponto de recuperação restaurado.', 'success');
                    renderSnapshotList(panel);
                } catch (error) {
                    root.showToast?.('Não foi possível restaurar este ponto.', 'error');
                    console.error('Falha ao restaurar ponto de recuperação:', error);
                }
            });

            row.append(copy, restore);
            list.appendChild(row);
        });
    }

    function mountRecoveryPanel() {
        const view = document.getElementById('backup-view');
        if (!view || document.getElementById('plannke-recovery-panel')) return;

        const panel = make('section', 'plannke-recovery-panel');
        panel.id = 'plannke-recovery-panel';

        const heading = make('div', 'plannke-recovery-heading');
        const headingCopy = make('div');
        headingCopy.append(
            make('span', 'plannke-recovery-eyebrow', 'Segurança local'),
            make('h3', '', 'Recuperação local'),
            make('p', '', 'O Plannke mantém até 5 pontos locais para ajudar a desfazer exclusões, importações em lote ou alterações acidentais.')
        );
        const create = make('button', 'btn btn-sm btn-outline-primary', 'Criar ponto agora');
        create.type = 'button';
        create.prepend(icon('ph-plus-circle'));
        create.addEventListener('click', () => {
            try {
                const created = root.PlannkeStorage?.createSnapshot('manual');
                if (!created) {
                    root.showToast?.('Adicione algum dado antes de criar um ponto de recuperação.', 'info');
                    return;
                }
                root.showToast?.('Ponto de recuperação criado.', 'success');
                renderSnapshotList(panel);
            } catch (error) {
                root.showToast?.('Não foi possível criar o ponto de recuperação.', 'error');
                console.error('Falha ao criar ponto de recuperação:', error);
            }
        });
        heading.append(headingCopy, create);

        const list = make('div', 'plannke-recovery-list');
        panel.append(heading, list);

        const bankImport = document.getElementById('product-bank-import');
        const row = view.querySelector(':scope > .row');
        if (bankImport?.parentElement === row) row.after(panel);
        else view.appendChild(panel);
        renderSnapshotList(panel);
    }

    function retireLegacyMemoryCardPrompt() {
        const welcome = document.getElementById('welcomeModal');
        if (!welcome || welcome.dataset.storageAdapterGuard) return;
        welcome.dataset.storageAdapterGuard = 'true';
        welcome.addEventListener('show.bs.modal', event => event.preventDefault());
    }

    function protectSmallBankImport(event) {
        const button = event.target?.closest?.('#revamp-import-review .revamp-import-actions .btn-primary');
        if (!button || !/Confirmar selecionadas/i.test(button.textContent || '')) return;
        const rows = [...document.querySelectorAll('#revamp-import-review .revamp-import-row[data-import-index]')];
        const selectedCount = rows.filter(row => row.querySelector('.revamp-import-check input[type="checkbox"]')?.checked).length;
        if (selectedCount <= 0 || selectedCount >= 5) return;
        try {
            root.PlannkeStorage?.createSnapshot('before-bank-import');
        } catch (error) {
            console.warn('Ponto de recuperação da importação indisponível:', error);
        }
    }

    function refresh() {
        updateStatus();
        retireLegacyMemoryCardPrompt();
        mountRecoveryPanel();
        const panel = document.getElementById('plannke-recovery-panel');
        if (panel) renderSnapshotList(panel);
    }

    let observerRefreshScheduled = false;
    function scheduleObserverRefresh() {
        if (observerRefreshScheduled) return;
        observerRefreshScheduled = true;
        queueMicrotask(() => {
            observerRefreshScheduled = false;
            updateStatus();
            retireLegacyMemoryCardPrompt();
            mountRecoveryPanel();
        });
    }

    function init() {
        if (!root.PlannkeStorage || typeof document === 'undefined') return;
        root.addEventListener?.('plannke:storage-status', event => updateStatus(event.detail));
        root.addEventListener?.('plannke:data-changed', () => {
            const panel = document.getElementById('plannke-recovery-panel');
            if (panel) renderSnapshotList(panel);
        });
        document.addEventListener('click', protectSmallBankImport, true);

        const observer = new MutationObserver(scheduleObserverRefresh);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        refresh();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})(globalThis);

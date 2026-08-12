/* Plannke canonical data actions: local reset and report-only Excel export. */
(function (root) {
    'use strict';

    let controlsBound = false;
    let pendingBankImport = null;

    function localDateString(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function currency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(root.PlannkeMoney.centsToReais(Number(value) || 0));
    }

    function dateLabel(value) {
        const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '');
    }

    function transactionType(type) {
        if (type === 'income') return 'Entrada';
        if (type === 'transfer') return 'Transferência';
        return 'Gasto';
    }

    function entityName(data, id) {
        return data.accounts?.find(item => item.id === id)?.name
            || data.cards?.find(item => item.id === id)?.name
            || '';
    }

    function showToast(message, type = 'success') {
        if (typeof root.showToast === 'function') root.showToast(message, type);
    }

    function emptyDataset(theme) {
        const raw = {
            schemaVersion: 3,
            accounts: [],
            cards: [],
            transactions: [],
            cardBillings: [],
            planning: {
                goals: [],
                reserves: [],
                recurringRules: [],
                categoryRules: [],
                onboardingComplete: false
            },
            settings: {
                schemaVersion: 3,
                theme: theme === 'light' ? 'light' : 'dark',
                categories: null,
                budgets: {},
                categoryColors: {},
                household: { members: [] },
                sharedTransactionMeta: {}
            }
        };
        return typeof root.normalizeData === 'function' ? root.normalizeData(raw) : raw;
    }

    function confirmClearData() {
        const current = typeof root.getData === 'function' ? root.getData() : null;
        if (!current || typeof root.saveData !== 'function') return;

        const approved = typeof root.confirm !== 'function' || root.confirm(
            'Isso vai apagar contas, cartões, movimentações e Planejamento deste dispositivo.\n\nUm ponto de recuperação será criado automaticamente antes da limpeza. Deseja continuar?'
        );
        if (!approved) return;

        const theme = current.settings?.theme || 'dark';
        root.saveData(emptyDataset(theme));
        if (typeof root.renderAll === 'function') root.renderAll();

        const panel = typeof document !== 'undefined' ? document.getElementById('settingsOffcanvas') : null;
        if (panel && root.bootstrap?.Offcanvas) root.bootstrap.Offcanvas.getInstance(panel)?.hide();
        showToast('Dados locais limpos. A recuperação continua disponível em Dados.', 'info');
    }

    function appendSheet(workbook, name, rows) {
        const XLSX = root.XLSX;
        const safeRows = rows.length ? rows : [{ Informação: 'Nenhum dado neste relatório.' }];
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(safeRows), name);
    }

    function summaryRows(data) {
        const accountBalance = (data.accounts || []).reduce((sum, item) => sum + Number(item.balance || 0), 0);
        const cardOutstanding = typeof root.getOutstandingCardBalance === 'function'
            ? (data.cards || []).reduce((sum, card) => sum + root.getOutstandingCardBalance(data, card.id), 0)
            : 0;
        const completed = (data.transactions || []).filter(tx => tx.status !== 'planned');
        const income = completed.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
        const expenses = completed.filter(tx => tx.type === 'expense').reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
        return [
            { Indicador: 'Gerado em', Valor: new Date().toLocaleString('pt-BR') },
            { Indicador: 'Saldo em contas', Valor: currency(accountBalance) },
            { Indicador: 'Faturas em aberto', Valor: currency(cardOutstanding) },
            { Indicador: 'Entradas registradas', Valor: currency(income) },
            { Indicador: 'Gastos registrados', Valor: currency(expenses) },
            { Indicador: 'Contas', Valor: String((data.accounts || []).length) },
            { Indicador: 'Cartões', Valor: String((data.cards || []).length) },
            { Indicador: 'Movimentações', Valor: String((data.transactions || []).length) }
        ];
    }

    function transactionRows(data) {
        return (data.transactions || [])
            .slice()
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
            .map(tx => ({
                Data: dateLabel(tx.date),
                Tipo: transactionType(tx.type),
                Descrição: tx.description || '',
                Categoria: tx.category || '',
                Valor: root.PlannkeMoney.centsToReais(Number(tx.amount || 0)),
                'Conta / Cartão': entityName(data, tx.accountId),
                Destino: tx.destinationId ? entityName(data, tx.destinationId) : '',
                Situação: tx.status === 'planned' ? 'Prevista' : 'Realizada',
                Parcela: Number(tx.totalInstallments || 1) > 1
                    ? `${Number(tx.currentInstallment || 1)}/${Number(tx.totalInstallments || 1)}`
                    : ''
            }));
    }

    function accountRows(data) {
        return (data.accounts || []).map(account => ({
            Conta: account.name || '',
            Saldo: root.PlannkeMoney.centsToReais(Number(account.balance || 0)),
            'Saldo inicial': root.PlannkeMoney.centsToReais(Number(account.openingBalance ?? account.balance ?? 0))
        }));
    }

    function cardRows(data) {
        return (data.cards || []).map(card => ({
            Cartão: card.name || '',
            Limite: root.PlannkeMoney.centsToReais(Number(card.limit || 0)),
            'Fatura em aberto': typeof root.getOutstandingCardBalance === 'function'
                ? root.PlannkeMoney.centsToReais(root.getOutstandingCardBalance(data, card.id))
                : 0,
            Fechamento: Number(card.closingDay || 0),
            Vencimento: Number(card.dueDay || 0)
        }));
    }

    function planningRows(data) {
        const planning = data.planning || {};
        const rows = [];
        (planning.goals || []).forEach(goal => rows.push({
            Tipo: 'Objetivo',
            Nome: goal.name || goal.title || '',
            Valor: root.PlannkeMoney.centsToReais(Number(goal.targetAmount || goal.amount || 0)),
            Atual: root.PlannkeMoney.centsToReais(Number(goal.currentAmount || 0)),
            Data: dateLabel(goal.targetDate || goal.date || '')
        }));
        (planning.reserves || []).forEach(reserve => rows.push({
            Tipo: 'Reserva',
            Nome: reserve.name || reserve.title || '',
            Valor: root.PlannkeMoney.centsToReais(Number(reserve.amount || reserve.currentAmount || 0)),
            Atual: root.PlannkeMoney.centsToReais(Number(reserve.currentAmount || reserve.amount || 0)),
            Data: dateLabel(reserve.targetDate || reserve.date || '')
        }));
        (planning.recurringRules || []).forEach(rule => rows.push({
            Tipo: rule.type === 'income' ? 'Receita recorrente' : 'Despesa recorrente',
            Nome: rule.description || rule.name || '',
            Valor: root.PlannkeMoney.centsToReais(Number(rule.amount || 0)),
            Atual: '',
            Data: rule.day ? `Dia ${rule.day}` : ''
        }));
        return rows;
    }

    function exportToExcel() {
        if (!root.XLSX?.utils || typeof root.getData !== 'function') {
            showToast('Não foi possível gerar o relatório Excel.', 'error');
            return;
        }
        const data = root.getData();
        const workbook = root.XLSX.utils.book_new();
        appendSheet(workbook, 'Resumo', summaryRows(data));
        appendSheet(workbook, 'Movimentações', transactionRows(data));
        appendSheet(workbook, 'Contas', accountRows(data));
        appendSheet(workbook, 'Cartões', cardRows(data));
        appendSheet(workbook, 'Planejamento', planningRows(data));
        root.XLSX.writeFile(workbook, `Plannke_Relatorio_${localDateString()}.xlsx`);
        showToast('Relatório Excel exportado.');
    }

    function cloneBankImportState(value) {
      return value ? JSON.parse(JSON.stringify(value)) : null;
    }

    function normalizeBankText(value) {
      return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }

    function merchantRuleKey(description) {
      const stop = new Set(['compra', 'pagamento', 'debito', 'credito', 'pix', 'transacao', 'cartao', 'online', 'brasil', 'ltda', 'sa']);
      const words = normalizeBankText(description)
        .replace(/[^a-z\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length >= 3 && !stop.has(word));
      return words.slice(0, 2).join(' ').slice(0, 60);
    }

    function getPendingBankImport() {
      return cloneBankImportState(pendingBankImport);
    }

    function setBankImportResult(message) {
      if (typeof document === 'undefined') return;
      const result = document.getElementById('product-bank-result');
      if (result) result.textContent = String(message || '');
    }

    function notifyBankImportReview(options = {}) {
      root.PlannkePresentationDesktop?.renderBankImportReview?.(options);
    }

    function updateBankImportItem(index, patch = {}) {
      const item = pendingBankImport?.items?.[Number(index)];
      if (!item) return false;
      if (Object.prototype.hasOwnProperty.call(patch, 'include')) item.include = !!patch.include;
      if (Object.prototype.hasOwnProperty.call(patch, 'category')) {
        item.category = String(patch.category || 'Outros');
        item.categoryChanged = item.category !== item.originalCategory;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'remember')) {
        item.remember = !!patch.remember && !!merchantRuleKey(item.transaction?.description);
      }
      return true;
    }

    function cancelBankImport() {
      pendingBankImport = null;
      notifyBankImportReview();
      setBankImportResult('Importação cancelada; nenhum lançamento foi alterado.');
    }

    function confirmBankImport() {
      if (!pendingBankImport) return;
      const data = typeof root.getData === 'function' ? root.getData() : null;
      const core = root.PlannkeCore;
      if (!data || !core) return;
      const selected = pendingBankImport.items.filter(item => item.include);
      if (!selected.length) {
        showToast('Selecione pelo menos uma movimentação.', 'error');
        return;
      }
    
      if (selected.length < 5) {
        try { root.PlannkeStorage?.createSnapshot?.('before-bank-import'); }
        catch (error) { console.warn('Ponto de recuperação da importação indisponível:', error); }
      }
    
      if (typeof core.ensurePlanning === 'function') core.ensurePlanning(data);
      if (!data.planning || typeof data.planning !== 'object') data.planning = {};
      if (!Array.isArray(data.planning.categoryRules)) data.planning.categoryRules = [];
    
      selected.forEach(item => {
        const transaction = { ...item.transaction, category: item.category || 'Outros' };
        data.transactions.push(transaction);
        if (!item.remember) return;
        const contains = merchantRuleKey(transaction.description);
        if (!contains) return;
        const exists = data.planning.categoryRules.some(rule => normalizeBankText(rule.contains) === contains && rule.category === transaction.category);
        if (!exists) {
          data.planning.categoryRules.push({
            id: typeof core.safeId === 'function' ? core.safeId('', 'catrule') : `catrule-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            contains,
            category: transaction.category
          });
        }
      });
    
      if (typeof core.sanitizePlanning === 'function') data.planning = core.sanitizePlanning(data.planning);
      root.saveData?.(data);
      root.renderAll?.();
      const imported = selected.length;
      const learned = selected.filter(item => item.remember).length;
      pendingBankImport = null;
      notifyBankImportReview();
      setBankImportResult(`${imported} movimentação${imported === 1 ? '' : 'ões'} confirmada${imported === 1 ? '' : 's'}${learned ? ` · ${learned} regra${learned === 1 ? '' : 's'} memorizada${learned === 1 ? '' : 's'}` : ''}.`);
      showToast(`${imported} movimentação${imported === 1 ? '' : 'ões'} importada${imported === 1 ? '' : 's'}.`);
    }

    async function readBankFileText(file) {
      if (!file || typeof file.arrayBuffer !== 'function') throw new Error('Arquivo bancário inválido.');
      const encoding = String(file.name || '').toLowerCase().endsWith('.ofx') ? 'windows-1252' : 'utf-8';
      const Decoder = root.TextDecoder;
      if (typeof Decoder !== 'function') throw new Error('TextDecoder indisponível.');
      return new Decoder(encoding).decode(await file.arrayBuffer());
    }

    async function stageBankFile(file, accountId) {
      const core = root.PlannkeCore;
      const data = typeof root.getData === 'function' ? root.getData() : null;
      if (!core || !data) return null;
      try {
        const source = await readBankFileText(file);
        const planning = data.planning && typeof data.planning === 'object' ? data.planning : {};
        const rules = Array.isArray(planning.categoryRules) ? planning.categoryRules : [];
        const lower = String(file.name || '').toLowerCase();
        const incoming = lower.endsWith('.ofx')
          ? core.parseOfxBank(source, accountId, rules)
          : core.parseCsvBank(source, accountId, rules);
        const fresh = core.dedupeImported(data.transactions || [], incoming || []);
        if (!incoming?.length) {
          showToast('Não consegui identificar movimentações nesse arquivo.', 'error');
          return null;
        }
        if (!fresh.length) {
          showToast('Nenhuma movimentação nova encontrada.', 'info');
          return null;
        }
        pendingBankImport = {
          accountId,
          fileName: file.name,
          totalFound: incoming.length,
          items: fresh.map(transaction => {
            const originalCategory = transaction.category || 'Outros';
            const suggested = !['Outros', 'Sem Categoria', ''].includes(originalCategory);
            return {
              transaction: { ...transaction },
              originalCategory,
              category: originalCategory,
              suggested,
              categoryChanged: false,
              include: true,
              remember: false
            };
          })
        };
        notifyBankImportReview({ focus: true });
        setBankImportResult(`${incoming.length} encontradas · ${fresh.length} novas aguardando revisão.`);
        return getPendingBankImport();
      } catch (error) {
        console.error(error);
        showToast('Erro ao ler o extrato.', 'error');
        return null;
      } finally {
        if (typeof document !== 'undefined') {
          const input = document.getElementById('product-bank-file');
          if (input) input.value = '';
        }
      }
    }

    function captureBankImport(event) {
      if (event.target?.id !== 'product-bank-file') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const file = event.target.files?.[0];
      const accountId = document.getElementById('product-bank-account')?.value;
      if (!file || !accountId) {
        showToast('Escolha a conta antes de selecionar o extrato.', 'error');
        event.target.value = '';
        return;
      }
      void stageBankFile(file, accountId);
    }

    function refreshBankAccountOptions(select, data) {
      if (!select) return;
      const selected = select.value || '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Escolha a conta...';
      const options = [placeholder];
      (data?.accounts || []).filter(account => account.status !== 'archived').forEach(account => {
        const option = document.createElement('option');
        option.value = String(account.id || '');
        option.textContent = `${account.name || 'Conta'} · ${currency(account.balance)}`;
        options.push(option);
      });
      select.replaceChildren(...options);
      select.value = (data?.accounts || []).some(account => String(account.id) === selected) ? selected : '';
    }

    function ensureBankImportPanel() {
      if (typeof document === 'undefined') return null;
      const backup = document.getElementById('backup-view');
      const row = backup?.querySelector(':scope > .row') || backup?.querySelector('.row');
      if (!backup || !row) return null;
    
      let panel = document.getElementById('product-bank-import');
      if (!panel) {
        panel = document.createElement('div');
        panel.className = 'col-12 col-md-7 col-lg-5 mt-3';
        panel.id = 'product-bank-import';
    
        const card = document.createElement('div');
        card.className = 'card';
        const body = document.createElement('div');
        body.className = 'card-body p-4';
        const title = document.createElement('div');
        title.className = 'product-card-title';
        const titleMain = document.createElement('div');
        const icon = document.createElement('i');
        icon.className = 'ph ph-file-arrow-up';
        const strong = document.createElement('strong');
        strong.textContent = 'Importar extrato bancário';
        titleMain.append(icon, strong);
        const subtitle = document.createElement('small');
        subtitle.textContent = 'OFX ou CSV — sem conexão com seu banco';
        title.append(titleMain, subtitle);
    
        const copy = document.createElement('p');
        copy.className = 'small text-muted';
        copy.textContent = 'O arquivo é lido localmente. Duplicatas são removidas antes da revisão das movimentações.';
    
        const account = document.createElement('select');
        account.id = 'product-bank-account';
        account.className = 'form-select mb-2';
    
        const label = document.createElement('label');
        label.className = 'btn btn-outline-primary w-100';
        label.appendChild(document.createTextNode('Selecionar OFX / CSV'));
        const input = document.createElement('input');
        input.id = 'product-bank-file';
        input.className = 'd-none';
        input.type = 'file';
        input.accept = '.ofx,.csv,text/csv';
        label.appendChild(input);
    
        const result = document.createElement('div');
        result.id = 'product-bank-result';
        result.className = 'tiny text-muted mt-2';
    
        body.append(title, copy, account, label, result);
        card.appendChild(body);
        panel.appendChild(card);
        row.appendChild(panel);
      }
    
      const data = typeof root.getData === 'function' ? root.getData() : { accounts: [] };
      refreshBankAccountOptions(document.getElementById('product-bank-account'), data);
      root.PlannkePresentationDesktop?.decorateBackup?.();
      return panel;
    }

    function bindDataControls() {
        if (controlsBound || typeof document === 'undefined') return;
        controlsBound = true;
        ensureBankImportPanel();
        document.addEventListener('change', captureBankImport, true);
        document.getElementById('data-export-excel')?.addEventListener('click', exportToExcel);
        document.getElementById('settings-clear-data')?.addEventListener('click', confirmClearData);
        root.addEventListener?.('plannke:data-changed', () => {
            if (typeof root.setTimeout === 'function') root.setTimeout(ensureBankImportPanel, 0);
            else ensureBankImportPanel();
        });
    }

    root.confirmClearData = confirmClearData;
    root.exportToExcel = exportToExcel;
    root.PlannkeDataActions = {
        confirmClearData,
        exportToExcel,
        emptyDataset,
        summaryRows,
        transactionRows,
        accountRows,
        cardRows,
        planningRows,
        getPendingBankImport,
        merchantRuleKey,
        updateBankImportItem,
        cancelBankImport,
        confirmBankImport,
        readBankFileText,
        stageBankFile,
        captureBankImport,
        ensureBankImportPanel,
        refreshBankAccountOptions,
        bindDataControls
    };
    bindDataControls();
})(typeof globalThis !== 'undefined' ? globalThis : this);

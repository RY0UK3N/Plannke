/* Plannke canonical theme, categories and budget settings runtime. */
(function (root) {
    'use strict';

    const DEFAULT_INCOME = ['Salário', 'Rendimentos / Freelance', 'Saldos Iniciais', 'Outros'];
    const DEFAULT_EXPENSE = {
        'Contas Fixas': ['Assinaturas', 'Contabilidade', 'Energia / Água', 'Internet / Celular', 'Taxas Bancárias'],
        'Gastos Variáveis': ['Farmácia / Saúde', 'Manutenções', 'Restaurantes / Delivery', 'Supermercado', 'Transporte / Combustível', 'Outros']
    };
    const COLOR_PALETTE = [
        '#00c896', '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
        '#f97316', '#f59e0b', '#10b981', '#0ea5e9', '#3b82f6',
        '#14b8a6', '#a78bfa', '#fb7185', '#34d399', '#60a5fa',
        '#94a3b8', '#475569', '#7c83fd', '#ff4d6d', '#fbbf24'
    ];
    const DEFAULT_COLORS = {
        'Assinaturas': '#8b5cf6', 'Contabilidade': '#6366f1', 'Energia / Água': '#3b82f6',
        'Internet / Celular': '#0ea5e9', 'Taxas Bancárias': '#f59e0b',
        'Farmácia / Saúde': '#10b981', 'Manutenções': '#ef4444',
        'Restaurantes / Delivery': '#f97316', 'Supermercado': '#f59e0b',
        'Transporte / Combustível': '#3b82f6', 'Outros': '#94a3b8',
        'Salário': '#00c896', 'Rendimentos / Freelance': '#14b8a6',
        'Saldos Iniciais': '#0ea5e9', 'Pagamento de Fatura': '#7c83fd'
    };

    let activeTab = 'expense';

    function byId(id) {
        return document.getElementById(id);
    }

    function make(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function icon(name) {
        return make('i', `ph ${name}`);
    }

    function cloneDefaults() {
        return {
            income: [...DEFAULT_INCOME],
            expense: Object.fromEntries(Object.entries(DEFAULT_EXPENSE).map(([group, list]) => [group, [...list]]))
        };
    }

    function loadCategories() {
        const categories = root.getSettings?.().categories;
        if (!categories?.income || !categories?.expense) return cloneDefaults();
        return categories;
    }

    function saveCategories(categories) {
        const settings = root.getSettings();
        settings.categories = categories;
        root.saveSettings(settings);
    }

    function loadBudgets() {
        return root.getSettings?.().budgets || {};
    }

    function saveBudgets(budgets) {
        const settings = root.getSettings();
        settings.budgets = budgets;
        root.saveSettings(settings);
    }

    function getCategoryColor(category) {
        const colors = root.getSettings?.().categoryColors || {};
        return colors[category] || DEFAULT_COLORS[category] || '#475569';
    }

    function setCategoryColor(category, color) {
        const settings = root.getSettings();
        settings.categoryColors = settings.categoryColors || {};
        settings.categoryColors[category] = color;
        root.saveSettings(settings);
    }

    function getAllExpenseCategories() {
        return Object.values(loadCategories().expense || {}).flat();
    }

    function applyTheme(theme) {
        const resolved = theme === 'light' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-bs-theme', resolved);
        document.querySelector('meta[name="theme-color"]')
            ?.setAttribute('content', resolved === 'dark' ? '#0d0d14' : '#f8fafc');
        const toggle = byId('settings-theme-toggle');
        if (toggle) toggle.checked = resolved === 'light';
        root.PlannkeDashboard?.refreshTheme?.();

        const movement = byId('movimentacao-view');
        if (movement && !movement.classList.contains('hidden')) {
            root.setTimeout?.(() => root.renderMovimentacao?.(root.getData?.()), 0);
        }
    }

    function toggleTheme() {
        const settings = root.getSettings();
        settings.theme = settings.theme === 'light' ? 'dark' : 'light';
        root.saveSettings(settings);
        applyTheme(settings.theme);
    }

    function setTabButtons(type, modal) {
        const expense = byId(modal ? 'cat-modal-tab-expense' : 'cat-tab-expense');
        const income = byId(modal ? 'cat-modal-tab-income' : 'cat-tab-income');
        if (expense) {
            expense.classList.toggle('btn-primary', type === 'expense');
            expense.classList.toggle('btn-outline-primary', type !== 'expense');
        }
        if (income) {
            income.classList.toggle('btn-primary', type === 'income');
            income.classList.toggle('btn-outline-primary', type !== 'income');
        }
    }

    function fillGroupSelect(select, type, categories) {
        if (!select) return;
        select.replaceChildren();
        if (type === 'income') {
            const option = make('option', '', 'Entradas');
            option.value = '__income__';
            select.appendChild(option);
            select.style.display = 'none';
            return;
        }
        select.style.display = '';
        Object.keys(categories.expense || {}).forEach(group => {
            const option = make('option', '', group);
            option.value = group;
            select.appendChild(option);
        });
    }

    function deleteButton(title, callback) {
        const button = make('button', 'btn-icon danger');
        button.type = 'button';
        button.title = title;
        button.setAttribute('aria-label', title);
        button.appendChild(icon('ph-trash'));
        button.addEventListener('click', callback);
        return button;
    }

    function colorButton(category) {
        const button = make('button', 'cat-color-swatch');
        button.type = 'button';
        button.style.background = getCategoryColor(category);
        button.title = `Alterar cor de ${category}`;
        button.setAttribute('aria-label', button.title);
        button.appendChild(icon('ph-pencil-simple'));
        button.addEventListener('click', () => openColorPicker(category));
        return button;
    }

    function categoryRow(category, type, group, index, modal) {
        const row = make('div', 'cat-manager-row');
        const left = make('div', modal ? 'd-flex align-items-center gap-2' : 'd-flex align-items-center gap-2 flex-1');
        if (modal) {
            const dot = make('span', 'cat-color-dot');
            dot.style.background = getCategoryColor(category);
            left.append(dot, make('span', 'cat-manager-name', category));
        } else {
            left.append(colorButton(category), make('span', 'cat-manager-name', category));
        }
        const remove = deleteButton(`Excluir ${category}`, () => {
            if (modal) deleteCategoryModal(type, group, index);
            else deleteCategory(type, group, index);
        });
        row.append(left, remove);
        return row;
    }

    function renderCategoryList(type, modal) {
        const categories = loadCategories();
        const list = byId(modal ? 'cat-manager-list-modal' : 'cat-manager-list');
        const groupSelect = byId(modal ? 'new-cat-group-modal' : 'new-cat-group');
        if (!list) return;
        list.replaceChildren();
        fillGroupSelect(groupSelect, type, categories);

        if (type === 'income') {
            if (!categories.income.length) {
                list.appendChild(make('p', 'text-muted small', 'Nenhuma categoria.'));
                return;
            }
            categories.income.forEach((category, index) => {
                list.appendChild(categoryRow(category, 'income', null, index, modal));
            });
            return;
        }

        Object.entries(categories.expense || {}).forEach(([group, groupCategories]) => {
            const section = make('div', 'cat-group-section');
            section.appendChild(make('div', 'cat-group-label', group));
            groupCategories.forEach((category, index) => {
                section.appendChild(categoryRow(category, 'expense', group, index, modal));
            });
            list.appendChild(section);
        });
    }

    function switchCatTabModal(type) {
        activeTab = type === 'income' ? 'income' : 'expense';
        setTabButtons(activeTab, true);
        renderCategoryList(activeTab, true);
    }

    function switchCatTab(type) {
        activeTab = type === 'income' ? 'income' : 'expense';
        setTabButtons(activeTab, false);
        renderCategoryList(activeTab, false);
    }

    function openCategoryManager() {
        const checked = document.querySelector('input[name="type"]:checked');
        activeTab = checked?.value === 'income' ? 'income' : 'expense';
        switchCatTabModal(activeTab);
        root.bootstrap?.Modal?.getOrCreateInstance(byId('categoryModal'))?.show();
    }

    function addCategoryFrom(inputId, groupId, modal) {
        const input = byId(inputId);
        const name = input?.value.trim() || '';
        if (!name) {
            root.showToast?.('Informe o nome da categoria.', 'error');
            return;
        }

        const categories = loadCategories();
        if (activeTab === 'income') {
            if (categories.income.includes(name)) {
                root.showToast?.('Categoria já existe.', 'error');
                return;
            }
            categories.income.push(name);
        } else {
            const group = byId(groupId)?.value || '';
            if (!group || !categories.expense[group]) {
                root.showToast?.('Selecione um grupo válido.', 'error');
                return;
            }
            if (categories.expense[group].includes(name)) {
                root.showToast?.('Categoria já existe.', 'error');
                return;
            }
            categories.expense[group].push(name);
        }

        saveCategories(categories);
        if (input) input.value = '';
        renderCategoryList(activeTab, modal);
        root.showToast?.(`Categoria "${name}" adicionada!`);
    }

    function addCustomCategoryModal() {
        addCategoryFrom('new-cat-name-modal', 'new-cat-group-modal', true);
    }

    function addCustomCategory() {
        addCategoryFrom('new-cat-name', 'new-cat-group', false);
        renderSettingsView();
    }

    function removeCategory(type, group, index, modal) {
        const categories = loadCategories();
        if (type === 'income') categories.income.splice(index, 1);
        else if (categories.expense[group]) categories.expense[group].splice(index, 1);
        saveCategories(categories);
        renderCategoryList(activeTab, modal);
        if (!modal) renderSettingsView();
    }

    function deleteCategoryModal(type, group, index) {
        removeCategory(type, group, index, true);
    }

    function deleteCategory(type, group, index) {
        removeCategory(type, group, index, false);
    }

    function renderCategoryManager() {
        setTabButtons(activeTab, false);
        renderCategoryList(activeTab, false);
    }

    function renderCatManagerTabs() {
        setTabButtons(activeTab, false);
    }

    function openColorPicker(category) {
        const name = byId('color-picker-cat-name');
        const target = byId('color-picker-cat-target');
        const content = byId('color-picker-modal-content');
        if (!content) return;
        if (name) name.textContent = category;
        if (target) target.value = category;
        content.replaceChildren();

        const current = getCategoryColor(category);
        COLOR_PALETTE.forEach(color => {
            const button = make('button', `color-swatch-option${color === current ? ' active' : ''}`);
            button.type = 'button';
            button.style.background = color;
            button.setAttribute('aria-label', `Usar cor ${color}`);
            if (color === current) button.appendChild(icon('ph-check'));
            button.addEventListener('click', () => selectCatColor(category, color));
            content.appendChild(button);
        });
        root.bootstrap?.Modal?.getOrCreateInstance(byId('colorPickerModal'))?.show();
    }

    function selectCatColor(category, color) {
        setCategoryColor(category, color);
        root.bootstrap?.Modal?.getInstance(byId('colorPickerModal'))?.hide();
        renderCategoryManager();
        root.renderAll?.();
        root.showToast?.('Cor atualizada!');
    }

    function openSettingsPanel() {
        const toggle = byId('settings-theme-toggle');
        if (toggle) toggle.checked = (root.getSettings?.().theme || 'dark') === 'light';
        renderCatManagerTabs();
        renderCategoryManager();
        root.bootstrap?.Offcanvas?.getOrCreateInstance(byId('settingsOffcanvas'))?.show();
    }

    function openBudgetManager() {
        root.renderBudgetManager?.();
        root.bootstrap?.Modal?.getOrCreateInstance(byId('budgetModal'))?.show();
    }

    function handleBudgetInput(input) {
        const digits = String(input?.value || '').replace(/\D/g, '');
        if (!digits) {
            input.value = '';
            input.dataset.rawValue = '';
            return;
        }
        const amount = parseInt(digits, 10) / 100;
        input.value = amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        input.dataset.rawValue = String(amount);
    }

    function saveBudgetEntry(category, rawValue) {
        const budgets = loadBudgets();
        const value = parseFloat(rawValue);
        if (!rawValue || !Number.isFinite(value) || value <= 0) delete budgets[category];
        else budgets[category] = value;
        saveBudgets(budgets);
        root.renderDashboard?.(root.getData?.());
        root.showToast?.(
            value > 0 ? `Orçamento de ${root.formatCurrency(value)} definido para ${category}` : `Orçamento de ${category} removido`,
            value > 0 ? 'success' : 'info'
        );
    }

    function renderSettingsView() {}

    const api = {
        applyTheme,
        toggleTheme,
        openSettingsPanel,
        openCategoryManager,
        switchCatTabModal,
        addCustomCategoryModal,
        deleteCategoryModal,
        switchCatTab,
        addCustomCategory,
        deleteCategory,
        renderCategoryManager,
        openColorPicker,
        selectCatColor,
        openBudgetManager,
        handleBudgetInput,
        saveBudgetEntry,
        loadCategories,
        saveCategories,
        loadBudgets,
        saveBudgets,
        getCategoryColor,
        setCategoryColor,
        getAllExpenseCategories
    };

    root.applyTheme = applyTheme;
    root.toggleTheme = toggleTheme;
    root.openSettingsPanel = openSettingsPanel;
    root.openCategoryManager = openCategoryManager;
    root.switchCatTabModal = switchCatTabModal;
    root.addCustomCategoryModal = addCustomCategoryModal;
    root.deleteCategoryModal = deleteCategoryModal;
    root._renderCatManagerTabs = renderCatManagerTabs;
    root.switchCatTab = switchCatTab;
    root.addCustomCategory = addCustomCategory;
    root.deleteCategory = deleteCategory;
    root.renderCategoryManager = renderCategoryManager;
    root.openColorPicker = openColorPicker;
    root.selectCatColor = selectCatColor;
    root.openBudgetManager = openBudgetManager;
    root.handleBudgetInput = handleBudgetInput;
    root.saveBudgetEntry = saveBudgetEntry;
    root.renderSettingsView = renderSettingsView;
    root._loadCategories = loadCategories;
    root._saveCategories = saveCategories;
    root._loadBudgets = loadBudgets;
    root._saveBudgets = saveBudgets;
    root._getCatColor = getCategoryColor;
    root._setCatColor = setCategoryColor;
    root._getAllExpenseCats = getAllExpenseCategories;
    root.PlannkeSettings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

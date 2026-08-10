/* ============================================================
   INIT
   ============================================================ */
function initApp() {
    setupNavigation();
    setupModalEvents();
    setupForms();
    setupCurrencyInput();
    setupKeyboardShortcuts();
    applyTheme(getSettings().theme || 'dark');
    renderAll();
    _navigateTo('dashboard');
}

/* ============================================================
   CAMPO DE VALOR FORMATADO (R$ 0,00)
   ============================================================ */
const AMOUNT_FIELDS = ['tx-amount', 'acc-balance', 'card-limit'];

function setupCurrencyInput() {
    AMOUNT_FIELDS.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.addEventListener('input', handleCurrencyInput);
    });
}

function handleCurrencyInput(e) {
    const input = e.target;
    const digits = input.value.replace(/\D/g, '');
    if (!digits) { input.value = ''; input.dataset.rawValue = ''; updateInstallmentHelper(); return; }
    const reais = parseInt(digits, 10) / 100;
    input.value = reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    input.dataset.rawValue = String(reais);
    if (input.id === 'tx-amount') updateInstallmentHelper();
}

function getCurrencyValue(id) {
    const input = document.getElementById(id);
    if (!input) return 0;
    if (input.dataset.rawValue) return parseFloat(input.dataset.rawValue) || 0;
    const digits = input.value.replace(/\D/g, '');
    return digits ? parseInt(digits, 10) / 100 : 0;
}

function setCurrencyValue(id, val) {
    const input = document.getElementById(id);
    if (!input) return;
    const num = parseFloat(val) || 0;
    input.value = num > 0 ? num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
    input.dataset.rawValue = String(num);
}

/* ============================================================
   MODAL SYSTEM
   ============================================================ */
function openModal(modalId) {
    if (modalId === 'transactionModal') {
        openTxModal(null);
        return;
    }
    bootstrap.Modal.getOrCreateInstance(document.getElementById(modalId)).show();
}

function closeModal(modalId) {
    const modal = bootstrap.Modal.getInstance(document.getElementById(modalId));
    if (modal) modal.hide();
}

/* ============================================================
   FEEDBACK
   ============================================================ */
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const id = 'toast-' + Date.now();
    const color = type === 'success' ? 'var(--color-primary)' : (type === 'info' ? '#7c83fd' : 'var(--color-expense)');
    const icon = type === 'success' ? 'ph-check-circle' : (type === 'info' ? 'ph-info' : 'ph-warning-circle');
    const el = document.createElement('div');
    el.id = id; el.className = 'planner-toast';
    el.style.borderLeftColor = color;
    el.innerHTML = `<i class="ph ${icon}" style="color:${color};font-size:1.1rem;flex-shrink:0;"></i><span>${message}</span>`;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, 3200);
}

function showFormError(msg) {
    const el = document.getElementById('tx-form-error');
    if (!el) return;
    el.textContent = msg; el.classList.remove('hidden');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => el.classList.add('hidden'), 5000);
}

function clearFormError() {
    document.getElementById('tx-form-error')?.classList.add('hidden');
}

/* ============================================================
   CRUD WRAPPERS
   ============================================================ */
/* ── Rich delete confirmation ── */
function _showDeleteConfirm(title, desc, value, onConfirm) {
    document.getElementById('delete-confirm-title').textContent = title;
    document.getElementById('delete-confirm-desc').textContent = desc;
    document.getElementById('delete-confirm-value').textContent = value || '';
    const btn = document.getElementById('delete-confirm-btn');
    // Clone to remove old listeners
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
        bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal'))?.hide();
        onConfirm();
    });
    bootstrap.Modal.getOrCreateInstance(document.getElementById('deleteConfirmModal')).show();
}

/* ============================================================
   RENDER ALL
   ============================================================ */
function renderAll() {
    const data = getData();
    renderTransactions(data);
    renderDashboard(data);
    renderAccounts(data);
    renderCards(data);
    renderMovimentacao(data);
    renderProjection(data);
    _populateMovFilters(data);
    renderSettingsView(); // only renders if view is visible

    // Refresh detail modal if open
    if (window._detailContext?.id) {
        const modalEl = document.getElementById('entityDetailModal');
        const isVisible = modalEl.classList.contains('show');
        if (isVisible) {
            if (window._detailContext.type === 'account') {
                viewAccountStatement(window._detailContext.id, true);
            } else {
                viewCardInvoice(window._detailContext.id, window._detailContext.period, true);
            }
        }
    }
}

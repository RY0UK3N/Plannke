/* Plannke canonical shared UI utilities. */
(function (root) {
    'use strict';

    const AMOUNT_FIELDS = ['tx-amount', 'acc-balance', 'card-limit'];
    let currencyInputsBound = false;

    function setupCurrencyInput() {
        if (currencyInputsBound || typeof document === 'undefined') return;
        currencyInputsBound = true;
        AMOUNT_FIELDS.forEach(id => {
            const input = document.getElementById(id);
            if (input) input.addEventListener('input', handleCurrencyInput);
        });
    }

    function handleCurrencyInput(event) {
        const input = event?.target;
        if (!input) return;
        const digits = String(input.value || '').replace(/\D/g, '');
        if (!digits) {
            input.value = '';
            input.dataset.rawValue = '';
            root.updateInstallmentHelper?.();
            return;
        }
        const reais = root.PlannkeMoney.centsToReais(parseInt(digits, 10));
        input.value = reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        input.dataset.rawValue = String(parseInt(digits, 10));
        if (input.id === 'tx-amount') root.updateInstallmentHelper?.();
    }

    function getCurrencyValue(id) {
        if (typeof document === 'undefined') return 0;
        const input = document.getElementById(id);
        if (!input) return 0;
        if (input.dataset.rawValue) return Number(input.dataset.rawValue) || 0;
        const digits = String(input.value || '').replace(/\D/g, '');
        return digits ? parseInt(digits, 10) : 0;
    }

    function setCurrencyValue(id, value) {
        if (typeof document === 'undefined') return;
        const input = document.getElementById(id);
        if (!input) return;
        const cents = Number(value) || 0;
        const number = root.PlannkeMoney.centsToReais(cents);
        input.value = cents > 0
            ? number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : '';
        input.dataset.rawValue = String(cents);
    }

    function openModal(modalId) {
        if (modalId === 'transactionModal') {
            root.openTxModal?.(null);
            return;
        }
        if (typeof document === 'undefined') return;
        const modalElement = document.getElementById(modalId);
        if (!modalElement) return;
        root.bootstrap?.Modal?.getOrCreateInstance(modalElement)?.show();
    }

    function closeModal(modalId) {
        if (typeof document === 'undefined') return;
        const modalElement = document.getElementById(modalId);
        if (!modalElement) return;
        root.bootstrap?.Modal?.getInstance(modalElement)?.hide();
    }

    function showToast(message, type = 'success') {
        if (typeof document === 'undefined') return;
        const container = document.getElementById('toast-container');
        if (!container) return;

        const palette = type === 'success'
            ? { color: 'var(--color-primary)', icon: 'ph-check-circle' }
            : type === 'info'
                ? { color: '#7c83fd', icon: 'ph-info' }
                : { color: 'var(--color-expense)', icon: 'ph-warning-circle' };

        const element = document.createElement('div');
        element.id = `toast-${Date.now()}`;
        element.className = 'planner-toast';
        element.style.borderLeftColor = palette.color;

        const icon = document.createElement('i');
        icon.className = `ph ${palette.icon}`;
        icon.style.color = palette.color;
        icon.style.fontSize = '1.1rem';
        icon.style.flexShrink = '0';

        const text = document.createElement('span');
        text.textContent = String(message ?? '');
        element.append(icon, text);
        container.appendChild(element);

        root.requestAnimationFrame?.(() => element.classList.add('show'));
        root.setTimeout?.(() => {
            element.classList.remove('show');
            root.setTimeout?.(() => element.remove(), 350);
        }, 3200);
    }

    function showFormError(message) {
        if (typeof document === 'undefined') return;
        const element = document.getElementById('tx-form-error');
        if (!element) return;
        element.textContent = String(message ?? '');
        element.classList.remove('hidden');
        element.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
        root.setTimeout?.(() => element.classList.add('hidden'), 5000);
    }

    function clearFormError() {
        if (typeof document === 'undefined') return;
        document.getElementById('tx-form-error')?.classList.add('hidden');
    }

    function showDeleteConfirm(title, description, value, onConfirm) {
        if (typeof document === 'undefined') return;
        const titleElement = document.getElementById('delete-confirm-title');
        const descriptionElement = document.getElementById('delete-confirm-desc');
        const valueElement = document.getElementById('delete-confirm-value');
        const button = document.getElementById('delete-confirm-btn');
        const modalElement = document.getElementById('deleteConfirmModal');
        if (!titleElement || !descriptionElement || !valueElement || !button || !modalElement) return;

        titleElement.textContent = String(title ?? '');
        descriptionElement.textContent = String(description ?? '');
        valueElement.textContent = String(value ?? '');

        const replacement = button.cloneNode(true);
        button.parentNode?.replaceChild(replacement, button);
        replacement.addEventListener('click', () => {
            root.bootstrap?.Modal?.getInstance(modalElement)?.hide();
            if (typeof onConfirm === 'function') onConfirm();
        });
        root.bootstrap?.Modal?.getOrCreateInstance(modalElement)?.show();
    }

    const api = {
        setupCurrencyInput,
        handleCurrencyInput,
        getCurrencyValue,
        setCurrencyValue,
        openModal,
        closeModal,
        showToast,
        showFormError,
        clearFormError,
        showDeleteConfirm
    };

    root.setupCurrencyInput = setupCurrencyInput;
    root.handleCurrencyInput = handleCurrencyInput;
    root.getCurrencyValue = getCurrencyValue;
    root.setCurrencyValue = setCurrencyValue;
    root.openModal = openModal;
    root.closeModal = closeModal;
    root.showToast = showToast;
    root.showFormError = showFormError;
    root.clearFormError = clearFormError;
    root._showDeleteConfirm = showDeleteConfirm;
    root.PlannkeUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

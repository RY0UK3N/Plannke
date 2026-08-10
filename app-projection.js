/* Plannke canonical 12-month projection runtime. */
(function (root) {
    'use strict';

    let projectionChart = null;
    let resizeAttached = false;

    function make(tag, className, textValue) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (textValue !== undefined && textValue !== null) node.textContent = String(textValue);
        return node;
    }

    function icon(name) {
        return make('i', `ph ${name}`);
    }

    function localDateString(date = new Date()) {
        if (root.PlannkeCore?.localDateString) return root.PlannkeCore.localDateString(date);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function parseLocalDate(dateString) {
        const match = String(dateString || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;
        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function number(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function money(value) {
        if (typeof root.formatCurrency === 'function') return root.formatCurrency(number(value));
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number(value));
    }

    function projectionMonths(today, count = 12) {
        const base = parseLocalDate(today) || new Date();
        const months = [];
        for (let index = 0; index < count; index++) {
            const date = new Date(base.getFullYear(), base.getMonth() + index, 1);
            months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
        }
        return months;
    }

    function historicalAverage(transactions, today) {
        const base = parseLocalDate(today) || new Date();
        const months = [];
        for (let index = 1; index <= 3; index++) {
            const date = new Date(base.getFullYear(), base.getMonth() - index, 1);
            months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
        }
        let income = 0;
        let expense = 0;
        let countedMonths = 0;
        months.forEach(month => {
            const monthly = transactions.filter(tx => String(tx.date || '').startsWith(month) && tx.type !== 'transfer');
            if (!monthly.length) return;
            countedMonths += 1;
            monthly.forEach(tx => {
                if (tx.type === 'income') income += number(tx.amount);
                if (tx.type === 'expense') expense += number(tx.amount);
            });
        });
        return {
            income: countedMonths ? income / countedMonths : 0,
            expense: countedMonths ? expense / countedMonths : 0,
            countedMonths
        };
    }

    function buildProjectionModel(data, today = localDateString()) {
        const transactions = Array.isArray(data?.transactions) ? data.transactions : [];
        const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
        const initialBalance = accounts.reduce((sum, account) => sum + number(account.balance), 0);
        const months = projectionMonths(today, 12);
        const future = Object.fromEntries(months.map(month => [month, { income: 0, expense: 0 }]));
        const legacyRecurring = transactions.filter(tx => tx.recurring && String(tx.date || '') <= today && tx.type !== 'transfer');
        const syntheticRecurring = transactions.filter(tx => tx.synthetic && tx.ruleId && tx.type !== 'transfer');
        const legacyRecurringIncome = legacyRecurring.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + number(tx.amount), 0);
        const legacyRecurringExpense = legacyRecurring.filter(tx => tx.type === 'expense').reduce((sum, tx) => sum + number(tx.amount), 0);

        transactions.filter(tx => tx.type !== 'transfer' && !tx.recurring).forEach(tx => {
            const date = String(tx.date || '');
            const month = date.slice(0, 7);
            if (!future[month]) return;
            if (month === months[0] && date <= today) return;
            if (tx.type === 'income') future[month].income += number(tx.amount);
            if (tx.type === 'expense') future[month].expense += number(tx.amount);
        });

        const hasLegacyRecurring = legacyRecurring.length > 0;
        const hasPlannedRecurring = syntheticRecurring.length > 0;
        const average = !hasLegacyRecurring && !hasPlannedRecurring
            ? historicalAverage(transactions, today)
            : { income: 0, expense: 0, countedMonths: 0 };
        const baselineIncome = hasLegacyRecurring ? legacyRecurringIncome : average.income;
        const baselineExpense = hasLegacyRecurring ? legacyRecurringExpense : average.expense;
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const labels = [], balances = [], incomes = [], expenses = [];
        let runningBalance = initialBalance;

        months.forEach((month, index) => {
            const [year, monthNumber] = month.split('-').map(Number);
            labels.push(`${monthNames[monthNumber - 1]}/${String(year).slice(2)}`);
            const baseIncome = index === 0 || hasPlannedRecurring ? 0 : baselineIncome;
            const baseExpense = index === 0 || hasPlannedRecurring ? 0 : baselineExpense;
            const projectedIncome = baseIncome + future[month].income;
            const projectedExpense = baseExpense + future[month].expense;
            incomes.push(Number(projectedIncome.toFixed(2)));
            expenses.push(Number(projectedExpense.toFixed(2)));
            runningBalance += projectedIncome - projectedExpense;
            balances.push(Number(runningBalance.toFixed(2)));
        });

        const finalBalance = balances.at(-1) ?? initialBalance;
        const balanceDelta = finalBalance - initialBalance;
        const bestMonthIndex = balances.length ? balances.indexOf(Math.max(...balances)) : 0;
        return {
            today, months, labels, balances, incomes, expenses, initialBalance, finalBalance,
            totalIncome: incomes.reduce((sum, value) => sum + value, 0),
            totalExpense: expenses.reduce((sum, value) => sum + value, 0),
            balanceDelta,
            averageMonthlyDelta: balanceDelta / 12,
            bestMonth: labels[bestMonthIndex] || '',
            negativeMonths: balances.filter(balance => balance < 0).length,
            source: hasPlannedRecurring
                ? { mode: 'planned-recurring', count: new Set(syntheticRecurring.map(tx => tx.ruleId)).size }
                : hasLegacyRecurring
                    ? { mode: 'legacy-recurring', count: legacyRecurring.length }
                    : average.countedMonths
                        ? { mode: 'history', count: average.countedMonths }
                        : { mode: 'none', count: 0 }
        };
    }

    function dispose() {
        if (!projectionChart) return;
        try { projectionChart.dispose(); } catch (_) {}
        projectionChart = null;
    }

    const api = { buildProjectionModel, dispose, localDateString };
    root.PlannkeProjection = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

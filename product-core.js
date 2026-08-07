(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.PlannkeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const DAY_MS = 86400000;

    function toNumber(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function cleanText(value, max = 160) {
        return String(value ?? '')
            .replace(/[\u0000-\u001F\u007F]+/g, ' ')
            .replace(/[<>]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, max);
    }

    function safeId(value, prefix = 'id') {
        const raw = String(value ?? '').trim().replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 100);
        if (raw) return raw;
        if (globalThis.crypto?.randomUUID) return `_${globalThis.crypto.randomUUID()}`;
        return `_${prefix}_${Math.random().toString(36).slice(2, 11)}`;
    }

    function localDateString(date = new Date()) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function parseISO(dateStr) {
        const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return null;
        const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        if (date.getFullYear() !== Number(m[1]) || date.getMonth() !== Number(m[2]) - 1 || date.getDate() !== Number(m[3])) return null;
        return date;
    }

    function lastDayOfMonth(dateStr) {
        const date = parseISO(dateStr) || new Date();
        return localDateString(new Date(date.getFullYear(), date.getMonth() + 1, 0));
    }

    function addDays(dateStr, days) {
        const date = parseISO(dateStr);
        if (!date) return dateStr;
        date.setDate(date.getDate() + days);
        return localDateString(date);
    }

    function daysBetween(start, end) {
        const a = parseISO(start);
        const b = parseISO(end);
        if (!a || !b) return 0;
        return Math.max(0, Math.round((b - a) / DAY_MS));
    }

    function clampDateDay(year, monthIndex, day) {
        const last = new Date(year, monthIndex + 1, 0).getDate();
        return localDateString(new Date(year, monthIndex, Math.min(Math.max(Number(day) || 1, 1), last)));
    }

    function hasPlanningContent(planning) {
        const p = planning || {};
        return ['goals', 'reserves', 'recurringRules', 'categoryRules'].some(key => Array.isArray(p[key]) && p[key].length > 0) || !!p.onboardingComplete;
    }

    function ensurePlanning(data) {
        const out = data && typeof data === 'object' ? data : {};
        const savedPlanning = out.settings?.productState?.planning;
        const source = (!hasPlanningContent(out.planning) && savedPlanning && typeof savedPlanning === 'object')
            ? savedPlanning
            : (out.planning && typeof out.planning === 'object' ? out.planning : {});
        out.planning = {
            goals: Array.isArray(source.goals) ? source.goals : [],
            reserves: Array.isArray(source.reserves) ? source.reserves : [],
            recurringRules: Array.isArray(source.recurringRules) ? source.recurringRules : [],
            categoryRules: Array.isArray(source.categoryRules) ? source.categoryRules : [],
            onboardingComplete: !!source.onboardingComplete
        };
        return out.planning;
    }

    function transactionEffect(tx, accountId) {
        if (!tx || !accountId) return 0;
        const amount = Math.abs(toNumber(tx.amount, 0));
        let effect = 0;
        if (tx.accountId === accountId) {
            if (tx.type === 'income') effect += amount;
            else if (tx.type === 'expense' || tx.type === 'transfer') effect -= amount;
        }
        if (tx.type === 'transfer' && tx.destinationId === accountId) effect += amount;
        return effect;
    }

    function normalizeStatuses(data, today = localDateString()) {
        (data.transactions || []).forEach(tx => {
            if (tx.status !== 'planned' && tx.status !== 'completed') {
                tx.status = String(tx.date || '') > today ? 'planned' : 'completed';
            }
        });
        return data;
    }

    function recomputeAccountBalances(data) {
        const txs = Array.isArray(data.transactions) ? data.transactions : [];
        (data.accounts || []).forEach(account => {
            const opening = toNumber(account.openingBalance, toNumber(account.balance, 0));
            account.openingBalance = opening;
            const ledger = txs
                .filter(tx => tx.status !== 'planned')
                .reduce((sum, tx) => sum + transactionEffect(tx, account.id), 0);
            account.balance = opening + ledger;
        });
        return data;
    }

    function sanitizePlanning(planning) {
        const p = planning || {};
        return {
            onboardingComplete: !!p.onboardingComplete,
            goals: (p.goals || []).map(g => ({
                id: safeId(g.id, 'goal'),
                name: cleanText(g.name, 100),
                targetAmount: Math.max(0, toNumber(g.targetAmount, 0)),
                currentAmount: Math.max(0, toNumber(g.currentAmount, 0)),
                targetDate: parseISO(g.targetDate) ? g.targetDate : ''
            })).filter(g => g.name && g.targetAmount > 0),
            reserves: (p.reserves || []).map(r => ({
                id: safeId(r.id, 'reserve'),
                name: cleanText(r.name, 100),
                amount: Math.max(0, toNumber(r.amount, 0))
            })).filter(r => r.name && r.amount > 0),
            recurringRules: (p.recurringRules || []).map(r => ({
                id: safeId(r.id, 'rule'),
                type: r.type === 'income' ? 'income' : 'expense',
                description: cleanText(r.description, 160),
                category: cleanText(r.category || 'Outros', 100),
                amount: Math.max(0, toNumber(r.amount, 0)),
                dayOfMonth: Math.min(Math.max(parseInt(r.dayOfMonth, 10) || 1, 1), 31),
                accountId: safeId(r.accountId || '', 'account'),
                startDate: parseISO(r.startDate) ? r.startDate : localDateString(),
                endDate: parseISO(r.endDate) ? r.endDate : '',
                active: r.active !== false
            })).filter(r => r.description && r.amount > 0 && r.accountId),
            categoryRules: (p.categoryRules || []).map(r => ({
                id: safeId(r.id, 'catrule'),
                contains: cleanText(r.contains, 100).toLowerCase(),
                category: cleanText(r.category, 100)
            })).filter(r => r.contains && r.category)
        };
    }

    function restoreProductState(data) {
        const state = data?.settings?.productState;
        if (!state || typeof state !== 'object') return false;
        let changed = false;
        const openings = state.openingBalances && typeof state.openingBalances === 'object' ? state.openingBalances : {};
        const meta = state.transactionMeta && typeof state.transactionMeta === 'object' ? state.transactionMeta : {};

        (data.accounts || []).forEach(account => {
            if (!Number.isFinite(Number(account.openingBalance)) && Number.isFinite(Number(openings[account.id]))) {
                account.openingBalance = Number(openings[account.id]);
                changed = true;
            }
        });

        (data.transactions || []).forEach(tx => {
            const saved = meta[tx.id];
            if (!saved || typeof saved !== 'object') return;
            if (tx.status !== 'planned' && tx.status !== 'completed' && ['planned', 'completed'].includes(saved.status)) {
                tx.status = saved.status;
                changed = true;
            }
            if ((!Array.isArray(tx.tags) || !tx.tags.length) && Array.isArray(saved.tags)) {
                tx.tags = saved.tags.map(tag => cleanText(tag, 40)).filter(Boolean).slice(0, 10);
                changed = true;
            }
        });

        if (!hasPlanningContent(data.planning) && state.planning) {
            data.planning = sanitizePlanning(state.planning);
            changed = true;
        }
        return changed;
    }

    function snapshotProductState(data) {
        if (!data || typeof data !== 'object') return data;
        if (!data.settings || typeof data.settings !== 'object') data.settings = {};
        const openingBalances = {};
        (data.accounts || []).forEach(account => {
            if (Number.isFinite(Number(account.openingBalance))) openingBalances[account.id] = Number(account.openingBalance);
        });
        const transactionMeta = {};
        (data.transactions || []).forEach(tx => {
            transactionMeta[tx.id] = {
                status: tx.status === 'planned' ? 'planned' : 'completed',
                tags: Array.isArray(tx.tags) ? tx.tags.map(tag => cleanText(tag, 40)).filter(Boolean).slice(0, 10) : []
            };
        });
        data.planning = sanitizePlanning(ensurePlanning(data));
        data.settings.productState = {
            version: 1,
            planning: data.planning,
            openingBalances,
            transactionMeta
        };
        return data;
    }

    function migrateLedger(data, today = localDateString()) {
        if (!data || typeof data !== 'object') return { data, changed: false };
        let changed = restoreProductState(data);
        ensurePlanning(data);
        const txs = Array.isArray(data.transactions) ? data.transactions : [];

        (data.accounts || []).forEach(account => {
            if (!Number.isFinite(Number(account.openingBalance))) {
                const allLegacyEffects = txs.reduce((sum, tx) => sum + transactionEffect(tx, account.id), 0);
                account.openingBalance = toNumber(account.balance, 0) - allLegacyEffects;
                changed = true;
            }
        });

        txs.forEach(tx => {
            if (tx.status !== 'planned' && tx.status !== 'completed') {
                tx.status = String(tx.date || '') > today ? 'planned' : 'completed';
                changed = true;
            }
            if (!Array.isArray(tx.tags)) tx.tags = [];
        });

        const before = (data.accounts || []).map(a => Number(a.balance));
        recomputeAccountBalances(data);
        if ((data.accounts || []).some((a, i) => Math.abs(Number(a.balance) - before[i]) > 0.005)) changed = true;
        snapshotProductState(data);

        return { data, changed };
    }

    function billingPeriod(dateStr, closingDay) {
        const d = parseISO(dateStr);
        if (!d) return '';
        if (d.getDate() > Number(closingDay || 1)) {
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }
        const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
        return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    }

    function outstandingCardBalance(data, cardId) {
        const card = (data.cards || []).find(c => c.id === cardId);
        if (!card) return 0;
        return (data.transactions || [])
            .filter(tx => tx.accountId === cardId && tx.type === 'expense')
            .filter(tx => {
                const period = billingPeriod(tx.date, card.closingDay);
                const billing = (data.cardBillings || []).find(b => b.cardId === cardId && b.period === period);
                return !billing?.isPaid;
            })
            .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount, 0)), 0);
    }

    function recurringOccurrences(rules, fromDate, toDate) {
        const start = parseISO(fromDate);
        const end = parseISO(toDate);
        if (!start || !end || end < start) return [];
        const out = [];
        const safeRules = sanitizePlanning({ recurringRules: rules }).recurringRules;

        safeRules.filter(r => r.active).forEach(rule => {
            const ruleStart = parseISO(rule.startDate) || start;
            const ruleEnd = rule.endDate ? parseISO(rule.endDate) : null;
            let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
            const limit = new Date(end.getFullYear(), end.getMonth(), 1);
            while (cursor <= limit) {
                const dateStr = clampDateDay(cursor.getFullYear(), cursor.getMonth(), rule.dayOfMonth);
                const occurrence = parseISO(dateStr);
                if (occurrence >= start && occurrence <= end && occurrence >= ruleStart && (!ruleEnd || occurrence <= ruleEnd)) {
                    out.push({
                        id: `_rec_${rule.id}_${dateStr}`,
                        ruleId: rule.id,
                        type: rule.type,
                        description: rule.description,
                        category: rule.category,
                        amount: rule.amount,
                        date: dateStr,
                        accountId: rule.accountId,
                        status: 'planned',
                        synthetic: true
                    });
                }
                cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
            }
        });
        return out.sort((a, b) => a.date.localeCompare(b.date));
    }

    function applyCategoryRules(description, currentCategory, rules) {
        const desc = cleanText(description, 300).toLowerCase();
        if (!desc) return currentCategory || 'Outros';
        const safeRules = sanitizePlanning({ categoryRules: rules }).categoryRules;
        const match = safeRules.find(rule => desc.includes(rule.contains));
        return match ? match.category : (currentCategory || 'Outros');
    }

    function nextPlannedIncome(data, today) {
        const planning = ensurePlanning(data);
        const monthAhead = addDays(today, 62);
        const recurring = recurringOccurrences(planning.recurringRules, addDays(today, 1), monthAhead)
            .filter(x => x.type === 'income');
        const txs = (data.transactions || [])
            .filter(tx => tx.type === 'income' && tx.status === 'planned' && tx.date > today)
            .map(tx => ({ ...tx }));
        return [...txs, ...recurring].sort((a, b) => a.date.localeCompare(b.date))[0] || null;
    }

    function getFinancialPulse(data, today = localDateString()) {
        ensurePlanning(data);
        const planning = sanitizePlanning(data.planning);
        const bankIds = new Set((data.accounts || []).map(a => a.id));
        const balance = (data.accounts || []).reduce((sum, a) => sum + toNumber(a.balance, 0), 0);
        const cardCommitted = (data.cards || []).reduce((sum, card) => sum + outstandingCardBalance(data, card.id), 0);
        const reserved = planning.reserves.reduce((s, r) => s + r.amount, 0) + planning.goals.reduce((s, g) => s + g.currentAmount, 0);

        const nextIncome = nextPlannedIncome(data, today);
        const horizon = nextIncome?.date || lastDayOfMonth(today);
        const recurring = recurringOccurrences(planning.recurringRules, addDays(today, 1), horizon);

        const plannedBankExpenses = (data.transactions || [])
            .filter(tx => tx.status === 'planned' && tx.type === 'expense' && bankIds.has(tx.accountId) && tx.date > today && tx.date <= horizon)
            .reduce((sum, tx) => sum + Math.abs(toNumber(tx.amount, 0)), 0);
        const plannedRecurringExpenses = recurring
            .filter(tx => tx.type === 'expense' && bankIds.has(tx.accountId))
            .reduce((sum, tx) => sum + tx.amount, 0);

        const committed = cardCommitted + reserved + plannedBankExpenses + plannedRecurringExpenses;
        const free = balance - committed;
        const days = Math.max(1, daysBetween(today, horizon));
        const daily = free > 0 ? free / days : 0;

        return {
            balance,
            committed,
            free,
            daily,
            days,
            horizon,
            nextIncome,
            cardCommitted,
            reserved,
            plannedBankExpenses: plannedBankExpenses + plannedRecurringExpenses
        };
    }

    function buildFinancialCalendar(data, fromDate, toDate) {
        const planning = ensurePlanning(data);
        const real = (data.transactions || [])
            .filter(tx => tx.status === 'planned' && tx.date >= fromDate && tx.date <= toDate)
            .map(tx => ({ ...tx, synthetic: false }));
        const recurring = recurringOccurrences(planning.recurringRules, fromDate, toDate);
        return [...real, ...recurring].sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));
    }

    function detectDelimiter(line) {
        const candidates = [';', ',', '\t'];
        return candidates.sort((a, b) => (line.split(b).length - line.split(a).length))[0];
    }

    function splitCsvLine(line, delimiter) {
        const values = [];
        let current = '';
        let quoted = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (quoted && line[i + 1] === '"') { current += '"'; i++; }
                else quoted = !quoted;
            } else if (ch === delimiter && !quoted) {
                values.push(current.trim()); current = '';
            } else current += ch;
        }
        values.push(current.trim());
        return values;
    }

    function normalizeHeader(value) {
        return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function parseMoney(value) {
        let s = String(value ?? '').trim().replace(/R\$/gi, '').replace(/\s/g, '');
        if (!s) return 0;
        if (s.includes(',') && s.includes('.')) {
            if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
            else s = s.replace(/,/g, '');
        } else if (s.includes(',')) s = s.replace(',', '.');
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
    }

    function normalizeImportedDate(value) {
        const raw = String(value || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && parseISO(raw)) return raw;
        const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
        if (br) {
            const y = Number(br[3]) < 100 ? 2000 + Number(br[3]) : Number(br[3]);
            const m = Number(br[2]);
            const d = Number(br[1]);
            const candidate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            if (parseISO(candidate)) return candidate;
        }
        const compact = raw.match(/^(\d{4})(\d{2})(\d{2})/);
        if (compact) {
            const candidate = `${compact[1]}-${compact[2]}-${compact[3]}`;
            if (parseISO(candidate)) return candidate;
        }
        return '';
    }

    function parseCsvBank(text, accountId, categoryRules = []) {
        const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return [];
        const delimiter = detectDelimiter(lines[0]);
        const headers = splitCsvLine(lines[0], delimiter).map(normalizeHeader);
        const indexOf = names => headers.findIndex(h => names.includes(h));
        const dateIdx = indexOf(['data', 'date', 'datatransacao', 'dtmovimento', 'lancamento']);
        const descIdx = indexOf(['descricao', 'historico', 'memo', 'nome', 'description', 'estabelecimento']);
        const amountIdx = indexOf(['valor', 'amount', 'valorlancamento', 'quantia']);
        const debitIdx = indexOf(['debito', 'debit']);
        const creditIdx = indexOf(['credito', 'credit']);
        if (dateIdx < 0 || descIdx < 0 || (amountIdx < 0 && debitIdx < 0 && creditIdx < 0)) return [];

        const out = [];
        lines.slice(1).forEach((line, rowIndex) => {
            const cols = splitCsvLine(line, delimiter);
            const date = normalizeImportedDate(cols[dateIdx]);
            const description = cleanText(cols[descIdx], 300);
            let signed = amountIdx >= 0 ? parseMoney(cols[amountIdx]) : 0;
            if (amountIdx < 0) signed = Math.abs(parseMoney(cols[creditIdx])) - Math.abs(parseMoney(cols[debitIdx]));
            if (!date || !description || !signed) return;
            const type = signed >= 0 ? 'income' : 'expense';
            const category = applyCategoryRules(description, type === 'income' ? 'Outros' : 'Outros', categoryRules);
            out.push({
                id: `_csv_${safeId(`${date}_${rowIndex}_${Math.abs(signed)}`, 'row')}`,
                type,
                description,
                category,
                amount: Math.abs(signed),
                date,
                accountId,
                destinationId: null,
                currentInstallment: 1,
                totalInstallments: 1,
                groupId: null,
                recurring: false,
                status: date > localDateString() ? 'planned' : 'completed',
                importFingerprint: `csv|${accountId}|${date}|${description.toLowerCase()}|${signed.toFixed(2)}`
            });
        });
        return out;
    }

    function ofxValue(block, tag) {
        const match = block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i'));
        return match ? match[1].trim() : '';
    }

    function parseOfxBank(text, accountId, categoryRules = []) {
        const source = String(text || '');
        const blocks = source.match(/<STMTTRN>[\s\S]*?(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST>))/gi) || [];
        return blocks.map((block, index) => {
            const signed = parseMoney(ofxValue(block, 'TRNAMT'));
            const date = normalizeImportedDate(ofxValue(block, 'DTPOSTED').slice(0, 8));
            const description = cleanText(ofxValue(block, 'NAME') || ofxValue(block, 'MEMO') || 'Lançamento bancário', 300);
            const fitid = cleanText(ofxValue(block, 'FITID'), 100);
            const type = signed >= 0 ? 'income' : 'expense';
            if (!signed || !date) return null;
            return {
                id: `_ofx_${safeId(fitid || `${date}_${index}_${Math.abs(signed)}`, 'row')}`,
                type,
                description,
                category: applyCategoryRules(description, 'Outros', categoryRules),
                amount: Math.abs(signed),
                date,
                accountId,
                destinationId: null,
                currentInstallment: 1,
                totalInstallments: 1,
                groupId: null,
                recurring: false,
                status: date > localDateString() ? 'planned' : 'completed',
                importFingerprint: `ofx|${accountId}|${fitid || `${date}|${signed.toFixed(2)}|${description.toLowerCase()}`}`
            };
        }).filter(Boolean);
    }

    function dedupeImported(existing, incoming) {
        const fingerprints = new Set((existing || []).map(tx => tx.importFingerprint).filter(Boolean));
        const heuristic = new Set((existing || []).map(tx => `${tx.accountId}|${tx.date}|${tx.type}|${Number(tx.amount).toFixed(2)}|${String(tx.description).toLowerCase()}`));
        return (incoming || []).filter(tx => {
            if (tx.importFingerprint && fingerprints.has(tx.importFingerprint)) return false;
            const key = `${tx.accountId}|${tx.date}|${tx.type}|${Number(tx.amount).toFixed(2)}|${String(tx.description).toLowerCase()}`;
            if (heuristic.has(key)) return false;
            if (tx.importFingerprint) fingerprints.add(tx.importFingerprint);
            heuristic.add(key);
            return true;
        });
    }

    return {
        DAY_MS,
        toNumber,
        cleanText,
        safeId,
        localDateString,
        parseISO,
        lastDayOfMonth,
        addDays,
        daysBetween,
        ensurePlanning,
        sanitizePlanning,
        transactionEffect,
        normalizeStatuses,
        recomputeAccountBalances,
        restoreProductState,
        snapshotProductState,
        migrateLedger,
        billingPeriod,
        outstandingCardBalance,
        recurringOccurrences,
        applyCategoryRules,
        getFinancialPulse,
        buildFinancialCalendar,
        parseCsvBank,
        parseOfxBank,
        dedupeImported
    };
});

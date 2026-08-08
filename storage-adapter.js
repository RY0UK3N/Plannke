/**
 * Plannke — StorageAdapter
 *
 * Persistence boundary for the desktop-app architecture. The financial/domain
 * layer keeps a synchronous in-memory getData()/saveData() surface, while the
 * backend contract may load and persist asynchronously. This is intentional:
 * SQLite/Tauri can replace LocalStorageAdapter without changing finance code.
 */
(function (root) {
    'use strict';

    const STORAGE_VERSION = 1;
    const DATA_KEY = 'plannke:data:v1';
    const SNAPSHOT_KEY = 'plannke:snapshots:v1';
    const LEGACY_AUTOSAVE_KEY = 'planner_autosave';
    const LEGACY_SESSION_KEY = 'planner_session_cache';
    const MAX_SNAPSHOTS = 5;
    const SNAPSHOT_COOLDOWN_MS = 5 * 60 * 1000;
    const DAILY_SNAPSHOT_MS = 24 * 60 * 60 * 1000;

    function clone(value) {
        if (typeof structuredClone === 'function') return structuredClone(value);
        return JSON.parse(JSON.stringify(value));
    }

    function safeParse(raw) {
        if (!raw || typeof raw !== 'string') return null;
        try { return JSON.parse(raw); } catch (_) { return null; }
    }

    function normalize(value) {
        if (typeof root.normalizeData === 'function') return root.normalizeData(value);
        return value && typeof value === 'object' ? clone(value) : null;
    }

    function collectionSize(value) {
        if (Array.isArray(value)) return value.length;
        if (value && typeof value === 'object') return Object.keys(value).length;
        return 0;
    }

    function recoveryFootprint(data) {
        const source = data && typeof data === 'object' ? data : {};
        const planning = source.planning && typeof source.planning === 'object' ? source.planning : {};
        const settings = source.settings && typeof source.settings === 'object' ? source.settings : {};
        const household = settings.household && typeof settings.household === 'object' ? settings.household : {};
        return {
            accounts: collectionSize(source.accounts),
            cards: collectionSize(source.cards),
            transactions: collectionSize(source.transactions),
            cardBillings: collectionSize(source.cardBillings),
            recurringRules: collectionSize(planning.recurringRules),
            goals: collectionSize(planning.goals),
            reserves: collectionSize(planning.reserves),
            categoryRules: collectionSize(planning.categoryRules),
            householdMembers: collectionSize(household.members),
            sharedTransactionMeta: collectionSize(settings.sharedTransactionMeta)
        };
    }

    function hasMeaningfulData(data) {
        return Object.values(recoveryFootprint(data)).some(size => size > 0);
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function makeId(prefix) {
        if (root.crypto?.randomUUID) return `${prefix}_${root.crypto.randomUUID()}`;
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }

    class LocalStorageAdapter {
        constructor(storage) {
            this.storage = storage;
            this.kind = 'localStorage';
        }

        _read(key) {
            try { return this.storage?.getItem(key) || null; } catch (_) { return null; }
        }

        _write(key, value) {
            if (!this.storage) throw new Error('Persistência local indisponível.');
            this.storage.setItem(key, value);
        }

        _mirrorLegacy(data) {
            try { this._write(LEGACY_AUTOSAVE_KEY, JSON.stringify(data)); }
            catch (error) {
                // Compatibility mirroring must never make the primary save fail.
                console.warn('Espelho legado de autosave indisponível:', error);
            }
        }

        async load() {
            const envelope = safeParse(this._read(DATA_KEY));
            if (envelope?.version === STORAGE_VERSION && envelope.data) {
                return { data: envelope.data, source: 'adapter', savedAt: envelope.savedAt || null };
            }

            const legacyAutosave = safeParse(this._read(LEGACY_AUTOSAVE_KEY));
            if (legacyAutosave && typeof legacyAutosave === 'object') {
                return { data: legacyAutosave, source: 'legacy-localStorage', savedAt: null };
            }

            let legacySession = null;
            try { legacySession = safeParse(root.sessionStorage?.getItem(LEGACY_SESSION_KEY)); } catch (_) {}
            if (legacySession && typeof legacySession === 'object') {
                return { data: legacySession, source: 'legacy-sessionStorage', savedAt: null };
            }

            return { data: null, source: 'empty', savedAt: null };
        }

        async save(data) {
            const envelope = {
                version: STORAGE_VERSION,
                savedAt: nowIso(),
                data
            };
            // This write is synchronous today, even though the method intentionally
            // exposes a Promise-compatible contract for the future SQLite backend.
            this._write(DATA_KEY, JSON.stringify(envelope));
            this._mirrorLegacy(data);
            return { savedAt: envelope.savedAt };
        }

        saveNow(data) {
            const envelope = {
                version: STORAGE_VERSION,
                savedAt: nowIso(),
                data
            };
            this._write(DATA_KEY, JSON.stringify(envelope));
            this._mirrorLegacy(data);
            return envelope.savedAt;
        }

        listSnapshots() {
            const parsed = safeParse(this._read(SNAPSHOT_KEY));
            if (!Array.isArray(parsed)) return [];
            return parsed.filter(item => item && item.id && item.data).slice(0, MAX_SNAPSHOTS);
        }

        createSnapshot(data, reason = 'manual') {
            const snapshots = this.listSnapshots();
            const entry = {
                id: makeId('snapshot'),
                createdAt: nowIso(),
                reason: String(reason || 'manual').slice(0, 80),
                data: clone(data)
            };
            snapshots.unshift(entry);
            this._write(SNAPSHOT_KEY, JSON.stringify(snapshots.slice(0, MAX_SNAPSHOTS)));
            return clone(entry);
        }
    }

    class StorageCoordinator {
        constructor(adapter, fallbackData) {
            this.adapter = adapter;
            this.data = normalize(fallbackData) || {};
            this.initialized = false;
            this.initializePromise = null;
            this.lifecycleInstalled = false;
            this.saveQueue = Promise.resolve();
            this.lastSavedAt = null;
            this.lastError = null;
            this.source = 'fallback';
        }

        initialize() {
            if (this.initialized) return Promise.resolve(this.getStatus());
            if (this.initializePromise) return this.initializePromise;

            this.initializePromise = Promise.resolve(this.adapter.load())
                .then(loaded => {
                    const next = normalize(loaded?.data) || normalize(this.data) || {};
                    this.data = next;
                    this.source = loaded?.source || 'empty';
                    this.lastSavedAt = loaded?.savedAt || null;
                    this.initialized = true;
                    return this.adapter.save(clone(this.data));
                })
                .then(result => {
                    this.lastSavedAt = result?.savedAt || nowIso();
                    this.lastError = null;
                    this._emit('saved');
                    return this.getStatus();
                })
                .catch(error => {
                    // Keep the normalized in-memory fallback usable even if durable
                    // storage is unavailable. The UI receives an explicit error state.
                    this.initialized = true;
                    this.lastError = error;
                    this._emit('error', error);
                    console.error('Falha ao inicializar persistência do Plannke:', error);
                    return this.getStatus();
                });

            return this.initializePromise;
        }

        getData() {
            return clone(this.data);
        }

        saveData(nextData) {
            const normalized = normalize(nextData) || {};

            if (!this.initialized) {
                // Normal UI boot waits for `ready`; this is a defensive path for a
                // caller that writes during bootstrap. Preserve the write in memory
                // and persist it immediately after initialization completes.
                this.data = normalized;
                this.initialize().then(() => this.saveData(normalized));
                return clone(this.data);
            }

            const previous = this.data;
            this._snapshotBeforeRiskyChange(previous, normalized);
            this._snapshotDaily(previous);
            this.data = normalized;
            this.lastError = null;
            this._emit('saving');

            const payload = clone(this.data);
            this.saveQueue = this.saveQueue
                .catch(() => undefined)
                .then(() => this.adapter.save(payload))
                .then(result => {
                    this.lastSavedAt = result?.savedAt || nowIso();
                    this._emit('saved');
                    return result;
                })
                .catch(error => {
                    this.lastError = error;
                    this._emit('error', error);
                    console.error('Falha ao salvar dados do Plannke:', error);
                });

            try {
                if (typeof root._markDataDirty === 'function') root._markDataDirty();
                else if (typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') {
                    root.dispatchEvent(new root.CustomEvent('plannke:data-changed'));
                }
            } catch (_) {}

            return clone(this.data);
        }

        createSnapshot(reason = 'manual') {
            if (!hasMeaningfulData(this.data)) return null;
            return this.adapter.createSnapshot(this.data, reason);
        }

        listSnapshots() {
            return this.adapter.listSnapshots().map(item => ({
                id: item.id,
                createdAt: item.createdAt,
                reason: item.reason
            }));
        }

        restoreSnapshot(id) {
            const snapshots = this.adapter.listSnapshots();
            const snapshot = snapshots.find(item => item.id === id);
            if (!snapshot) throw new Error('Ponto de recuperação não encontrado.');
            const beforeRestore = this.createSnapshot('before-restore');
            const restored = normalize(snapshot.data) || {};
            this.data = restored;
            const savedNow = this._saveNowIfSupported(this.data);
            if (!savedNow) this.saveData(this.data);
            this._emit('saved');
            try {
                if (typeof root._markDataDirty === 'function') root._markDataDirty();
            } catch (_) {}
            return { data: this.getData(), safetySnapshotId: beforeRestore?.id || null };
        }

        flush() {
            if (!this.initialized) return this.initialize();
            this._saveNowIfSupported(this.data);
            return this.saveQueue.catch(() => undefined);
        }

        installLifecycleHandlers() {
            if (this.lifecycleInstalled) return;
            this.lifecycleInstalled = true;
            if (typeof root.addEventListener === 'function') {
                root.addEventListener('pagehide', () => { this.flush(); });
            }
            if (root.document?.addEventListener) {
                root.document.addEventListener('visibilitychange', () => {
                    if (root.document.visibilityState === 'hidden') this.flush();
                });
            }
        }

        getStatus() {
            return {
                backend: this.adapter.kind,
                initialized: this.initialized,
                source: this.source,
                savedAt: this.lastSavedAt,
                error: this.lastError ? String(this.lastError.message || this.lastError) : null
            };
        }

        _saveNowIfSupported(data) {
            if (typeof this.adapter.saveNow !== 'function') return null;
            try {
                const savedAt = this.adapter.saveNow(clone(data));
                this.lastSavedAt = savedAt || nowIso();
                return this.lastSavedAt;
            } catch (error) {
                this.lastError = error;
                this._emit('error', error);
                return null;
            }
        }

        _snapshotBeforeRiskyChange(previous, next) {
            if (!hasMeaningfulData(previous)) return;
            const before = recoveryFootprint(previous);
            const after = recoveryFootprint(next);
            const destructive = Object.keys(before).some(key => after[key] < before[key]);
            const txGrowth = after.transactions - before.transactions;
            if (destructive) this._createSnapshotThrottled(previous, 'before-destructive-change');
            else if (txGrowth >= 5) this._createSnapshotThrottled(previous, 'before-bulk-change');
        }

        _snapshotDaily(previous) {
            if (!hasMeaningfulData(previous)) return;
            try {
                const latest = this.adapter.listSnapshots()[0];
                const latestTime = latest?.createdAt ? new Date(latest.createdAt).getTime() : 0;
                if (!latestTime || Date.now() - latestTime >= DAILY_SNAPSHOT_MS) {
                    this.adapter.createSnapshot(previous, 'daily');
                }
            } catch (error) {
                // Recovery history must never block the primary financial save.
                console.warn('Ponto diário de recuperação indisponível:', error);
            }
        }

        _createSnapshotThrottled(data, reason) {
            try {
                const latest = this.adapter.listSnapshots()[0];
                if (latest?.reason === reason && latest.createdAt) {
                    const age = Date.now() - new Date(latest.createdAt).getTime();
                    if (Number.isFinite(age) && age < SNAPSHOT_COOLDOWN_MS) return null;
                }
                return this.adapter.createSnapshot(data, reason);
            } catch (error) {
                console.warn('Não foi possível criar ponto de recuperação:', error);
                return null;
            }
        }

        _emit(state, error = null) {
            if (typeof root.dispatchEvent !== 'function' || typeof root.CustomEvent !== 'function') return;
            try {
                root.dispatchEvent(new root.CustomEvent('plannke:storage-status', {
                    detail: {
                        state,
                        backend: this.adapter.kind,
                        savedAt: this.lastSavedAt,
                        error: error ? String(error.message || error) : null
                    }
                }));
            } catch (_) {}
        }
    }

    const legacyGetData = typeof root.getData === 'function' ? root.getData.bind(root) : () => ({});
    let fallback;
    try { fallback = legacyGetData(); } catch (_) { fallback = {}; }

    const adapter = new LocalStorageAdapter(root.localStorage);
    const coordinator = new StorageCoordinator(adapter, fallback);

    // Compatibility surface: finance code remains synchronous against the
    // in-memory cache. ui-bridge waits for `ready` before running initApp().
    root.getData = function () { return coordinator.getData(); };
    root.saveData = function (data) { return coordinator.saveData(data); };
    root.loadFromLocalStorage = function () { return coordinator.initialize(); };
    root.setupBeforeUnload = function () { coordinator.installLifecycleHandlers(); };
    root.checkImportPrompt = function () {};

    coordinator.installLifecycleHandlers();
    const ready = coordinator.initialize();
    const api = {
        version: STORAGE_VERSION,
        backend: adapter.kind,
        initialize: () => coordinator.initialize(),
        getStatus: () => coordinator.getStatus(),
        flush: () => coordinator.flush(),
        createSnapshot: reason => coordinator.createSnapshot(reason),
        listSnapshots: () => coordinator.listSnapshots(),
        restoreSnapshot: id => coordinator.restoreSnapshot(id),
        LocalStorageAdapter,
        StorageCoordinator,
        ready
    };

    root.PlannkeStorage = Object.freeze(api);
})(globalThis);

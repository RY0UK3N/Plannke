/**
 * Plannke — StorageAdapter
 *
 * Transitional persistence layer for the desktop-app architecture.
 * The finance/domain layer keeps using getData()/saveData(), while this file
 * owns the runtime cache, durable browser persistence, migration and recovery
 * snapshots. A future SQLite adapter can replace LocalStorageAdapter without
 * changing the financial features.
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

    function hasMeaningfulData(data) {
        if (!data || typeof data !== 'object') return false;
        return !!((data.accounts?.length || 0) + (data.cards?.length || 0) + (data.transactions?.length || 0));
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

        load() {
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

        save(data) {
            const envelope = {
                version: STORAGE_VERSION,
                savedAt: nowIso(),
                data
            };
            const serialized = JSON.stringify(envelope);
            this._write(DATA_KEY, serialized);

            // Temporary rollback bridge while browser preview and desktop runtime coexist.
            // All legacy mirroring is centralized here and can be removed with SQLite.
            this._write(LEGACY_AUTOSAVE_KEY, JSON.stringify(data));
            return Promise.resolve({ savedAt: envelope.savedAt });
        }

        saveNow(data) {
            const envelope = {
                version: STORAGE_VERSION,
                savedAt: nowIso(),
                data
            };
            this._write(DATA_KEY, JSON.stringify(envelope));
            this._write(LEGACY_AUTOSAVE_KEY, JSON.stringify(data));
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

        replaceSnapshots(snapshots) {
            this._write(SNAPSHOT_KEY, JSON.stringify((snapshots || []).slice(0, MAX_SNAPSHOTS)));
        }
    }

    class StorageCoordinator {
        constructor(adapter, fallbackData) {
            this.adapter = adapter;
            this.data = normalize(fallbackData) || {};
            this.initialized = false;
            this.lifecycleInstalled = false;
            this.saveQueue = Promise.resolve();
            this.lastSavedAt = null;
            this.lastError = null;
            this.source = 'fallback';
        }

        initialize() {
            if (this.initialized) return this.getStatus();
            const loaded = this.adapter.load();
            const next = normalize(loaded.data) || normalize(this.data) || {};
            this.data = next;
            this.source = loaded.source;
            this.lastSavedAt = loaded.savedAt;
            this.initialized = true;

            // Persist the normalized form immediately, which also migrates legacy data.
            try {
                this.adapter.saveNow(this.data);
                this.lastSavedAt = nowIso();
                this._emit('saved');
            } catch (error) {
                this.lastError = error;
                this._emit('error', error);
            }
            return this.getStatus();
        }

        getData() {
            if (!this.initialized) this.initialize();
            return clone(this.data);
        }

        saveData(nextData) {
            if (!this.initialized) this.initialize();
            const normalized = normalize(nextData) || {};
            const previous = this.data;
            this._snapshotBeforeRiskyChange(previous, normalized);
            this._snapshotDaily(previous);
            this.data = normalized;
            this.lastError = null;
            this._emit('saving');

            let write;
            try {
                // LocalStorageAdapter performs the durable write synchronously before
                // returning its promise. This keeps today's browser runtime safe while
                // preserving an async-shaped contract for the future SQLite adapter.
                write = this.adapter.save(this.data);
            } catch (error) {
                this.lastError = error;
                this._emit('error', error);
                throw error;
            }

            this.saveQueue = this.saveQueue
                .catch(() => undefined)
                .then(() => write)
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
            if (!this.initialized) this.initialize();
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
            this.adapter.saveNow(this.data);
            this.lastSavedAt = nowIso();
            this._emit('saved');
            try {
                if (typeof root._markDataDirty === 'function') root._markDataDirty();
            } catch (_) {}
            return { data: this.getData(), safetySnapshotId: beforeRestore?.id || null };
        }

        flush() {
            if (!this.initialized) return Promise.resolve();
            try {
                this.adapter.saveNow(this.data);
                this.lastSavedAt = nowIso();
            } catch (error) {
                this.lastError = error;
                this._emit('error', error);
            }
            return this.saveQueue.catch(() => undefined);
        }

        installLifecycleHandlers() {
            if (this.lifecycleInstalled || typeof root.addEventListener !== 'function') return;
            this.lifecycleInstalled = true;
            root.addEventListener('pagehide', () => { this.flush(); });
            root.addEventListener('visibilitychange', () => {
                if (root.document?.visibilityState === 'hidden') this.flush();
            });
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

        _snapshotBeforeRiskyChange(previous, next) {
            if (!hasMeaningfulData(previous)) return;
            const accountDrop = (next.accounts?.length || 0) < (previous.accounts?.length || 0);
            const cardDrop = (next.cards?.length || 0) < (previous.cards?.length || 0);
            const txDrop = (next.transactions?.length || 0) < (previous.transactions?.length || 0);
            const txGrowth = (next.transactions?.length || 0) - (previous.transactions?.length || 0);
            if (accountDrop || cardDrop || txDrop) this._createSnapshotThrottled(previous, 'before-destructive-change');
            else if (txGrowth >= 5) this._createSnapshotThrottled(previous, 'before-bulk-change');
        }

        _snapshotDaily(previous) {
            if (!hasMeaningfulData(previous)) return;
            const latest = this.adapter.listSnapshots()[0];
            const latestTime = latest?.createdAt ? new Date(latest.createdAt).getTime() : 0;
            if (!latestTime || Date.now() - latestTime >= DAILY_SNAPSHOT_MS) {
                this.adapter.createSnapshot(previous, 'daily');
            }
        }

        _createSnapshotThrottled(data, reason) {
            const latest = this.adapter.listSnapshots()[0];
            if (latest?.reason === reason && latest.createdAt) {
                const age = Date.now() - new Date(latest.createdAt).getTime();
                if (Number.isFinite(age) && age < SNAPSHOT_COOLDOWN_MS) return null;
            }
            try { return this.adapter.createSnapshot(data, reason); }
            catch (error) {
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
    coordinator.initialize();
    coordinator.installLifecycleHandlers();

    // Compatibility surface: the domain layer stays synchronous for this PR.
    // Persistence itself is already isolated behind the adapter contract.
    root.getData = function () { return coordinator.getData(); };
    root.saveData = function (data) { return coordinator.saveData(data); };

    // app.js still calls these boot hooks; they now delegate instead of touching
    // localStorage/sessionStorage directly.
    root.loadFromLocalStorage = function () { return coordinator.initialize(); };
    root.setupBeforeUnload = function () { coordinator.installLifecycleHandlers(); };

    root.PlannkeStorage = Object.freeze({
        version: STORAGE_VERSION,
        backend: adapter.kind,
        initialize: () => coordinator.initialize(),
        getStatus: () => coordinator.getStatus(),
        flush: () => coordinator.flush(),
        createSnapshot: reason => coordinator.createSnapshot(reason),
        listSnapshots: () => coordinator.listSnapshots(),
        restoreSnapshot: id => coordinator.restoreSnapshot(id),
        LocalStorageAdapter,
        StorageCoordinator
    });
})(globalThis);

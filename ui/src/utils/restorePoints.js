/**
 * Restore points: copies of the workspace kept inside the browser, so that a
 * deletion, a reset or an overwriting import can be taken back.
 *
 * They live in a database of their own (not the workspace's), in two stores:
 *
 *   points      small description of each point — shown in lists
 *   snapshots   the workspace itself, read only when one is restored
 *
 * The storage is a small backend object so tests (and a browser without
 * IndexedDB) can swap it out.
 */

const DB_NAME = 'CMNeumenRestorePoints';
const DB_VERSION = 1;

/** How many restore points are kept; the oldest automatic ones go first. */
export const MAX_POINTS = 8;

let backend = null;

export function useBackend(next) {
    backend = next;
}

// --- IndexedDB backend ---------------------------------------------------

function openDb() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('This browser does not allow local storage for restore points.'));
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('points')) db.createObjectStore('points', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots');
        };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => db.close();
            resolve(db);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('The restore-point database is blocked by another tab.'));
    });
}

function idbBackend() {
    let dbPromise = null;
    const db = () => {
        if (!dbPromise) dbPromise = openDb().catch((e) => { dbPromise = null; throw e; });
        return dbPromise;
    };
    const wrap = (request) => new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    const done = (tx) => new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('The restore point could not be saved (storage may be full).'));
    });
    return {
        async put(point, snapshot) {
            const tx = (await db()).transaction(['points', 'snapshots'], 'readwrite');
            tx.objectStore('points').put(point);
            tx.objectStore('snapshots').put(snapshot, point.id);
            await done(tx);
        },
        async listPoints() {
            const tx = (await db()).transaction('points', 'readonly');
            return wrap(tx.objectStore('points').getAll());
        },
        async getSnapshot(id) {
            const tx = (await db()).transaction('snapshots', 'readonly');
            return wrap(tx.objectStore('snapshots').get(id));
        },
        async remove(id) {
            const tx = (await db()).transaction(['points', 'snapshots'], 'readwrite');
            tx.objectStore('points').delete(id);
            tx.objectStore('snapshots').delete(id);
            await done(tx);
        },
        async clear() {
            const tx = (await db()).transaction(['points', 'snapshots'], 'readwrite');
            tx.objectStore('points').clear();
            tx.objectStore('snapshots').clear();
            await done(tx);
        }
    };
}

/** A backend that keeps everything in memory. For tests. */
export function memoryBackend() {
    const points = new Map();
    const snapshots = new Map();
    return {
        async put(point, snapshot) { points.set(point.id, point); snapshots.set(point.id, snapshot); },
        async listPoints() { return Array.from(points.values()); },
        async getSnapshot(id) { return snapshots.get(id); },
        async remove(id) { points.delete(id); snapshots.delete(id); },
        async clear() { points.clear(); snapshots.clear(); }
    };
}

const current = () => {
    if (!backend) backend = idbBackend();
    return backend;
};

// --- API -----------------------------------------------------------------

let counter = 0;
const newId = () => `rp_${Date.now().toString(36)}_${(counter++).toString(36)}`;

/**
 * Keep a copy of a workspace.
 * @param {object} snapshot a captured workspace (see workspaceSnapshot)
 * @param {{ label: string, auto?: boolean, summary?: string }} info
 * @returns {Promise<object>} the stored point's description
 */
export async function saveRestorePoint(snapshot, { label, auto = false, summary = '' }) {
    const point = {
        id: newId(),
        createdAt: new Date().toISOString(),
        label,
        auto,
        summary,
        bytes: approximateBytes(snapshot)
    };
    await current().put(point, snapshot);
    await prune();
    return point;
}

/** @returns {Promise<object[]>} descriptions of the kept points, newest first */
export async function listRestorePoints() {
    const points = await current().listPoints();
    return points.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

/** @returns {Promise<object|undefined>} the workspace stored in a point */
export function loadRestorePoint(id) {
    return current().getSnapshot(id);
}

export function deleteRestorePoint(id) {
    return current().remove(id);
}

export function clearRestorePoints() {
    return current().clear();
}

/** Drop the oldest points beyond MAX_POINTS, automatic ones before manual ones. */
async function prune() {
    const points = await listRestorePoints();
    const excess = points.length - MAX_POINTS;
    if (excess <= 0) return;
    const oldestFirst = [...points].reverse();
    const victims = [...oldestFirst.filter(p => p.auto), ...oldestFirst.filter(p => !p.auto)].slice(0, excess);
    for (const p of victims) await current().remove(p.id);
}

/** A rough size, for showing "2.4 MB" next to a point. */
export function approximateBytes(value) {
    try { return JSON.stringify(value).length; } catch { return 0; }
}

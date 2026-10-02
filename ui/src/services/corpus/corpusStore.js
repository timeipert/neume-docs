/**
 * Where the loaded corpus lives: the browser's IndexedDB, in a database of its
 * own so it can be dropped without touching the workspace (annotations, tables).
 *
 * Two stores, both keyed by source name:
 *
 *   catalog      small record per source — metadata, document list, pattern
 *                counts, folios. All of it is read at startup.
 *   occurrences  the big one — every pattern's positions. Read per source, on
 *                demand, when a view needs to show where a pattern occurs.
 *
 * Usable from the main thread and from the import worker.
 */

const DB_NAME = 'CMNeumenCorpus';
const DB_VERSION = 1;
const CATALOG = 'catalog';
const OCCURRENCES = 'occurrences';

let dbPromise = null;

function openDb() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(CATALOG)) db.createObjectStore(CATALOG, { keyPath: 'name' });
                if (!db.objectStoreNames.contains(OCCURRENCES)) db.createObjectStore(OCCURRENCES, { keyPath: 'name' });
            };
            request.onsuccess = () => {
                const db = request.result;
                db.onversionchange = () => { db.close(); dbPromise = null; };
                resolve(db);
            };
            request.onerror = () => { dbPromise = null; reject(request.error); };
            request.onblocked = () => { dbPromise = null; reject(new Error('The corpus database is blocked by another tab.')); };
        });
    }
    return dbPromise;
}

function transaction(stores, mode, work) {
    return openDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(stores, mode);
        let result;
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
        result = work(tx);
    }));
}

function requestPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * The catalog record: everything about a source except where its patterns occur.
 * @param {object} result a source as produced by readCorpus
 */
export function toCatalogRecord(result, importedAt = new Date().toISOString()) {
    return {
        name: result.name,
        meta: result.meta,
        documents: result.documents,
        counts: result.counts,
        folios: result.folios,
        images: result.images || [],
        clefs: result.clefs,
        skippedDocuments: result.skippedDocuments,
        importedAt
    };
}

/** Store (or replace) one source. */
export async function saveSource(result) {
    const record = toCatalogRecord(result);
    await transaction([CATALOG, OCCURRENCES], 'readwrite', (tx) => {
        tx.objectStore(CATALOG).put(record);
        tx.objectStore(OCCURRENCES).put({ name: result.name, patterns: result.patterns });
    });
    return record;
}

/** @returns {Promise<object[]>} every source's catalog record */
export async function loadCatalog() {
    const db = await openDb();
    const tx = db.transaction(CATALOG, 'readonly');
    return requestPromise(tx.objectStore(CATALOG).getAll());
}

/** @returns {Promise<Object<string, Array>|null>} pattern -> positions, for one source */
export async function loadOccurrences(name) {
    const db = await openDb();
    const tx = db.transaction(OCCURRENCES, 'readonly');
    const row = await requestPromise(tx.objectStore(OCCURRENCES).get(name));
    return row ? row.patterns : null;
}

export async function deleteSource(name) {
    await transaction([CATALOG, OCCURRENCES], 'readwrite', (tx) => {
        tx.objectStore(CATALOG).delete(name);
        tx.objectStore(OCCURRENCES).delete(name);
    });
}

export async function clearCorpus() {
    await transaction([CATALOG, OCCURRENCES], 'readwrite', (tx) => {
        tx.objectStore(CATALOG).clear();
        tx.objectStore(OCCURRENCES).clear();
    });
}

/**
 * Snippet pictures kept in this browser.
 *
 * A snippet is a cut-out of a page on a library's IIIF server. The server is asked every time the
 * picture is shown, and busy libraries answer slowly or not at all. A reader can save the pictures of a
 * documentation once (Pictures → Save); from then on they are shown from the browser's own storage
 * (IndexedDB), without asking the server, and they stay until the reader clears them.
 *
 * A picture can only be saved when its server lets other websites read it (CORS). A server that does not
 * is reported as a failure and the picture keeps being loaded from the server as before.
 *
 * The storage is handed in (`store`), so the logic can be tested without a browser.
 */
import { alternativeUrls } from './iiifUrls';
import { waitTurn } from './imageQueue';

const DB_NAME = 'neumedocs-pictures';
const STORE = 'pictures';

/** The browser's storage: one record per address, `{ url, blob, savedAt }`. Null where there is no IndexedDB. */
function openDb() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise((resolve) => {
        let request;
        try { request = indexedDB.open(DB_NAME, 1); } catch { resolve(null); return; }
        request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'url' });
        request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
    });
}

const ask = (request) => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });

/** @returns {Promise<{ get: Function, put: Function, keys: Function, clear: Function, size: Function } | null>} */
export async function browserStore() {
    const db = await openDb();
    if (!db) return null;
    const tx = (mode) => db.transaction(STORE, mode).objectStore(STORE);
    return {
        get: (url) => ask(tx('readonly').get(url)),
        put: (record) => ask(tx('readwrite').put(record)),
        keys: () => ask(tx('readonly').getAllKeys()),
        clear: () => ask(tx('readwrite').clear()),
        /** the bytes held, and how many pictures */
        async size() {
            const all = await ask(tx('readonly').getAll());
            return { count: all.length, bytes: all.reduce((n, r) => n + (r.blob ? r.blob.size : 0), 0) };
        }
    };
}

let sharedStore = null;
const storeOnce = () => (sharedStore || (sharedStore = browserStore()));

// ---- reading -------------------------------------------------------------------------------------

const objectUrls = new Map(); // address -> blob: address, so a picture shown twice is read once

/** The saved picture for an address, as an address a picture element can show; null when it is not saved. */
export async function savedPicture(url, { store } = {}) {
    if (!url) return null;
    if (objectUrls.has(url)) return objectUrls.get(url);
    const s = store || await storeOnce();
    if (!s) return null;
    let record = null;
    try { record = await s.get(url); } catch { return null; }
    if (!record || !record.blob) return null;
    const local = URL.createObjectURL(record.blob);
    objectUrls.set(url, local);
    return local;
}

/** The saved picture itself, for putting it in a file; null when it is not saved. */
export async function savedBlob(url, { store } = {}) {
    const s = store || await storeOnce();
    if (!s) return null;
    try {
        const record = await s.get(url);
        return record && record.blob ? record.blob : null;
    } catch {
        return null;
    }
}

/** Which of these addresses are saved. */
export async function savedAmong(urls, { store } = {}) {
    const s = store || await storeOnce();
    if (!s) return new Set();
    const have = new Set(await s.keys());
    return new Set(urls.filter(u => have.has(u)));
}

export async function pictureStorage({ store } = {}) {
    const s = store || await storeOnce();
    return s ? s.size() : { count: 0, bytes: 0 };
}

/** Forget every saved picture. */
export async function clearPictures({ store } = {}) {
    const s = store || await storeOnce();
    if (s) await s.clear();
    for (const local of objectUrls.values()) URL.revokeObjectURL(local);
    objectUrls.clear();
}

// ---- saving --------------------------------------------------------------------------------------

/**
 * Fetch one picture and keep it.
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
export async function savePicture(url, { store, fetchFn = (...a) => fetch(...a) } = {}) {
    const s = store || await storeOnce();
    if (!s) return { ok: false, reason: 'This browser has no storage for pictures.' };
    // The address as it is, then the same picture asked for another way (see alternativeUrls). A busy server
    // (429, 503) is not asked again at once: that would only make it busier.
    let failure = null;
    for (const address of [url, ...alternativeUrls(url)]) {
        let response;
        try {
            response = await fetchFn(address, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
        } catch {
            return { ok: false, reason: 'The server did not answer, or does not let other websites read its pictures.' };
        }
        if (!response.ok) {
            failure = { ok: false, reason: response.status === 429 || response.status === 503 ? `The server is busy (${response.status}); try again later.` : `The server refused it (${response.status}).` };
            if (response.status === 429 || response.status === 503) return failure;
            continue;
        }
        const blob = await response.blob();
        if (!/^image\//.test(blob.type) || !blob.size) { failure = { ok: false, reason: 'The server did not send a picture.' }; continue; }
        try {
            await s.put({ url, blob, savedAt: Date.now() });
        } catch {
            return { ok: false, reason: 'The browser had no room to keep it.' };
        }
        return { ok: true };
    }
    return failure || { ok: false, reason: 'The server did not send a picture.' };
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Save many pictures, a few at a time per server, those already saved skipped, each tried a second time
 * after a pause when it fails (a busy server).
 *
 * @param {string[]} urls
 * @param {{ onProgress?: (p: { done: number, total: number, saved: number, skipped: number, failed: number }) => void,
 *           signal?: AbortSignal, retryPause?: number, store?: object, fetchFn?: Function, limit?: number }} [options]
 * @returns {Promise<{ total: number, saved: number, skipped: number, failures: Array<{ url: string, reason: string }>, stopped: boolean }>}
 */
export async function savePictures(urls, { onProgress = () => {}, signal, retryPause = 1500, store, fetchFn, limit } = {}) {
    const s = store || await storeOnce();
    const list = [...new Set(urls.filter(Boolean))];
    const have = s ? await savedAmong(list, { store: s }) : new Set();
    const progress = { done: 0, total: list.length, saved: 0, skipped: 0, failed: 0 };
    const failures = [];
    const report = () => onProgress({ ...progress });
    report();

    async function one(url) {
        if (have.has(url)) { progress.skipped++; progress.done++; report(); return; }
        const release = await waitTurn(url, limit ? { limit } : {});
        try {
            if (signal && signal.aborted) return;
            let result = await savePicture(url, { store: s, fetchFn });
            if (!result.ok && !(signal && signal.aborted)) {
                await wait(retryPause);
                result = await savePicture(url, { store: s, fetchFn });
            }
            if (result.ok) progress.saved++;
            else { progress.failed++; failures.push({ url, reason: result.reason }); }
            progress.done++;
            report();
        } finally {
            release();
        }
    }
    await Promise.all(list.map(one));
    return { total: list.length, saved: progress.saved, skipped: progress.skipped, failures, stopped: !!(signal && signal.aborted) };
}

/** A size for people: 1.4 MB. */
export function sizeText(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

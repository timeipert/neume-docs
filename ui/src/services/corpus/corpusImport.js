/**
 * Main-thread side of the corpus import: turns whatever the user picked or
 * dropped into a flat list of candidate files, and runs the import worker.
 */

const WANTED = /\.(json|monodijson|zip)$/i;

/** Only these can hold transcriptions; a project folder is mostly scans and PDFs. */
function isCandidate(path) {
    return WANTED.test(path) && !path.split('/').some(seg => seg.startsWith('.') || seg === '__MACOSX');
}

/**
 * Candidate files from an <input type="file"> — plain files, or a whole folder
 * (`webkitdirectory`).
 * @param {FileList|File[]} fileList
 * @returns {Array<{file: File, path: string}>}
 */
export function collectFromFileList(fileList) {
    const out = [];
    for (const file of Array.from(fileList || [])) {
        const path = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
        if (isCandidate(path)) out.push({ file, path });
    }
    return out;
}

function readEntries(reader) {
    return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

async function walkEntry(entry, out) {
    if (entry.isFile) {
        const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
        const path = entry.fullPath.replace(/^\/+/, '');
        if (isCandidate(path)) out.push({ file, path });
    } else if (entry.isDirectory) {
        const reader = entry.createReader();
        // readEntries hands back at most ~100 entries per call.
        for (;;) {
            const batch = await readEntries(reader);
            if (batch.length === 0) break;
            for (const child of batch) await walkEntry(child, out);
        }
    }
}

/**
 * Candidate files from a drop, including dropped folders.
 *
 * The entries have to be taken from the DataTransfer synchronously — it is
 * emptied once the event handler yields — and walked afterwards.
 *
 * @param {DataTransfer} dataTransfer
 */
export async function collectFromDrop(dataTransfer) {
    const items = Array.from(dataTransfer.items || []);
    const entries = items
        .map(item => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
        .filter(Boolean);

    if (entries.length === 0) return collectFromFileList(dataTransfer.files);

    const out = [];
    for (const entry of entries) await walkEntry(entry, out);
    return out;
}

/**
 * Run an import in a worker.
 *
 * @param {Array<{file: File, path: string}>} items
 * @param {{ onProgress?: (e: object) => void, onSource?: (record: object) => void, skipSuffixes?: string[] }} [options]
 * @returns {{ promise: Promise<object>, abort: () => void }}
 */
export function runImport(items, options = {}) {
    const { onProgress = () => {}, onSource = () => {}, skipSuffixes } = options;
    const worker = new Worker(new URL('./corpus.worker.js', import.meta.url), { type: 'module' });

    const promise = new Promise((resolve, reject) => {
        worker.onmessage = (event) => {
            const msg = event.data;
            if (msg.type === 'progress') onProgress(msg);
            else if (msg.type === 'source') onSource(msg.record);
            else if (msg.type === 'done') { worker.terminate(); resolve(msg.summary); }
            else if (msg.type === 'error') { worker.terminate(); reject(new Error(msg.message)); }
        };
        worker.onerror = (event) => {
            worker.terminate();
            reject(new Error(event.message || 'The import worker failed.'));
        };
        worker.postMessage({ type: 'start', files: items, skipSuffixes });
    });

    return { promise, abort: () => worker.postMessage({ type: 'abort' }) };
}

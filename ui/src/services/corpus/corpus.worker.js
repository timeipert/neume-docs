/**
 * Import worker: reads the picked files, analyses them and writes each finished
 * source straight into IndexedDB, so the page stays responsive and the (large)
 * results never have to cross back to the main thread.
 *
 * Messages in:  { type: 'start', files: File[], skipSuffixes?: string[] }
 *               { type: 'abort' }
 * Messages out: { type: 'progress', ...event }
 *               { type: 'source', record }     catalog record of a stored source
 *               { type: 'done', summary }
 *               { type: 'error', message }
 */

import { readCorpus, toCorpusFile } from './corpusReader.js';
import { saveSource } from './corpusStore.js';

const signal = { aborted: false };

self.onmessage = async (event) => {
    const msg = event.data || {};

    if (msg.type === 'abort') {
        signal.aborted = true;
        return;
    }
    if (msg.type !== 'start') return;

    signal.aborted = false;
    try {
        const inputs = msg.files.map(item => toCorpusFile(item.file || item, item.path));
        const summary = await readCorpus(inputs, {
            signal,
            skipSuffixes: msg.skipSuffixes,
            onProgress: (p) => self.postMessage({ type: 'progress', ...p }),
            onSource: async (result) => {
                const record = await saveSource(result);
                self.postMessage({ type: 'source', record });
            }
        });
        self.postMessage({ type: 'done', summary: { ...summary, aborted: signal.aborted } });
    } catch (error) {
        self.postMessage({ type: 'error', message: error && error.message ? error.message : String(error) });
    }
};

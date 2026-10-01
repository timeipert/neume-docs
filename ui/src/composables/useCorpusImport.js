import { ref, computed } from 'vue';
import { runImport } from '../services/corpus/corpusImport';
import { DEFAULT_SKIPPED_SUFFIXES } from '../services/corpus/corpusReader';
import { useTranscriptionData } from './useTranscriptionData';

/**
 * The state of the running (or last) corpus import.
 *
 * Kept outside any component, so that leaving the Corpus page does not stop an
 * import and coming back shows where it stands.
 */

const phase = ref('idle'); // idle | collecting | importing | done | error
const progress = ref({ doneDocs: 0, totalDocs: 0, doneSources: 0, totalSources: 0, source: '', phase: '' });
const importedNow = ref([]);
const result = ref(null);
const errorMessage = ref('');

let current = null;

const busy = computed(() => phase.value === 'collecting' || phase.value === 'importing');

const percent = computed(() => {
    const p = progress.value;
    if (p.phase === 'json') return null;
    return p.totalDocs ? Math.min(100, Math.round((p.doneDocs / p.totalDocs) * 100)) : 0;
});

const statusLine = computed(() => {
    const p = progress.value;
    if (phase.value === 'collecting') return 'Looking through the selection…';
    if (p.phase === 'scan') return 'Unpacking and listing files…';
    if (p.phase === 'json') return `Reading ${p.file}…`;
    return `${p.source || '…'} — ${p.doneDocs} of ${p.totalDocs} documents, ${p.doneSources} of ${p.totalSources} sources`;
});

/**
 * @param {Array<{file: File, path: string}>} items
 * @param {{ skipWorkingCopies?: boolean }} [options]
 */
async function start(items, { skipWorkingCopies = true } = {}) {
    if (busy.value) return;
    const data = useTranscriptionData();

    errorMessage.value = '';
    result.value = null;
    importedNow.value = [];

    if (!items.length) {
        phase.value = 'error';
        errorMessage.value = 'No .monodijson, .json or .zip files found in that selection.';
        return;
    }

    phase.value = 'importing';
    progress.value = { doneDocs: 0, totalDocs: 0, doneSources: 0, totalSources: 0, source: '', phase: 'scan' };

    try {
        current = runImport(items, {
            skipSuffixes: skipWorkingCopies ? DEFAULT_SKIPPED_SUFFIXES : [],
            onProgress: (p) => { progress.value = { ...progress.value, ...p }; },
            onSource: (record) => { importedNow.value.push(record.name); }
        });
        result.value = await current.promise;
        await data.refresh();
        phase.value = 'done';
    } catch (e) {
        console.error(e);
        errorMessage.value = e.message || String(e);
        phase.value = 'error';
        await data.refresh();
    } finally {
        current = null;
    }
}

function cancel() {
    if (current) current.abort();
}

/** Forget the last result, e.g. after the corpus was cleared. */
function reset() {
    if (busy.value) return;
    phase.value = 'idle';
    result.value = null;
    errorMessage.value = '';
}

export function useCorpusImport() {
    return { phase, progress, importedNow, result, errorMessage, busy, percent, statusLine, start, cancel, reset };
}

import { computed, ref, unref, watch } from 'vue';
import { loadOccurrences, loadNoteOrder, loadNoteUuids } from '../services/corpus/corpusStore';
import { buildLineIndex } from '../services/exchange/linkAssistant';
import { folioInRange } from '../utils/projectData';
import { compareFolios } from '../utils/sorting';

/**
 * The neumes the transcription has on a line, in reading order, for the manuscript
 * of a project: what a line screenshot is marked against.
 *
 * Read once per manuscript and kept; a manuscript that was imported before the
 * reading order was stored has to be loaded again (`ready` is false).
 */
const cache = new Map(); // source -> Promise<index>

function indexOf(source) {
    if (!cache.has(source)) {
        cache.set(source, Promise.all([loadOccurrences(source), loadNoteUuids(source), loadNoteOrder(source)])
            .then(([occurrences, noteUuids, noteOrder]) => buildLineIndex(occurrences, noteUuids, noteOrder))
            .catch(() => ({ ready: false, lines: new Map(), byFolio: new Map() })));
    }
    return cache.get(source);
}

/** Forget what was read for a manuscript (it was imported again). */
export function forgetLineNeumes(source) {
    cache.delete(source);
}

/**
 * @param {import('vue').Ref<string>|string} sourceRef the manuscript
 * @param {import('vue').Ref<boolean>|boolean} availableRef whether the manuscript is in the loaded corpus
 */
export function useLineNeumes(sourceRef, availableRef = true) {
    const index = ref(null);

    watch(() => [unref(sourceRef), unref(availableRef)], async ([source, available]) => {
        index.value = null;
        if (!source || !available) return;
        const loaded = await indexOf(source);
        if (unref(sourceRef) === source) index.value = loaded;
    }, { immediate: true });

    const ready = computed(() => !!(index.value && index.value.ready));

    /** The neumes of one line, in reading order: [{ pattern, sysId, order }]. */
    function neumesFor(folio, line) {
        if (!ready.value || !folio || !line) return [];
        return index.value.lines.get(`${folio}|${line}`) || [];
    }

    /** The lines of the transcription in a range of folios: [{ folio, line, count }], in reading order. */
    function linesInRange(from = '', to = '') {
        if (!ready.value) return [];
        const out = [];
        for (const [key, neumes] of index.value.lines) {
            const [folio, line] = key.split('|');
            if (folioInRange(folio, from, to)) out.push({ folio, line, count: neumes.length });
        }
        return out.sort((a, b) => compareFolios(a.folio, b.folio) || Number(a.line) - Number(b.line));
    }

    return { ready, loading: computed(() => index.value === null), neumesFor, linesInRange };
}

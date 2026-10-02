import { ref, shallowRef, computed } from 'vue';
import { buildIndex, suggest, search } from '../services/mmmo/matching';

/**
 * The MMMO catalogue (Medieval Music Manuscripts Online, https://musmed.eu), as
 * collected by scripts/crawl-mmmo.mjs into src/data/mmmo/sources.json.
 *
 * The file is optional: it is third-party data that each installation collects
 * for itself. Without it everything here reports "not available" and the rest of
 * the editor works as before. When present it is loaded on first use, as a chunk
 * of its own, so it costs nothing until a page asks for it.
 */
const files = import.meta.glob('../data/mmmo/sources.json', { import: 'default' });

const status = ref('idle'); // 'idle' | 'loading' | 'ready' | 'missing' | 'error'
const info = ref({ count: 0, withManifest: 0, collectedAt: '', source: '' });
const index = shallowRef(null);
let loading = null;

export const MMMO_NAME = 'MMMO Database';
export const MMMO_URL = 'https://musmed.eu';

async function load() {
    if (status.value === 'ready' || status.value === 'missing') return status.value;
    if (loading) return loading;
    const loader = Object.values(files)[0];
    if (!loader) {
        status.value = 'missing';
        return status.value;
    }
    status.value = 'loading';
    loading = loader().then((data) => {
        const sources = Array.isArray(data?.sources) ? data.sources : [];
        index.value = buildIndex(sources);
        info.value = {
            count: sources.length,
            withManifest: sources.filter(s => s.manifest).length,
            checked: sources.filter(s => s.checked).length,
            collectedAt: data?.collectedAt || '',
            source: data?.source || ''
        };
        status.value = sources.length ? 'ready' : 'missing';
        return status.value;
    }).catch((e) => {
        console.error('Could not read the MMMO catalogue', e);
        status.value = 'error';
        return status.value;
    }).finally(() => { loading = null; });
    return loading;
}

/** What the metadata table calls a manuscript's catalogue fields, as a matching query. */
export function queryFromSource(source, metaOf) {
    return {
        siglum: metaOf(source, 'cantus_siglum') || source,
        city: metaOf(source, 'bibliotheksort'),
        library: metaOf(source, 'bibliothek'),
        shelfmark: metaOf(source, 'bibliothekssignatur'),
        origin: metaOf(source, 'herkunftsort'),
        date: metaOf(source, 'datierung') || metaOf(source, 'jahrhundert') || metaOf(source, 'cantus_century')
    };
}

export function useMmmo() {
    return {
        status,
        info,
        ready: computed(() => status.value === 'ready'),
        load,
        /** Candidates for a manuscript, best first. Empty until the catalogue is loaded. */
        suggest: (query, options) => (index.value ? suggest(index.value, query, options) : []),
        /** Words in any field. */
        search: (text, options) => (index.value ? search(index.value, text, options) : [])
    };
}

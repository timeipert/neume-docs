import { ref, shallowRef, computed } from 'vue';
import { useIiifStore } from '../stores/iiif';
import { GLYPHS } from '../data/glyphs';
import {
    loadCatalog,
    loadOccurrences,
    deleteSource,
    clearCorpus
} from '../services/corpus/corpusStore';

/**
 * The loaded corpus, as the rest of the app sees it.
 *
 * There is no data baked into the app: everything here comes from what the user
 * imported (see services/corpus). The shape deliberately stays what the views
 * already consume — `patStats`, `sourceFolios`, `rawData`, … — so they work the
 * same on any corpus, from a single manuscript to the whole Corpus Monodicum.
 *
 * Reading is split in two. The *catalog* (counts, folios, metadata of every
 * source) is small and is read once, at startup. A source's *occurrences*
 * (where each pattern stands) are read per source by `loadSource`.
 */

const catalog = shallowRef({}); // { [source]: catalog record }

const rawData = shallowRef({}); // { source: { pattern: [[doc, folio, line, syllable, notes], ...] } }
const pagePatternsIndex = shallowRef({}); // { source: { folio: [patterns] } }
const folioLinesIndex = shallowRef({}); // { source: { folio: [lines] } }
const loadedSources = ref(new Set());

const loading = ref(true);
const error = ref(null);

const glyphs = shallowRef(GLYPHS);

let initPromise = null;

const patStats = computed(() => {
    const stats = {};
    for (const record of Object.values(catalog.value)) {
        for (const [pattern, count] of Object.entries(record.counts || {})) {
            if (!stats[pattern]) stats[pattern] = { count: 0, length: pattern.length };
            stats[pattern].count += count;
        }
    }
    return stats;
});

/** The most often any one pattern occurs in a single source. */
const overallMax = computed(() => {
    let max = 0;
    for (const record of Object.values(catalog.value)) {
        for (const count of Object.values(record.counts || {})) {
            if (count > max) max = count;
        }
    }
    return max;
});

const sourceFolios = computed(() => {
    const out = {};
    for (const [name, record] of Object.entries(catalog.value)) {
        out[name] = new Set(record.folios || []);
    }
    return out;
});

const manifests = computed(() => {
    const out = {};
    for (const [name, record] of Object.entries(catalog.value)) {
        const url = record.meta && record.meta.manifest;
        if (url) out[name] = { url };
    }
    return out;
});

/** Catalogue metadata per source, under the keys the source filters use. */
const sourceMeta = computed(() => {
    const out = {};
    for (const [name, record] of Object.entries(catalog.value)) {
        const m = record.meta || {};
        const entry = {
            siglum: m.quellensigle || name,
            region: m.herkunftsregion,
            place: m.herkunftsort,
            institution: m.herkunftsinstitution,
            tradition: m.ordenstradition,
            type: m.quellentyp,
            libraryPlace: m.bibliotheksort,
            library: m.bibliothek,
            shelfmark: m.bibliothekssignatur,
            date: m.datierung,
            century: m.jahrhundert
        };
        out[name] = Object.fromEntries(Object.entries(entry).filter(([, v]) => v));
    }
    return out;
});

/** Every document of every source, with its source name attached. */
const documents = computed(() => {
    const out = [];
    for (const [name, record] of Object.entries(catalog.value)) {
        for (const d of record.documents || []) {
            out.push({
                sourceId: name,
                documentId: d.dokumenten_id || d.id || '',
                initium: d.textinitium || '',
                feast: d.festtag || '',
                occasion: d.feier || '',
                genre1: d.gattung1 || '',
                genre2: d.gattung2 || '',
                folioStart: d.foliostart || '',
                lineStart: d.zeilenstart || ''
            });
        }
    }
    return out;
});

const sourceNames = computed(() => Object.keys(catalog.value).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
const hasCorpus = computed(() => sourceNames.value.length > 0);

/** What was imported, for the corpus page. */
const corpusSummary = computed(() => {
    let documentCount = 0;
    let occurrences = 0;
    let clefs = 0;
    for (const record of Object.values(catalog.value)) {
        documentCount += (record.documents || []).length;
        clefs += record.clefs || 0;
        for (const c of Object.values(record.counts || {})) occurrences += c;
    }
    return {
        sources: sourceNames.value.length,
        documents: documentCount,
        neumes: occurrences,
        patterns: Object.keys(patStats.value).length,
        clefs
    };
});

function forgetSource(name) {
    const drop = (map) => {
        if (!(name in map.value)) return;
        const next = { ...map.value };
        delete next[name];
        map.value = next;
    };
    drop(rawData);
    drop(pagePatternsIndex);
    drop(folioLinesIndex);
    loadedSources.value.delete(name);
}

/** (Re)read the catalog from the database, e.g. after an import. */
async function refresh() {
    try {
        const records = await loadCatalog();
        const next = {};
        for (const r of records) next[r.name] = r;

        // A source that was re-imported has new occurrences; drop the stale copy.
        for (const name of Object.keys(next)) {
            const before = catalog.value[name];
            if (before && before.importedAt !== next[name].importedAt) forgetSource(name);
        }
        for (const name of Object.keys(catalog.value)) {
            if (!next[name]) forgetSource(name);
        }

        const removed = Object.keys(catalog.value).filter(name => !next[name]);
        catalog.value = next;
        error.value = null;

        const iiif = useIiifStore();
        try {
            // Manifest addresses recorded on the sources
            if (Object.keys(manifests.value).length > 0) iiif.importFromDataManifests(manifests.value);
            // Page images named in the documents' metadata, for sources without a manifest
            for (const [name, record] of Object.entries(next)) {
                if (record.images && record.images.length) iiif.setFolioImages(name, record.images);
                else iiif.clearFolioImages(name);
            }
            for (const name of removed) iiif.clearFolioImages(name);
        } catch (e) {
            console.warn('Could not register the IIIF images of the corpus:', e);
        }
    } catch (e) {
        console.error(e);
        error.value = e;
    } finally {
        loading.value = false;
    }
}

async function loadSource(sourceName) {
    if (!sourceName) return;
    if (loadedSources.value.has(sourceName)) return;
    if (!catalog.value[sourceName]) return;

    try {
        const sourceData = await loadOccurrences(sourceName);
        if (!sourceData) return;

        const pPats = {};
        const fLines = {};

        for (const [pat, occs] of Object.entries(sourceData)) {
            for (const occ of occs) {
                const fol = occ[1];
                const line = occ[2];

                if (!pPats[fol]) pPats[fol] = [];
                pPats[fol].push(pat);

                if (!fLines[fol]) fLines[fol] = new Set();
                fLines[fol].add(line);
            }
        }

        for (const fol of Object.keys(pPats)) {
            pPats[fol] = Array.from(new Set(pPats[fol])).sort();
            fLines[fol] = Array.from(fLines[fol]).sort((a, b) => a - b);
        }

        rawData.value = { ...rawData.value, [sourceName]: sourceData };
        pagePatternsIndex.value = { ...pagePatternsIndex.value, [sourceName]: pPats };
        folioLinesIndex.value = { ...folioLinesIndex.value, [sourceName]: fLines };

        loadedSources.value.add(sourceName);
    } catch (e) {
        console.error(e);
    }
}

async function removeSource(name) {
    await deleteSource(name);
    await refresh();
}

async function clearAll() {
    await clearCorpus();
    rawData.value = {};
    pagePatternsIndex.value = {};
    folioLinesIndex.value = {};
    loadedSources.value = new Set();
    await refresh();
}

function api() {
    return {
        rawData,
        sourceFolios,
        pagePatternsIndex,
        folioLinesIndex,
        patStats,
        glyphs,
        manifests,
        documents,
        sourceMeta,
        sourceNames,
        hasCorpus,
        corpusSummary,
        overallMax,
        loading,
        error,
        loadSource,
        loadedSources,
        refresh,
        removeSource,
        clearAll,
        catalog
    };
}

/** Resolves, with the same API, once the stored corpus has been read. */
export async function corpusReady() {
    if (!initPromise) initPromise = refresh();
    await initPromise;
    return api();
}

export function useTranscriptionData() {
    if (!initPromise) {
        initPromise = refresh();
    }
    return api();
}


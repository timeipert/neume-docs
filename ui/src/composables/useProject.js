import { computed, effectScope, inject, unref, watch } from 'vue';
import { useProjectsStore } from '../stores/projects';
import { useAnnotationsStore } from '../stores/annotations';
import { useDirectSnippetsStore } from '../stores/directSnippets';
import { useIiifStore } from '../stores/iiif';
import { useSettingsStore } from '../stores/settings';
import { getBaseCode } from '../utils/patternCode';
import { useTranscriptionData } from './useTranscriptionData';
import { usePatternCatalog } from './usePatternCatalog';
import { buildLibrary, filledCount, tableCodes } from '../utils/projectTable';
import { collectOccurrences, collectSnippets, collectionSnippets, foliosInRange } from '../utils/projectData';
import { compareFolios } from '../utils/sorting';

/** Whether pages can be shown for a manuscript: a manifest is linked, or its pages are known. */
export function hasIiif(iiif, source) {
    return !!(source && (iiif.links[source] || iiif.parsedData[source] || iiif.folioImageSources[source]));
}

/** The key under which the project's frame hands its context to the tabs. */
export const PROJECT_CONTEXT = Symbol('project');

/** The context of the project whose tab this is (see ProjectShellView). */
export function useProjectContext() {
    const context = inject(PROJECT_CONTEXT, null);
    if (!context) throw new Error('useProjectContext() needs to be used inside a project.');
    return context;
}

/** The snippets of a project by code: from its folios, or from its collection of screenshots. */
export function projectSnippets(p, { annotations, direct }) {
    if (p.images === 'screenshots') return collectionSnippets(p.collectionId ? direct.getCollection(p.collectionId) : null);
    return collectSnippets({
        source: p.source, from: p.from, to: p.to,
        annotations: annotations.annotations, regions: annotations.regions, regionItems: annotations.regionItems
    });
}

let sharedLibrary = null;

/**
 * The pattern library arranged as the two levels of the project table. Built once
 * and shared; the codes every project already uses are part of it, so a code that
 * left the library (a deleted variant) still has its column.
 */
export function useProjectLibrary() {
    if (!sharedLibrary) {
        sharedLibrary = effectScope(true).run(() => {
            const { freq, allCodes } = usePatternCatalog();
            const store = useProjectsStore();
            const settings = useSettingsStore();
            return computed(() => {
                // Code variants: a code the library derives from another by a sign of the project.
                const variants = new Map();
                for (const [base, list] of Object.entries(settings.codeVariants || {})) {
                    for (const v of list || []) {
                        if (v && v.code) variants.set(getBaseCode(v.code), { base: getBaseCode(base), label: v.label || '', id: v.id || '' });
                    }
                }
                return buildLibrary(
                    [...allCodes.value, ...store.projects.flatMap(p => [...p.columns, ...p.extended])],
                    freq.value,
                    { variants }
                );
            });
        });
    }
    return sharedLibrary;
}

/**
 * One project and what it looks at: the transcription of its folios, the
 * snippets drawn on them, the progress of its table.
 *
 * @param {import('vue').Ref<string>|string} idRef the project's id
 */
export function useProject(idRef) {
    const store = useProjectsStore();
    const annotations = useAnnotationsStore();
    const direct = useDirectSnippetsStore();
    const iiif = useIiifStore();
    const { rawData, loadSource, catalog, glyphs } = useTranscriptionData();
    const { freq } = usePatternCatalog();
    const library = useProjectLibrary();

    const project = computed(() => store.get(unref(idRef)));
    const record = computed(() => (project.value ? catalog.value[project.value.source] || null : null));
    /** The manuscript is in the loaded corpus, so its transcription is there to use. */
    const hasTranscription = computed(() => !!record.value);
    const iiifAvailable = computed(() => !!project.value && hasIiif(iiif, project.value.source));

    watch(
        () => [project.value && project.value.source, hasTranscription.value, project.value && project.value.images],
        ([source, inCorpus, images]) => {
            if (source && inCorpus) loadSource(source);
            if (source && images === 'iiif') iiif.ensureLoaded(source);
        },
        { immediate: true }
    );

    const occurrences = computed(() => {
        const p = project.value;
        if (!p || !hasTranscription.value) return new Map();
        return collectOccurrences(rawData.value[p.source], p.from, p.to);
    });
    /** The neumes of the folios have been read (not just counted in the catalogue). */
    const occurrencesLoaded = computed(() => !!(project.value && rawData.value[project.value.source]));

    const collection = computed(() => {
        const p = project.value;
        return p && p.collectionId ? direct.getCollection(p.collectionId) : null;
    });

    const snippets = computed(() => (project.value ? projectSnippets(project.value, { annotations, direct }) : new Map()));

    const annotatedCounts = computed(() => new Map([...snippets.value].map(([code, list]) => [code, list.length])));
    const occurringCounts = computed(() => new Map([...occurrences.value].map(([code, o]) => [code, o.count])));

    /** Every folio the manuscript is known to have: from the corpus, else from its images. */
    const manuscriptFolios = computed(() => {
        const p = project.value;
        if (!p) return [];
        if (record.value && (record.value.folios || []).length) return [...record.value.folios].sort(compareFolios);
        const pages = iiif.parsedData[p.source] || [];
        return [...new Set(pages.map(c => c.folio).filter(Boolean))].sort(compareFolios);
    });
    const folios = computed(() => (project.value ? foliosInRange(manuscriptFolios.value, project.value.from, project.value.to) : []));

    const standardCodes = computed(() => (project.value ? tableCodes(project.value, 'standard') : []));
    const extendedCodes = computed(() => (project.value ? tableCodes(project.value, 'extended') : []));

    const progress = computed(() => ({
        columns: standardCodes.value.length,
        filled: filledCount(standardCodes.value, snippets.value),
        extended: extendedCodes.value.length - standardCodes.value.length,
        extendedFilled: filledCount(extendedCodes.value, snippets.value) - filledCount(standardCodes.value, snippets.value)
    }));

    /** The collection that holds a screenshot project's images, made when first needed. */
    function ensureCollection() {
        const p = project.value;
        if (!p || p.images !== 'screenshots') return null;
        const existing = p.collectionId && direct.getCollection(p.collectionId);
        if (existing) return existing;
        const made = direct.createCollection(p.source || p.name, p.name);
        store.update(p.id, { collectionId: made.id });
        return made;
    }

    return {
        project, record, library, freq, glyphs,
        hasTranscription, iiifAvailable, occurrences, occurrencesLoaded,
        collection, snippets, annotatedCounts, occurringCounts,
        manuscriptFolios, folios, standardCodes, extendedCodes, progress,
        ensureCollection
    };
}

/** The snippets of every project, by project and code (for the table of all manuscripts). */
export function useAllProjectSnippets() {
    const store = useProjectsStore();
    const annotations = useAnnotationsStore();
    const direct = useDirectSnippetsStore();
    return computed(() => new Map(store.projects.map(p => [p.id, projectSnippets(p, { annotations, direct })])));
}

import { computed, effectScope } from 'vue';
import { useSettingsStore } from '../stores/settings';
import { usePatternLibraryStore } from '../stores/patternLibrary';
import { useTranscriptionData } from './useTranscriptionData';
import { blendFrequency, buildFrequency } from '../utils/neumeTable';
import { getBaseCode } from '../utils/patternCode';
import cmReference from '../data/cmReference.json';

/**
 * The pattern library as the neume table sees it: every pattern code the app
 * knows about, and how frequent each is.
 *
 * Codes come from four places — the Corpus Monodicum snapshot the app carries,
 * the corpus the user has imported, the project's code variants, and patterns
 * added by hand to the library. Frequencies are those of the corpus the user has
 * loaded; the snapshot only orders what that corpus cannot (Settings can ask for
 * the snapshot alone).
 *
 * Built once and shared: the pieces are lazy, so components that never read
 * them cost nothing.
 */

/** What the bundled snapshot covers, for display. */
export const CM_REFERENCE_INFO = {
    generatedAt: cmReference.generatedAt,
    sources: cmReference.sources,
    documents: cmReference.documents,
    neumes: cmReference.neumes,
    patterns: Object.keys(cmReference.patterns).length
};

const cmFrequency = buildFrequency(cmReference.patterns);

let shared = null;

function create() {
    const settings = useSettingsStore();
    const library = usePatternLibraryStore();
    const { patStats } = useTranscriptionData();

    const loadedFrequency = computed(() => buildFrequency(patStats.value));

    /**
     * How frequent each code is, for ordering: the corpus the user loaded, and the CM snapshot
     * for what that corpus cannot tell apart (see blendFrequency). The snapshot alone is a choice in Settings.
     */
    const freq = computed(() => (
        settings.frequencyBasis === 'snapshot'
            ? cmFrequency
            : blendFrequency(loadedFrequency.value, cmFrequency)
    ));

    /** Every code the library offers. */
    const allCodes = computed(() => {
        const set = new Set(Object.keys(cmReference.patterns));
        for (const code of Object.keys(patStats.value)) set.add(getBaseCode(code));
        for (const code of library.manualCodes()) set.add(code);
        for (const [base, variants] of Object.entries(settings.codeVariants || {})) {
            set.add(getBaseCode(base));
            for (const v of variants || []) if (v && v.code) set.add(getBaseCode(v.code));
        }
        set.delete('');
        return [...set];
    });

    return { freq, allCodes, cmFrequency, loadedFrequency };
}

export function usePatternCatalog() {
    if (!shared) {
        // Detached, so it outlives the component that happened to ask first.
        shared = effectScope(true).run(create);
    }
    return { ...shared, CM_REFERENCE_INFO };
}

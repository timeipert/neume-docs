import { computed, effectScope } from 'vue';
import { useSettingsStore } from '../stores/settings';
import { usePatternLibraryStore } from '../stores/patternLibrary';
import { useTranscriptionData } from './useTranscriptionData';
import { buildFrequency, withFallback } from '../utils/neumeTable';
import { getBaseCode } from '../utils/patternCode';
import cmReference from '../data/cmReference.json';

/**
 * The pattern library as the neume table sees it: every pattern code the app
 * knows about, and how frequent each is.
 *
 * Codes come from four places — the Corpus Monodicum snapshot the app carries,
 * the corpus the user has imported, the project's code variants, and patterns
 * added by hand to the library. Frequencies are those of the whole CM unless
 * the user asked (Settings) for the loaded corpus instead; the other source
 * fills in whatever the first has never seen.
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

    /** Frequency in the CM, per the user's choice of basis. */
    const freq = computed(() => (
        settings.frequencyBasis === 'loaded'
            ? withFallback(loadedFrequency.value, cmFrequency)
            : withFallback(cmFrequency, loadedFrequency.value)
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

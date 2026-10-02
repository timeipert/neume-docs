import { useTranscriptionData } from './useTranscriptionData';
import { useManuscriptMetaStore } from '../stores/manuscriptMeta';

/**
 * A manuscript's catalogue field as it stands: what the user has set in the
 * metadata table if anything, else what the corpus says.
 *
 * @returns {(source: string, field: string) => string}
 */
export function useEffectiveMeta() {
    const { catalog } = useTranscriptionData();
    const meta = useManuscriptMetaStore();

    return (source, field) => {
        const edited = meta.get(source, field);
        if (edited !== undefined) return edited;
        const record = catalog.value[source];
        return (record && record.meta && record.meta[field]) || '';
    };
}

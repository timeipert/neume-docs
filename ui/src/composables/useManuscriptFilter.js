import { computed, ref } from 'vue';
import { useManuscriptTable } from './useManuscriptTable';
import { useRowFilter } from './useRowFilter';
import { useSettingsStore } from '../stores/settings';
import { removeView, saveView, setFilterConfig } from '../utils/metadataSchema';
import { cleanFilter, declaredType, describeColumnFilter, emptyFilter } from '../utils/manuscriptFilter';

/**
 * Filtering the manuscripts table of the editor: the filter that is set now, which columns are
 * offered (the user says so in the settings), and the filters kept under a name. What a rule
 * means is in utils/manuscriptFilter, the filtering itself in useRowFilter, and where the
 * settings are kept in utils/metadataSchema.
 *
 * The filter that is set now outlives the page: leave the table and come back, and it is still set.
 */

const KIND_LABELS = { values: 'Pick values', text: 'Text', years: 'Date range', number: 'Number range' };
export const FILTER_KIND_OPTIONS = Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }));

const current = ref(emptyFilter());

export function useManuscriptFilter(table = useManuscriptTable()) {
    const settings = useSettingsStore();

    const model = useRowFilter({
        filter: current,
        ids: table.sources,
        columns: computed(() => table.columns.value.filter(c => !c.frozen)),
        cell: (id, col) => table.value(id, col),
        // What a column is for filtering: as it is set, or as its contents suggest.
        configOf: (col, cells) => {
            const type = declaredType(col);
            return describeColumnFilter(cells, {
                declared: type === 'century' ? 'century' : '', numeric: type === 'number', said: settings.metadataSchema.filters[col.key]
            });
        }
    });

    function configure(key, patch) {
        settings.setMetadataSchema(setFilterConfig(settings.metadataSchema, key, patch));
    }

    // ---- filters kept under a name -----------------------------------------------------------

    const views = computed(() => settings.metadataSchema.views);

    function saveCurrent(name) {
        const before = settings.metadataSchema;
        const next = saveView(before, name, current.value);
        if (next === before) return false;
        settings.setMetadataSchema(next);
        return true;
    }
    const applyView = (view) => { current.value = cleanFilter(view.filter); };
    const deleteView = (name) => settings.setMetadataSchema(removeView(settings.metadataSchema, name));
    /** A view that was removed, put back as it was. */
    const keepView = (view) => settings.setMetadataSchema(saveView(settings.metadataSchema, view.name, view.filter));

    return { ...model, views, configure, saveCurrent, applyView, deleteView, keepView, editable: true };
}

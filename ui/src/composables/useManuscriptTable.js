import { computed } from 'vue';
import { useTranscriptionData } from './useTranscriptionData';
import { useSettingsStore } from '../stores/settings';
import { useIiifStore } from '../stores/iiif';
import { useManuscriptMetaStore } from '../stores/manuscriptMeta';
import { useProjectsStore } from '../stores/projects';
import { arrangeColumns, checkProblem, placeColumn, resolveCategories } from '../utils/metadataSchema';

/**
 * The manuscripts as a table: one row per manuscript, one column per piece of
 * metadata, whatever its source.
 *
 *   corpus catalogue   what the import brought (editable as overrides, the corpus stays as it was)
 *   IIIF               the manifest address, kept by the IIIF store
 *   project fields     the attributes the project defines, used as filters on the public pages
 *   corpus statistics  documents, neumes, … (read-only)
 *
 * Which category a column stands under, in what order, and what its cells may hold is the
 * user's to arrange (Settings → Manuscript metadata): a column is where it comes from until
 * it is placed elsewhere.
 *
 * Every cell is read and written as text, so the grid, copy and paste, import
 * and undo can all treat them alike.
 */

/** Readable names for the CM's own (mostly German) field names. */
export const FIELD_LABELS = {
    herkunftsregion: 'Region of origin',
    herkunftsort: 'Place of origin',
    herkunftsinstitution: 'Institution',
    ordenstradition: 'Order tradition',
    quellentyp: 'Source type',
    bibliotheksort: 'Library city',
    bibliothek: 'Library',
    bibliothekssignatur: 'Shelfmark',
    datierung: 'Date',
    jahrhundert: 'Century',
    foliooffset: 'Folio offset',
    kommentar: 'Comment',
    status: 'Status',
    cantus_siglum: 'Cantus siglum',
    cantus_century: 'Cantus century',
    publish: 'Publish',
    id: 'Source ID'
};

/** Shown at first; the rest can be switched on. */
const DEFAULT_CATALOGUE = [
    'herkunftsregion', 'herkunftsort', 'herkunftsinstitution', 'ordenstradition', 'quellentyp',
    'bibliotheksort', 'bibliothek', 'bibliothekssignatur', 'datierung', 'jahrhundert', 'foliooffset', 'kommentar'
];

/** Fields the grid does not offer as catalogue columns: they are the row's identity or have their own column. */
const NOT_A_CATALOGUE_COLUMN = new Set(['quellensigle', 'manifest', 'iiifManifestUrl']);

const prettify = (key) => key.replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase());

/** What a project field of a given type means for the grid. */
const FILTER_TYPE = { datierung: 'century', jahrhundert: 'century', cantus_century: 'century', herkunftsort: 'location', bibliotheksort: 'location' };

export function isUrl(text) {
    return /^https?:\/\/\S+$/i.test(String(text).trim());
}

export function useManuscriptTable() {
    const { catalog } = useTranscriptionData();
    const settings = useSettingsStore();
    const iiif = useIiifStore();
    const meta = useManuscriptMetaStore();
    const projects = useProjectsStore();

    // ---- rows -------------------------------------------------------------

    const sources = computed(() => {
        const names = new Set(Object.keys(catalog.value));
        for (const p of projects.projects) if (p.source) names.add(p.source);
        for (const s of Object.keys(meta.overrides)) names.add(s);
        for (const s of Object.keys(settings.sourceMeta)) names.add(s);
        return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    });

    // ---- columns ----------------------------------------------------------

    const catalogueKeys = computed(() => {
        const seen = new Set();
        for (const rec of Object.values(catalog.value)) {
            for (const key of Object.keys(rec.meta || {})) if (!NOT_A_CATALOGUE_COLUMN.has(key)) seen.add(key);
        }
        // Fields the user has filled in for a manuscript that is not in the corpus have a column too.
        for (const fields of Object.values(meta.overrides)) {
            for (const key of Object.keys(fields)) if (!NOT_A_CATALOGUE_COLUMN.has(key)) seen.add(key);
        }
        const known = Object.keys(FIELD_LABELS).filter(k => seen.has(k));
        const others = [...seen].filter(k => !(k in FIELD_LABELS)).sort();
        return [...known, ...others];
    });

    /** The columns as they come: each with the category it comes with (`group`). */
    const baseColumns = computed(() => {
        const cols = [{ key: 'source', label: 'Siglum', group: 'id', type: 'text', readonly: true, width: 150, frozen: true }];

        for (const field of catalogueKeys.value) {
            if (field === 'id') continue;
            cols.push({
                key: `cat:${field}`, field, group: 'catalogue', type: 'text',
                label: FIELD_LABELS[field] || prettify(field), readonly: false,
                width: field === 'kommentar' ? 220 : (field === 'herkunftsregion' ? 190 : 150),
                suggest: !['kommentar', 'bibliothekssignatur'].includes(field),
                hiddenByDefault: !DEFAULT_CATALOGUE.includes(field)
            });
        }

        cols.push(
            { key: 'iiif:manifest', label: 'IIIF manifest', group: 'iiif', type: 'url', readonly: false, width: 260,
              hint: 'The address of the manuscript\'s IIIF manifest. It loads when the images are first needed.' },
            { key: 'iiif:images', label: 'Page images', group: 'iiif', type: 'number', readonly: true, width: 100,
              hint: 'Pages for which the corpus\'s document metadata names an image address (these work without a manifest)' },
            { key: 'iiif:state', label: 'Images from', group: 'iiif', type: 'text', readonly: true, width: 110,
              hint: 'Where the manuscript\'s images come from: its manifest, or the addresses in the corpus\'s document metadata' }
        );

        for (const f of settings.sourceMetaFields) {
            cols.push({
                key: `proj:${f.key}`, field: f.key, label: f.label, group: 'project',
                type: 'text', readonly: false, width: 150, suggest: true, removable: true, hint: f.description || '', filterType: f.type
            });
        }

        cols.push(
            { key: 'stat:documents', label: 'Documents', group: 'corpus', type: 'number', readonly: true, width: 90 },
            { key: 'stat:neumes', label: 'Neumes', group: 'corpus', type: 'number', readonly: true, width: 90 },
            { key: 'stat:patterns', label: 'Patterns', group: 'corpus', type: 'number', readonly: true, width: 90 },
            { key: 'stat:projects', label: 'Projects', group: 'corpus', type: 'number', readonly: true, width: 90,
              hint: 'How many projects work on this manuscript. Select the row and choose Project → to open or start one.' }
        );
        return cols;
    });

    // ---- categories, order and checks -------------------------------------------

    const schema = computed(() => settings.metadataSchema);
    const categories = computed(() => resolveCategories(schema.value));
    const bandLabels = computed(() => Object.fromEntries(categories.value.map(c => [c.key, c.label])));

    /** The columns as shown: arranged by category, and a list-check offers its values. */
    const columns = computed(() => arrangeColumns(baseColumns.value, schema.value).map(col => {
        const check = schema.value.checks[col.key];
        return check && check.kind === 'list' && !col.readonly ? { ...col, suggest: true, choices: check.values } : col;
    }));

    /** Each category with its columns, for the pages that arrange and list them. */
    const layout = computed(() => categories.value.map(cat => ({
        ...cat,
        columns: columns.value.filter(c => !c.frozen && c.band === cat.key)
    })));

    const columnByKey = computed(() => new Map(columns.value.map(c => [c.key, c])));

    /** Columns the user has not hidden. */
    const visibleColumns = computed(() => {
        const hidden = meta.hiddenColumns;
        return columns.value.filter(c => c.frozen || (hidden ? !hidden.includes(c.key) : !c.hiddenByDefault));
    });

    function toggleColumn(key) {
        const current = meta.hiddenColumns || columns.value.filter(c => c.hiddenByDefault).map(c => c.key);
        meta.setHidden(current.includes(key) ? current.filter(k => k !== key) : [...current, key]);
    }

    function showAllColumns() { meta.setHidden([]); }

    // ---- statistics (read-only columns) -------------------------------------

    const stats = computed(() => {
        const out = {};
        for (const source of sources.value) {
            const rec = catalog.value[source];
            const counts = (rec && rec.counts) || {};
            out[source] = {
                documents: rec ? (rec.documents || []).length : 0,
                neumes: Object.values(counts).reduce((a, b) => a + b, 0),
                patterns: Object.keys(counts).length,
                projects: projects.projects.filter(p => p.source === source).length,
                images: rec && rec.images ? rec.images.length : 0
            };
        }
        return out;
    });

    // ---- reading and writing a cell ----------------------------------------

    function catalogValue(source, field) {
        const rec = catalog.value[source];
        return (rec && rec.meta && rec.meta[field]) || '';
    }

    function corpusManifest(source) {
        const rec = catalog.value[source];
        return (rec && rec.meta && (rec.meta.manifest || rec.meta.iiifManifestUrl)) || '';
    }

    /** The text of a cell. */
    function value(source, col) {
        switch (col.group) {
            case 'id': return source;
            case 'catalogue': {
                const over = meta.get(source, col.field);
                return over !== undefined ? over : catalogValue(source, col.field);
            }
            case 'iiif':
                if (col.key === 'iiif:manifest') return iiif.links[source] || '';
                if (col.key === 'iiif:images') { const n = stats.value[source]?.images || 0; return n ? String(n) : ''; }
                if (iiif.links[source]) return isUrl(iiif.links[source]) ? 'manifest' : 'invalid address';
                return iiif.folioImageSources[source] ? 'documents' : '';
            case 'project': return settings.getSourceMetaValue(source, col.field);
            case 'corpus': {
                const s = stats.value[source];
                if (!s) return '';
                const n = s[col.key.slice(5)];
                return n ? String(n) : '';
            }
            default: return '';
        }
    }

    /** Whether a cell has been changed from what the corpus says. */
    function isEdited(source, col) {
        if (col.group === 'catalogue') return meta.has(source, col.field);
        if (col.key === 'iiif:manifest') return (iiif.links[source] || '') !== corpusManifest(source);
        return false;
    }

    /** The corpus's own value of a cell, for resetting. */
    function baseValue(source, col) {
        if (col.group === 'catalogue') return catalogValue(source, col.field);
        if (col.key === 'iiif:manifest') return corpusManifest(source);
        return '';
    }

    /** Why a cell is marked, or '' if it is not: the column's own rules first, then the check set for it. */
    function invalid(col, text) {
        const t = String(text ?? '').trim();
        if (t === '') return '';
        if (col.type === 'url' && !isUrl(t)) return 'Not a web address';
        // The CM writes it as a number or as an expression: 7, -1, pageNr+3
        if (col.key === 'cat:foliooffset' && !/^(pageNr\s*)?[+-]?\s*\d+$/i.test(t)) return 'Expected a number, or pageNr plus a number';
        return checkProblem(schema.value.checks[col.key], t);
    }

    function isReadonly(col) { return !!col.readonly; }

    /** Write a cell. */
    function write(source, col, text) {
        const t = String(text ?? '');
        switch (col.group) {
            case 'catalogue':
                meta.set(source, col.field, t, catalogValue(source, col.field));
                break;
            case 'iiif':
                if (col.key === 'iiif:manifest') {
                    const url = t.trim();
                    iiif.setLink(source, url).then(() => {
                        // Without a manifest, the pages the corpus names are the fallback.
                        if (!url) {
                            const rec = catalog.value[source];
                            if (rec && rec.images && rec.images.length) iiif.setFolioImages(source, rec.images);
                        }
                    }).catch(e => console.warn('Could not set the manifest address', e));
                }
                break;
            case 'project':
                settings.setSourceMetaValue(source, col.field, t);
                break;
            default: break;
        }
    }

    /** Distinct values already in a column. */
    function usedValues(col) {
        const seen = new Set();
        for (const source of sources.value) {
            const v = value(source, col);
            if (v) seen.add(v);
        }
        return [...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }

    /** What a column offers while it is edited: the values of its list, or those already in use. */
    function suggestions(col) {
        if (col.choices) return col.choices;
        if (!col.suggest) return [];
        return usedValues(col).slice(0, 300);
    }

    // ---- columns of the project's own ---------------------------------------

    /** A column of your own, under a category if you name one. */
    function addProjectColumn(label, type = 'text', category = '') {
        const field = settings.addSourceMetaField(label, '', type);
        if (field && category && category !== 'project') {
            settings.setMetadataSchema(placeColumn(settings.metadataSchema, `proj:${field.key}`, category, 'project'));
        }
        return field;
    }

    function removeProjectColumn(col) {
        if (col.group === 'project') settings.removeSourceMetaField(col.field);
    }

    /**
     * Copy a catalogue column into a column of the project's own, so it can serve as a
     * filter on the public pages. A one-time copy: the two are independent afterwards.
     */
    function copyToFilterColumn(col) {
        const type = FILTER_TYPE[col.field] || 'text';
        const field = settings.addSourceMetaField(col.label, `Copied from the corpus catalogue (${col.field})`, type);
        if (!field) return null;
        for (const source of sources.value) {
            const v = value(source, col);
            if (v) settings.setSourceMetaValue(source, field.key, v);
        }
        return field;
    }

    function revertColumn(col) {
        if (col.group === 'catalogue') meta.revertColumn(col.field);
    }

    return {
        sources, columns, columnByKey, visibleColumns, toggleColumn, showAllColumns,
        categories, bandLabels, layout,
        value, write, isEdited, baseValue, invalid, isReadonly, suggestions, usedValues, stats,
        addProjectColumn, removeProjectColumn, copyToFilterColumn, revertColumn,
        editedCount: () => meta.editedCount()
    };
}

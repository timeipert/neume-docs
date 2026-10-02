/**
 * The parts of the workspace a person can look at and delete one by one.
 *
 * Each area knows how to measure itself (so the workspace page can say "412
 * snippets" and disable "Delete" when there is nothing) and how to empty itself.
 * Measuring and emptying are the only things here; deciding when to ask for
 * confirmation or make a restore point is the caller's job.
 *
 * All functions take the stores: { settings, annotations, tables, iiif, registry, library, meta, direct }
 */
import { SETTING_GROUPS } from '../stores/settings';

const sumLengths = (map) => Object.values(map || {}).reduce((n, list) => n + (Array.isArray(list) ? list.length : 0), 0);
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** Join the non-empty parts: "412 snippets · 38 line regions". */
const describe = (parts) => parts.filter(Boolean).join(' · ');

function countVariants(codeVariants) {
    return Object.values(codeVariants || {}).reduce((n, list) => n + (list || []).length, 0);
}

function countOwnValues(sourceMeta) {
    return Object.values(sourceMeta || {}).reduce((n, values) => n + Object.keys(values || {}).length, 0);
}

export const AREAS = [
    {
        key: 'annotations',
        title: 'Annotations',
        blurb: 'Snippets and line regions drawn on page images.',
        to: '/polygons',
        goLabel: 'Page images',
        measure({ annotations }) {
            const snippets = sumLengths(annotations.annotations) + sumLengths(annotations.regionItems);
            const regions = sumLengths(annotations.regions);
            const lines = sumLengths(annotations.manualLines);
            return {
                count: snippets + regions + lines,
                text: describe([
                    snippets && plural(snippets, 'snippet'),
                    regions && plural(regions, 'line region'),
                    lines && plural(lines, 'manual line')
                ])
            };
        },
        clear({ annotations }) { annotations.clearAll(); }
    },
    {
        key: 'tables',
        title: 'Neume tables',
        blurb: 'The patterns you chose for each manuscript, with their IDs and notes.',
        to: '/table',
        goLabel: 'Neume Tables',
        measure({ tables }) {
            const rows = tables.tables.reduce((n, t) => n + (t.rows || []).length, 0);
            return {
                count: tables.tables.length,
                text: describe([
                    tables.tables.length && plural(tables.tables.length, 'table'),
                    rows && plural(rows, 'pattern row')
                ])
            };
        },
        clear({ tables }) { tables.clearAll(); }
    },
    {
        key: 'metadata',
        title: 'Manuscript metadata',
        blurb: 'Your edits to the corpus metadata, and the columns you added yourself.',
        to: '/metadata',
        goLabel: 'Metadata',
        measure({ meta, settings }) {
            const edits = meta.editedCount();
            const columns = settings.sourceMetaFields.length;
            const values = countOwnValues(settings.sourceMeta);
            return {
                count: edits + columns + values,
                text: describe([
                    edits && plural(edits, 'edited cell'),
                    columns && plural(columns, 'own column'),
                    values && plural(values, 'own value')
                ])
            };
        },
        clear({ meta, settings }) {
            meta.clear();
            settings.reset(SETTING_GROUPS.metadata);
        }
    },
    {
        key: 'library',
        title: 'Pattern library',
        blurb: 'Pattern labels, notes and MEI templates, custom signs, code variants and preferred IDs.',
        to: '/patterns',
        goLabel: 'Patterns',
        measure({ library, settings }) {
            const entries = Object.keys(library.patterns).length;
            const signs = settings.customSigns.length;
            const variants = countVariants(settings.codeVariants);
            const ids = Object.keys(settings.globalDisplayIds).length;
            const snippetVariants = settings.snippetVariants.length;
            return {
                count: entries + signs + variants + ids + snippetVariants,
                text: describe([
                    entries && plural(entries, 'described pattern'),
                    signs && plural(signs, 'custom sign'),
                    variants && plural(variants, 'code variant'),
                    ids && plural(ids, 'preferred ID'),
                    snippetVariants && plural(snippetVariants, 'snippet variant')
                ])
            };
        },
        clear({ library, settings }) {
            library.clear();
            settings.reset(SETTING_GROUPS.library);
        }
    },
    {
        key: 'images',
        title: 'Images & IIIF',
        blurb: 'Manifest links you set, your IIIF table and the folio alignments you corrected by hand.',
        to: '/metadata/iiif',
        goLabel: 'IIIF sources',
        measure({ iiif, registry, settings }) {
            const links = Object.keys(iiif.links).length;
            const rows = registry.entries.length;
            const alignments = Object.keys(settings.sourceAlignments).length;
            return {
                count: links + rows + alignments,
                text: describe([
                    links && plural(links, 'manifest link'),
                    rows && plural(rows, 'IIIF table row'),
                    alignments && plural(alignments, 'folio alignment')
                ])
            };
        },
        clear({ iiif, registry, settings }) {
            iiif.clearLinks();
            registry.clear();
            settings.reset(SETTING_GROUPS.alignments);
        }
    },
    {
        key: 'custom',
        title: 'Custom manuscripts',
        blurb: 'Snippet collections with their own images, outside any corpus.',
        to: '/custom-manuscripts',
        goLabel: 'Custom manuscripts',
        measure({ direct }) {
            const snippets = direct.collections.reduce((n, c) => n + (c.snippets || []).length, 0);
            return {
                count: direct.collections.length,
                text: describe([
                    direct.collections.length && plural(direct.collections.length, 'collection'),
                    snippets && plural(snippets, 'snippet')
                ])
            };
        },
        clear({ direct }) { direct.clearAll(); }
    },
    {
        key: 'preferences',
        title: 'Preferences',
        blurb: 'Display mode, how the table is ordered, snippet size and the backup label.',
        to: '/settings',
        goLabel: 'Settings',
        // Preferences are not "work": "delete my work" leaves them alone.
        isWork: false,
        measure({ settings }) {
            const changed = settings.changedCount(SETTING_GROUPS.preferences);
            return {
                count: changed,
                text: changed ? `${plural(changed, 'setting')} changed from the default` : ''
            };
        },
        clear({ settings }) { settings.reset(SETTING_GROUPS.preferences); }
    }
];

/** Areas that hold the user's own work, as opposed to preferences. */
export const WORK_AREAS = AREAS.filter(a => a.isWork !== false);

export function areaByKey(key) {
    return AREAS.find(a => a.key === key) || null;
}

/** @returns {{ key, title, blurb, to, goLabel, isWork, count: number, text: string }[]} */
export function measureAreas(stores) {
    return AREAS.map(area => ({
        key: area.key,
        title: area.title,
        blurb: area.blurb,
        to: area.to,
        goLabel: area.goLabel,
        isWork: area.isWork !== false,
        ...area.measure(stores)
    }));
}

/** Empty the given areas (all of them by default). */
export function clearAreas(stores, keys = AREAS.map(a => a.key)) {
    for (const key of keys) areaByKey(key)?.clear(stores);
}

/**
 * Work made before projects existed — a neume table per manuscript, a custom
 * collection of screenshots — as projects.
 *
 * Nothing is moved or copied: a table's rows become the project's columns, a
 * collection is linked by its id, and the snippets stay where they are. Each
 * piece of old work is adopted once (it remembers `legacyKey`), and a project
 * the person deleted is not brought back (its key goes on the dismissed list).
 */

import { categoryOf, selectColumn } from './projectTable.js';
import { getBaseCode } from './patternCode.js';
import { tierOf } from './neumeTable.js';

export const tableKey = (source) => `table:${source}`;
export const collectionKey = (id) => `collection:${id}`;

/** Standard-table codes first (as far as the rules allow), the rest as extended. */
function splitColumns(codes) {
    let columns = [];
    const extended = [];
    for (const raw of codes) {
        const code = getBaseCode(raw);
        if (!code || !categoryOf(code) || columns.includes(code) || extended.includes(code)) continue;
        const result = selectColumn(columns, code);
        if (result.ok) columns = result.columns;
        else extended.push(code);
    }
    return { columns, extended };
}

/**
 * @param {{
 *   tables?: Array<{ source: string, rows?: Array<{ pattern: string, tier?: string }> }>,
 *   collections?: Array<{ id: string, source: string, name?: string, patterns?: Array<{ code: string }>, snippets?: Array }>,
 *   projects?: Array<{ legacyKey?: string }>,
 *   dismissed?: string[],
 *   corpusSources?: Set<string>
 * }} input
 * @returns {Array<object>} project drafts, ready for the store
 */
export function legacyDrafts({ tables = [], collections = [], projects = [], dismissed = [], corpusSources = new Set() }) {
    // A collection a project already holds (it made it for its screenshots) is that project's, not old work.
    const taken = new Set([
        ...projects.map(p => p.legacyKey).filter(Boolean),
        ...projects.map(p => p.collectionId).filter(Boolean).map(collectionKey),
        ...dismissed
    ]);
    // A manuscript that already has a project of its own does not also get one from its table:
    // the table may only have been started by following a link out of that project.
    const sourcesWithProject = new Set(projects.map(p => p.source).filter(Boolean));
    const drafts = [];

    for (const table of tables) {
        const source = table && table.source;
        if (!source || !(table.rows || []).length || taken.has(tableKey(source)) || sourcesWithProject.has(source)) continue;
        // The standard selection of the table stays the standard selection; the rows of
        // the expanded documentation, and anything the rules would not allow, are extended.
        const rows = table.rows.filter(r => r && r.pattern);
        const standard = splitColumns(rows.filter(r => tierOf(r) === 'standard').map(r => r.pattern));
        const rest = rows.filter(r => tierOf(r) !== 'standard').map(r => getBaseCode(r.pattern)).filter(c => categoryOf(c));
        drafts.push({
            name: source,
            source,
            focus: corpusSources.has(source) ? 'transcription' : 'manuscript',
            images: 'iiif',
            snippets: 'lines',
            columns: standard.columns,
            extended: [...new Set([...standard.extended, ...rest])],
            legacyKey: tableKey(source),
            published: !!table.isPublished,
            columnsChosen: true
        });
    }

    for (const c of collections) {
        if (!c || !c.id || taken.has(collectionKey(c.id))) continue;
        const codes = [...(c.patterns || []).map(p => p.code), ...(c.snippets || []).map(s => s.pattern)].filter(Boolean);
        const { columns, extended } = splitColumns(codes);
        drafts.push({
            name: c.name || c.source || 'Custom manuscript',
            source: c.source || c.name || '',
            focus: 'manuscript',
            images: 'screenshots',
            snippets: 'signs',
            collectionId: c.id,
            columns,
            extended,
            legacyKey: collectionKey(c.id),
            published: !!c.isPublished,
            columnsChosen: true
        });
    }

    return drafts;
}

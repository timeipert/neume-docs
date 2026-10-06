/**
 * What the public views read, worked out from the projects.
 *
 * The public pages (and the static export) list manuscripts from a table per
 * manuscript — its rows, and whether it is published — and image collections from
 * their own flag. A project is published with one switch, so those are derived:
 *
 *   IIIF projects         the table of the manuscript gets the columns of every
 *                         published project on it (standard ones as the standard
 *                         selection, the rest as expanded documentation)
 *   screenshot projects   the collection they keep their images in is published
 *
 * A table is only ever unpublished here if it was published from a project
 * (`fromProjects`), so a table somebody published by hand is left alone.
 */

import { getBaseCode } from './patternCode.js';

/**
 * @param {{
 *   projects: Array<{ source: string, images: string, published?: boolean, columns: string[], extended: string[], collectionId?: string }>,
 *   tables: Array<{ source: string, rows?: Array<{ pattern: string, customId?: string }>, isPublished?: boolean, fromProjects?: boolean }>,
 *   collections: Array<{ id: string, isPublished?: boolean }>,
 *   globalId?: (code: string) => string
 * }} input
 * @returns {{
 *   tables: Array<{ source: string, rows?: Array<object>, isPublished: boolean }>,
 *   collections: Array<{ id: string, isPublished: boolean }>
 * }} only what has to change
 */
export function publicationPlan({ projects, tables, collections, globalId = () => '' }) {
    const out = { tables: [], collections: [] };

    // Manuscripts with IIIF projects that are published.
    const bySource = new Map();
    for (const p of projects) {
        if (!p.published || p.images !== 'iiif' || !p.source) continue;
        if (!bySource.has(p.source)) bySource.set(p.source, []);
        bySource.get(p.source).push(p);
    }

    for (const [source, list] of bySource) {
        const existing = tables.find(t => t.source === source);
        const kept = new Map(((existing && existing.rows) || []).map(r => [getBaseCode(r.pattern), r]));
        const rows = [];
        const seen = new Set();
        const add = (code, tier) => {
            const base = getBaseCode(code);
            if (!base || seen.has(base)) return;
            seen.add(base);
            const before = kept.get(base);
            rows.push({
                pattern: base,
                customId: (before && before.customId) || globalId(base) || '',
                notes: (before && before.notes) || '',
                tier
            });
        };
        for (const p of list) p.columns.forEach(c => add(c, 'standard'));
        for (const p of list) p.extended.forEach(c => add(c, 'expanded'));

        const same = existing && existing.isPublished && existing.fromProjects
            && JSON.stringify(existing.rows) === JSON.stringify(rows);
        if (!same) out.tables.push({ source, rows, isPublished: true });
    }

    for (const t of tables) {
        if (t.fromProjects && t.isPublished && !bySource.has(t.source)) out.tables.push({ source: t.source, isPublished: false });
    }

    for (const p of projects) {
        if (p.images !== 'screenshots' || !p.collectionId) continue;
        const c = collections.find(x => x.id === p.collectionId);
        if (c && !!c.isPublished !== !!p.published) out.collections.push({ id: c.id, isPublished: !!p.published });
    }

    return out;
}

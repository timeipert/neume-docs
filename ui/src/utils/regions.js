/**
 * The manuscripts of a documentation under their region of origin, in the order of the Neumedocs plan
 * (Iberian, Aquitanian, French, British, Scandinavian, German, Italian, Central European, then the rest).
 * The corpus catalogue names a region in German ("Quellen aquitanischer Herkunft"); the page says it in English.
 */

const REGIONS = [
    { test: /iberi|spani|portugies|katalan/i, label: 'Manuscripts of Iberian Origin' },
    { test: /aquitan/i, label: 'Manuscripts of Aquitanian Origin' },
    { test: /franz[oö]s|french|france/i, label: 'Manuscripts of French Origin' },
    { test: /brit|engl|schott|irisch/i, label: 'Manuscripts of British Origin' },
    { test: /skandinav|nordisch|d[aä]nisch|schwedisch|norweg/i, label: 'Manuscripts of Scandinavian Origin' },
    { test: /deutsch|german/i, label: 'Manuscripts of German Origin' },
    { test: /italien|ital/i, label: 'Manuscripts of Italian Origin' },
    { test: /mitteleurop|zentraleurop|central/i, label: 'Manuscripts of Central European Origin' },
    { test: /orden/i, label: 'Manuscripts of Religious Order Traditions' }
];

/** How a region is called on the page, and its place in the order. A region nobody knows keeps its own name, last. */
export function regionOf(name) {
    const text = String(name || '').trim();
    if (!text) return { label: 'Region not stated', rank: REGIONS.length + 1 };
    const i = REGIONS.findIndex(r => r.test.test(text));
    return i < 0 ? { label: text, rank: REGIONS.length } : { label: REGIONS[i].label, rank: i };
}

/** The key of the first column whose key or label matches. */
export function findColumn(columns, pattern) {
    const hit = (columns || []).find(c => pattern.test(`${c.key} ${c.label}`));
    return hit ? hit.key : '';
}

/**
 * @param {Array<{ id: string, source: string, meta: Object<string,string> }>} entries
 * @param {Array<{ key: string, label: string }>} columns  the index's metadata columns
 * @returns {Array<{ label: string, entries: Array<{ id: string, source: string, date: string }> }>}
 */
export function groupByRegion(entries, columns) {
    const regionKey = findColumn(columns, /region/i);
    const dateKey = findColumn(columns, /datier|\bdate\b/i);
    const groups = new Map();
    for (const e of entries || []) {
        const { label, rank } = regionOf(regionKey ? e.meta[regionKey] : '');
        if (!groups.has(label)) groups.set(label, { label, rank, entries: [] });
        groups.get(label).entries.push({ id: e.id, source: e.source, date: dateKey ? e.meta[dateKey] || '' : '' });
    }
    return [...groups.values()]
        .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
        .map(({ label, entries: list }) => ({ label, entries: list.sort((a, b) => a.source.localeCompare(b.source, undefined, { numeric: true })) }));
}

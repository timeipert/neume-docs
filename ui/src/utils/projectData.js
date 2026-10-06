/**
 * What a project looks at: the folios of its range, the snippets drawn on them,
 * the neumes the transcription has there.
 *
 * Snippets stay where they always were — keyed by manuscript and folio in the
 * annotations store, or in a custom collection for screenshots — so two
 * projects on one manuscript see the same snippets for the same folios. A
 * project only decides which folios count.
 */

import { compareFolios } from './sorting.js';
import { getBaseCode } from './patternCode.js';
import { placeOfSnippet } from './lineSigns.js';

/** Whether a folio lies in the range. An empty end is open: no `from` starts at the first folio. */
export function folioInRange(folio, from, to) {
    if (!folio) return false;
    if (from && compareFolios(folio, from) < 0) return false;
    if (to && compareFolios(folio, to) > 0) return false;
    return true;
}

/** The folios of a list that lie in the range, in reading order. */
export function foliosInRange(folios, from, to) {
    return [...folios || []].filter(f => folioInRange(f, from, to)).sort(compareFolios);
}

/** "f. 12r–20v", "from f. 12r", "up to f. 20v", "all folios". */
export function describeRange(from, to) {
    if (from && to) return from === to ? `f. ${from}` : `f. ${from}–${to}`;
    if (from) return `from f. ${from}`;
    if (to) return `up to f. ${to}`;
    return 'all folios';
}

/**
 * The snippets drawn on a manuscript's folios in a range, by code.
 *
 * Both places a snippet can live are read: the ones drawn on a line region
 * (`regionItems`) and the ones drawn straight on the page (`annotations`, keyed
 * `source_folio_pattern`). A snippet that is in both (an OMMR import writes it
 * twice) is counted once. A code variant (`*ud b`) counts for its code.
 *
 * @returns {Map<string, Array<{ id: string|number, source: string, folio: string, pattern: string, points: string, regionId?: string, lineName?: string, variant?: string, kind: 'line'|'sign' }>>}
 */
export function collectSnippets({ source, from = '', to = '', annotations = {}, regions = {}, regionItems = {} }) {
    const out = new Map();
    if (!source) return out;
    const prefix = `${source}_`;
    const seen = new Set();

    const push = (snippet) => {
        const code = getBaseCode(snippet.pattern);
        if (!code) return;
        const id = `${code}\u0000${snippet.folio}\u0000${snippet.id}`;
        if (snippet.id !== undefined && snippet.id !== null) {
            if (seen.has(id)) return;
            seen.add(id);
        }
        if (!out.has(code)) out.set(code, []);
        out.get(code).push(snippet);
    };

    for (const [key, list] of Object.entries(regions)) {
        if (!key.startsWith(prefix)) continue;
        const folio = key.slice(prefix.length);
        if (!folioInRange(folio, from, to)) continue;
        for (const region of list || []) {
            for (const item of regionItems[region.id] || []) {
                if (!item || !item.pattern || !item.points) continue;
                push({ ...item, source, folio, regionId: region.id, lineName: region.name, kind: 'line' });
            }
        }
    }

    for (const [key, list] of Object.entries(annotations)) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        const cut = rest.indexOf('_');
        if (cut < 1) continue;
        const folio = rest.slice(0, cut);
        const pattern = rest.slice(cut + 1);
        if (!folioInRange(folio, from, to)) continue;
        for (const a of list || []) {
            if (!a || !a.points) continue;
            push({ ...a, source, folio, pattern, kind: 'sign' });
        }
    }

    for (const list of out.values()) {
        list.sort((a, b) => compareFolios(a.folio, b.folio));
    }
    return out;
}

/**
 * What the transcription has in a range: for each code how often, and where.
 *
 * @param {Object<string, Array<Array>>} occurrences `{ pattern: [[document, folio, line, syllable, notes], …] }`
 * @returns {Map<string, { count: number, places: Array<{ folio: string, line: number|string, document: string }> }>}
 */
export function collectOccurrences(occurrences, from = '', to = '') {
    const out = new Map();
    for (const [pattern, list] of Object.entries(occurrences || {})) {
        const code = getBaseCode(pattern);
        for (const occ of list) {
            const folio = occ[1];
            if (!folioInRange(String(folio), from, to)) continue;
            if (!out.has(code)) out.set(code, { count: 0, places: [] });
            const entry = out.get(code);
            entry.count++;
            entry.places.push({ document: occ[0], folio: String(folio), line: occ[2] });
        }
    }
    for (const entry of out.values()) {
        entry.places.sort((a, b) => compareFolios(a.folio, b.folio) || Number(a.line) - Number(b.line));
    }
    return out;
}

/**
 * The snippets of a custom collection, by code. A sign cut from a line says which
 * line, and where on it (`place`); the others say what they say themselves.
 */
export function collectionSnippets(collection) {
    const out = new Map();
    for (const s of (collection && collection.snippets) || []) {
        const code = getBaseCode(s.pattern);
        if (!code) continue;
        if (!out.has(code)) out.set(code, []);
        out.get(code).push({ ...s, kind: 'image', place: placeOfSnippet(collection, s) });
    }
    return out;
}

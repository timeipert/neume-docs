/**
 * Proposing which snippet is which neume of the transcription.
 *
 * Monodi-Zero can show a sign in the manuscript only if a snippet points at the
 * neume it depicts (its first note's uuid) and a line region at the line it
 * covers. Linking each snippet by hand is slow, so this works the links out:
 *
 *  - a region's snippets, taken left to right, are aligned with the neumes of one
 *    transcription line, in reading order, by pattern;
 *  - which line is read from snippets already linked, else the line on the page
 *    that the snippets fit best, else (weakest) the region's name, "Line 3";
 *  - nothing is applied here: proposals come back with a confidence, for the
 *    person to review.
 *
 * Pure functions on plain data. A snippet links to an occurrence the way the
 * editor always did, by `linkData.sysId` (the occurrence's fields joined by "|");
 * the neume's uuid is looked up from that when the annotations are sent.
 */

import { getBaseCode } from '../../utils/patternCode';
import { parsePageKey } from './annotationExchange';

/** Only snippets of a neume (pattern codes start with * or a bracket) are linked; a clef or custos is not. */
const isNeumeCode = (pattern) => /^[*[{]/.test(getBaseCode(pattern));

const text = (v) => (v === undefined || v === null ? '' : String(v));

/**
 * The transcription's neumes by line, in reading order.
 *
 * @param {Object<string, string[][]>|null} occurrences pattern -> occurrences
 * @param {Object<string, string[]>|null} noteUuids     pattern -> uuids, same order
 * @param {Object<string, number[]>|null} noteOrder     pattern -> reading-order numbers, same order
 * @returns {{ ready: boolean, lines: Map<string, Array<{pattern: string, uuid: string, sysId: string, order: number}>>,
 *             byFolio: Map<string, string[]> }}
 *   `ready` is false for a source imported before the order was kept: load it again.
 */
export function buildLineIndex(occurrences, noteUuids, noteOrder) {
    const lines = new Map();
    const byFolio = new Map();
    if (!occurrences || !noteUuids || !noteOrder) return { ready: false, lines, byFolio };

    for (const [pattern, list] of Object.entries(occurrences)) {
        const uuids = noteUuids[pattern] || [];
        const orders = noteOrder[pattern] || [];
        list.forEach((o, i) => {
            const key = `${o[1]}|${o[2]}`;
            if (!lines.has(key)) lines.set(key, []);
            lines.get(key).push({ pattern, uuid: uuids[i] || '', sysId: o.join('|'), order: orders[i] ?? 0 });
        });
    }
    for (const [key, neumes] of lines) {
        neumes.sort((a, b) => a.order - b.order);
        const [folio, line] = key.split('|');
        if (!byFolio.has(folio)) byFolio.set(folio, []);
        byFolio.get(folio).push(line);
    }
    for (const list of byFolio.values()) list.sort((a, b) => Number(a) - Number(b));
    return { ready: true, lines, byFolio };
}

/** Left, right and horizontal centre of a "x,y x,y …" polygon, in percent. */
function xSpan(points) {
    let min = Infinity;
    let max = -Infinity;
    for (const p of text(points).split(/\s+/)) {
        const x = Number(p.split(',')[0]);
        if (!Number.isFinite(x)) continue;
        if (x < min) min = x;
        if (x > max) max = x;
    }
    return Number.isFinite(min) ? { min, max, centre: (min + max) / 2 } : null;
}

/**
 * Align snippets, left to right, with the neumes of a line, by pattern.
 *
 * Matches count first; among equally many matches the one whose positions agree
 * best wins (a plain note repeats often, and where the snippet stands on the page
 * says which of them it is).
 *
 * @param {Array<{id: *, pattern: string, centre: number}>} items sorted by centre
 * @param {Array<{pattern: string}>} neumes in reading order
 * @param {{ min: number, max: number }} span horizontal extent of the region
 * @returns {{ pairs: Array<{item: object, neume: object, dist: number}>, matched: number, maxDist: number }}
 */
export function alignItems(items, neumes, span) {
    const n = items.length;
    const m = neumes.length;
    const width = Math.max(span.max - span.min, 1e-6);
    const where = items.map(i => Math.min(1, Math.max(0, (i.centre - span.min) / width)));
    const score = (i, j) => {
        if (getBaseCode(items[i].pattern) !== neumes[j].pattern) return -1;
        const dist = Math.min(1, Math.abs(where[i] - (j + 0.5) / m));
        return 1 + 0.5 * (1 - dist);
    };

    // dp[i][j]: best total using the first i snippets and the first j neumes
    const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            let best = Math.max(dp[i - 1][j], dp[i][j - 1]);
            const s = score(i - 1, j - 1);
            if (s > 0) best = Math.max(best, dp[i - 1][j - 1] + s);
            dp[i][j] = best;
        }
    }

    const pairs = [];
    let i = n;
    let j = m;
    while (i > 0 && j > 0) {
        const s = score(i - 1, j - 1);
        if (s > 0 && dp[i][j] === dp[i - 1][j - 1] + s) {
            pairs.push({ item: items[i - 1], neume: neumes[j - 1], dist: Math.min(1, Math.abs(where[i - 1] - (j - 0.5) / m)) });
            i--; j--;
        } else if (dp[i][j] === dp[i - 1][j]) i--;
        else j--;
    }
    pairs.reverse();
    return { pairs, matched: pairs.length, maxDist: pairs.reduce((d, p) => Math.max(d, p.dist), 0) };
}

/** 'high' | 'medium' | 'low' | null, from how many snippets matched and how well the positions agree. */
function confidenceOf(count, neumeCount, matched, maxDist) {
    if (!count || !matched) return null;
    if (matched === count) return count === neumeCount || maxDist <= 0.12 ? 'high' : 'medium';
    return matched / count >= 0.6 ? 'low' : null;
}

const lineNumberOf = (name) => {
    const m = /(\d+)/.exec(text(name));
    return m ? m[1] : '';
};

/**
 * Proposals for one source.
 *
 * @param {object} source
 * @param {string} source.name
 * @param {Object<string, Object<string, string>>} [source.lineUuids] folio -> line -> LineChange uuid
 * @param {ReturnType<typeof buildLineIndex>} index
 * @param {{ regions: Object, regionItems: Object }} workspace
 * @returns {{ proposals: object[], snippets: number, linked: number, unresolved: Array<{ folio: string, region: string, reason: string }> }}
 */
export function proposeLinks(source, index, workspace) {
    const proposals = [];
    const unresolved = [];
    let snippets = 0;
    let linked = 0;
    const lineUuids = source.lineUuids || {};

    // the pages of this source, regions in the order the person drew them
    const pages = [];
    for (const [key, list] of Object.entries(workspace.regions || {})) {
        const where = parsePageKey(key);
        if (where && where.source === source.name) pages.push({ folio: where.folio, regions: list || [] });
    }

    for (const page of pages) {
        const claimed = new Set(); // lines already given to a region of this page
        const work = [];

        for (const region of page.regions) {
            if (region.unassigned) continue;
            const all = (workspace.regionItems && workspace.regionItems[region.id]) || [];
            // Snippets are addressed by their position in the region: ids are made from the clock
            // and may repeat, a position cannot.
            const neumeItems = all.map((item, index) => ({ item, index })).filter(({ item }) => isNeumeCode(item.pattern));
            snippets += neumeItems.length;
            const done = neumeItems.filter(({ item }) => item.linkData && item.linkData.sysId).map(({ item }) => item);
            linked += done.length;
            work.push({ region, free: neumeItems.filter(({ item }) => !(item.linkData && item.linkData.sysId)), done });
        }

        // A line the region's own linked snippets stand on is certain.
        const fixed = new Map();
        for (const w of work) {
            const seen = new Set();
            for (const i of w.done) {
                const p = text(i.linkData.sysId).split('|');
                if (p.length === 5) seen.add(`${p[1]}|${p[2]}`);
            }
            if (seen.size === 1) {
                fixed.set(w.region.id, [...seen][0]);
                claimed.add([...seen][0]);
            }
        }
        const usedSysIds = new Set(work.flatMap(w => w.done.map(i => i.linkData.sysId)));

        // Most fitting snippets first, so that a clear region keeps its line.
        const candidatesOf = (w) => {
            const span = xSpan(w.region.points);
            const items = w.free
                .map(({ item, index }) => ({ id: item.id, index, pattern: item.pattern, centre: (xSpan(item.points) || { centre: NaN }).centre }))
                .filter(i => Number.isFinite(i.centre))
                .sort((a, b) => a.centre - b.centre);
            const lineKeys = fixed.has(w.region.id)
                ? [fixed.get(w.region.id)]
                : (index.byFolio.get(page.folio) || []).map(l => `${page.folio}|${l}`);
            const named = lineNumberOf(w.region.name);
            const out = [];
            for (const key of lineKeys) {
                const neumes = (index.lines.get(key) || []).filter(n => !usedSysIds.has(n.sysId));
                if (!neumes.length || !items.length || !span) continue;
                const a = alignItems(items, neumes, span);
                const line = key.split('|')[1];
                out.push({
                    key, line, neumes: neumes.length, ...a,
                    nameBonus: named && named === line ? 1 : 0,
                    confidence: confidenceOf(items.length, neumes.length, a.matched, a.maxDist),
                    count: items.length
                });
            }
            out.sort((x, y) => y.matched - x.matched || y.nameBonus - x.nameBonus || x.maxDist - y.maxDist);
            return out;
        };

        const ranked = work
            .filter(w => w.free.length)
            .map(w => ({ w, candidates: candidatesOf(w) }))
            .sort((a, b) => (b.candidates[0]?.matched || 0) - (a.candidates[0]?.matched || 0));

        for (const { w, candidates } of ranked) {
            const pick = fixed.has(w.region.id)
                ? candidates[0]
                : candidates.find(c => c.confidence && !claimed.has(c.key));
            if (!pick || !pick.confidence) {
                unresolved.push({ folio: page.folio, region: text(w.region.name), reason: candidates.length ? 'the snippets do not fit any line of this folio' : 'no transcription lines on this folio' });
                continue;
            }
            claimed.add(pick.key);
            const lineUuid = w.region.lineUUID ? '' : (lineUuids[page.folio] || {})[pick.line] || '';
            proposals.push({
                source: source.name, folio: page.folio, regionId: w.region.id, regionName: text(w.region.name),
                line: pick.line, lineUuid, basis: 'snippets', confidence: pick.confidence,
                neumes: pick.neumes, unmatched: pick.count - pick.matched,
                links: pick.pairs.map(p => ({ itemId: p.item.id, index: p.item.index, sysId: p.neume.sysId, pattern: p.neume.pattern }))
            });
        }

        // Regions with no snippets of a neume: the name is all there is to go on.
        for (const w of work) {
            if (w.free.length || w.done.length || w.region.lineUUID) continue;
            const line = lineNumberOf(w.region.name);
            const key = `${page.folio}|${line}`;
            if (!line || claimed.has(key) || !index.lines.has(key)) continue;
            const lineUuid = (lineUuids[page.folio] || {})[line] || '';
            if (!lineUuid) continue;
            claimed.add(key);
            proposals.push({
                source: source.name, folio: page.folio, regionId: w.region.id, regionName: text(w.region.name),
                line, lineUuid, basis: 'name', confidence: 'low', neumes: index.lines.get(key).length, unmatched: 0, links: []
            });
        }
    }

    proposals.sort((a, b) => a.folio.localeCompare(b.folio, undefined, { numeric: true })
        || Number(a.line) - Number(b.line));
    return { proposals, snippets, linked, unresolved };
}

/**
 * The workspace with the accepted proposals applied. Returns only what changed;
 * nothing passed in is modified. A snippet that is already linked is left alone.
 *
 * @returns {{ regions: Object, regionItems: Object, linkedSnippets: number, linkedLines: number }}
 */
export function applyProposals(proposals, workspace) {
    const regions = { ...workspace.regions };
    const regionItems = { ...workspace.regionItems };
    let linkedSnippets = 0;
    let linkedLines = 0;

    for (const p of proposals) {
        const key = `${p.source}_${p.folio}`;
        if (p.lineUuid && regions[key]) {
            regions[key] = regions[key].map(r => (r.id === p.regionId && !r.lineUUID ? { ...r, lineUUID: p.lineUuid } : r));
            linkedLines++;
        }
        if (p.links.length && regionItems[p.regionId]) {
            const byPosition = new Map(p.links.map(l => [l.index, l]));
            regionItems[p.regionId] = regionItems[p.regionId].map((item, index) => {
                const link = byPosition.get(index);
                // the id is a safeguard: if the region changed since the proposal, link nothing
                if (!link || text(link.itemId) !== text(item.id) || (item.linkData && item.linkData.sysId)) return item;
                linkedSnippets++;
                return { ...item, linkData: { ...(item.linkData || {}), sysId: link.sysId } };
            });
        }
    }
    return { regions, regionItems, linkedSnippets, linkedLines };
}

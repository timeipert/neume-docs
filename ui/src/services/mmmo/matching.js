/**
 * Finding a manuscript in the MMMO catalogue (see scripts/crawl-mmmo.mjs) from
 * what the editor knows about it, so that a manuscript can be given its IIIF
 * manifest and its catalogue data without typing them.
 *
 * Pure functions on plain data. A catalogue record is
 *   { id, siglum, rism, country, city, archive, shelfmark, origin, centuries[],
 *     years, types[], notation[], links[], manifest }
 * and a query is any subset of
 *   { siglum, rism, city, library, shelfmark, origin, date }
 * where `rism` is a library siglum such as "D-Eu", `city` the place of the library,
 * `shelfmark` the call number ("84", "VI G 5") and `date` a free-text dating.
 */
import { parseDateRange, rangesOverlap } from '../../utils/sourceMeta';

// ---- normalising ------------------------------------------------------------------------

/** Lower case, no accents, letters and digits only, single spaces. */
export function normalise(value) {
    return String(value ?? '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/** Words in a shelfmark that carry no identity: "Cod. 511" and "511" are the same book. */
const SHELF_NOISE = new Set([
    'cod', 'codex', 'codd', 'ms', 'mss', 'msc', 'mscr', 'hs', 'hss', 'handschrift', 'manuscript', 'manuscrit',
    'mscript', 'no', 'nr', 'n', 'fol', 'f', 'bibl', 'bibliotheca', 'biblioteca', 'bibliotheque', 'library'
]);

/** The identifying tokens of a shelfmark; numbers lose leading zeros ("084" is "84"). */
export function shelfTokens(value) {
    return normalise(value)
        .split(' ')
        .filter(t => t && !SHELF_NOISE.has(t))
        .map(t => (/^\d+$/.test(t) ? String(parseInt(t, 10)) : t));
}

/** Same set of tokens, order aside. */
const sameTokens = (a, b) => a.length > 0 && a.length === b.length && a.every(t => b.includes(t));

/** Do all tokens of the shorter list occur in the longer one? */
function containedTokens(a, b) {
    if (!a.length || !b.length) return false;
    const [small, large] = a.length <= b.length ? [a, b] : [b, a];
    return small.every(t => large.includes(t));
}

/** City names in other languages that mean the same place (normalised). */
const CITY_GROUPS = [
    ['prague', 'praha', 'prag', 'praga'], ['vienna', 'wien', 'vienne'], ['cologne', 'koln', 'koeln', 'colonia'],
    ['munich', 'munchen', 'muenchen', 'monaco'], ['venice', 'venezia', 'venedig', 'venise'],
    ['florence', 'firenze', 'florenz'], ['rome', 'roma', 'rom'], ['milan', 'milano', 'mailand'],
    ['turin', 'torino'], ['padua', 'padova', 'padoue'], ['naples', 'napoli', 'neapel'],
    ['brussels', 'bruxelles', 'brussel', 'brussell'], ['antwerp', 'anvers', 'antwerpen'],
    ['zurich', 'zuerich'], ['geneva', 'geneve', 'genf'], ['basel', 'bale', 'basle'],
    ['lucerne', 'luzern'], ['saint gall', 'st gallen', 'sankt gallen', 'st gall', 'saint gallen'],
    ['nuremberg', 'nurnberg', 'nuernberg'], ['mainz', 'mayence'], ['trier', 'treves'],
    ['aachen', 'aix la chapelle'], ['liege', 'luttich', 'luik'], ['lyon', 'lyons'],
    ['wolfenbuttel', 'wolfenbuettel'], ['cracow', 'krakow', 'cracovie', 'krakau'],
    ['wroclaw', 'breslau'], ['gdansk', 'danzig'], ['bratislava', 'pressburg', 'pozsony'],
    ['olomouc', 'olmutz', 'olmuetz'], ['brno', 'brunn', 'bruenn'], ['gent', 'ghent', 'gand'],
    ['bruges', 'brugge'], ['leuven', 'louvain', 'lowen'], ['mechelen', 'malines'], ['kraków', 'krakow']
].map(g => g.map(normalise));

const cityKey = (value) => {
    const n = normalise(value);
    if (!n) return '';
    const group = CITY_GROUPS.find(g => g.includes(n));
    return group ? group[0] : n;
};

/** Library sigla: "D-Eu", "A-Gu", "GB-Lbl", also written "D Eu". Compared without punctuation. */
const rismKey = (value) => normalise(value).replace(/ /g, '');

/**
 * Split a siglum into a library code and a shelfmark when it has the RISM shape:
 * "D-Eu 84", "D-Eu : 84", "A-A : Cod. 511". Anything else comes back as a shelfmark only.
 */
export function parseSiglum(siglum) {
    const text = String(siglum ?? '').trim();
    const m = text.match(/^([A-Z]{1,3}-[A-Za-z]{1,6})\s*[:,]?\s*(.*)$/);
    if (m) return { rism: m[1], shelfmark: m[2].trim() };
    return { rism: '', shelfmark: text };
}

/** A date as an inclusive year range, from free text or from a list of roman centuries. */
export function dateRangeOf({ date, years, centuries } = {}) {
    for (const candidate of [years, date]) {
        const r = parseDateRange(prepareDate(candidate));
        if (r) return r;
    }
    if (centuries && centuries.length) {
        const spans = centuries.map(romanToInt).filter(Boolean).map(c => ({ start: (c - 1) * 100 + 1, end: c * 100 }));
        if (spans.length) return { start: Math.min(...spans.map(s => s.start)), end: Math.max(...spans.map(s => s.end)) };
    }
    return null;
}

/** "15." and "14.0" are how the CM writes centuries; the date reader knows "15th c.". */
function prepareDate(value) {
    const s = String(value ?? '').trim();
    const m = s.match(/^(\d{1,2})(?:\.0?)?\s*(?:(?:or|oder|ou|\/|-)\s*(\d{1,2})(?:\.0?)?)?$/i);
    if (m) return m[2] ? `${m[1]}th-${m[2]}th c.` : `${m[1]}th c.`;
    return s;
}

const ROMAN = { i: 1, v: 5, x: 10, l: 50, c: 100 };
function romanToInt(text) {
    const s = String(text).toLowerCase().replace(/[^ivxlc]/g, '');
    if (!s) return null;
    let total = 0, prev = 0;
    for (const ch of s.split('').reverse()) {
        const v = ROMAN[ch];
        total += v < prev ? -v : v;
        prev = Math.max(prev, v);
    }
    return total || null;
}

// ---- the index --------------------------------------------------------------------------

/** Prepare the catalogue for matching; build it once, query it often. */
export function buildIndex(records) {
    const entries = records.map(record => {
        const shelf = shelfTokens(record.shelfmark || parseSiglum(record.siglum).shelfmark);
        return {
            record,
            rism: rismKey(record.rism || parseSiglum(record.siglum).rism),
            city: cityKey(record.city),
            shelf,
            range: dateRangeOf({ years: record.years, centuries: record.centuries }),
            haystack: normalise([record.siglum, record.country, record.city, record.archive, record.shelfmark, record.origin, ...(record.types || [])].join(' '))
        };
    });
    const byShelf = new Map();
    for (const e of entries) {
        for (const t of e.shelf) {
            if (!byShelf.has(t)) byShelf.set(t, []);
            byShelf.get(t).push(e);
        }
    }
    return { entries, byShelf };
}

// ---- matching a manuscript --------------------------------------------------------------

const WEIGHTS = { rism: 30, city: 20, shelfExact: 45, shelfPart: 25, dateOverlap: 10, dateConflict: -15, manifest: 3 };

/**
 * Score one catalogue entry against a query. Returns null when there is no basis
 * at all (no shared library and no shared shelfmark).
 */
function score(entry, q) {
    const reasons = [];
    let total = 0;

    let place = 0;
    if (q.rism && entry.rism && q.rism === entry.rism) { place = WEIGHTS.rism; reasons.push(`same library (${entry.record.rism})`); }
    else if (q.city && entry.city && q.city === entry.city) { place = WEIGHTS.city; reasons.push(`same city (${entry.record.city})`); }

    let shelf = 0;
    if (sameTokens(q.shelf, entry.shelf)) { shelf = WEIGHTS.shelfExact; reasons.push(`same shelfmark (${entry.record.shelfmark})`); }
    else if (containedTokens(q.shelf, entry.shelf)) { shelf = WEIGHTS.shelfPart; reasons.push(`similar shelfmark (${entry.record.shelfmark})`); }

    // A shelfmark alone proves little ("84" exists in every library); a place alone proves nothing.
    if (place && shelf) total = place + shelf;
    else if (shelf) total = Math.round(shelf * 0.3);
    else return null;

    if (q.range && entry.range) {
        if (rangesOverlap(q.range, entry.range)) { total += WEIGHTS.dateOverlap; reasons.push('dates overlap'); }
        else { total += WEIGHTS.dateConflict; reasons.push('dates differ'); }
    }
    if (entry.record.manifest) total += WEIGHTS.manifest;
    return { total, reasons };
}

const confidenceOf = (total) => (total >= 70 ? 'high' : total >= 45 ? 'likely' : 'possible');

/** Turn the loose description of a manuscript into what matching compares. */
function prepare(query) {
    const parsed = parseSiglum(query.siglum);
    const rism = rismKey(query.rism || parsed.rism);
    const shelfmark = query.shelfmark || (parsed.rism ? parsed.shelfmark : '');
    return {
        rism,
        city: cityKey(query.city),
        shelf: shelfTokens(shelfmark),
        range: dateRangeOf({ date: query.date })
    };
}

/**
 * Candidates for a manuscript, best first.
 * @param {object} index from buildIndex
 * @param {object} query see the top of this file
 * @returns {{ record, score: number, confidence: 'high'|'likely'|'possible', reasons: string[] }[]}
 */
export function suggest(index, query, { limit = 5, minScore = 30 } = {}) {
    const variants = [prepare(query)];

    // A siglum like "Eichstätt 84" has no library code but a place and a number:
    // try its first words as the city and the rest as the shelfmark.
    const words = String(query.siglum || '').trim().split(/\s+/);
    if (!variants[0].rism && !query.city && words.length >= 2) {
        for (let cut = 1; cut < Math.min(words.length, 3); cut++) {
            const city = words.slice(0, cut).join(' ');
            if (/\d/.test(city)) break;
            variants.push({ rism: '', city: cityKey(city), shelf: shelfTokens(words.slice(cut).join(' ')), range: variants[0].range });
        }
    }

    const best = new Map();
    for (const q of variants) {
        if (!q.shelf.length) continue;
        // Only entries that share a shelfmark token can match, which keeps this fast.
        const seen = new Set();
        for (const t of q.shelf) {
            for (const entry of index.byShelf.get(t) || []) {
                if (seen.has(entry)) continue;
                seen.add(entry);
                const s = score(entry, q);
                if (!s || s.total < minScore) continue;
                const previous = best.get(entry.record.id);
                if (!previous || s.total > previous.score) {
                    best.set(entry.record.id, { record: entry.record, score: s.total, confidence: confidenceOf(s.total), reasons: s.reasons });
                }
            }
        }
    }
    return [...best.values()].sort((a, b) => b.score - a.score || Number(!!b.record.manifest) - Number(!!a.record.manifest)).slice(0, limit);
}

/** Free-text search: every word must occur somewhere in the record. */
export function search(index, text, { limit = 20 } = {}) {
    const words = normalise(text).split(' ').filter(Boolean);
    if (!words.length) return [];
    const hits = [];
    for (const entry of index.entries) {
        if (!words.every(w => entry.haystack.includes(w))) continue;
        const exact = words.filter(w => entry.haystack.split(' ').includes(w)).length;
        hits.push({ record: entry.record, rank: exact * 2 + (entry.record.manifest ? 1 : 0) });
    }
    return hits.sort((a, b) => b.rank - a.rank).slice(0, limit).map(h => h.record);
}

/** Catalogue fields a record can give a manuscript, named as the metadata table names them. */
export function metadataFrom(record) {
    const out = {};
    const put = (field, value) => { if (value) out[field] = value; };
    put('bibliotheksort', record.city);
    put('bibliothek', record.archive);
    put('bibliothekssignatur', record.shelfmark);
    put('herkunftsort', record.origin);
    put('datierung', record.years || (record.centuries || []).join(', '));
    put('cantus_siglum', record.rism && record.shelfmark ? `${record.rism} ${record.shelfmark}` : '');
    return out;
}

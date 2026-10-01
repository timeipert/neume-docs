/**
 * The neume table: how patterns are ordered, which of them make up the
 * standard table, and how special signs are assigned to their columns.
 *
 * Vocabulary
 *
 *   code        a pattern as transcribed, e.g. `[*u]dL`
 *   signature   the code without ligature brackets: `*udL`. This is the unit a
 *               scholar thinks in ("*dL", "*uL"); brackets only say how it is
 *               written graphically, and are the choice offered by the library.
 *   direction   the signature without any sign letters: `*ud`
 *   tones       the number of notes (`*` and every `u`, `d`, `e`) — "Tonzahl"
 *   sign        an uppercase letter on a note. L, O, Q, S are the built-in
 *               special signs (liquescent, oriscus, quilisma, strophicus); other
 *               letters are project-defined (settings.customSigns).
 *
 * The rules (from the editorial brief)
 *
 *   1. Order: first by tones, then by how often it occurs in the Corpus
 *      Monodicum. A direction is counted over every code with that movement,
 *      brackets and signs ignored.
 *   2. The standard table has fixed columns:
 *        * | *d | *u | *e | *dd | *ud | *uu | *du | *udd | *uud | *ddu |
 *        L | O | Q | , | Clef | Custos
 *      — the same ordering, with some cases left out.
 *   3. A pattern with signs belongs to the column of its FIRST special sign.
 *   4. Per special column a manuscript selects at most three signatures.
 *   5. The expanded documentation adds any pattern back, at its place in the
 *      ordering; the full table shows everything.
 *
 * Everything here is plain functions over strings and numbers.
 */

import { getBaseCode } from './patternCode.js';

/** Pseudo-patterns: documented like a pattern, but not a neume shape. */
export const CLEF_CODE = '(Clef)';
export const CUSTOS_CODE = '(Custos)';

/** The directional columns of the standard table, in the order of the brief. */
export const STANDARD_DIRECTIONS = ['*', '*d', '*u', '*e', '*dd', '*ud', '*uu', '*du', '*udd', '*uud', '*ddu'];

/**
 * The special-sign columns. `header` is what the table shows; the strophicus
 * column is headed with a comma, the sign it is written with.
 */
export const SPECIAL_COLUMNS = [
    { key: 'L', header: 'L', label: 'Liqueszenz' },
    { key: 'O', header: 'O', label: 'Oriscus' },
    { key: 'Q', header: 'Q', label: 'Quilisma' },
    { key: 'S', header: ',', label: 'Strophicus' }
];

export const SPECIAL_KEYS = SPECIAL_COLUMNS.map(c => c.key);

/** How many signatures a manuscript may select per special column. */
export const MAX_SPECIAL_SIGNATURES = 3;

const NOTE_CHARS = new Set(['*', 'u', 'd', 'e']);

// ---------------------------------------------------------------------------
// Reading a code
// ---------------------------------------------------------------------------

/** The code without ligature brackets and parentheses. */
export function signatureOf(code) {
    return getBaseCode(code).replace(/[[\]{}()]/g, '');
}

/** The signature without sign letters: the movement only. */
export function directionOf(code) {
    return signatureOf(code).replace(/[A-Z]/g, '');
}

/** Number of notes. */
export function toneCount(code) {
    let n = 0;
    for (const ch of directionOf(code)) if (NOTE_CHARS.has(ch)) n++;
    return n;
}

/** The first built-in special sign in reading order, or '' if there is none. */
export function firstSpecialSign(code) {
    for (const ch of signatureOf(code)) {
        if (SPECIAL_KEYS.includes(ch)) return ch;
    }
    return '';
}

/**
 * Describe a code for the table.
 *
 * `kind` decides where it goes:
 *   direction  no signs at all
 *   special    carries a built-in sign; `column` is the first one
 *   custom     only project-defined signs
 *   clef, custos   the pseudo-patterns
 *   other      anything without notes, e.g. the "(Start)" marker
 *
 * @param {string} code
 * @returns {{
 *   code: string, signature: string, direction: string, tones: number,
 *   kind: 'direction'|'special'|'custom'|'clef'|'custos'|'other',
 *   column: string
 * }}
 */
export function classify(code) {
    const base = getBaseCode(code);

    if (base === CLEF_CODE) return { code: base, signature: base, direction: '', tones: 0, kind: 'clef', column: 'clef' };
    if (base === CUSTOS_CODE) return { code: base, signature: base, direction: '', tones: 0, kind: 'custos', column: 'custos' };

    const signature = signatureOf(base);
    const direction = directionOf(base);
    const tones = toneCount(base);

    if (tones === 0 || !signature.includes('*')) {
        return { code: base, signature, direction, tones: 0, kind: 'other', column: 'other' };
    }

    const special = firstSpecialSign(base);
    if (special) return { code: base, signature, direction, tones, kind: 'special', column: special };
    if (/[A-Z]/.test(signature)) return { code: base, signature, direction, tones, kind: 'custom', column: 'custom' };
    return { code: base, signature, direction, tones, kind: 'direction', column: 'direction' };
}

// ---------------------------------------------------------------------------
// Frequency
// ---------------------------------------------------------------------------

/**
 * Index the number of occurrences of every code, so any code, signature or
 * direction can be asked for its frequency.
 *
 * @param {Object<string, number|{count: number}>|Map<string, number>} counts
 * @returns {{
 *   code: (c: string) => number,
 *   signature: (s: string) => number,
 *   direction: (d: string) => number,
 *   total: number
 * }}
 */
export function buildFrequency(counts) {
    const byCode = new Map();
    const bySignature = new Map();
    const byDirection = new Map();
    let total = 0;

    const entries = counts instanceof Map ? counts.entries() : Object.entries(counts || {});
    for (const [code, value] of entries) {
        const n = typeof value === 'number' ? value : (value && value.count) || 0;
        const cl = classify(code);
        if (!n || cl.kind === 'other' || cl.kind === 'clef' || cl.kind === 'custos') continue;

        const base = cl.code;
        byCode.set(base, (byCode.get(base) || 0) + n);
        bySignature.set(cl.signature, (bySignature.get(cl.signature) || 0) + n);
        byDirection.set(cl.direction, (byDirection.get(cl.direction) || 0) + n);
        total += n;
    }

    return {
        code: (c) => byCode.get(getBaseCode(c)) || 0,
        signature: (s) => bySignature.get(s) || 0,
        direction: (d) => byDirection.get(d) || 0,
        total
    };
}

/** Combine two frequency sources: use `primary`, and `fallback` where it knows nothing. */
export function withFallback(primary, fallback) {
    return {
        code: (c) => primary.code(c) || fallback.code(c),
        signature: (s) => primary.signature(s) || fallback.signature(s),
        direction: (d) => primary.direction(d) || fallback.direction(d),
        total: primary.total || fallback.total
    };
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });

/**
 * Order directions: fewer tones first, then by frequency.
 * Ties keep the order of the standard table, then fall back to the alphabet.
 */
export function compareDirections(a, b, freq) {
    const ta = toneCount(a);
    const tb = toneCount(b);
    if (ta !== tb) return ta - tb;
    const fa = freq.direction(a);
    const fb = freq.direction(b);
    if (fa !== fb) return fb - fa;
    const ia = STANDARD_DIRECTIONS.indexOf(a);
    const ib = STANDARD_DIRECTIONS.indexOf(b);
    if (ia !== ib) return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib);
    return natural(a, b);
}

/** Order signatures: fewer tones first, then by the frequency of the signature. */
export function compareSignatures(a, b, freq) {
    const ta = toneCount(a);
    const tb = toneCount(b);
    if (ta !== tb) return ta - tb;
    const fa = freq.signature(a);
    const fb = freq.signature(b);
    if (fa !== fb) return fb - fa;
    return natural(a, b);
}

/**
 * Order codes: fewer tones first, then by the frequency of the code itself.
 * This is the "Tonzahl, then Häufigkeit" order for a flat list of patterns.
 */
export function compareCodes(a, b, freq) {
    const ta = toneCount(a);
    const tb = toneCount(b);
    if (ta !== tb) return ta - tb;
    const fa = freq.code(a);
    const fb = freq.code(b);
    if (fa !== fb) return fb - fa;
    return natural(getBaseCode(a), getBaseCode(b));
}

/** Sort a list of codes by tones, then frequency. Does not modify the input. */
export function sortCodes(codes, freq) {
    return [...codes].sort((a, b) => compareCodes(a, b, freq));
}

// ---------------------------------------------------------------------------
// Tiers: standard selection vs expanded documentation
// ---------------------------------------------------------------------------

/**
 * Where a pattern belongs when nobody has said otherwise: a plain pattern of a
 * standard direction is part of the standard table, anything else is an
 * addition of the expanded documentation. Special-sign patterns are only ever
 * "standard" when a scholar picks them for the L / O / Q / , column.
 */
export function defaultTier(code) {
    const cl = classify(code);
    if (cl.kind === 'clef' || cl.kind === 'custos') return 'standard';
    if (cl.kind === 'direction' && STANDARD_DIRECTIONS.includes(cl.direction)) return 'standard';
    return 'expanded';
}

/** The tier of a table row (`{ pattern, tier? }`). */
export function tierOf(row) {
    return (row && row.tier) || defaultTier(row && row.pattern);
}

/**
 * The distinct signatures a manuscript has selected for one special column.
 *
 * @param {Array<{pattern: string, tier?: string}>} rows
 * @param {string} key one of SPECIAL_KEYS
 */
export function selectedSignatures(rows, key) {
    const set = new Set();
    for (const row of rows || []) {
        if (tierOf(row) !== 'standard') continue;
        const cl = classify(row.pattern);
        if (cl.kind === 'special' && cl.column === key) set.add(cl.signature);
    }
    return [...set];
}

/**
 * May `code` be added to the standard selection of its column?
 *
 * Only special columns are limited: a third signature is fine, a fourth is not.
 * A further variant of a signature that is already selected always is.
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canSelectForStandard(rows, code, max = MAX_SPECIAL_SIGNATURES) {
    const cl = classify(code);
    if (cl.kind !== 'special') return { ok: true };

    const chosen = selectedSignatures(rows, cl.column);
    if (chosen.includes(cl.signature) || chosen.length < max) return { ok: true };
    return {
        ok: false,
        reason: `At most ${max} constellations per column — ${chosen.join(', ')} already chosen.`
    };
}

/**
 * How far a manuscript's standard table is filled in.
 *
 * @param {Array<{pattern: string, tier?: string}>} rows
 * @returns {{ directions: number, specials: Object<string, number>, clef: boolean, custos: boolean, expanded: number }}
 */
export function tableProgress(rows) {
    const list = rows || [];
    const standard = list.filter(r => tierOf(r) === 'standard');

    const directions = new Set(standard
        .map(r => classify(r.pattern))
        .filter(cl => cl.kind === 'direction' && STANDARD_DIRECTIONS.includes(cl.direction))
        .map(cl => cl.direction));

    const specials = {};
    for (const key of SPECIAL_KEYS) specials[key] = selectedSignatures(list, key).length;

    return {
        directions: directions.size,
        specials,
        clef: list.some(r => r.pattern === CLEF_CODE),
        custos: list.some(r => r.pattern === CUSTOS_CODE),
        expanded: list.filter(r => tierOf(r) === 'expanded').length
    };
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

/** @typedef {'standard'|'expanded'|'all'} TableMode */

/**
 * @typedef {Object} TableColumn
 * @property {string} key       unique, stable
 * @property {string} group     'direction' | 'L' | 'O' | 'Q' | 'S' | 'custom' | 'clef' | 'custos'
 * @property {string} header    what to print
 * @property {string} label
 * @property {string} [pattern] a code to draw (direction and signature columns)
 * @property {boolean} slot     a special column that collects up to three signatures
 */

function directionColumn(direction) {
    return {
        key: `dir:${direction}`,
        group: 'direction',
        header: direction,
        label: direction,
        pattern: direction,
        slot: false
    };
}

function signatureColumn(signature, group) {
    return {
        key: `sig:${signature}`,
        group,
        header: signature,
        label: signature,
        pattern: signature,
        slot: false
    };
}

function slotColumn(def) {
    return {
        key: `special:${def.key}`,
        group: def.key,
        header: def.header,
        label: def.label,
        slot: true
    };
}

const CLEF_COLUMN = { key: 'clef', group: 'clef', header: 'Clef', label: 'Schlüssel', slot: false };
const CUSTOS_COLUMN = { key: 'custos', group: 'custos', header: 'Custos', label: 'Custos', slot: false };

/**
 * Which column a pattern lands in, for a given table mode.
 *
 * In the standard table every special sign goes into the single column of its
 * letter; in the expanded table and the full table each signature has its own
 * column, so that the table reads as "everything, in order".
 *
 * @param {string} code
 * @param {TableMode} mode
 * @returns {TableColumn|null} null when the pattern has no place in this mode
 */
export function columnFor(code, mode) {
    const cl = classify(code);
    switch (cl.kind) {
        case 'clef': return CLEF_COLUMN;
        case 'custos': return CUSTOS_COLUMN;
        case 'direction': return directionColumn(cl.direction);
        case 'special':
            return mode === 'standard'
                ? slotColumn(SPECIAL_COLUMNS.find(c => c.key === cl.column))
                : signatureColumn(cl.signature, cl.column);
        case 'custom': return signatureColumn(cl.signature, 'custom');
        default: return null;
    }
}

/**
 * The columns of the table, in order.
 *
 * The standard table always has the same columns. The expanded and the full
 * table start from them and add a column for every extra pattern in `codes`,
 * placed by the ordering rule.
 *
 * @param {TableMode} mode
 * @param {Iterable<string>} codes the patterns that are in play (selected rows,
 *        or every annotated pattern) — ignored for the standard table
 * @param {ReturnType<typeof buildFrequency>} freq
 * @returns {TableColumn[]}
 */
export function buildColumns(mode, codes, freq) {
    const directions = new Set(STANDARD_DIRECTIONS);
    const signatures = { L: new Set(), O: new Set(), Q: new Set(), S: new Set(), custom: new Set() };

    if (mode !== 'standard') {
        for (const code of codes || []) {
            const cl = classify(code);
            if (cl.kind === 'direction') directions.add(cl.direction);
            else if (cl.kind === 'special') signatures[cl.column].add(cl.signature);
            else if (cl.kind === 'custom') signatures.custom.add(cl.signature);
        }
    }

    const columns = [...directions]
        .sort((a, b) => compareDirections(a, b, freq))
        .map(directionColumn);

    for (const def of SPECIAL_COLUMNS) {
        if (mode === 'standard') {
            columns.push(slotColumn(def));
        } else {
            [...signatures[def.key]]
                .sort((a, b) => compareSignatures(a, b, freq))
                .forEach(sig => columns.push(signatureColumn(sig, def.key)));
        }
    }

    if (mode !== 'standard') {
        [...signatures.custom]
            .sort((a, b) => compareSignatures(a, b, freq))
            .forEach(sig => columns.push(signatureColumn(sig, 'custom')));
    }

    columns.push(CLEF_COLUMN, CUSTOS_COLUMN);
    return columns;
}

/**
 * Group neighbouring columns under a heading, for the header row of a table and
 * for the sections of the editor.
 *
 *   Neume shapes · Special signs (standard table)
 *   Neume shapes · L — Liqueszenz · O — Oriscus · … (expanded and full table)
 *   Project-defined signs · Clef and custos
 *
 * @param {TableColumn[]} columns in table order
 * @returns {Array<{ key: string, label: string, columns: TableColumn[] }>}
 */
export function groupColumns(columns) {
    const groups = [];
    for (const col of columns) {
        let key;
        let label;
        if (col.group === 'direction') {
            key = 'shapes'; label = 'Neume shapes';
        } else if (col.slot) {
            key = 'special'; label = 'Special signs';
        } else if (SPECIAL_KEYS.includes(col.group)) {
            const def = SPECIAL_COLUMNS.find(c => c.key === col.group);
            key = `sign:${col.group}`; label = `${def.header} — ${def.label}`;
        } else if (col.group === 'custom') {
            key = 'custom'; label = 'Project-defined signs';
        } else {
            key = 'clef-custos'; label = 'Clef and custos';
        }
        const last = groups[groups.length - 1];
        if (last && last.key === key) last.columns.push(col);
        else groups.push({ key, label, columns: [col] });
    }
    return groups;
}

/**
 * Which rows are shown in which mode: the standard table shows only the
 * standard selection, the expanded documentation everything the manuscript
 * documents.
 */
export function rowsForMode(rows, mode) {
    if (mode === 'standard') return (rows || []).filter(r => tierOf(r) === 'standard');
    return rows || [];
}

// ---------------------------------------------------------------------------
// The pattern library
// ---------------------------------------------------------------------------

/**
 * Everything the library offers for one column of the standard table.
 *
 *   direction column  the plain variants of that direction (how the neume can
 *                     be written without signs: `*ud`, `[*u]d`, `*[ud]`, ...)
 *   special column    every pattern whose first special sign it is, grouped by
 *                     signature in the order tones → frequency
 *
 * @param {Iterable<string>} codes the whole library
 * @param {TableColumn} column
 * @param {ReturnType<typeof buildFrequency>} freq
 * @returns {Array<{signature: string, variants: string[]}>}
 */
export function libraryForColumn(codes, column, freq) {
    const bySignature = new Map();

    for (const code of new Set([...codes].map(getBaseCode))) {
        const cl = classify(code);
        const belongs = column.slot
            ? cl.kind === 'special' && cl.column === column.group
            : cl.kind === 'direction' && column.group === 'direction' && cl.direction === column.pattern;
        if (!belongs) continue;
        if (!bySignature.has(cl.signature)) bySignature.set(cl.signature, []);
        bySignature.get(cl.signature).push(code);
    }

    return [...bySignature.entries()]
        .sort(([a], [b]) => compareSignatures(a, b, freq))
        .map(([signature, variants]) => ({
            signature,
            variants: variants.sort((a, b) => freq.code(b) - freq.code(a) || natural(a, b))
        }));
}

/**
 * Search the whole library by code, for the expanded documentation.
 *
 * A query without brackets matches the signature (so `*udL` finds `[*u]dL`,
 * `*[ud]L` and `[*ud]L`); a query with brackets matches the code as written.
 * Results are in the table's order: tones, then frequency.
 *
 * @param {Iterable<string>} codes
 * @param {string} query
 * @param {ReturnType<typeof buildFrequency>} freq
 * @param {{ limit?: number, exclude?: Set<string> }} [options]
 */
export function searchLibrary(codes, query, freq, options = {}) {
    const { limit = 60, exclude = new Set() } = options;
    const q = String(query || '').trim();
    if (!q) return [];

    const withBrackets = /[[\]{}]/.test(q);
    const needle = withBrackets ? q : q.replace(/[()]/g, '');

    const hits = [];
    for (const code of new Set([...codes].map(getBaseCode))) {
        if (exclude.has(code)) continue;
        const cl = classify(code);
        if (cl.kind === 'other' || cl.kind === 'clef' || cl.kind === 'custos') continue;
        const haystack = withBrackets ? code : cl.signature;
        if (haystack.includes(needle)) hits.push(code);
    }

    return sortCodes(hits, freq).slice(0, limit);
}

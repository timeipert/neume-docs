/**
 * The table of a project: two levels of columns, and how a project's selection
 * of them is kept.
 *
 *   level 1  a group: a shape (only the movement of the notes — `*ud`, up, down —
 *            whatever sits on them), then one group for each special sign (L, O, Q, S),
 *            then Clef and Custos together
 *   level 2  the columns proper: every code of the pattern library that belongs to the
 *            group — under a shape the plain ways of writing it, in brackets, and the code
 *            variants (`*ud`, `[*u]d`, `*uVd`, ...); under a sign the codes whose first
 *            special sign it is (`*dL`, `[*uL]`, ...)
 *
 * One rule orders everything: **length, then frequency** — fewer notes first, and
 * among equally long the more frequent first. It orders the shapes, and the codes
 * under each group (the ways of writing one signature stay together).
 *
 * A **code variant** (a code the pattern library derives from another by marking a
 * note with a sign of the project, the virga above all: `*uuVdd` of `*uudd`) is a column
 * of its own, in the group of the code it comes from and right after it — a variant is
 * shown with the patterns, not apart from them.
 *
 * A project selects level-2 columns twice over:
 *
 *   columns    the standard table: the standard shapes (`*` `*d` `*u` `*e` `*dd` `*ud`
 *              `*uu` `*du` `*udd` `*uud` `*ddu`), the special signs on them, Clef and
 *              Custos. A special sign (L O Q `,`) takes at most three constellations.
 *   extended   anything else the library has, added for this project.
 *
 * Frequency, classification and the three-constellation rule are those of
 * `neumeTable.js`; this file only arranges them into the two levels. Plain
 * functions, no stores.
 */

import {
    CUSTOS_CODE,
    SPECIAL_COLUMNS,
    STANDARD_CLEFS,
    STANDARD_VIRGA_SET,
    STANDARD_DIRECTIONS,
    MAX_SPECIAL_SIGNATURES,
    canSelectForStandard,
    classify,
    compareDirections,
    compareSignatures
} from './neumeTable.js';
import { getBaseCode } from './patternCode.js';

const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });

/** The built-in sign of the virga. A code that differs from another only by it is that code's virga variant. */
export const VIRGA_SIGN = 'V';

/**
 * The virga variants among some codes, without anyone having registered them: `*V` of `*`,
 * `[*Vd]` of `[*d]`, `*uuVdd` of `*uudd`, `[*VdL]` of `[*dL]`. A code is one when taking the virga
 * out leaves a code of a shape or of a special sign — a project's other signs leave it a code of its own.
 *
 * @param {Iterable<string>} codes
 * @returns {Map<string, { base: string, label: string, id: string }>} variant → the code it is a variant of
 */
export function virgaVariants(codes) {
    const out = new Map();
    for (const raw of codes || []) {
        const code = getBaseCode(raw);
        if (!code.includes(VIRGA_SIGN)) continue;
        const base = code.replaceAll(VIRGA_SIGN, '');
        if (!['direction', 'special'].includes(classify(base).kind)) continue;
        out.set(code, { base, label: 'Virga', id: '' });
    }
    return out;
}

/**
 * The group a code stands under, or null when it has no place in a table.
 * `standard` says whether this code can be a column of the standard table.
 *
 *   a shape      the movement only, whatever the signs of the project on it
 *   a sign       a code with a built-in special sign (L, O, Q, S) stands under that sign,
 *                not under its shape
 *   clef/custos  together, at the end
 *
 * @param {string} code
 * @returns {{ key: string, label: string, title: string, group: 'direction'|'sign'|'other', standard: boolean, direction?: string, sign?: string }|null}
 */
export function categoryOf(code) {
    const cl = classify(code);
    switch (cl.kind) {
        case 'clef':
        case 'custos':
            return { key: 'other', label: 'Clef · Custos', title: '', group: 'other', standard: true };
        case 'special': {
            const def = SPECIAL_COLUMNS.find(c => c.key === cl.column);
            return {
                key: `sign:${cl.column}`,
                label: cl.column,
                title: def ? def.label : '',
                group: 'sign',
                sign: cl.column,
                // The standard table has the signs on the standard shapes.
                standard: STANDARD_DIRECTIONS.includes(cl.direction)
            };
        }
        case 'direction':
        case 'custom':
            return {
                key: `dir:${cl.direction}`,
                label: cl.direction,
                title: '',
                group: 'direction',
                direction: cl.direction,
                // The standard table has the standard shapes; a sign of the project makes a code an addition.
                standard: cl.kind !== 'custom' && STANDARD_DIRECTIONS.includes(cl.direction)
            };
        default: return null;
    }
}

/**
 * Where a code stands in the standard table's own rule: the plain ways of writing a
 * shape share one place, and each special sign has one (that is where its limit of
 * three constellations applies).
 */
function slotOf(code) {
    const cl = classify(code);
    if (cl.kind === 'direction') return `dir:${cl.direction}`;
    if (cl.kind === 'special') return `sign:${cl.column}`;
    if (cl.kind === 'clef' || cl.kind === 'custos') return cl.kind;
    return '';
}

/**
 * Every group (shapes, signs, clef and custos) with its columns, in table order.
 *
 * @param {Iterable<string>} allCodes every code the library knows
 * @param {ReturnType<import('./neumeTable.js').buildFrequency>} freq
 * @param {{ variants?: Map<string, { base: string, label?: string, id?: string }> }} [options]
 *   `variants`: code variant → the code it is a variant of
 * @returns {{
 *   categories: Array<{ key: string, label: string, title: string, group: 'direction'|'sign'|'other', direction?: string, sign?: string, columns: LibraryColumn[] }>,
 *   byCode: Map<string, LibraryColumn>,
 *   byKey: Map<string, object>,
 *   variantOf: (code: string) => string
 * }}
 *
 * @typedef {{ code: string, signature: string, tones: number, categoryKey: string, freq: number, standard: boolean,
 *             variantOf?: string, variantLabel?: string, variantId?: string, baseFreq: number }} LibraryColumn
 */
export function buildLibrary(allCodes, freq, { variants = new Map() } = {}) {
    const byKey = new Map();
    const byCode = new Map();
    const inSet = new Set(STANDARD_VIRGA_SET);
    // The virga variants need no registering: they are found by their sign. Registered ones win.
    variants = new Map([...virgaVariants([...allCodes || [], ...STANDARD_VIRGA_SET]), ...variants]);
    const variantOf = (code) => {
        const v = variants.get(getBaseCode(code));
        return v ? getBaseCode(v.base) : '';
    };

    const add = (raw) => {
        const code = getBaseCode(raw);
        if (!code || byCode.has(code)) return;
        const base = variantOf(code);
        // A code variant is placed, and judged, by the code it comes from.
        const cat = categoryOf(base || code);
        if (!cat) return;
        const cl = classify(base || code);
        const info = variants.get(code) || {};
        if (!byKey.has(cat.key)) {
            const { standard, ...shape } = cat;
            byKey.set(cat.key, { ...shape, columns: [] });
        }
        const column = {
            code, signature: cl.signature, tones: cl.tones, categoryKey: cat.key, freq: freq.code(code),
            baseFreq: freq.code(base || code), standard: cat.standard || inSet.has(code),
            ...(base ? { variantOf: base, variantLabel: info.label || '', variantId: info.id || '' } : {})
        };
        byKey.get(cat.key).columns.push(column);
        byCode.set(code, column);
    };

    for (const code of allCodes || []) add(code);
    // The shapes of the standard table exist even when the library has nothing for them yet,
    // and so do its virga variants, its clefs and the custos.
    STANDARD_DIRECTIONS.forEach(add);
    STANDARD_VIRGA_SET.forEach(add);
    STANDARD_CLEFS.forEach(add);
    add(CUSTOS_CODE);

    // Length, then frequency: the signature (its notes, then how often it occurs, in any way of writing it),
    // then the ways of writing it; a variant follows the code it comes from.
    const baseOf = (c) => c.variantOf || c.code;
    // Clefs and custos have no notes to order by: C, F, the clefs added since, then the custos.
    const pseudoRank = (c) => (c.code === CUSTOS_CODE ? 2 : STANDARD_CLEFS.includes(c.code) ? 0 : 1);
    for (const cat of byKey.values()) {
        if (cat.group === 'other') {
            cat.columns.sort((a, b) => pseudoRank(a) - pseudoRank(b) || natural(a.code, b.code));
            continue;
        }
        cat.columns.sort((a, b) =>
            compareSignatures(a.signature, b.signature, freq)
            || b.baseFreq - a.baseFreq
            || natural(baseOf(a), baseOf(b))
            || (a.variantOf ? 1 : 0) - (b.variantOf ? 1 : 0)
            || natural(a.code, b.code));
    }

    // The shapes, then the special signs in the order of the brief, then clef and custos.
    const rank = { direction: 0, sign: 1, other: 2 };
    const signOrder = (cat) => SPECIAL_COLUMNS.findIndex(c => c.key === cat.sign);
    const categories = [...byKey.values()].sort((a, b) => {
        if (a.group !== b.group) return rank[a.group] - rank[b.group];
        if (a.group === 'sign') return signOrder(a) - signOrder(b);
        return a.group === 'other' ? 0 : compareDirections(a.direction, b.direction, freq);
    });

    return { categories, byCode, byKey, variantOf };
}

/**
 * The columns of a table, under their categories, in library order.
 *
 * @param {ReturnType<typeof buildLibrary>} library
 * @param {Iterable<string>} codes the selected columns
 * @returns {Array<{ key: string, label: string, title: string, group: string, columns: LibraryColumn[] }>}
 */
export function groupSelected(library, codes) {
    const wanted = new Set([...codes || []].map(getBaseCode));
    const out = [];
    for (const cat of library.categories) {
        const columns = cat.columns.filter(c => wanted.has(c.code));
        if (columns.length) out.push({ ...cat, columns });
    }
    return out;
}

/** The codes of the table for a project: the standard selection, or with the extended additions. */
export function tableCodes(project, mode) {
    const standard = project.columns || [];
    if (mode === 'standard') return standard;
    const seen = new Set(standard);
    return [...standard, ...(project.extended || []).filter(c => !seen.has(c))];
}

/**
 * Which columns of a category to draw while choosing columns: everything that is
 * selected or already has something, plus the most frequent few — or all of them.
 * The variants of a column that is drawn are drawn with it: a variant is shown with the patterns.
 *
 * @param {{ columns: LibraryColumn[] }} category
 * @param {{ keep?: Set<string>, expanded?: boolean, top?: number }} [options]
 */
export function columnsToShow(category, { keep = new Set(), expanded = false, top = 4 } = {}) {
    const columns = category.columns;
    if (expanded || columns.length <= top) return columns;
    const frequent = new Set(
        columns
            .map((c, i) => ({ c, i }))
            .sort((a, b) => b.c.freq - a.c.freq || a.i - b.i)
            .slice(0, top)
            .map(x => x.c.code)
    );
    return columns.filter(c => frequent.has(c.code) || keep.has(c.code) || (c.variantOf && frequent.has(c.variantOf)));
}

// ---------------------------------------------------------------------------
// Choosing columns
// ---------------------------------------------------------------------------

/**
 * Add a column to the standard selection.
 *
 * @returns {{ ok: true, columns: string[] } | { ok: false, reason: string }}
 */
export function selectColumn(columns, code, max = MAX_SPECIAL_SIGNATURES, variantOf = () => '') {
    const base = getBaseCode(code);
    // A code variant is of the shape, and counts as the constellation, of the code it comes from.
    const origin = variantOf(base) || base;
    const cat = categoryOf(origin);
    if (!cat) return { ok: false, reason: `${base} is not a neume shape, so it has no column.` };
    if (!cat.standard && !STANDARD_VIRGA_SET.includes(base)) return { ok: false, reason: `${base} belongs to the extended table, not the standard table.` };
    if (columns.includes(base)) return { ok: true, columns };
    const verdict = canSelectForStandard(columns.map(pattern => ({ pattern: variantOf(pattern) || pattern, tier: 'standard' })), origin, max);
    if (!verdict.ok) return { ok: false, reason: verdict.reason };
    return { ok: true, columns: [...columns, base] };
}

/**
 * What the extended list holds that the standard table has a place for, moved there: a code of a
 * standard shape (or a variant of one) is a column of the standard table, whatever way it came
 * into the extended list. What the rules refuse — a fourth constellation of a sign — stays.
 *
 * @returns {{ columns: string[], extended: string[], moved: string[] }}
 */
export function promoteToStandard(columns, extended, variantOf = () => '') {
    let current = [...columns];
    const moved = [];
    for (const code of extended) {
        const result = selectColumn(current, code, undefined, variantOf);
        if (result.ok && result.columns.length > current.length) {
            current = result.columns;
            moved.push(code);
        }
    }
    return { columns: current, extended: extended.filter(c => !moved.includes(c)), moved };
}

export function deselectColumn(columns, code) {
    const base = getBaseCode(code);
    return columns.filter(c => c !== base);
}

/**
 * Columns worth starting from.
 *
 *   annotated    codes that already have snippets in the project's folios — always
 *   occurring    the most frequent code of each shape (and of each special sign) in the
 *                transcription of those folios, when it has no column yet
 *
 * A column that cannot be selected (not in the standard categories, a fourth
 * constellation) is left out. Returns only what is not selected yet.
 *
 * @param {ReturnType<typeof buildLibrary>} library
 * @param {{ annotated?: Map<string, number>, occurring?: Map<string, number>, current?: string[] }} input
 * @returns {{ fromAnnotations: string[], fromTranscription: string[] }}
 */
export function suggestColumns(library, { annotated = new Map(), occurring = new Map(), current = [] } = {}) {
    let columns = [...current];
    const fromAnnotations = [];
    const fromTranscription = [];

    const take = (code, into) => {
        const result = selectColumn(columns, code, MAX_SPECIAL_SIGNATURES, library.variantOf);
        if (result.ok && result.columns.length > columns.length) {
            columns = result.columns;
            into.push(getBaseCode(code));
        }
    };

    const byCount = (map) => [...map.entries()].sort((a, b) => b[1] - a[1] || natural(a[0], b[0])).map(([code]) => code);

    for (const code of byCount(annotated)) take(code, fromAnnotations);

    const covered = new Set(columns.map(c => slotOf(library.variantOf(c) || c)));
    const best = new Map();
    for (const code of byCount(occurring)) {
        const origin = library.variantOf(code) || code;
        const cat = categoryOf(origin);
        const slot = slotOf(origin);
        if (!cat || !cat.standard || covered.has(slot) || best.has(slot)) continue;
        best.set(slot, code);
    }
    const wanted = new Set(best.values());
    for (const cat of library.categories) {
        for (const column of cat.columns) if (wanted.has(column.code)) take(column.code, fromTranscription);
    }

    return { fromAnnotations, fromTranscription };
}

/** How many codes of a table have at least one snippet. */
export function filledCount(codes, snippetsByCode) {
    let n = 0;
    for (const code of codes) if ((snippetsByCode.get(getBaseCode(code)) || []).length) n++;
    return n;
}

// ---------------------------------------------------------------------------
// A code of one's own
// ---------------------------------------------------------------------------

/**
 * Whether a text is a pattern code the library can take, and what it is.
 *
 * The grammar is that of the transcription: the first note is `*`, each next one
 * `u`, `d` or `e`, a note may carry upper-case signs (`L`, `O`, a sign of the
 * project), and `[ ]` / `{ }` mark notes written as one group.
 *
 * @returns {{ ok: boolean, code: string, message: string, category: ReturnType<typeof categoryOf> }}
 */
export function checkCode(text) {
    const code = String(text ?? '').trim();
    const fail = (message) => ({ ok: false, code, message, category: null });
    if (!code) return fail('');
    if (/\s/.test(code)) return fail('A code has no spaces.');
    if (classify(code).kind === 'clef') return { ok: true, code, message: '', category: categoryOf(code) };
    if (/^\(clef/i.test(code)) return fail('A clef is written (Clef-C), (Clef-F), … with its letter.');
    if (!/^[*ude[\]{}A-Z]+$/.test(code)) return fail('A code is made of * u d e, upper-case signs, and [ ] for groups.');

    let depth = 0;
    for (const ch of code) {
        if (ch === '[' || ch === '{') depth++;
        if (ch === ']' || ch === '}') depth--;
        if (depth < 0) return fail('A bracket is closed that was not opened.');
    }
    if (depth !== 0) return fail('A bracket is not closed.');

    const notes = code.replace(/[[\]{}]/g, '').replace(/[A-Z]/g, '');
    if (notes[0] !== '*') return fail('A code starts with * (the first note).');
    if (!/^\*[ude]*$/.test(notes)) return fail('After the first note come only u (up), d (down) and e (equal).');
    if (/[A-Z]\*|^[A-Z]/.test(code.replace(/[[\]{}]/g, ''))) return fail('A sign belongs after a note.');

    const category = categoryOf(code);
    return category ? { ok: true, code, message: '', category } : fail('That is not a neume shape.');
}

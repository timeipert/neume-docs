/**
 * The table of a project: two levels of columns, and how a project's selection
 * of them is kept.
 *
 *   level 1  a shape: only the movement of the notes (`*ud` — up, down), whatever
 *            the signs on them; Clef and Custos stand together at the end
 *   level 2  the columns proper: every code of the pattern library that has that
 *            movement — plain, in brackets, with signs, code variants
 *            (`*ud`, `[*u]d`, `*udL`, `*uVd`, ...)
 *
 * One rule orders everything: **length, then frequency** — fewer notes first, and
 * among equally long the more frequent first. It orders the shapes, and the codes
 * under each shape (the ways of writing one signature stay together).
 *
 * A **code variant** (a code the pattern library derives from another by marking a
 * note with a sign of the project: `*uuVdd` of `*uudd`) is a column of its own, in the
 * shape of the code it comes from and right after it.
 *
 * A project selects level-2 columns twice over:
 *
 *   columns    the standard table: the standard shapes (`*` `*d` `*u` `*e` `*dd` `*ud`
 *              `*uu` `*du` `*udd` `*uud` `*ddu`), plain or with the built-in signs, Clef and
 *              Custos. A special sign (L O Q `,`) takes at most three constellations.
 *   extended   anything else the library has, added for this project.
 *
 * Frequency, classification and the three-constellation rule are those of
 * `neumeTable.js`; this file only arranges them into the two levels. Plain
 * functions, no stores.
 */

import {
    CLEF_CODE,
    CUSTOS_CODE,
    STANDARD_DIRECTIONS,
    MAX_SPECIAL_SIGNATURES,
    canSelectForStandard,
    classify,
    compareDirections,
    compareSignatures
} from './neumeTable.js';
import { getBaseCode } from './patternCode.js';

const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });

/**
 * The shape a code stands under, or null when it has no place in a table.
 * `standard` says whether this code can be a column of the standard table.
 *
 * @param {string} code
 * @returns {{ key: string, label: string, title: string, group: 'direction'|'other', standard: boolean, direction?: string }|null}
 */
export function categoryOf(code) {
    const cl = classify(code);
    switch (cl.kind) {
        case 'clef':
        case 'custos':
            return { key: 'other', label: 'Clef · Custos', title: '', group: 'other', standard: true };
        case 'direction':
        case 'special':
        case 'custom':
            return {
                key: `dir:${cl.direction}`,
                label: cl.direction,
                title: '',
                group: 'direction',
                direction: cl.direction,
                // The standard table has the standard shapes, plain or with built-in signs; a sign of the project makes a code an addition.
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
 * Every shape with its columns, in table order.
 *
 * @param {Iterable<string>} allCodes every code the library knows
 * @param {ReturnType<import('./neumeTable.js').buildFrequency>} freq
 * @param {{ variants?: Map<string, { base: string, label?: string, id?: string }> }} [options]
 *   `variants`: code variant → the code it is a variant of
 * @returns {{
 *   categories: Array<{ key: string, label: string, title: string, group: string, direction?: string, columns: LibraryColumn[] }>,
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
            baseFreq: freq.code(base || code), standard: cat.standard,
            ...(base ? { variantOf: base, variantLabel: info.label || '', variantId: info.id || '' } : {})
        };
        byKey.get(cat.key).columns.push(column);
        byCode.set(code, column);
    };

    for (const code of allCodes || []) add(code);
    // The shapes of the standard table exist even when the library has nothing for them yet.
    STANDARD_DIRECTIONS.forEach(add);
    add(CLEF_CODE);
    add(CUSTOS_CODE);

    // Length, then frequency: the signature (its notes, then how often it occurs, in any way of writing it),
    // then the ways of writing it; a variant follows the code it comes from.
    const baseOf = (c) => c.variantOf || c.code;
    for (const cat of byKey.values()) {
        cat.columns.sort((a, b) =>
            compareSignatures(a.signature, b.signature, freq)
            || b.baseFreq - a.baseFreq
            || natural(baseOf(a), baseOf(b))
            || (a.variantOf ? 1 : 0) - (b.variantOf ? 1 : 0)
            || natural(a.code, b.code));
    }

    const categories = [...byKey.values()].sort((a, b) => {
        if (a.group !== b.group) return a.group === 'other' ? 1 : -1;
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
    return columns.filter(c => frequent.has(c.code) || keep.has(c.code));
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
    if (!cat.standard) return { ok: false, reason: `${base} belongs to the extended table, not the standard table.` };
    if (columns.includes(base)) return { ok: true, columns };
    const verdict = canSelectForStandard(columns.map(pattern => ({ pattern: variantOf(pattern) || pattern, tier: 'standard' })), origin, max);
    if (!verdict.ok) return { ok: false, reason: verdict.reason };
    return { ok: true, columns: [...columns, base] };
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

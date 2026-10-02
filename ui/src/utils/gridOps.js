/**
 * The logic behind the metadata table, as plain functions over a rectangular
 * grid of text cells: reading and writing delimited text (what Excel copies and
 * pastes), and planning an edit — paste, fill, clear, clean up, find and
 * replace — as a list of changes before any of it is applied. The component
 * only has to carry the plans out, which is also what makes undo simple.
 *
 * A grid is addressed by row and column index. Functions that plan an edit take
 *   get(r, c)          the current text of a cell
 *   isReadonly(r, c)   whether the cell may not be changed
 * and return changes `{ r, c, before, value }`; cells whose text would not
 * change are left out.
 */

// ---------------------------------------------------------------------------
// Delimited text
// ---------------------------------------------------------------------------

/** Tab if the first record has one (a copy from Excel), else whichever of ; and , it uses more. */
export function detectDelimiter(text) {
    let tabs = 0;
    let semicolons = 0;
    let commas = 0;
    let quoted = false;
    for (const ch of String(text)) {
        if (ch === '"') quoted = !quoted;
        else if (!quoted && (ch === '\n' || ch === '\r')) break;
        else if (!quoted && ch === '\t') tabs++;
        else if (!quoted && ch === ';') semicolons++;
        else if (!quoted && ch === ',') commas++;
    }
    if (tabs > 0) return '\t';
    return semicolons > commas ? ';' : ',';
}

/**
 * Parse delimited text into rows of cells. Quoted cells may hold the delimiter,
 * doubled quotes and line breaks; a final line break does not make an empty row.
 *
 * @param {string} text
 * @param {string} [delimiter] detected when omitted
 * @returns {string[][]}
 */
export function parseDelimited(text, delimiter) {
    const src = String(text).replace(/^﻿/, '');
    if (src === '') return [];
    const d = delimiter || detectDelimiter(src);

    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;

    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (quoted) {
            if (ch === '"') {
                if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
            } else {
                cell += ch;
            }
        } else if (ch === '"' && cell === '') {
            quoted = true;
        } else if (ch === d) {
            row.push(cell); cell = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && src[i + 1] === '\n') i++;
            row.push(cell); cell = '';
            rows.push(row); row = [];
        } else {
            cell += ch;
        }
    }
    if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
    return rows;
}

/** Rows of cells as delimited text; a cell is quoted only where it has to be. */
export function formatDelimited(rows, delimiter = '\t') {
    const quote = (v) => {
        const s = v === null || v === undefined ? '' : String(v);
        return s.includes(delimiter) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return rows.map(r => r.map(quote).join(delimiter)).join('\r\n');
}

// ---------------------------------------------------------------------------
// Ranges
// ---------------------------------------------------------------------------

/** The rectangle between two corner cells, whichever way round they are given. */
export function normalizeRange(a, b) {
    return {
        r0: Math.min(a.r, b.r), c0: Math.min(a.c, b.c),
        r1: Math.max(a.r, b.r), c1: Math.max(a.c, b.c)
    };
}

export function rangeSize(range) {
    return (range.r1 - range.r0 + 1) * (range.c1 - range.c0 + 1);
}

export function inRange(range, r, c) {
    return !!range && r >= range.r0 && r <= range.r1 && c >= range.c0 && c <= range.c1;
}

/** The cells of a range as a matrix of text — what gets copied. */
export function matrixOf(range, get) {
    const out = [];
    for (let r = range.r0; r <= range.r1; r++) {
        const row = [];
        for (let c = range.c0; c <= range.c1; c++) row.push(get(r, c) ?? '');
        out.push(row);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Planning edits
// ---------------------------------------------------------------------------

function change(get, r, c, value) {
    const before = get(r, c) ?? '';
    return before === value ? null : { r, c, before, value };
}

/**
 * Paste a block of text.
 *
 * One value pasted over a selection of several cells fills the whole selection,
 * as in Excel. Otherwise the block is written from the selection's top-left
 * cell; whatever falls outside the grid, or on a read-only cell, is skipped.
 *
 * @param {{ matrix: string[][], anchor: {r:number,c:number}, selection?: object|null,
 *           rowCount: number, colCount: number,
 *           get: Function, isReadonly: Function }} p
 * @returns {{ changes: object[], skippedReadonly: number, skippedOutside: number }}
 */
export function planPaste({ matrix, anchor, selection = null, rowCount, colCount, get, isReadonly }) {
    const changes = [];
    let skippedReadonly = 0;
    let skippedOutside = 0;
    if (!matrix.length) return { changes, skippedReadonly, skippedOutside };

    const single = matrix.length === 1 && matrix[0].length === 1;
    if (single && selection && rangeSize(selection) > 1) {
        for (let r = selection.r0; r <= selection.r1; r++) {
            for (let c = selection.c0; c <= selection.c1; c++) {
                if (isReadonly(r, c)) { skippedReadonly++; continue; }
                const ch = change(get, r, c, matrix[0][0]);
                if (ch) changes.push(ch);
            }
        }
        return { changes, skippedReadonly, skippedOutside };
    }

    const origin = selection ? { r: selection.r0, c: selection.c0 } : anchor;
    matrix.forEach((cells, dr) => {
        cells.forEach((value, dc) => {
            const r = origin.r + dr;
            const c = origin.c + dc;
            if (r >= rowCount || c >= colCount) { skippedOutside++; return; }
            if (isReadonly(r, c)) { skippedReadonly++; return; }
            const ch = change(get, r, c, value);
            if (ch) changes.push(ch);
        });
    });
    return { changes, skippedReadonly, skippedOutside };
}

/**
 * Fill a range from its first row (down) or first column (right), like Ctrl+D
 * and Ctrl+R. A range of a single row or column fills from the cell above or to
 * the left of it instead, which is what Excel does too.
 */
export function planFill({ range, direction, get, isReadonly }) {
    const changes = [];
    let skippedReadonly = 0;
    const down = direction === 'down';
    const lo = down ? range.r0 : range.c0;
    const hi = down ? range.r1 : range.c1;
    const multi = hi > lo;
    const sourceIndex = multi ? lo : lo - 1;
    if (sourceIndex < 0) return { changes, skippedReadonly };
    const firstTarget = multi ? lo + 1 : lo;

    for (let r = range.r0; r <= range.r1; r++) {
        for (let c = range.c0; c <= range.c1; c++) {
            if ((down ? r : c) < firstTarget) continue;
            if (isReadonly(r, c)) { skippedReadonly++; continue; }
            const ch = change(get, r, c, (down ? get(sourceIndex, c) : get(r, sourceIndex)) ?? '');
            if (ch) changes.push(ch);
        }
    }
    return { changes, skippedReadonly };
}

/** Empty every writable cell of a range. */
export function planClear({ range, get, isReadonly }) {
    return planMap({ range, get, isReadonly, fn: () => '' });
}

/** Apply a text function to every writable cell of a range. */
export function planMap({ range, get, isReadonly, fn }) {
    const changes = [];
    let skippedReadonly = 0;
    for (let r = range.r0; r <= range.r1; r++) {
        for (let c = range.c0; c <= range.c1; c++) {
            if (isReadonly(r, c)) { skippedReadonly++; continue; }
            const ch = change(get, r, c, fn(get(r, c) ?? '', r, c));
            if (ch) changes.push(ch);
        }
    }
    return { changes, skippedReadonly };
}

export const CLEAN_UP = {
    trim: (s) => s.replace(/\s+/g, ' ').trim(),
    upper: (s) => s.toUpperCase(),
    lower: (s) => s.toLowerCase(),
    title: (s) => s.toLowerCase().replace(/(^|[\s(/–-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
};

/**
 * Find and replace over a range.
 *
 * @param {{ range: object, get: Function, isReadonly: Function, find: string, replace: string,
 *           matchCase?: boolean, wholeCell?: boolean, regex?: boolean }} p
 * @returns {{ changes: object[], error?: string }}
 */
export function planReplace({ range, get, isReadonly, find, replace, matchCase = false, wholeCell = false, regex = false }) {
    if (find === '') return { changes: [] };

    let pattern;
    try {
        const source = regex ? find : find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        pattern = new RegExp(wholeCell ? `^(?:${source})$` : source, matchCase ? 'g' : 'gi');
    } catch (e) {
        return { changes: [], error: `Not a valid pattern: ${e.message}` };
    }

    const changes = [];
    for (let r = range.r0; r <= range.r1; r++) {
        for (let c = range.c0; c <= range.c1; c++) {
            if (isReadonly(r, c)) continue;
            const before = get(r, c) ?? '';
            const value = before.replace(pattern, regex ? replace : () => replace);
            if (value !== before) changes.push({ r, c, before, value });
        }
    }
    return { changes };
}

// ---------------------------------------------------------------------------
// Filtering and sorting
// ---------------------------------------------------------------------------

/**
 * Whether a cell passes a column filter.
 *
 *   text      contains the text, ignoring case
 *   =text     is exactly the text ("=" alone: is empty)
 *   !text     does not contain the text ("!" alone: is not empty)
 */
export function matchesFilter(value, expr) {
    const e = String(expr ?? '').trim();
    if (e === '') return true;
    const v = String(value ?? '').toLowerCase();
    if (e.startsWith('=')) return v === e.slice(1).trim().toLowerCase();
    if (e.startsWith('!')) {
        const rest = e.slice(1).trim().toLowerCase();
        return rest === '' ? v !== '' : !v.includes(rest);
    }
    return v.includes(e.toLowerCase());
}

/** Natural order, with empty cells last whichever way it runs. */
export function compareCells(a, b, descending = false) {
    const x = String(a ?? '');
    const y = String(b ?? '');
    if (x === '' && y === '') return 0;
    if (x === '') return 1;
    if (y === '') return -1;
    const cmp = x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' });
    return descending ? -cmp : cmp;
}

// ---------------------------------------------------------------------------
// Importing a table
// ---------------------------------------------------------------------------

/**
 * Match an imported table to the grid.
 *
 * The first row names the columns (by label or key, ignoring case); one of them
 * identifies the row. Cells of columns the grid does not have, and rows it does
 * not know, are reported rather than guessed at.
 *
 * @param {string[][]} matrix imported rows, header first
 * @param {{ columns: Array<{key: string, label: string}>, rowIndexByKey: Map<string, number>, keyColumn: string,
 *           get: Function, isReadonly: Function }} p
 * @returns {{ changes: object[], matchedRows: number, unmatchedRows: string[], unknownColumns: string[], readonlyColumns: string[], error?: string }}
 */
export function planImport(matrix, { columns, rowIndexByKey, keyColumn, get, isReadonly }) {
    const result = { changes: [], matchedRows: 0, unmatchedRows: [], unknownColumns: [], readonlyColumns: [] };
    if (matrix.length < 2) return { ...result, error: 'The file needs a header row and at least one row of data.' };

    const norm = (s) => String(s ?? '').trim().toLowerCase();
    const byName = new Map();
    columns.forEach((col, c) => { byName.set(norm(col.label), c); byName.set(norm(col.key), c); });

    const header = matrix[0].map(h => byName.get(norm(h)));
    const keyIndex = columns.findIndex(col => col.key === keyColumn);
    const keyAt = header.indexOf(keyIndex);
    if (keyAt === -1) return { ...result, error: `The file has no “${columns[keyIndex] ? columns[keyIndex].label : keyColumn}” column to tell the rows apart.` };

    matrix[0].forEach((h, i) => {
        if (header[i] === undefined && norm(h) !== '') result.unknownColumns.push(String(h).trim());
    });

    for (let i = 1; i < matrix.length; i++) {
        const line = matrix[i];
        const id = norm(line[keyAt]);
        if (id === '') continue;
        const r = rowIndexByKey.get(id);
        if (r === undefined) { result.unmatchedRows.push(String(line[keyAt]).trim()); continue; }
        result.matchedRows++;
        header.forEach((c, at) => {
            if (c === undefined || c === keyIndex) return;
            if (isReadonly(r, c)) {
                if (!result.readonlyColumns.includes(columns[c].label)) result.readonlyColumns.push(columns[c].label);
                return;
            }
            const value = String(line[at] ?? '').trim();
            const before = get(r, c) ?? '';
            if (value !== before) result.changes.push({ r, c, before, value });
        });
    }
    return result;
}

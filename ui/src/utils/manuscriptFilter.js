/**
 * Filtering the manuscripts table: which manuscripts to show, by what their metadata says.
 *
 * A filter is a set of rules, at most one per column, joined by `mode`:
 *   all   a manuscript has to satisfy every rule (the default: each rule narrows)
 *   any   it is enough to satisfy one
 *
 * A rule says what to keep in one column, by its kind:
 *   values   one of the listed values (case, accents and surrounding space do not count), and/or empty
 *   text     contains / equals / starts with / matches a pattern / is empty / has a value
 *   years    a date range: the cell is read as a dating ("s. XI/XII", "c. 1100") and kept if it
 *            overlaps — or lies fully within — the range
 *   number   at least and/or at most
 * Any rule can be turned round with `not`: keep everything the rule would drop.
 *
 * Everything here is plain functions over plain data, so a filter can be stored (as a saved
 * view), cleaned when read back, and tested without the table.
 */
import { parseDateRange } from './sourceMeta';

export const FILTER_KINDS = ['values', 'text', 'years', 'number'];
export const TEXT_OPS = ['contains', 'equals', 'starts', 'regex', 'empty', 'filled'];

const MAX_VALUES = 300;
const MAX_TEXT = 200;
/** A column with more distinct values than this is searched, not ticked. */
export const MAX_FACET_VALUES = 60;

const plainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v, max = MAX_TEXT) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Lower case, no accents, no surrounding space: how values are compared. */
export function fold(value) {
    return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export const emptyFilter = () => ({ mode: 'all', rules: {} });

// ---- rules as they are kept ---------------------------------------------------------------

/** A rule as it is kept, or null if it says nothing. */
export function cleanRule(raw) {
    if (!plainObject(raw)) return null;
    const not = raw.not === true;

    if (raw.kind === 'values') {
        const seen = new Set();
        const values = [];
        for (const v of Array.isArray(raw.values) ? raw.values : []) {
            const t = str(v);
            if (t && !seen.has(fold(t))) { seen.add(fold(t)); values.push(t); }
        }
        const empty = raw.empty === true;
        return values.length || empty ? { kind: 'values', values: values.slice(0, MAX_VALUES), empty, not } : null;
    }
    if (raw.kind === 'text') {
        const op = TEXT_OPS.includes(raw.op) ? raw.op : 'contains';
        const text = str(raw.text);
        if ((op === 'empty' || op === 'filled')) return { kind: 'text', op, text: '', not };
        return text ? { kind: 'text', op, text, not } : null;
    }
    if (raw.kind === 'years') {
        let from = finite(raw.from);
        let to = finite(raw.to);
        if (from === null && to === null) return null;
        if (from !== null && to !== null && from > to) [from, to] = [to, from];
        return { kind: 'years', from, to, within: raw.within === true, undated: raw.undated === true, not };
    }
    if (raw.kind === 'number') {
        let min = finite(raw.min);
        let max = finite(raw.max);
        if (min === null && max === null) return null;
        if (min !== null && max !== null && min > max) [min, max] = [max, min];
        return { kind: 'number', min, max, not };
    }
    return null;
}

/** A whole filter, as read from storage or a saved view. */
export function cleanFilter(raw) {
    const out = emptyFilter();
    if (!plainObject(raw)) return out;
    if (raw.mode === 'any') out.mode = 'any';
    if (plainObject(raw.rules)) {
        for (const [key, rule] of Object.entries(raw.rules)) {
            const clean = typeof key === 'string' && key ? cleanRule(rule) : null;
            if (clean) out.rules[key] = clean;
        }
    }
    return out;
}

/** A filter as text for an address: compact JSON, made safe for a link. Empty when nothing is set. */
export function encodeFilter(filter) {
    if (!filter || !ruleCount(filter)) return '';
    const json = JSON.stringify(cleanFilter(filter));
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** What `encodeFilter` made, cleaned; an empty filter for anything that is not one. */
export function decodeFilter(text) {
    if (typeof text !== 'string' || !text || text.length > 8000) return emptyFilter();
    try {
        const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
        return cleanFilter(JSON.parse(new TextDecoder().decode(bytes)));
    } catch { return emptyFilter(); }
}

/** The filter with one rule set (or, with null, taken away). */
export function withRule(filter, key, rule) {
    const rules = { ...filter.rules };
    const clean = cleanRule(rule);
    if (clean) rules[key] = clean;
    else delete rules[key];
    return { ...filter, rules };
}

export const ruleCount = (filter) => Object.keys((filter && filter.rules) || {}).length;

// ---- matching ----------------------------------------------------------------------------

const valueSets = new WeakMap();
const patterns = new Map();
const dateCache = new Map();

function valueSet(rule) {
    let set = valueSets.get(rule);
    if (!set) { set = new Set(rule.values.map(fold)); valueSets.set(rule, set); }
    return set;
}

/** A pattern as it is typed, or null if it is not a valid one. */
export function compilePattern(source) {
    if (!patterns.has(source)) {
        let re = null;
        try { re = new RegExp(source, 'i'); } catch { re = null; }
        if (patterns.size > 200) patterns.clear();
        patterns.set(source, re);
    }
    return patterns.get(source);
}

/** The dating of a cell as years, or null if it cannot be read. */
export function readYears(text) {
    const t = String(text ?? '').trim();
    if (!t) return null;
    if (!dateCache.has(t)) {
        if (dateCache.size > 5000) dateCache.clear();
        // a bare 11 (or "11.") in a column of datings is the century
        const bare = t.match(/^(\d{1,2})\.?$/);
        const century = bare && +bare[1] >= 1 && +bare[1] <= 21 ? +bare[1] : 0;
        dateCache.set(t, parseDateRange(century ? `${century}th c.` : t));
    }
    return dateCache.get(t);
}

/** The first number in a cell, or null. */
export function readNumber(text) {
    const m = String(text ?? '').replace(',', '.').match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
}

/** Whether the text of one cell satisfies a rule. */
export function matchRule(rule, text) {
    const t = String(text ?? '').trim();
    let hit = false;
    switch (rule.kind) {
        case 'values':
            hit = t === '' ? rule.empty : valueSet(rule).has(fold(t));
            break;
        case 'text': {
            if (rule.op === 'empty') { hit = t === ''; break; }
            if (rule.op === 'filled') { hit = t !== ''; break; }
            if (rule.op === 'regex') {
                const re = compilePattern(rule.text);
                if (!re) return true; // a pattern that is not valid filters nothing
                hit = re.test(t);
                break;
            }
            const a = fold(t);
            const b = fold(rule.text);
            hit = rule.op === 'equals' ? a === b : rule.op === 'starts' ? a.startsWith(b) : a.includes(b);
            break;
        }
        case 'years': {
            const r = readYears(t);
            if (!r) { hit = rule.undated; break; }
            const lo = rule.from === null ? -Infinity : rule.from;
            const hi = rule.to === null ? Infinity : rule.to;
            hit = rule.within ? r.start >= lo && r.end <= hi : r.start <= hi && lo <= r.end;
            break;
        }
        case 'number': {
            const n = readNumber(t);
            hit = n !== null && (rule.min === null || n >= rule.min) && (rule.max === null || n <= rule.max);
            break;
        }
        default: return true;
    }
    return rule.not ? !hit : hit;
}

/**
 * The rows that pass a filter.
 * @param {string[]} ids
 * @param {(id: string, key: string) => string} textOf  the text of a cell
 * @param {string} [skip]  a column whose rule is left out (for counting what its own choices would give)
 */
export function filterRows(filter, ids, textOf, skip = '') {
    const entries = Object.entries(filter.rules).filter(([key]) => key !== skip);
    if (!entries.length) return ids;
    const test = (id) => ([key, rule]) => matchRule(rule, textOf(id, key));
    return ids.filter(id => (filter.mode === 'any' ? entries.some(test(id)) : entries.every(test(id))));
}

/** The rows a column's own choices are counted over: those the other rules leave (all of them when any rule will do). */
export function rowsForFacet(filter, ids, textOf, key) {
    return filter.mode === 'any' ? ids : filterRows(filter, ids, textOf, key);
}

// ---- what a column holds, for offering it ---------------------------------------------------

/** The distinct values with how often each occurs; spellings that differ only in case or accents count as one. */
export function valueCounts(ids, textOf) {
    const groups = new Map();
    let empty = 0;
    for (const id of ids) {
        const t = String(textOf(id) ?? '').trim();
        if (!t) { empty++; continue; }
        const k = fold(t);
        let g = groups.get(k);
        if (!g) { g = { key: k, count: 0, spellings: new Map() }; groups.set(k, g); }
        g.count++;
        g.spellings.set(t, (g.spellings.get(t) || 0) + 1);
    }
    const items = [...groups.values()].map(g => ({
        key: g.key,
        count: g.count,
        // the spelling used most often stands for the group, the first met if they are equal
        label: [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0]
    }));
    items.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, undefined, { numeric: true }));
    return { items, empty };
}

/**
 * The datings of a column: each as a span for the timeline, and how many cells cannot be read.
 * An open end ("before 1100") is drawn as far as the data goes.
 */
export function yearInfo(ids, textOf) {
    const spans = [];
    const unreadable = new Map();
    let empty = 0;
    for (const id of ids) {
        const t = String(textOf(id) ?? '').trim();
        if (!t) { empty++; continue; }
        const r = readYears(t);
        if (r) spans.push({ id, start: r.start, end: r.end, label: `${id}: ${t}` });
        else unreadable.set(t, (unreadable.get(t) || 0) + 1);
    }
    const starts = spans.map(s => s.start).filter(Number.isFinite);
    const ends = spans.map(s => s.end).filter(Number.isFinite);
    const lo = Math.min(...starts, ...ends);
    const hi = Math.max(...starts, ...ends);
    const known = Number.isFinite(lo) && Number.isFinite(hi);
    const min = known ? Math.floor((lo - 10) / 50) * 50 : 0;
    const max = known ? Math.ceil((hi + 10) / 50) * 50 : 0;
    const points = spans.map(s => ({
        ...s,
        start: Number.isFinite(s.start) ? s.start : min,
        end: Number.isFinite(s.end) ? s.end : max
    }));
    return { points, min, max, known, empty, unreadable: [...unreadable.keys()], unreadableCount: [...unreadable.values()].reduce((a, b) => a + b, 0) };
}

/** Century number of a year: 1100 -> 11, 1101 -> 12. */
export const centuryOf = (year) => Math.floor((year - 1) / 100) + 1;

/** The centuries the datings touch, with how many each holds: the quick choices of a date facet. */
export function centuryBuckets(points) {
    const counts = new Map();
    for (const p of points) {
        const a = centuryOf(p.start);
        const b = centuryOf(p.end);
        if (b - a > 4) continue; // too vague to say it belongs to any one of them
        for (let c = a; c <= b; c++) counts.set(c, (counts.get(c) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([century, count]) => ({ century, count, from: (century - 1) * 100 + 1, to: century * 100 }));
}

/** The smallest and largest number in a column. */
export function numberInfo(ids, textOf) {
    let min = Infinity;
    let max = -Infinity;
    let count = 0;
    for (const id of ids) {
        const n = readNumber(textOf(id));
        if (n === null) continue;
        count++;
        if (n < min) min = n;
        if (n > max) max = n;
    }
    return { count, min: count ? min : null, max: count ? max : null };
}

/**
 * How a column is filtered unless it was told otherwise.
 * @param {{ declared?: string, numeric?: boolean, distinct: number, filled: number }} p
 *   `declared` is the kind a column of your own was given ('century' reads as a date)
 */
export function autoKind({ declared = '', numeric = false, distinct, filled }) {
    if (declared === 'century') return 'years';
    if (numeric) return 'number';
    if (distinct <= MAX_FACET_VALUES) return 'values';
    return filled ? 'text' : 'values';
}

/** Whether a column is offered as a filter when nobody has said: when ticking its values helps. */
export function offeredByDefault(kind, { distinct, filled }) {
    if (kind === 'years' || kind === 'number') return filled > 0;
    if (kind === 'text') return false;
    // a column whose values are nearly all different has nothing to tick
    return distinct > 0 && (filled <= 12 || distinct <= filled * 0.7);
}

/** Catalogue fields that hold a dating, and so are read as a date range. */
const DATE_FIELDS = new Set(['datierung', 'jahrhundert', 'cantus_century']);

/** What a column of the manuscripts table is by kind: century (a dating) | location | number | text. */
export function declaredType(col) {
    if (col.filterType === 'century' || DATE_FIELDS.has(col.field)) return 'century';
    if (col.filterType === 'location') return 'location';
    return col.type === 'number' ? 'number' : 'text';
}

/**
 * How a column is filtered, from what it holds and what was said about it.
 * @param {string[]} values  the cells of the column (empty ones included)
 * @param {{ declared?: string, numeric?: boolean, said?: { on?: boolean, kind?: string } }} p
 *   `numeric` is true for a column that is a number by kind; one that holds only numbers counts too
 * @returns {{ kind: string, auto: string, offered: boolean, defaultOffered: boolean, saidKind: string, distinct: number, filled: number }}
 */
export function describeColumnFilter(values, { declared = '', numeric = false, said = {} } = {}) {
    const seen = new Set();
    let filled = 0;
    let numbers = 0;
    for (const v of values) {
        const t = String(v ?? '').trim();
        if (!t) continue;
        filled++;
        seen.add(fold(t));
        if (/^-?\d+([.,]\d+)?$/.test(t)) numbers++;
    }
    const holds = { distinct: seen.size, filled };
    const auto = autoKind({ declared, numeric: numeric || (filled > 0 && numbers === filled), ...holds });
    const kind = (said && said.kind) || auto;
    return {
        kind, auto, ...holds,
        saidKind: (said && said.kind) || '',
        offered: said && typeof said.on === 'boolean' ? said.on : offeredByDefault(kind, holds),
        defaultOffered: offeredByDefault(kind, holds)
    };
}

// ---- saying what a rule does ---------------------------------------------------------------

const TEXT_WORDS = { contains: 'contains', equals: 'is', starts: 'starts with', regex: 'matches' };

/** A few words for a rule: the part after the column's name. */
export function describeRule(rule) {
    if (!rule) return '';
    const not = rule.not ? 'not ' : '';
    switch (rule.kind) {
        case 'values': {
            const shown = rule.values.slice(0, 3).join(', ') + (rule.values.length > 3 ? ` +${rule.values.length - 3}` : '');
            const parts = [shown, rule.empty ? 'empty' : ''].filter(Boolean).join(', ');
            return `${not}${parts}`;
        }
        case 'text':
            if (rule.op === 'empty') return rule.not ? 'has a value' : 'is empty';
            if (rule.op === 'filled') return rule.not ? 'is empty' : 'has a value';
            return `${not}${TEXT_WORDS[rule.op]} “${rule.text}”`;
        case 'years': {
            const range = rule.from !== null && rule.to !== null ? `${rule.from}–${rule.to}`
                : rule.from !== null ? `from ${rule.from}` : `until ${rule.to}`;
            return `${not}${range}${rule.within ? ' (fully within)' : ''}${rule.undated ? ' + undated' : ''}`;
        }
        case 'number': {
            const range = rule.min !== null && rule.max !== null ? `${rule.min}–${rule.max}`
                : rule.min !== null ? `≥ ${rule.min}` : `≤ ${rule.max}`;
            return `${not}${range}`;
        }
        default: return '';
    }
}

/** Whether a rule needs attention: a pattern that is not valid. */
export function ruleProblem(rule) {
    if (rule && rule.kind === 'text' && rule.op === 'regex' && !compilePattern(rule.text)) return 'Not a valid pattern — nothing is filtered by it.';
    return '';
}

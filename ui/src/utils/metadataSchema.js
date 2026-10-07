/**
 * How the columns of the manuscripts table are arranged, and what each may hold.
 *
 *   categories   the bands above the column headers, in order; each has a key and a label.
 *                The four the table started with — the corpus catalogue, IIIF, your own
 *                columns, the corpus statistics — always exist and can be renamed.
 *   placement    the category of a column that is not in the one it came with
 *   order        the place of columns that were moved by hand
 *   checks       what the cells of a column should look like: one of a list, or a pattern.
 *                A cell that does not fit is marked, never refused.
 *
 * A column is named by its key in the table: `cat:herkunftsort`, `proj:ink`, `iiif:manifest`.
 * Everything here is plain functions over plain data, so what is stored, imported
 * and restored can be cleaned the same way.
 */

export const BUILTIN_CATEGORIES = [
    { key: 'catalogue', label: 'Corpus catalogue' },
    { key: 'iiif', label: 'IIIF' },
    { key: 'project', label: 'Your fields' },
    { key: 'corpus', label: 'Corpus' }
];

const BUILTIN_KEYS = new Set(BUILTIN_CATEGORIES.map(c => c.key));
/** The frozen first column belongs to no category. */
const IDENTITY = 'id';

export const MAX_CATEGORIES = 30;
const MAX_LIST = 500;
const MAX_TEXT = 200;
const MAX_PATTERN = 500;

export const defaultMetadataSchema = () => ({ categories: [], placement: {}, order: [], checks: {} });

const text = (v, max = MAX_TEXT) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const plainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// ---- what a check is ---------------------------------------------------------------

/** The values of a list, from what was typed: one per line (or separated by semicolons). */
export function parseList(source) {
    const seen = new Set();
    const out = [];
    for (const part of String(source ?? '').split(/[\r\n;]+/)) {
        const v = part.trim().slice(0, MAX_TEXT);
        if (v && !seen.has(v)) { seen.add(v); out.push(v); }
    }
    return out.slice(0, MAX_LIST);
}

/** A check as it is kept, or null if it says nothing. */
export function normaliseCheck(check) {
    if (!plainObject(check)) return null;
    const message = text(check.message);
    const ignoreCase = check.ignoreCase === true;
    if (check.kind === 'list') {
        const values = Array.isArray(check.values) ? parseList(check.values.join('\n')) : [];
        return values.length ? { kind: 'list', values, ignoreCase, message } : null;
    }
    if (check.kind === 'regex') {
        const pattern = typeof check.pattern === 'string' ? check.pattern.trim().slice(0, MAX_PATTERN) : '';
        return pattern ? { kind: 'regex', pattern, ignoreCase, message } : null;
    }
    return null;
}

const compiled = new Map();
/** A check that has been compiled stays compiled while it is the same object, so a column of thousands of cells does not redo it. */
const compiledByObject = new WeakMap();

/**
 * A check ready to use. A pattern has to match the whole value, like the pattern of an HTML
 * input; one that is not a valid pattern is reported and checks nothing.
 * @returns {{ ok: boolean, error?: string, test?: (value: string) => boolean, expected?: string } | null}
 */
export function compileCheck(check) {
    if (check && typeof check === 'object' && compiledByObject.has(check)) return compiledByObject.get(check);
    const c = normaliseCheck(check);
    if (!c) return null;
    const id = JSON.stringify([c.kind, c.kind === 'list' ? c.values : c.pattern, c.ignoreCase]);
    if (compiled.has(id)) {
        compiledByObject.set(check, compiled.get(id));
        return compiled.get(id);
    }

    let result;
    if (c.kind === 'list') {
        const fold = (s) => (c.ignoreCase ? s.toLowerCase() : s);
        const set = new Set(c.values.map(fold));
        const shown = c.values.slice(0, 8).join(', ') + (c.values.length > 8 ? ', …' : '');
        result = { ok: true, test: (value) => set.has(fold(value)), expected: `Expected one of: ${shown}` };
    } else {
        try {
            const re = new RegExp(`^(?:${c.pattern})$`, c.ignoreCase ? 'i' : '');
            result = { ok: true, test: (value) => re.test(value), expected: `Does not match the pattern ${c.pattern}` };
        } catch (e) {
            // The engine quotes the pattern as it ran it, with the anchors added here: leave that out.
            const why = String(e.message).replace(/^Invalid regular expression: /, '').replace(/^\/.*\/[a-z]*: /, '');
            result = { ok: false, error: `Not a valid pattern: ${why}` };
        }
    }
    if (compiled.size > 500) compiled.clear();
    compiled.set(id, result);
    compiledByObject.set(check, result);
    return result;
}

/** Why a cell does not fit its column's check — or '' if it does, is empty, or there is nothing to check. */
export function checkProblem(check, value) {
    const v = String(value ?? '').trim();
    if (!v) return '';
    const c = compileCheck(check);
    if (!c || !c.ok || c.test(v)) return '';
    const own = check && typeof check.message === 'string' ? check.message.trim() : '';
    return own || c.expected;
}

/** The distinct values that do not fit. */
export function misfits(check, values) {
    const out = new Set();
    for (const v of values) if (checkProblem(check, v)) out.add(String(v).trim());
    return [...out];
}

/** A few words for a check: what it is. */
export function describeCheck(check) {
    const c = normaliseCheck(check);
    if (!c) return '';
    if (c.kind === 'list') return `one of ${c.values.length}`;
    return 'pattern';
}

/** What the dialog edits: the same, as text. */
export function toDraft(check) {
    const c = normaliseCheck(check);
    if (!c) return { kind: 'none', listText: '', pattern: '', ignoreCase: false, message: '' };
    return {
        kind: c.kind,
        listText: c.kind === 'list' ? c.values.join('\n') : '',
        pattern: c.kind === 'regex' ? c.pattern : '',
        ignoreCase: c.ignoreCase,
        message: c.message
    };
}

export function fromDraft(draft) {
    if (!draft) return null;
    return normaliseCheck({
        kind: draft.kind, values: parseList(draft.listText), pattern: draft.pattern,
        ignoreCase: draft.ignoreCase, message: draft.message
    });
}

// ---- the schema ----------------------------------------------------------------------

/** What is read from storage, a backup or a colleague's file, made safe to use. */
export function cleanMetadataSchema(raw) {
    const out = defaultMetadataSchema();
    if (!plainObject(raw)) return out;

    const seen = new Set();
    for (const c of Array.isArray(raw.categories) ? raw.categories : []) {
        const key = text(c && c.key, 60);
        const label = text(c && c.label, 60);
        if (!key || !label || key === IDENTITY || seen.has(key) || out.categories.length >= MAX_CATEGORIES) continue;
        seen.add(key);
        out.categories.push({ key, label });
    }

    if (plainObject(raw.placement)) {
        for (const [col, cat] of Object.entries(raw.placement)) if (typeof cat === 'string' && cat) out.placement[col] = cat;
    }
    if (Array.isArray(raw.order)) {
        const keys = new Set();
        for (const k of raw.order) if (typeof k === 'string' && k && !keys.has(k)) { keys.add(k); out.order.push(k); }
    }
    if (plainObject(raw.checks)) {
        for (const [col, check] of Object.entries(raw.checks)) {
            const c = normaliseCheck(check);
            if (c) out.checks[col] = c;
        }
    }
    return out;
}

/** The categories in order: the stored list, then any of the four the table started with that it lacks. */
export function resolveCategories(schema) {
    const stored = (schema && schema.categories) || [];
    const out = stored.map(c => ({ key: c.key, label: c.label, builtin: BUILTIN_KEYS.has(c.key) }));
    for (const b of BUILTIN_CATEGORIES) if (!out.some(c => c.key === b.key)) out.push({ ...b, builtin: true });
    return out;
}

/**
 * The columns as the table shows them: the frozen one first, then by category, then in the order
 * they were moved to, then as they came. Each column gets its `band` (its category's key) and, in
 * a category of your own, a `tone` to tell the bands apart.
 * @param {Array<{key: string, group: string, frozen?: boolean}>} columns  as they come, with `group` the category they come with
 */
export function arrangeColumns(columns, schema) {
    const cats = resolveCategories(schema);
    const rank = new Map(cats.map((c, i) => [c.key, i]));
    const tones = new Map();
    cats.filter(c => !c.builtin).forEach((c, i) => tones.set(c.key, i % 4));
    const place = (schema && schema.placement) || {};
    const order = new Map(((schema && schema.order) || []).map((k, i) => [k, i]));

    const rows = columns.map((col, i) => {
        const wanted = place[col.key];
        const band = col.frozen ? IDENTITY : (wanted && rank.has(wanted) ? wanted : col.group);
        return { col, i, band };
    });
    rows.sort((a, b) => {
        const fa = a.col.frozen ? 0 : 1;
        const fb = b.col.frozen ? 0 : 1;
        if (fa !== fb) return fa - fb;
        const ra = rank.has(a.band) ? rank.get(a.band) : 1e6;
        const rb = rank.has(b.band) ? rank.get(b.band) : 1e6;
        if (ra !== rb) return ra - rb;
        const oa = order.has(a.col.key) ? order.get(a.col.key) : Infinity;
        const ob = order.has(b.col.key) ? order.get(b.col.key) : Infinity;
        if (oa !== ob) return oa < ob ? -1 : 1;
        return a.i - b.i;
    });
    return rows.map(({ col, band }) => ({ ...col, band, tone: tones.get(band) }));
}

/** The user's own fields in the order they were arranged, for the pages that list them (the public views). */
export function arrangeFields(fields, schema) {
    return arrangeColumns(fields.map(field => ({ key: `proj:${field.key}`, group: 'project', field })), schema).map(c => c.field);
}

// ---- changing the schema ---------------------------------------------------------------

const slug = (label) => String(label).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** The schema with every category written out, so a change to one keeps the order of all. */
function whole(schema) {
    return { ...schema, categories: resolveCategories(schema).map(({ key, label }) => ({ key, label })) };
}

/** @returns {{ schema: object, key: string } | null} null if the name is empty or taken */
export function addCategory(schema, label) {
    const clean = text(label, 60);
    if (!clean) return null;
    const base = whole(schema);
    if (base.categories.some(c => c.label.toLowerCase() === clean.toLowerCase()) || base.categories.length >= MAX_CATEGORIES) return null;
    let key = slug(clean) || 'category';
    if (BUILTIN_KEYS.has(key) || key === IDENTITY) key = `${key}_2`;
    for (let n = 2; base.categories.some(c => c.key === key); n++) key = `${slug(clean) || 'category'}_${n}`;
    return { schema: { ...base, categories: [...base.categories, { key, label: clean }] }, key };
}

export function renameCategory(schema, key, label) {
    const clean = text(label, 60);
    const base = whole(schema);
    if (!clean || base.categories.some(c => c.key !== key && c.label.toLowerCase() === clean.toLowerCase())) return schema;
    return { ...base, categories: base.categories.map(c => (c.key === key ? { ...c, label: clean } : c)) };
}

/** A category of your own goes; its columns go back to where they came from. The four the table started with stay. */
export function removeCategory(schema, key) {
    if (BUILTIN_KEYS.has(key)) return schema;
    const base = whole(schema);
    const placement = {};
    for (const [col, cat] of Object.entries(base.placement)) if (cat !== key) placement[col] = cat;
    return { ...base, categories: base.categories.filter(c => c.key !== key), placement };
}

export function moveCategory(schema, key, delta) {
    const base = whole(schema);
    const list = [...base.categories];
    const i = list.findIndex(c => c.key === key);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return schema;
    [list[i], list[j]] = [list[j], list[i]];
    return { ...base, categories: list };
}

/** Put a column into a category. Into the one it comes with is the same as no placement. */
export function placeColumn(schema, colKey, categoryKey, comesWith) {
    const placement = { ...schema.placement };
    if (!categoryKey || categoryKey === comesWith) delete placement[colKey];
    else placement[colKey] = categoryKey;
    return { ...whole(schema), placement };
}

/**
 * Move a column one place up or down within its category.
 * @param {string[]} siblings  the keys of the category's columns, as shown
 * @param {string[]} all       the keys of all columns, as shown
 */
export function moveColumn(schema, colKey, delta, siblings, all) {
    const i = siblings.indexOf(colKey);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= siblings.length) return schema;
    const next = [...siblings];
    [next[i], next[j]] = [next[j], next[i]];
    const slots = [];
    all.forEach((k, idx) => { if (siblings.includes(k)) slots.push(idx); });
    const order = [...all];
    slots.forEach((slot, n) => { order[slot] = next[n]; });
    return { ...schema, order };
}

/** Set the check of a column; null takes it away. */
export function setCheck(schema, colKey, check) {
    const checks = { ...schema.checks };
    const clean = normaliseCheck(check);
    if (clean) checks[colKey] = clean;
    else delete checks[colKey];
    return { ...schema, checks };
}

/** A column is gone for good: nothing is kept of its place or its check. */
export function forgetColumn(schema, colKey) {
    const placement = { ...schema.placement };
    const checks = { ...schema.checks };
    delete placement[colKey];
    delete checks[colKey];
    return { ...schema, placement, checks, order: schema.order.filter(k => k !== colKey) };
}

/** What differs from a table nobody has arranged: for counting and for "nothing to reset". */
export function schemaChanges(schema) {
    const s = schema || defaultMetadataSchema();
    const own = (s.categories || []).filter(c => !BUILTIN_KEYS.has(c.key)).length;
    const renamed = (s.categories || []).filter(c => BUILTIN_KEYS.has(c.key) && c.label !== BUILTIN_CATEGORIES.find(b => b.key === c.key).label).length;
    return {
        categories: own,
        renamed,
        placed: Object.keys(s.placement || {}).length,
        moved: (s.order || []).length ? 1 : 0,
        checks: Object.keys(s.checks || {}).length
    };
}

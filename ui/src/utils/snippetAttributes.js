/**
 * The attributes a snippet carries, and checking what is typed into them.
 *
 * A **line snippet** (a picture of a text line) says where it is: its folio and
 * its line. A **sign snippet** (one neume on a line) says what is under it: the
 * syllable. A sign that stands alone has no line to take its place from, so it
 * carries the attributes of a line as well, only not required.
 *
 * The attributes are settings, so they can be extended and adjusted: every one
 * has a type, may be required, and is checked by default — a folio is a number
 * and `r` or `v`, a line is a number — and the check can be switched off or
 * replaced by a pattern of one's own.
 *
 * Plain functions on plain data.
 */

export const ATTRIBUTE_TYPES = [
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'folio', label: 'Folio (12r, 12v)' },
    { value: 'line', label: 'Line number' },
    { value: 'choice', label: 'One of a list' }
];

/** What each type is checked against by default, and how it is explained when it fails. */
const RULES = {
    folio: { test: /^\d+[rv]$/, message: 'A folio is a number and r or v, e.g. 12r.' },
    line: { test: /^\d+$/, message: 'A line is a number, e.g. 3.' },
    number: { test: /^-?\d+([.,]\d+)?$/, message: 'This is a number.' }
};

/** The attributes of the two levels, as they are before anyone changes them. A new object on every call. */
export function defaultSnippetAttributes() {
    return {
        line: [
            { key: 'folio', label: 'Folio', type: 'folio', required: true, validate: true, builtin: true, hint: 'e.g. 12r', pattern: '', options: [] },
            { key: 'line', label: 'Line', type: 'line', required: true, validate: true, builtin: true, hint: 'a number, e.g. 3', pattern: '', options: [] }
        ],
        sign: [
            { key: 'syllable', label: 'Syllable', type: 'text', required: false, validate: false, builtin: false, hint: 'the text under the sign', pattern: '', options: [] }
        ]
    };
}

const TYPES = new Set(ATTRIBUTE_TYPES.map(t => t.value));
const text = (v) => (v === undefined || v === null ? '' : String(v));

/** One definition made usable: a key, a label, a known type. Null when there is nothing to make of it. */
function cleanDefinition(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const key = text(raw.key).trim();
    if (!key) return null;
    const type = TYPES.has(raw.type) ? raw.type : 'text';
    return {
        key,
        label: text(raw.label).trim() || key,
        type,
        required: !!raw.required,
        validate: raw.validate !== false && (type !== 'text' || !!raw.validate),
        builtin: !!raw.builtin,
        hint: text(raw.hint),
        pattern: text(raw.pattern),
        options: Array.isArray(raw.options) ? raw.options.map(o => text(o).trim()).filter(Boolean) : []
    };
}

/**
 * The attributes of both levels from whatever was stored: malformed ones are dropped
 * and the folio and the line of a line snippet are always there, so a hand-edited
 * file cannot leave a line without a place.
 */
export function cleanSnippetAttributes(value) {
    const defaults = defaultSnippetAttributes();
    const out = { line: [], sign: [] };
    for (const level of ['line', 'sign']) {
        const seen = new Set();
        const list = value && Array.isArray(value[level]) ? value[level] : defaults[level];
        for (const raw of list) {
            const def = cleanDefinition(raw);
            if (def && !seen.has(def.key)) { seen.add(def.key); out[level].push(def); }
        }
    }
    // The folio and the line come first, whatever else was stored, and they keep their type.
    const builtin = defaults.line.map(b => {
        const stored = out.line.find(d => d.key === b.key);
        return stored ? { ...stored, type: b.type, builtin: true } : cleanDefinition(b);
    });
    out.line = [...builtin, ...out.line.filter(d => !defaults.line.some(b => b.key === d.key))];
    return out;
}

/** The attributes a sign that stands alone carries: the place of a line (not required) and its own. */
export function loneSignAttributes(attributes) {
    const { line, sign } = cleanSnippetAttributes(attributes);
    return [...line.map(d => ({ ...d, required: false })), ...sign];
}

/** A value as it is kept: trimmed, and a folio in lower case without blanks. */
export function normalizeValue(def, value) {
    const v = text(value).trim();
    if (def.type === 'folio') return v.replace(/\s+/g, '').toLowerCase();
    if (def.type === 'line') return v.replace(/\s+/g, '');
    return v;
}

function customTest(pattern) {
    try { return new RegExp(pattern); } catch (e) { return null; }
}

/**
 * Check one value against its definition.
 *
 * @returns {{ ok: boolean, value: string, message: string }} `value` is the normalised value
 */
export function validateAttribute(def, raw) {
    const value = normalizeValue(def, raw);
    if (!value) return def.required ? { ok: false, value, message: `${def.label} is required.` } : { ok: true, value, message: '' };
    if (!def.validate) return { ok: true, value, message: '' };

    if (def.type === 'choice') {
        return def.options.length === 0 || def.options.includes(value)
            ? { ok: true, value, message: '' }
            : { ok: false, value, message: `${def.label} is one of: ${def.options.join(', ')}.` };
    }
    const rule = RULES[def.type];
    if (rule && !rule.test.test(value)) return { ok: false, value, message: rule.message };
    if (def.pattern) {
        const test = customTest(def.pattern);
        if (test && !test.test(value)) return { ok: false, value, message: `${def.label} does not look right (${def.hint || def.pattern}).` };
    }
    return { ok: true, value, message: '' };
}

/**
 * Check every attribute of a set.
 *
 * @param {Array<object>} defs
 * @param {Object<string, string>} attrs
 * @returns {{ ok: boolean, values: Object<string, string>, errors: Object<string, string> }}
 *   `values` has every attribute that is not empty, normalised
 */
export function validateAttributes(defs, attrs = {}) {
    const values = {};
    const errors = {};
    for (const def of defs) {
        const result = validateAttribute(def, attrs[def.key]);
        if (result.value) values[def.key] = result.value;
        if (!result.ok) errors[def.key] = result.message;
    }
    return { ok: Object.keys(errors).length === 0, values, errors };
}

/** Whether a folio may be used as it is, under the folio attribute of the settings. */
export function folioProblem(attributes, value) {
    const def = cleanSnippetAttributes(attributes).line.find(d => d.key === 'folio');
    const v = text(value).trim();
    if (!v) return '';
    const result = validateAttribute({ ...def, required: false }, v);
    return result.ok ? '' : result.message;
}

/** A key for a new attribute, from its label: letters and digits, never one that is taken. */
export function attributeKey(label, taken = []) {
    const base = text(label).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'attribute';
    let key = base;
    for (let i = 2; taken.includes(key); i++) key = `${base}_${i}`;
    return key;
}

/**
 * Paleographic attributes: what a snippet says about the way a sign is written, set when
 * the snippet is made — `r`, `l`, a longer key like `rl`. They are defined beforehand, in the
 * pattern library, so the same thing is always spelled the same way, and they stand in braces
 * at the end of the code: `*Vdu{r}`, `*Vdu{r,l}`.
 *
 * The code of a snippet stays what it was (`*Vdu`); its attributes are kept beside it and only
 * written after the code when the two are shown together. A table keeps the snippets that have
 * the same attributes at the same place, so the signs of two manuscripts that are both `{r}` can be
 * compared at a glance (see `paleoSlots`).
 *
 * Braces also write a group of notes (`*u{ud}`), so what is in them decides: a key is lower-case
 * letters and digits, and never only the letters of a movement (`u`, `d`, `e`), which is a group.
 *
 * Plain functions on plain data.
 */

const KEY = /^[a-z0-9]{1,12}$/;
const ONLY_NOTES = /^[ude]+$/;

/** Whether a key can be an attribute: an error to show, or '' when it is fine. */
export function validatePaleoKey(key, existing = []) {
    const k = String(key ?? '').trim();
    if (!k) return 'An attribute needs a key.';
    if (!KEY.test(k)) return 'A key is lower-case letters and digits, up to 12, e.g. r or rl.';
    if (ONLY_NOTES.test(k)) return `“${k}” is made of the letters of a movement (u, d, e), which braces use for a group of notes.`;
    if (existing.includes(k)) return `“${k}” is already there.`;
    return '';
}

/** The attributes made usable: a key, a label, in the order they were given. Anything else is dropped. */
export function cleanPaleoAttributes(list) {
    const seen = new Set();
    const out = [];
    for (const raw of Array.isArray(list) ? list : []) {
        if (!raw || typeof raw !== 'object') continue;
        const key = String(raw.key ?? '').trim();
        if (validatePaleoKey(key, [...seen])) continue;
        seen.add(key);
        out.push({
            key,
            label: String(raw.label ?? '').trim() || key,
            description: String(raw.description ?? '').trim()
        });
    }
    return out;
}

/** The attributes of a snippet as a list of keys: no repeats, in the order of the vocabulary, the unknown ones last. */
export function normalizePaleo(value, order = []) {
    const keys = [...new Set((Array.isArray(value) ? value : []).map(k => String(k ?? '').trim()).filter(Boolean))];
    const rank = (k) => { const i = order.indexOf(k); return i < 0 ? order.length : i; };
    return keys.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/** `{r,l}` for the keys, '' for none. */
export function paleoSuffix(keys) {
    const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
    return list.length ? `{${list.join(',')}}` : '';
}

/** A code with the attributes after it: `*Vdu` and `['r']` are `*Vdu{r}`. */
export function withPaleo(code, keys) {
    return `${splitPaleo(code).base}${paleoSuffix(keys)}`;
}

/**
 * A code split into the code and the attributes at its end. Braces that write a group of notes are not attributes.
 *
 * @returns {{ base: string, keys: string[] }}
 */
export function splitPaleo(code) {
    const text = String(code ?? '');
    const m = /^(.*\*.*)\{([a-z0-9,]+)\}$/.exec(text);
    if (!m) return { base: text, keys: [] };
    const keys = m[2].split(',');
    if (keys.some(k => !k || ONLY_NOTES.test(k) || !KEY.test(k))) return { base: text, keys: [] };
    return { base: m[1], keys };
}

/** The place a set of attributes has in a table: its keys, joined. '' is the place of the snippets that have none. */
export const slotKey = (keys) => (Array.isArray(keys) ? keys : []).filter(Boolean).join(',');

/** The attributes of a snippet, normalised (the field is `paleo`). */
export const paleoOf = (snippet, order = []) => normalizePaleo(snippet && snippet.paleo, order);

/**
 * The places snippets can stand in, top to bottom: first those without attributes, then each set of
 * attributes, ordered by the vocabulary (a set starts with its first key), a smaller set before a larger one.
 * The same order everywhere, so a place is at the same height for every manuscript.
 *
 * @param {Iterable<{ paleo?: string[] }>} snippets every snippet whose places are wanted
 * @param {string[]} order the keys of the vocabulary, in order
 * @returns {Array<{ key: string, keys: string[], label: string }>} only the places that have a snippet
 */
export function paleoSlots(snippets, order = []) {
    const seen = new Map();
    for (const s of snippets || []) {
        const keys = paleoOf(s, order);
        const key = slotKey(keys);
        if (!seen.has(key)) seen.set(key, keys);
    }
    const rank = (k) => { const i = order.indexOf(k); return i < 0 ? order.length : i; };
    const sets = [...seen.entries()].map(([key, keys]) => ({ key, keys, label: paleoSuffix(keys) }));
    return sets.sort((a, b) => {
        if (!a.keys.length || !b.keys.length) return a.keys.length - b.keys.length;
        for (let i = 0; i < Math.min(a.keys.length, b.keys.length); i++) {
            if (a.keys[i] !== b.keys[i]) return rank(a.keys[i]) - rank(b.keys[i]) || (a.keys[i] < b.keys[i] ? -1 : 1);
        }
        return a.keys.length - b.keys.length;
    });
}

/**
 * The snippets that have all the attributes asked for. `'-'` among them asks for those that have none.
 * Nothing asked for keeps them all.
 */
export function filterByPaleo(snippets, wanted = [], order = []) {
    const list = Array.isArray(wanted) ? wanted : [];
    if (!list.length) return snippets;
    return snippets.filter(s => {
        const keys = paleoOf(s, order);
        return list.every(k => (k === '-' ? !keys.length : keys.includes(k)));
    });
}

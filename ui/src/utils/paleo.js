/**
 * Paleographic attributes: what a snippet says about the way a sign is written, set when
 * the snippet is made — `r`, `l`, a longer key like `rl`. They are defined beforehand, in the
 * pattern library, so the same thing is always spelled the same way.
 *
 * An attribute refers to one element, one note of the pattern, and stands in braces right after
 * that note — the way a sign of a code variant does: `*V{r}du` is `r` on the first note, `*Vdu{r}` on
 * the last, `*V{r}d{l,r}u` has three. In the snippet it is `{ key, note }`, `note` counting from 0.
 * The code of a snippet stays what it was (`*Vdu`); its attributes are kept beside it, and the whole
 * pattern with the braces in it is what is shown. A table keeps the snippets that have the same
 * attributes at the same place, so the signs of two manuscripts that are both `*Vdu{r}` can be compared
 * at a glance (see `paleoSlots`).
 *
 * A snippet that has plain keys (`['r']`, from before an attribute had a note) has them on the last note.
 *
 * Braces also write a group of notes (`*u{ud}`), so what is in them decides: a key is lower-case
 * letters and digits, and never two or more letters of a movement (`ud`, `dde`), which is a group; `e` is fine.
 *
 * Plain functions on plain data.
 */

const KEY = /^[a-z0-9]{1,12}$/;
// Two or more movement letters in braces are a group of notes (`*u{ud}`); a single letter is a key like any other (`{e}`, an episem).
const ONLY_NOTES = /^[ude]{2,}$/;

/** Whether a key can be an attribute: an error to show, or '' when it is fine. */
export function validatePaleoKey(key, existing = []) {
    const k = String(key ?? '').trim();
    if (!k) return 'An attribute needs a key.';
    if (!KEY.test(k)) return 'A key is lower-case letters and digits, up to 12, e.g. r or rl.';
    if (ONLY_NOTES.test(k)) return `“${k}” is made of the letters of a movement (u, d, e), which braces use for a group of notes. A single letter, or a key with another letter in it, is fine.`;
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

/** The notes of a code: what each one is (`*`, `uV`) and where in the code it ends. Empty for what has no notes (a clef). */
export function codeNotes(code) {
    const src = String(code ?? '').split(' ')[0];
    if (!src.includes('*')) return [];
    const notes = [];
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (ch === '*' || (notes.length && 'ude'.includes(ch))) notes.push({ text: ch, end: i + 1 });
        else if (/[A-Z]/.test(ch) && notes.length) { const last = notes[notes.length - 1]; last.text += ch; last.end = i + 1; }
    }
    return notes;
}

const rankIn = (order) => (k) => { const i = order.indexOf(k); return i < 0 ? order.length : i; };

/**
 * The attributes of a snippet as `{ key, note }`, once each, by note and then in the order of the vocabulary
 * (the unknown keys last). A plain key is on the last note of `code`; a note beyond the code's is the last.
 */
export function normalizePaleo(value, order = [], code = '') {
    const last = Math.max(0, codeNotes(code).length - 1);
    const rank = rankIn(order);
    const seen = new Set();
    const out = [];
    for (const v of Array.isArray(value) ? value : []) {
        const key = String(v && typeof v === 'object' ? v.key : v ?? '').trim();
        if (!key) continue;
        const note = v && typeof v === 'object' && Number.isInteger(v.note) ? Math.min(Math.max(0, v.note), last) : last;
        const id = `${note}:${key}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ key, note });
    }
    return out.sort((a, b) => a.note - b.note || rank(a.key) - rank(b.key) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** `{r,l}` for the keys, '' for none. */
export function paleoSuffix(keys) {
    const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
    return list.length ? `{${list.join(',')}}` : '';
}

/** A code with the attributes after the notes they are on: `*Vdu` and `[{ key: 'r', note: 0 }]` are `*V{r}du`. */
export function withPaleo(code, entries) {
    const base = splitPaleo(code).base;
    const notes = codeNotes(base);
    // The keys of a note keep the order they were given in (the vocabulary's, where the entries come from `normalizePaleo`).
    const list = (Array.isArray(entries) ? entries : []).filter(e => e && e.key).map(e => ({ key: e.key, note: Math.min(Math.max(0, e.note | 0), notes.length - 1) }));
    if (!notes.length || !list.length) return base;
    let out = '';
    let at = 0;
    notes.forEach((note, i) => {
        const keys = [...new Set(list.filter(e => e.note === i).map(e => e.key))];
        out += base.slice(at, note.end) + paleoSuffix(keys);
        at = note.end;
    });
    return out + base.slice(at);
}

/**
 * A code split into the code and the attributes in it. Braces that write a group of notes are not attributes.
 *
 * @returns {{ base: string, keys: string[], entries: Array<{ key: string, note: number }> }}
 *   `keys` all the keys, `entries` each with its note
 */
export function splitPaleo(code) {
    const text = String(code ?? '');
    let base = '';
    let notes = 0;
    const entries = [];
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '{' && notes > 0 && /[*ude]|[A-Z]/.test(base[base.length - 1])) {
            const close = text.indexOf('}', i);
            const keys = close > i ? text.slice(i + 1, close).split(',') : [];
            if (keys.length && keys.every(k => KEY.test(k) && !ONLY_NOTES.test(k))) {
                keys.forEach(k => entries.push({ key: k, note: notes - 1 }));
                i = close;
                continue;
            }
        }
        base += ch;
        if (ch === '*' || (notes > 0 && 'ude'.includes(ch))) notes++;
    }
    return { base, keys: entries.map(e => e.key), entries };
}

/** The place a set of attributes has in a table: its notes and keys, joined. '' is the place of the snippets that have none. */
export const slotKey = (entries) => (Array.isArray(entries) ? entries : []).map(e => `${e.note}:${e.key}`).join(',');

/** The attributes of a snippet, normalised (the field is `paleo`); `code` says which note a plain key is on. */
export const paleoOf = (snippet, order = [], code = '') => normalizePaleo(snippet && snippet.paleo, order, code || (snippet && snippet.pattern) || '');

/**
 * The places snippets of one code can stand in, top to bottom: first those without attributes, then each
 * set of attributes, by the note it starts on and the vocabulary, a smaller set before a larger one. The same
 * order everywhere, so a place is at the same height for every manuscript. A place is named by the whole pattern
 * with its attributes in it.
 *
 * @param {Iterable<{ paleo?: Array }>} snippets every snippet of the code whose places are wanted
 * @param {string[]} order the keys of the vocabulary, in order
 * @param {string} code the code
 * @returns {Array<{ key: string, entries: Array<{ key: string, note: number }>, label: string }>} only the places that have a snippet
 */
export function paleoSlots(snippets, order = [], code = '') {
    const rank = rankIn(order);
    const seen = new Map();
    for (const s of snippets || []) {
        const entries = paleoOf(s, order, code || s.pattern);
        const key = slotKey(entries);
        if (!seen.has(key)) seen.set(key, entries);
    }
    const slots = [...seen.entries()].map(([key, entries]) => ({ key, entries, label: entries.length ? withPaleo(code || '', entries) : '' }));
    return slots.sort((a, b) => {
        if (!a.entries.length || !b.entries.length) return a.entries.length - b.entries.length;
        for (let i = 0; i < Math.min(a.entries.length, b.entries.length); i++) {
            const x = a.entries[i];
            const y = b.entries[i];
            if (x.note !== y.note) return x.note - y.note;
            if (x.key !== y.key) return rank(x.key) - rank(y.key) || (x.key < y.key ? -1 : 1);
        }
        return a.entries.length - b.entries.length;
    });
}

/**
 * The snippets that have all the attributes asked for, on whichever note. `'-'` among them asks for those that
 * have none. Nothing asked for keeps them all.
 */
export function filterByPaleo(snippets, wanted = [], order = []) {
    const list = Array.isArray(wanted) ? wanted : [];
    if (!list.length) return snippets;
    return snippets.filter(s => {
        const keys = paleoOf(s, order).map(e => e.key);
        return list.every(k => (k === '-' ? !keys.length : keys.includes(k)));
    });
}

/** What is kept of a snippet's attributes when it is exported: `{ key, note }`, or a plain key from before they had a note. At most eight. */
export function exportPaleo(value) {
    return (Array.isArray(value) ? value : [])
        .map(v => (v && typeof v === 'object'
            ? { key: String(v.key ?? '').trim().slice(0, 12), note: Number.isInteger(v.note) && v.note >= 0 ? Math.min(v.note, 99) : 0 }
            : String(v ?? '').trim().slice(0, 12)))
        .filter(v => (typeof v === 'string' ? v : v.key))
        .slice(0, 8);
}

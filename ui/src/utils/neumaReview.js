/**
 * The review of the Hungarian Neume Catalogue's snippets (`neuma-import/`): which snippets there are
 * to look at, what each is proposed as, and what was decided.
 *
 * The catalogue gives every snippet a name only through the column of its table (Pes, Clivis, …), and
 * it does not tell a punctum from a virga. So every snippet carries a proposal made by `neuma-import`
 * (`snippet.suggestion`), and a person accepts it, corrects it, sets it aside or throws the snippet out.
 * Everything here is plain functions over plain data; `useNeumaReview` keeps the state.
 */
import { getBaseCode, tokenizeCode } from './patternCode';
import { toneCount } from './neumeTable';

export const STATUSES = ['accepted', 'corrected', 'later', 'discarded'];

/** What a snippet's state is, for filtering and counting. */
export const STATES = ['undecided', 'accepted', 'corrected', 'later', 'discarded'];

/** What the flags `neuma-import` puts on a cut (`snippet.flags`) say, for people. */
export const FLAG_TEXT = {
    tiny: 'very small: a fragment of a snippet, or dust',
    thin: 'much longer than wide: a fragment, or two snippets cut as one',
    parts: 'a white band runs through it: two snippets cut as one?'
};

/** Why a snippet's cut deserves a look, in words; '' if it does not. */
export const oddReason = (snippet) => ((snippet && snippet.flags) || []).map(f => FLAG_TEXT[f] || f).join('; ');

const CODE_CHARS = /^[*udeA-Z[\]{}]+$/;

/**
 * Whether a typed code is one the library can hold: notes (`*`, `u`, `d`, `e`) with sign letters,
 * balanced brackets — or one of the two pseudo-patterns.
 * @returns {{ ok: boolean, error: string }}
 */
export function checkCode(code) {
    const c = String(code ?? '').trim();
    if (c === '(Clef)' || c === '(Custos)') return { ok: true, error: '' };
    if (!c) return { ok: false, error: 'Write a code, for example [*u].' };
    if (!CODE_CHARS.test(c)) return { ok: false, error: 'A code has the notes * u d e, sign letters (A–Z) and brackets.' };
    if (!c.includes('*')) return { ok: false, error: 'A code starts with *.' };
    let open = 0;
    for (const ch of c) {
        if (ch === '[' || ch === '{') open++;
        if (ch === ']' || ch === '}') { open--; if (open < 0) return { ok: false, error: 'A closing bracket has no opening one.' }; }
    }
    if (open !== 0) return { ok: false, error: 'A bracket is not closed.' };
    if (!tokenizeCode(c).length) return { ok: false, error: 'There is no note in it.' };
    return { ok: true, error: '' };
}

/** Which notes (0 = the first) of a code carry the virga letter. */
export function virgaNotes(code) {
    const out = [];
    let n = -1;
    for (const ch of String(code)) {
        if ('*ude'.includes(ch)) n++;
        else if (ch === 'V' && n >= 0) out.push(n);
    }
    return out;
}

/** The code with the virga letter put on a note, or taken off it if it is there. */
export function toggleVirga(code, note) {
    const src = String(code);
    const has = virgaNotes(src).includes(note);
    let n = -1;
    let out = '';
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (ch === 'V' && has && n === note) continue; // the one to take off
        out += ch;
        if ('*ude'.includes(ch)) {
            n++;
            if (n === note && !has) out += 'V';
        }
    }
    return out;
}

/** The code without any virga letter. */
export const withoutVirga = (code) => String(code).replace(/V/g, '');

/**
 * The codes to offer first for a snippet: what is proposed, the other things that column can be, and
 * the virga on each note of the proposal (the catalogue does not say which is a virga).
 *
 * @param {{ suggestion?: { code?: string, alternatives?: string[] } }} snippet
 * @returns {string[]}
 */
export function quickChoices(snippet) {
    const s = (snippet && snippet.suggestion) || {};
    const out = [];
    const add = (c) => { if (c && !out.includes(c)) out.push(c); };
    add(s.code);
    for (const a of s.alternatives || []) add(a);
    const base = withoutVirga(s.code || '');
    if (base) for (let i = 0; i < toneCount(base) && i < 4; i++) add(toggleVirga(base, i));
    return out;
}

/**
 * Whether a decision was made about another snippet than the one that now has its id: the catalogue was
 * split again and this one moved. It is kept in the file but does not count.
 */
export const isStale = (snippet, decision) => !!(decision && decision.sig && snippet.sig && decision.sig !== snippet.sig);

/** The decision of a snippet and what it is taken to be for now: the decision, else the proposal. */
export function stateOf(snippet, decision) {
    const proposed = (snippet.suggestion && snippet.suggestion.code) || '';
    if (isStale(snippet, decision)) return { state: 'undecided', code: proposed, decided: false, stale: true };
    if (decision && STATUSES.includes(decision.status)) {
        // a snippet set aside is still taken to be what is proposed; a discarded one is nothing
        return { state: decision.status, code: decision.status === 'discarded' ? '' : (decision.code || proposed), decided: true };
    }
    return { state: 'undecided', code: proposed, decided: false };
}

/**
 * The snippets that match a set of filters.
 *
 * @param {Array<object>} snippets
 * @param {Object<string, object>} decisions
 * @param {{ column?: string, source?: string, state?: string, confidence?: string, code?: string, odd?: boolean }} filters
 *   `state` is one of STATES, `open` (undecided or set aside) or '' for all; `confidence` one of high|medium|low|none;
 *   `source` a catalogue id; `code` what the snippet is taken to be; `odd` only snippets whose cut was flagged
 */
export function filterSnippets(snippets, decisions, { column = '', source = '', state = '', confidence = '', code = '', odd = false } = {}) {
    return snippets.filter(s => {
        if (column && s.column !== column) return false;
        if (odd && !(s.flags && s.flags.length)) return false;
        if (source && s.source !== source) return false;
        const st = stateOf(s, decisions[s.id]);
        if (state === 'open' ? !(st.state === 'undecided' || st.state === 'later') : state && st.state !== state) return false;
        if (confidence && ((s.suggestion && s.suggestion.confidence) || 'none') !== confidence) return false;
        if (code && getBaseCode(st.code) !== code) return false;
        return true;
    });
}

/** How far the review is: counts by state, and how many snippets there are. */
export function summarize(snippets, decisions) {
    const counts = { total: snippets.length, undecided: 0, accepted: 0, corrected: 0, later: 0, discarded: 0 };
    for (const s of snippets) counts[stateOf(s, decisions[s.id]).state]++;
    counts.done = counts.accepted + counts.corrected + counts.discarded;
    return counts;
}

/** Counts by column and state, for the column filter. */
export function summarizeByColumn(snippets, decisions) {
    const out = {};
    for (const s of snippets) {
        const c = out[s.column] || (out[s.column] = { total: 0, done: 0 });
        c.total++;
        const st = stateOf(s, decisions[s.id]).state;
        if (st === 'accepted' || st === 'corrected' || st === 'discarded') c.done++;
    }
    return out;
}

/**
 * The patterns to offer for a combination, which the catalogue does not name: the most common of the
 * library's longer patterns.
 *
 * @param {Iterable<string>} codes
 * @param {ReturnType<import('./neumeTable').buildFrequency>} freq
 */
export function combinationCodes(codes, freq, { minNotes = 3, limit = 48 } = {}) {
    const keep = [];
    for (const code of new Set([...codes].map(getBaseCode))) {
        if (!code.startsWith('(') && toneCount(code) >= minNotes) keep.push(code);
    }
    return keep.sort((a, b) => freq.code(b) - freq.code(a) || a.localeCompare(b)).slice(0, limit);
}

/** The decision that sets a snippet to a code: accepted if it is the proposal, else corrected. */
export function decisionFor(snippet, code) {
    const proposed = snippet.suggestion && snippet.suggestion.code;
    return { code, status: proposed && proposed === code ? 'accepted' : 'corrected' };
}

/** How many decisions refer to snippets that are no longer where they were. */
export function countStale(snippets, decisions) {
    let n = 0;
    for (const s of snippets) if (isStale(s, decisions[s.id])) n++;
    return n;
}

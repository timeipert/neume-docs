/**
 * The decisions made about the snippets: what is kept, and how it is read back.
 *
 *   { "version": 1, "decisions": { "007b-2": { "status": "corrected", "code": "[*uV]", "sig": "110,17,45,62", "at": "…" } } }
 *
 * Plain functions with nothing of node in them: the development-server plugin cleans what the review
 * tool sends with them, and the tool itself cleans a file somebody loads.
 */

export const STATUSES = ['accepted', 'corrected', 'later', 'discarded'];

/** The decisions that may be stored: only known statuses, short text, nothing else. */
export function cleanDecision(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const status = STATUSES.includes(raw.status) ? raw.status : '';
    const code = typeof raw.code === 'string' ? raw.code.trim().slice(0, 120) : '';
    if (!status) return null;
    if ((status === 'accepted' || status === 'corrected') && !code) return null;
    const out = { status, at: new Date().toISOString() };
    if (code && status !== 'discarded') out.code = code;
    if (typeof raw.note === 'string' && raw.note.trim()) out.note = raw.note.trim().slice(0, 500);
    // where the snippet was in its cell: a decision whose snippet has since moved (a new split) no longer counts
    if (typeof raw.sig === 'string' && /^\d{1,5}(,\d{1,5}){3}$/.test(raw.sig)) out.sig = raw.sig;
    return out;
}

/** The decisions file with a change merged in. */
export function mergeDecisions(current, change) {
    const decisions = { ...((current && current.decisions) || {}) };
    for (const [id, raw] of Object.entries((change && change.set) || {})) {
        if (!/^[\w.-]{1,40}$/.test(id)) continue;
        const d = cleanDecision(raw);
        if (d) decisions[id] = d;
    }
    for (const id of (change && Array.isArray(change.remove)) ? change.remove : []) delete decisions[id];
    return { version: 1, updated: new Date().toISOString(), decisions };
}

/**
 * A decisions file as somebody gives it (a file loaded in the tool): only what is well-formed is kept.
 * @returns {{ decisions: Object<string, object>, dropped: number }}
 */
export function readDecisionsFile(raw) {
    const out = {};
    let dropped = 0;
    const source = raw && typeof raw === 'object' && raw.decisions && typeof raw.decisions === 'object' && !Array.isArray(raw.decisions) ? raw.decisions : null;
    if (!source) return { decisions: out, dropped: 0, valid: false };
    for (const [id, d] of Object.entries(source)) {
        const clean = /^[\w.-]{1,40}$/.test(id) ? cleanDecision(d) : null;
        if (!clean) { dropped++; continue; }
        // what was said when stays: the file says when it was decided
        if (d && typeof d.at === 'string' && !Number.isNaN(Date.parse(d.at))) clean.at = d.at;
        out[id] = clean;
    }
    return { decisions: out, dropped, valid: true };
}

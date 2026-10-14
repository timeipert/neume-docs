import { computed, reactive, ref, shallowRef } from 'vue';
import { countStale, decisionFor, quickChoices, stateOf } from '../utils/neumaReview';

/**
 * The state of the review of the Hungarian Neume Catalogue's snippets (see `neuma-import/`): the
 * catalogue and its snippets as the module made them, and the decisions made about them.
 *
 * The data is not part of the app. In development the module's Vite plugin serves it from
 * `neuma-import/data/` (`/neuma-data/…`) and keeps the decisions in `decisions.json`; anywhere else
 * there is nothing to load and the page says so. A decision is sent to the file a moment after it was
 * made, in one piece with the ones made with it; if that fails it stays pending and is sent again.
 */

const MOUNT = 'neuma-data/';
const SAVE_AFTER_MS = 500;
const UNDO_DEPTH = 100;

const base = () => new URL(MOUNT, typeof document !== 'undefined' ? document.baseURI : 'http://localhost/').href;

let shared = null;

function create() {
    /** 'idle' | 'loading' | 'ready' | 'missing' | 'error' */
    const status = ref('idle');
    const error = ref('');
    const catalogue = shallowRef(null);
    const snippets = shallowRef([]);
    const decisions = reactive({});
    /** 'saved' | 'pending' | 'saving' | 'error' */
    const saving = ref('saved');
    const saveError = ref('');

    /** Snippets by id, for the signature a decision is made with. */
    const byId = new Map();
    /** How many earlier decisions no longer fit their snippets (the catalogue was split again). */
    const stale = computed(() => countStale(snippets.value, decisions));

    const sources = computed(() => new Map(((catalogue.value && catalogue.value.sources) || []).map(s => [s.id, s])));
    const columns = computed(() => new Map(((catalogue.value && catalogue.value.columns) || []).map(c => [c.key, c])));

    // ---- loading ------------------------------------------------------------------------------

    async function getJson(name, { optional = false } = {}) {
        const res = await fetch(base() + name, { cache: 'no-store' });
        if (res.status === 404 && optional) return null;
        if (!res.ok) throw Object.assign(new Error(`${name}: ${res.status}`), { status: res.status });
        return res.json();
    }

    async function load() {
        if (status.value === 'loading') return;
        status.value = 'loading';
        error.value = '';
        try {
            const [cat, snips, saved] = await Promise.all([getJson('catalogue.json'), getJson('snippets.json'), getJson('decisions.json', { optional: true })]);
            catalogue.value = cat;
            snippets.value = snips;
            byId.clear();
            for (const s of snips) byId.set(s.id, s);
            for (const k of Object.keys(decisions)) delete decisions[k];
            Object.assign(decisions, (saved && saved.decisions) || {});
            undoStack.length = 0;
            syncUndo();
            status.value = 'ready';
        } catch (e) {
            // a 404 is "nothing collected here", whatever else it is a problem
            const missing = e.status === 404 || /Unexpected token|JSON/.test(e.message);
            status.value = missing ? 'missing' : 'error';
            error.value = e.message;
        }
    }

    // ---- deciding -----------------------------------------------------------------------------

    /** Changes not yet sent: `set` by snippet id, `remove` ids. */
    let pendingSet = {};
    let pendingRemove = new Set();
    let timer = null;
    const undoStack = [];
    /** Whether there is something to undo, and what it was. */
    const canUndo = ref(false);
    const lastLabel = ref('');
    const syncUndo = () => {
        canUndo.value = undoStack.length > 0;
        lastLabel.value = undoStack.length ? undoStack[undoStack.length - 1].label : '';
    };

    const hasPending = () => Object.keys(pendingSet).length > 0 || pendingRemove.size > 0;

    async function flush() {
        clearTimeout(timer);
        timer = null;
        if (!hasPending()) { saving.value = 'saved'; return true; }
        const change = { set: pendingSet, remove: [...pendingRemove] };
        pendingSet = {};
        pendingRemove = new Set();
        saving.value = 'saving';
        try {
            const res = await fetch(base() + 'decisions', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Neuma-Import': '1' }, body: JSON.stringify(change)
            });
            if (!res.ok) throw new Error(`${res.status}`);
            saving.value = hasPending() ? 'pending' : 'saved';
            saveError.value = '';
            return true;
        } catch (e) {
            // keep what was not sent, in front of whatever was decided meanwhile
            pendingSet = { ...change.set, ...pendingSet };
            for (const id of change.remove) if (!(id in pendingSet)) pendingRemove.add(id);
            saving.value = 'error';
            saveError.value = e.message;
            timer = setTimeout(flush, 5000);
            return false;
        }
    }

    function queue(id, decision) {
        if (decision) { pendingSet[id] = decision; pendingRemove.delete(id); }
        else { delete pendingSet[id]; pendingRemove.add(id); }
        saving.value = 'pending';
        clearTimeout(timer);
        timer = setTimeout(flush, SAVE_AFTER_MS);
    }

    /** Sets decisions for snippets: `decision` is `{ status, code?, note? }`, for all of `ids` or by `byId`. */
    function apply(changes, label = '') {
        const before = {};
        for (const [id, d] of changes) {
            before[id] = decisions[id] ? { ...decisions[id] } : null;
            const sig = d && byId.get(id) ? byId.get(id).sig : undefined;
            if (d) decisions[id] = { ...d, sig, at: new Date().toISOString() };
            else delete decisions[id];
            queue(id, d ? { status: d.status, code: d.code, note: d.note, sig } : null);
        }
        undoStack.push({ before, label });
        if (undoStack.length > UNDO_DEPTH) undoStack.shift();
        syncUndo();
    }

    function undo() {
        const entry = undoStack.pop();
        syncUndo();
        if (!entry) return 0;
        for (const [id, d] of Object.entries(entry.before)) {
            if (d) decisions[id] = d; else delete decisions[id];
            queue(id, d ? { status: d.status, code: d.code, note: d.note, sig: d.sig } : null);
        }
        return Object.keys(entry.before).length;
    }

    /** Decide one snippet: sets it to a code (accepted if it is the proposal, else corrected). */
    function setCode(snippet, code, label = '') {
        apply([[snippet.id, decisionFor(snippet, code)]], label || `${snippet.id} → ${code}`);
    }
    /** Accepts what a snippet is proposed as. */
    function accept(snippet) {
        const code = snippet.suggestion && snippet.suggestion.code;
        if (!code) return false;
        setCode(snippet, code, `${snippet.id} accepted`);
        return true;
    }
    /** Accepts the proposals of many snippets at once; those without one are left alone. Returns how many. */
    function acceptAll(list) {
        const changes = [];
        for (const s of list) {
            const st = stateOf(s, decisions[s.id]);
            if (st.state === 'undecided' && s.suggestion && s.suggestion.code) changes.push([s.id, { status: 'accepted', code: s.suggestion.code }]);
        }
        if (changes.length) apply(changes, `${changes.length} accepted`);
        return changes.length;
    }
    function setAside(snippet) { apply([[snippet.id, { status: 'later' }]], `${snippet.id} set aside`); }
    function discard(snippet) { apply([[snippet.id, { status: 'discarded' }]], `${snippet.id} discarded`); }
    function reopen(snippet) { apply([[snippet.id, null]], `${snippet.id} reopened`); }

    // ---- the documentation --------------------------------------------------------------------

    /** Writes the documentation folder (neuma-import/data/documentation/); resolves with what was written. */
    async function buildDocumentation(include = 'reviewed') {
        await flush();
        const res = await fetch(`${base()}export?include=${include === 'proposed' ? 'proposed' : 'reviewed'}`, { method: 'POST', headers: { 'X-Neuma-Import': '1' } });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `${res.status}`);
        return body;
    }

    // ---- pictures -----------------------------------------------------------------------------

    const imageUrl = (snippet) => base() + snippet.file;
    const cellUrl = (snippet) => {
        const source = sources.value.get(snippet.source);
        const cell = source && source.cells[snippet.column];
        return cell ? base() + cell.image : '';
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', (e) => {
            if (hasPending() && saving.value !== 'saved') { flush(); e.preventDefault(); e.returnValue = ''; }
        });
    }

    return {
        status, error, catalogue, snippets, decisions, saving, saveError, sources, columns, stale,
        load, flush, setCode, accept, acceptAll, setAside, discard, reopen, undo, canUndo, lastLabel,
        buildDocumentation, imageUrl, cellUrl, quickChoices
    };
}

export function useNeumaReview() {
    if (!shared) shared = create();
    return shared;
}

/** For tests: a fresh state. */
export function resetNeumaReview() { shared = null; }

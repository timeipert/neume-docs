import { computed, reactive, ref, shallowRef } from 'vue';
import { countStale, decisionFor, quickChoices, stateOf } from '../utils/neumaReview';
import { readDecisionsFile } from '../../../neuma-import/src/decisions.mjs';
import { buildDocumentation, virgaSign } from '../../../neuma-import/src/documentation.mjs';
import { GLYPHS } from '../data/glyphs';

/**
 * The state of the review of the Hungarian Neume Catalogue's snippets (see `neuma-import/`): the
 * catalogue and its snippets as the module made them, and the decisions made about them.
 *
 * The data comes from one of two places. On a computer with the development server, the module's Vite
 * plugin serves `neuma-import/data/` (`/neuma-data/…`) and keeps the decisions in `decisions.json`
 * (*server*). On the website the same files lie under `hung/`, and there is no server to keep anything:
 * the decisions are kept in this browser, and can be saved to a file and loaded from one (*static*).
 * Either way a decision is stored a moment after it was made, in one piece with the ones made with it;
 * if that fails it stays pending and is tried again. The documentation is made in the browser, with
 * the module's own function, and downloaded as a ZIP.
 */

const SERVER = 'neuma-data/';
const STATIC = 'hung/';
const LOCAL_KEY = 'neume-docs:neuma-decisions';
const SAVE_AFTER_MS = 500;
const UNDO_DEPTH = 100;
const FETCH_AT_ONCE = 8;

const origin = () => (typeof document !== 'undefined' ? document.baseURI : 'http://localhost/');
const absolute = (root) => new URL(root, origin()).href;

/** Gives a file to the person: the browser's download. */
function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

let shared = null;

function create() {
    /** 'idle' | 'loading' | 'ready' | 'missing' | 'error' */
    const status = ref('idle');
    const error = ref('');
    /** 'server' (development server: decisions in a file) | 'static' (the website: decisions in this browser) */
    const mode = ref('static');
    let root = STATIC;
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
        const res = await fetch(absolute(root) + name, { cache: 'no-store' });
        if (res.status === 404 && optional) return null;
        if (!res.ok) throw Object.assign(new Error(`${name}: ${res.status}`), { status: res.status });
        return res.json();
    }

    const readLocal = () => {
        try {
            const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
            return readDecisionsFile(raw).decisions;
        } catch {
            return {};
        }
    };

    /** Where the data is: the development server if there is one, else the website's own folder. */
    async function findRoot() {
        const candidates = import.meta.env.DEV ? [SERVER, STATIC] : [STATIC];
        for (const candidate of candidates) {
            try {
                const res = await fetch(absolute(candidate) + 'catalogue.json', { method: 'HEAD', cache: 'no-store' });
                if (res.ok) return candidate;
            } catch { /* try the next */ }
        }
        return '';
    }

    async function load() {
        if (status.value === 'loading') return;
        status.value = 'loading';
        error.value = '';
        try {
            root = await findRoot();
            if (!root) { status.value = 'missing'; return; }
            mode.value = root === SERVER ? 'server' : 'static';
            const [cat, snips, saved] = await Promise.all([
                getJson('catalogue.json'), getJson('snippets.json'),
                mode.value === 'server' ? getJson('decisions.json', { optional: true }) : Promise.resolve(null)
            ]);
            catalogue.value = cat;
            snippets.value = snips;
            byId.clear();
            for (const s of snips) byId.set(s.id, s);
            for (const k of Object.keys(decisions)) delete decisions[k];
            Object.assign(decisions, mode.value === 'server' ? ((saved && saved.decisions) || {}) : readLocal());
            undoStack.length = 0;
            syncUndo();
            status.value = 'ready';
        } catch (e) {
            status.value = 'error';
            error.value = e.message;
        }
    }

    // ---- deciding -----------------------------------------------------------------------------

    /** Changes not yet stored: `set` by snippet id, `remove` ids. */
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

    /** What is stored in this browser: all decisions, as the file has them. */
    const wholeFile = () => ({ version: 1, updated: new Date().toISOString(), decisions: { ...decisions } });

    async function flush() {
        clearTimeout(timer);
        timer = null;
        if (!hasPending()) { saving.value = 'saved'; return true; }
        const change = { set: pendingSet, remove: [...pendingRemove] };
        pendingSet = {};
        pendingRemove = new Set();
        saving.value = 'saving';
        try {
            if (mode.value === 'server') {
                const res = await fetch(absolute(root) + 'decisions', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Neuma-Import': '1' }, body: JSON.stringify(change)
                });
                if (!res.ok) throw new Error(`${res.status}`);
            } else {
                localStorage.setItem(LOCAL_KEY, JSON.stringify(wholeFile()));
            }
            saving.value = hasPending() ? 'pending' : 'saved';
            saveError.value = '';
            return true;
        } catch (e) {
            // keep what was not stored, in front of whatever was decided meanwhile
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

    /**
     * Sets decisions: `changes` are `[id, decision | null]`. A decision gets the place of its snippet in the
     * cell (`sig`) unless it brings one (a decision from a file does), so that a new split cannot attach
     * it to another snippet.
     */
    function apply(changes, label = '') {
        const before = {};
        for (const [id, d] of changes) {
            before[id] = decisions[id] ? { ...decisions[id] } : null;
            const sig = d ? (d.sig ?? (byId.get(id) ? byId.get(id).sig : undefined)) : undefined;
            if (d) decisions[id] = { ...d, sig, at: d.at || new Date().toISOString() };
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

    // ---- the decisions as a file --------------------------------------------------------------

    const stamp = () => new Date().toISOString().slice(0, 10);

    /** Gives the decisions as a file: what the development server keeps in `decisions.json`. */
    function saveDecisionsFile() {
        download(new Blob([JSON.stringify(wholeFile(), null, 1)], { type: 'application/json' }), `neuma-decisions-${stamp()}.json`);
    }

    /**
     * Takes the decisions of a file (made here or by somebody else): they replace those of the same snippets.
     * @param {File|Blob} file
     * @returns {Promise<{ count: number, dropped: number }>}
     */
    async function loadDecisionsFile(file) {
        let raw;
        try { raw = JSON.parse(await file.text()); } catch { throw new Error('This is not a decisions file (it is not JSON).'); }
        const { decisions: loaded, dropped, valid } = readDecisionsFile(raw);
        if (!valid) throw new Error('This is not a decisions file (it has no "decisions").');
        const changes = Object.entries(loaded);
        if (changes.length) apply(changes, `${changes.length} decisions loaded from a file`);
        return { count: changes.length, dropped };
    }

    // ---- the documentation --------------------------------------------------------------------

    /** Writes the documentation folder on the computer that runs the development server (`neuma-import/data/documentation/`). */
    async function writeDocumentationFolder(include = 'reviewed') {
        await flush();
        const res = await fetch(`${absolute(root)}export?include=${include === 'proposed' ? 'proposed' : 'reviewed'}`, { method: 'POST', headers: { 'X-Neuma-Import': '1' } });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `${res.status}`);
        return body;
    }

    /**
     * Makes the documentation in the browser and gives it as a ZIP: `neume-docs.json`, `data/…`, `images/…` —
     * the files the viewer reads and a GitHub repository can hold.
     *
     * @param {'reviewed'|'proposed'} include
     * @param {(done: number, total: number) => void} [onProgress]  as the pictures are fetched
     * @returns {Promise<{ manuscripts: number, snippets: number, counts: object }>}
     */
    async function downloadDocumentation(include = 'reviewed', onProgress = () => {}) {
        const doc = buildDocumentation({
            catalogue: catalogue.value, snippets: snippets.value, decisions: { ...decisions }, include,
            signs: virgaSign(GLYPHS.note)
        });
        if (!doc.images.length) throw new Error('There is nothing to put in it yet: accept or correct some snippets first.');

        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        zip.file('neume-docs.json', JSON.stringify(doc.index, null, 2));
        for (const entry of doc.index.manuscripts) zip.file(entry.file, JSON.stringify(doc.manuscripts[entry.id], null, 2));

        let done = 0;
        const queue = [...doc.images];
        await Promise.all(Array.from({ length: FETCH_AT_ONCE }, async () => {
            while (queue.length) {
                const image = queue.shift();
                const res = await fetch(absolute(root) + image.from);
                if (!res.ok) throw new Error(`The picture ${image.from} could not be fetched (${res.status}).`);
                zip.file(image.to, await res.arrayBuffer());
                onProgress(++done, doc.images.length);
            }
        }));

        // the pictures are PNG already: storing them is as small and much faster
        const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
        download(blob, `hungarian-neume-catalogue-documentation-${stamp()}.zip`);
        return { manuscripts: doc.index.manuscripts.length, snippets: doc.images.length, counts: doc.counts };
    }

    // ---- pictures -----------------------------------------------------------------------------

    const imageUrl = (snippet) => absolute(root) + snippet.file;
    /** The catalogue's picture of the whole cell, if this place has it (the website does not carry them). */
    const cellUrl = (snippet) => {
        const source = sources.value.get(snippet.source);
        const cell = source && source.cells[snippet.column];
        return cell && cell.image ? absolute(root) + cell.image : '';
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', (e) => {
            if (hasPending() && saving.value !== 'saved') { flush(); e.preventDefault(); e.returnValue = ''; }
        });
    }

    return {
        status, error, mode, catalogue, snippets, decisions, saving, saveError, sources, columns, stale,
        load, flush, setCode, accept, acceptAll, setAside, discard, reopen, undo, canUndo, lastLabel,
        saveDecisionsFile, loadDecisionsFile, writeDocumentationFolder, downloadDocumentation, imageUrl, cellUrl, quickChoices
    };
}

export function useNeumaReview() {
    if (!shared) shared = create();
    return shared;
}

/** For tests: a fresh state. */
export function resetNeumaReview() { shared = null; }

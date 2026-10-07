import { computed, reactive, ref } from 'vue';
import {
    INDEX_FILE, LOCAL_ID, cleanEndpointList, combineId, combinedParts, endpointFromId, idFromRepoInput, isCombineId, resolveEndpoint
} from '../utils/documentation';
import { DocumentationError, createCombinedSource, createMemorySource, createRemoteSource } from '../utils/documentationSource';
import { buildLocalDocumentation } from './useLocalDocumentation';

/**
 * The documentations a reader can look at: the endpoints the hosting offers (`endpoints.json`,
 * next to the app), the repositories this reader added, and the documentation made from this
 * browser's own work. Each is opened once and kept while the page is open; a manuscript's file
 * is read when it is first needed.
 *
 * Everything is read-only: nothing here can change what is at an endpoint.
 */

const MINE_KEY = 'neume-docs.repositories';

function readMine() {
    try {
        const list = JSON.parse(localStorage.getItem(MINE_KEY) || '[]');
        return Array.isArray(list) ? list.filter(id => typeof id === 'string' && endpointFromId(id)) : [];
    } catch { return []; }
}
function writeMine(list) {
    try { localStorage.setItem(MINE_KEY, JSON.stringify(list)); } catch { /* private window: it lasts until the page is closed */ }
}

const hosted = reactive({ status: 'idle', list: [], error: '' });
const mine = ref(readMine());
const opened = reactive(new Map());

/** The list the hosting offers. */
async function loadHosted(force = false) {
    if (hosted.status === 'ready' && !force) return;
    hosted.status = 'loading';
    try {
        const response = await fetch(`${import.meta.env.BASE_URL}endpoints.json`, { cache: 'no-cache' });
        // A hosting without the file just offers nothing of its own.
        hosted.list = response.ok ? cleanEndpointList(await response.json()) : [];
        hosted.error = '';
    } catch (e) {
        hosted.list = [];
        hosted.error = 'The list of documentations could not be read.';
    }
    hosted.status = 'ready';
}

const documentBase = () => (typeof document !== 'undefined' ? document.baseURI : 'http://localhost/');

/** One documentation, as the pages see it. */
function newState(id) {
    return reactive({
        id, status: 'loading', error: '', hint: '', endpoint: null, source: null, index: null,
        manuscripts: {}, // entry id -> { status, data, error }
        local: id === LOCAL_ID || (isCombineId(id) && combinedParts(id).includes(LOCAL_ID))
    });
}

const PREVIEW_KEY = 'neume-docs.preview-unpublished';
function readPreview() {
    try { return localStorage.getItem(PREVIEW_KEY) === '1'; } catch { return false; }
}
/** Whether "This browser" shows all of one's own work, not only what is published. */
export const previewUnpublished = ref(readPreview());
export function setPreviewUnpublished(on) {
    previewUnpublished.value = !!on;
    try { localStorage.setItem(PREVIEW_KEY, on ? '1' : '0'); } catch { /* it lasts until the page is closed */ }
    const local = opened.get(LOCAL_ID);
    if (local) openInto(local);
    // a combination with this browser's work is made again
    for (const state of opened.values()) if (state.id !== LOCAL_ID && state.endpoint && state.endpoint.kind === 'combine' && combinedParts(state.id).includes(LOCAL_ID)) openInto(state);
}

/** The source of one documentation: this browser's own, or an endpoint. */
async function makeSource(id) {
    if (id === LOCAL_ID) {
        const built = await buildLocalDocumentation({ includeUnpublished: previewUnpublished.value });
        const endpoint = { id: LOCAL_ID, kind: 'memory', name: 'This browser', description: 'Your own work, as readers will see it.' };
        return { endpoint, source: createMemorySource(LOCAL_ID, built, endpoint) };
    }
    await loadHosted();
    const endpoint = resolveEndpoint(id, hosted.list.concat(mine.value.map(endpointFromId).filter(Boolean)));
    if (!endpoint) {
        throw new DocumentationError(`There is no documentation called “${id}” here.`, { hint: 'It is not in this site\'s list. A repository on GitHub can be opened by its address, owner/name.' });
    }
    return { endpoint, source: createRemoteSource(endpoint, { documentBase: documentBase() }) };
}

async function openInto(state) {
    state.status = 'loading';
    state.error = '';
    state.hint = '';
    try {
        if (isCombineId(state.id)) {
            const ids = combinedParts(state.id);
            if (!ids.length) throw new DocumentationError('Nothing is named to look at together.');
            const tried = await Promise.all(ids.map(async (id) => {
                try {
                    const { source } = await makeSource(id);
                    return { id, source, index: await source.loadIndex() };
                } catch (e) {
                    return { id, error: e instanceof DocumentationError ? e.message : 'It could not be opened.' };
                }
            }));
            const ok = tried.filter(t => !t.error);
            const problems = tried.filter(t => t.error).map(t => ({ id: t.id, message: t.error }));
            if (!ok.length) throw new DocumentationError('None of the documentations could be opened.', { hint: problems.map(p => `${p.id}: ${p.message}`).join(' ') });
            state.source = createCombinedSource(state.id, ok, problems);
            state.endpoint = state.source.endpoint;
        } else {
            const made = await makeSource(state.id);
            state.endpoint = made.endpoint;
            state.source = made.source;
        }
        state.index = await state.source.loadIndex();
        state.manuscripts = {};
        state.status = 'ready';
    } catch (e) {
        state.status = 'error';
        state.error = e instanceof DocumentationError ? e.message : `The documentation could not be opened (${e && e.message ? e.message : 'unknown problem'}).`;
        state.hint = e instanceof DocumentationError ? e.hint : '';
    }
}

/** A documentation, opened (or being opened). `refresh` reads it again; the local one always is. */
export function openDocumentation(id, { refresh = false } = {}) {
    let state = opened.get(id);
    if (!state) { state = newState(id); opened.set(id, state); openInto(state); }
    else if (refresh || (state.local && state.status !== 'loading')) openInto(state);
    return state;
}

/** A documentation that has been opened, or undefined: it never opens one (so it is safe in a computed). */
export const peekDocumentation = (id) => opened.get(id);

/** One manuscript's file, read once. */
export async function loadManuscript(state, entry) {
    const have = state.manuscripts[entry.id];
    if (have && (have.status === 'ready' || have.status === 'loading')) return have;
    const slot = reactive({ status: 'loading', data: null, error: '' });
    state.manuscripts[entry.id] = slot;
    try {
        slot.data = await state.source.loadManuscript(entry);
        slot.status = 'ready';
    } catch (e) {
        slot.status = 'error';
        slot.error = e instanceof DocumentationError ? e.message : 'The file could not be read.';
    }
    return slot;
}

/** All manuscripts' files, a few at a time (the neume table needs every one). */
export async function loadAllManuscripts(state, limit = 6) {
    const entries = [...state.index.manuscripts];
    let next = 0;
    async function worker() {
        while (next < entries.length) await loadManuscript(state, entries[next++]);
    }
    await Promise.all(Array.from({ length: Math.min(limit, entries.length) }, worker));
}

export function useDocumentations() {
    const endpoints = computed(() => [
        ...hosted.list,
        ...mine.value.map(endpointFromId).filter(Boolean)
    ]);

    /** Add a repository the reader typed; returns its id, or '' if it is not an address of one. */
    function addRepository(input) {
        const id = idFromRepoInput(input);
        if (!id) return '';
        if (!mine.value.includes(id) && !hosted.list.some(e => e.id === id)) {
            mine.value = [...mine.value, id];
            writeMine(mine.value);
        }
        return id;
    }

    function removeRepository(id) {
        mine.value = mine.value.filter(x => x !== id);
        writeMine(mine.value);
        opened.delete(id);
    }

    return { hosted, endpoints, mine, loadHosted, addRepository, removeRepository, open: openDocumentation, INDEX_FILE, combineId, previewUnpublished, setPreviewUnpublished };
}

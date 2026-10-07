import { inject, provide, computed } from 'vue';
import { referenceUrl } from '../utils/citation';
import { holdingOf } from '../utils/documentation';
import { canPin, isPinned, pinnedId, resolveCommit, shortSha } from '../utils/documentationVersion';
import { useStars } from './useStars';

const KEY = Symbol('documentation');

/**
 * What the pages of one documentation share: the documentation itself, how to address things in it,
 * and how to cite them. Provided by the shell (DocsShellView), used by every page inside it.
 *
 * Addresses are built here only, so a reference to a manuscript, a pattern, a cell or a snippet
 * has one form wherever it is made.
 *
 * @param {import('vue').Ref<object>} stateRef  the opened documentation (see useDocumentations)
 * @param {{ cite: (target: object, sub?: string, query?: object) => void }} actions
 */
export function provideDocs(stateRef, { cite }) {
    const id = computed(() => stateRef.value.id);

    /** The path of a page of this documentation, e.g. `/m/Ms01` (the first part of the address is the endpoint). */
    const path = (sub = '') => `/docs/${encodeURIComponent(id.value)}${sub}`;
    const manuscriptPath = (entryId) => path(`/m/${encodeURIComponent(entryId)}`);

    /** A full address that leads back to something, from anywhere: for copying and citing. */
    const permalink = (sub = '', query = {}) => referenceUrl(`${window.location.href.split('#')[0]}#${path(sub)}`, query);

    const entries = computed(() => (stateRef.value.index ? stateRef.value.index.manuscripts : []));
    const entry = (entryId) => entries.value.find(m => m.id === entryId) || null;
    const columns = computed(() => (stateRef.value.index ? stateRef.value.index.columns : []));
    const columnLabel = (key) => (columns.value.find(c => c.key === key) || { label: key }).label;
    /** Where a manuscript is kept, for citing it. */
    const holding = (entryId) => { const e = entry(entryId); return e ? holdingOf(e.meta, columns.value) : ''; };

    /**
     * The same address at the version the documentation is at now (a GitHub commit), so a citation keeps
     * leading to what was cited even when the authors go on changing it.
     * @returns {Promise<{ url: string, version: string } | null>} null where there is no such thing as a version
     */
    async function pinned(sub = '', query = {}) {
        const endpoint = stateRef.value.endpoint;
        if (!canPin(endpoint)) return null;
        const sha = await resolveCommit(endpoint);
        if (!sha) return null;
        const id = isPinned(endpoint) ? stateRef.value.id : pinnedId(endpoint, sha);
        const base = `${window.location.href.split('#')[0]}#/docs/${encodeURIComponent(id)}${sub}`;
        return { url: referenceUrl(base, query), version: shortSha(sha), sha };
    }

    const asset = (rel) => (rel && stateRef.value.source ? stateRef.value.source.assetUrl(rel) : '');

    const ctx = {
        state: stateRef, id, path, manuscriptPath, permalink, pinned, holding, entries, entry, columns, columnLabel, asset, cite,
        stars: useStars(id),
        signs: computed(() => (stateRef.value.index ? stateRef.value.index.signs : {})),
        /** the signs as a list, for the hierarchy of codes */
        signList: computed(() => Object.entries(stateRef.value.index ? stateRef.value.index.signs : {}).map(([key, g]) => ({ key, label: g.label || key, abbrev: g.abbrev || key }))),
        info: computed(() => (stateRef.value.index ? stateRef.value.index.info : {})),
        generated: computed(() => (stateRef.value.index ? stateRef.value.index.generated : ''))
    };
    provide(KEY, ctx);
    return ctx;
}

export function useDocs() {
    const ctx = inject(KEY, null);
    if (!ctx) throw new Error('useDocs() is used outside a documentation.');
    return ctx;
}

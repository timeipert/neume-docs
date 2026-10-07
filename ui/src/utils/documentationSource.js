/**
 * Where a documentation is read from: a web address (a repository on GitHub, or any server), or
 * memory (what the editor has just built, for a preview). Both answer the same three questions:
 * what is the index, what is a manuscript's file, and where is a picture.
 *
 * Reading is the only thing a source does; nothing here writes, so an endpoint is read-only by
 * construction. `fetch` is handed in, so it can be tested without a network.
 */
import { INDEX_FILE, baseUrl, cleanIndex, cleanManuscript, fileUrl, repoWebUrl } from './documentation';

/** A problem a person can understand and, with luck, fix. */
export class DocumentationError extends Error {
    constructor(message, { hint = '' } = {}) {
        super(message);
        this.name = 'DocumentationError';
        this.hint = hint;
    }
}

async function readJson(fetchFn, url, what) {
    let response;
    try {
        response = await fetchFn(url, { cache: 'no-cache', credentials: 'omit' });
    } catch {
        throw new DocumentationError(`Could not reach ${new URL(url).host}.`, { hint: 'Check the connection. If the address is right, the server may not allow reading from other websites.' });
    }
    if (response.status === 404) {
        throw new DocumentationError(`${what} was not found.`, { hint: `Looked at ${url}. Is the repository public, is the branch right, and is ${INDEX_FILE} in the folder that was named?` });
    }
    if (!response.ok) throw new DocumentationError(`${what} could not be read (${response.status}).`, { hint: `Looked at ${url}.` });
    try {
        return await response.json();
    } catch {
        throw new DocumentationError(`${what} is not valid JSON.`, { hint: `Looked at ${url}.` });
    }
}

/**
 * A documentation that lives at an address.
 * @param {object} endpoint  see utils/documentation
 */
export function createRemoteSource(endpoint, { fetchFn = (...a) => fetch(...a), documentBase } = {}) {
    const base = baseUrl(endpoint, documentBase);
    return {
        id: endpoint.id,
        endpoint,
        base,
        webUrl: repoWebUrl(endpoint),
        editable: false,
        async loadIndex() {
            const raw = await readJson(fetchFn, `${base}${INDEX_FILE}`, `The documentation (${INDEX_FILE})`);
            const { index, error } = cleanIndex(raw);
            if (error) throw new DocumentationError(error);
            return index;
        },
        async loadManuscript(entry) {
            const url = fileUrl(base, entry.file);
            if (!url) throw new DocumentationError(`The file of ${entry.id} is not a path inside the documentation.`);
            const raw = await readJson(fetchFn, url, `The file of ${entry.id}`);
            const { manuscript, error } = cleanManuscript(raw, entry.id);
            if (error) throw new DocumentationError(`${entry.id}: ${error}`);
            return manuscript;
        },
        assetUrl: (rel) => fileUrl(base, rel)
    };
}

/** A documentation held in memory: `built` is what utils/buildDocumentation made. */
export function createMemorySource(id, built, endpoint) {
    const { index, error } = cleanIndex(built.index);
    const files = new Map((built.files || []).map(f => [f.path, f.dataUrl]));
    return {
        id,
        endpoint,
        base: '',
        webUrl: '',
        editable: false,
        async loadIndex() {
            if (error) throw new DocumentationError(error);
            return index;
        },
        async loadManuscript(entry) {
            const raw = built.manuscripts[entry.id];
            if (!raw) throw new DocumentationError(`${entry.id} is not in this documentation.`);
            const result = cleanManuscript(raw, entry.id);
            if (result.error) throw new DocumentationError(result.error);
            return result.manuscript;
        },
        assetUrl: (rel) => (/^(https?:|data:image\/)/i.test(rel) ? rel : (files.get(rel) || ''))
    };
}

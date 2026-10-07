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

// ---- several documentations looked at together ------------------------------------------------------

/** The name a part goes by in the ids of the combination: short, and different for each. */
function partKey(id, taken) {
    const base = String(id).toLowerCase().replace(/^gh:/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'docs';
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
    taken.add(key);
    return key;
}

/** The key of the column that says which documentation a manuscript comes from. */
export const ORIGIN_COLUMN = '@documentation';

const sameGlyph = (a, b) => a.d === b.d && a.viewBox === b.viewBox;

/**
 * Several documentations as one: their manuscripts side by side, in one table and one neume table.
 * Each manuscript keeps what it came with — its metadata, its snippets, and (for citing it) the
 * documentation it comes from. Pictures are made absolute, since the files of each part are
 * somewhere else. Parts that could not be opened are left out and named in `problems`.
 *
 * @param {string} id
 * @param {Array<{ id: string, source: object, index: object }>} parts  already opened
 * @param {Array<{ id: string, message: string }>} [problems]
 */
export function createCombinedSource(id, parts, problems = []) {
    const taken = new Set();
    const keyed = parts.map(p => ({ ...p, key: partKey(p.id, taken) }));
    const byEntry = new Map();

    const columns = [];
    const seen = new Map();
    const byLabel = new Map();
    const signs = {};
    const clashes = [];
    const manuscripts = [];

    for (const part of keyed) {
        const { info } = part.index;
        const origin = {
            key: part.key, id: part.id, title: info.title, authors: info.authors, year: info.year, publisher: info.publisher,
            license: info.license, doi: info.doi, url: info.url, preferredCitation: info.preferredCitation, generated: part.index.generated
        };
        part.origin = origin;

        // The same column in two documentations — the same key, or just the same name — is one column here.
        const remap = {};
        for (const c of part.index.columns) {
            const name = c.label.trim().toLowerCase();
            const have = seen.get(c.key) || byLabel.get(name);
            if (!have) {
                const copy = { ...c };
                seen.set(c.key, copy);
                byLabel.set(name, copy);
                columns.push(copy);
                remap[c.key] = c.key;
            } else {
                remap[c.key] = have.key;
                if (!have.filter && c.filter) have.filter = c.filter;
            }
        }
        for (const [key, glyph] of Object.entries(part.index.signs)) {
            if (!signs[key]) signs[key] = glyph;
            else if (!sameGlyph(signs[key], glyph) && !clashes.includes(key)) clashes.push(key);
        }
        for (const e of part.index.manuscripts) {
            const meta = { [ORIGIN_COLUMN]: info.title };
            for (const [key, value] of Object.entries(e.meta)) if (!(remap[key] in meta)) meta[remap[key] ?? key] = value;
            const merged = { ...e, id: `${part.key}/${e.id}`, meta, origin };
            byEntry.set(merged.id, { part, entry: e });
            manuscripts.push(merged);
        }
    }

    // where each manuscript comes from is a column of its own, to filter and to read
    columns.push({ key: ORIGIN_COLUMN, label: 'Documentation', type: 'text', filter: keyed.length > 1 ? 'values' : '' });

    const licences = [...new Set(keyed.map(p => p.index.info.license).filter(Boolean))];
    const index = {
        format: 'neume-docs',
        version: 1,
        generated: keyed.map(p => p.index.generated).filter(Boolean).sort().pop() || '',
        info: {
            title: keyed.length ? `${keyed.map(p => p.index.info.title).join(' + ')}` : 'Combination',
            description: keyed.length ? `${keyed.length} documentation${keyed.length === 1 ? '' : 's'} looked at together. Each manuscript keeps its own authors and licence: cite it by the documentation it comes from.` : '',
            authors: [], publisher: '', doi: '', url: '', year: '', preferredCitation: '',
            license: licences.length === 1 ? licences[0] : (licences.length ? 'Mixed — see each documentation' : ''),
            combined: true,
            parts: keyed.map(p => p.origin)
        },
        columns,
        manuscripts,
        signs,
        discriminateSigns: keyed.some(p => p.index.discriminateSigns),
        signClashes: clashes
    };

    const absolute = (part, rel) => (rel ? part.source.assetUrl(rel) : '');

    return {
        id,
        endpoint: { id, kind: 'combine', name: index.info.title, parts: keyed.map(p => p.id) },
        base: '',
        webUrl: '',
        editable: false,
        problems,
        parts: keyed,
        async loadIndex() { return index; },
        async loadManuscript(entry) {
            const found = byEntry.get(entry.id);
            if (!found) throw new DocumentationError(`${entry.id} is not in this combination.`);
            const data = await found.part.source.loadManuscript(found.entry);
            return {
                ...data,
                id: entry.id,
                snippets: data.snippets.map(s => ({ ...s, image: absolute(found.part, s.image), zoom: absolute(found.part, s.zoom) })),
                lines: data.lines.map(l => ({ ...l, image: absolute(found.part, l.image) }))
            };
        },
        assetUrl: (rel) => (/^(https?:|data:image\/)/i.test(rel) ? rel : '')
    };
}

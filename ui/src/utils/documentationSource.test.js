import { describe, expect, it } from 'vitest';
import { DocumentationError, createMemorySource, createRemoteSource } from './documentationSource';
import { endpointFromId } from './documentation';

const INDEX = { format: 'neume-docs', version: 1, info: { title: 'T' }, manuscripts: [{ id: 'Ms01', file: 'data/Ms01.json' }] };
const MS = { id: 'Ms01', rows: [{ pattern: '*u' }], snippets: [] };

/** A fake fetch over a table of address -> answer. */
function fakeFetch(table) {
    const seen = [];
    const fn = async (url, options) => {
        seen.push({ url, options });
        const hit = table[url];
        if (hit === 'network') throw new TypeError('Failed to fetch');
        if (!hit) return { ok: false, status: 404, json: async () => ({}) };
        if (typeof hit === 'number') return { ok: false, status: hit, json: async () => ({}) };
        if (hit === 'broken') return { ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } };
        return { ok: true, status: 200, json: async () => hit };
    };
    fn.seen = seen;
    return fn;
}

const BASE = 'https://raw.githubusercontent.com/a/b/main/';
const endpoint = endpointFromId('gh:a/b');

describe('a documentation at an address', () => {
    it('reads the index and a manuscript, and nothing else', async () => {
        const fetchFn = fakeFetch({ [`${BASE}neume-docs.json`]: INDEX, [`${BASE}data/Ms01.json`]: MS });
        const source = createRemoteSource(endpoint, { fetchFn });
        const index = await source.loadIndex();
        expect(index.manuscripts[0].id).toBe('Ms01');
        const ms = await source.loadManuscript(index.manuscripts[0]);
        expect(ms.rows[0].pattern).toBe('*u');
        expect(fetchFn.seen.every(s => s.options.credentials === 'omit')).toBe(true);
        expect(source.editable).toBe(false);
        expect(source.webUrl).toBe('https://github.com/a/b');
    });

    it('says what is wrong in words, and where it looked', async () => {
        const missing = createRemoteSource(endpoint, { fetchFn: fakeFetch({}) });
        await expect(missing.loadIndex()).rejects.toThrow(DocumentationError);
        await expect(missing.loadIndex()).rejects.toThrow(/was not found/);
        const offline = createRemoteSource(endpoint, { fetchFn: fakeFetch({ [`${BASE}neume-docs.json`]: 'network' }) });
        await expect(offline.loadIndex()).rejects.toThrow(/Could not reach raw\.githubusercontent\.com/);
        const down = createRemoteSource(endpoint, { fetchFn: fakeFetch({ [`${BASE}neume-docs.json`]: 503 }) });
        await expect(down.loadIndex()).rejects.toThrow(/\(503\)/);
        const broken = createRemoteSource(endpoint, { fetchFn: fakeFetch({ [`${BASE}neume-docs.json`]: 'broken' }) });
        await expect(broken.loadIndex()).rejects.toThrow(/not valid JSON/);
        const wrong = createRemoteSource(endpoint, { fetchFn: fakeFetch({ [`${BASE}neume-docs.json`]: { hello: 1 } }) });
        await expect(wrong.loadIndex()).rejects.toThrow(/not a neume-docs documentation/);
        try { await missing.loadIndex(); } catch (e) { expect(e.hint).toContain(`${BASE}neume-docs.json`); }
    });

    it('does not follow a path out of the documentation', async () => {
        const source = createRemoteSource(endpoint, { fetchFn: fakeFetch({}) });
        await expect(source.loadManuscript({ id: 'x', file: '../other.json' })).rejects.toThrow(/not a path inside/);
        expect(source.assetUrl('../x.png')).toBe('');
        expect(source.assetUrl('images/a.png')).toBe(`${BASE}images/a.png`);
    });

    it('reads a documentation on any server, relative to the page', async () => {
        const fetchFn = fakeFetch({ 'https://site.example/app/docs-demo/neume-docs.json': INDEX });
        const source = createRemoteSource({ id: 'demo', kind: 'url', url: './docs-demo/' }, { fetchFn, documentBase: 'https://site.example/app/' });
        expect((await source.loadIndex()).info.title).toBe('T');
    });
});

describe('a documentation in memory', () => {
    const built = { index: INDEX, manuscripts: { Ms01: MS }, files: [{ path: 'images/Shots/s1.png', dataUrl: 'data:image/png;base64,AAAA' }] };

    it('answers like one at an address', async () => {
        const source = createMemorySource('local', built);
        const index = await source.loadIndex();
        expect((await source.loadManuscript(index.manuscripts[0])).id).toBe('Ms01');
        await expect(source.loadManuscript({ id: 'nope' })).rejects.toThrow(/not in this documentation/);
    });

    it('hands out the pictures it holds, and addresses as they are', () => {
        const source = createMemorySource('local', built);
        expect(source.assetUrl('images/Shots/s1.png')).toBe('data:image/png;base64,AAAA');
        expect(source.assetUrl('https://iiif.example/x.jpg')).toBe('https://iiif.example/x.jpg');
        expect(source.assetUrl('images/none.png')).toBe('');
    });

    it('says when what it holds is no documentation', async () => {
        await expect(createMemorySource('local', { index: {}, manuscripts: {} }).loadIndex()).rejects.toThrow(DocumentationError);
    });
});

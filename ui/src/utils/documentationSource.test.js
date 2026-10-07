import { describe, expect, it } from 'vitest';
import { DocumentationError, createCombinedSource, createMemorySource, createRemoteSource } from './documentationSource';
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

describe('several documentations as one', () => {
    const indexOf = (title, ids, extra = {}) => ({
        format: 'neume-docs', version: 1, generated: '2026-10-01',
        info: { title, authors: [`Author of ${title}`], license: 'CC BY 4.0', year: '2026' },
        columns: [{ key: 'origin', label: 'Origin', type: 'location', filter: 'values' }],
        manuscripts: ids.map(id => ({ id, file: `data/${id}.json`, source: id, meta: { origin: 'Köln' } })),
        signs: { V: { viewBox: '0 0 1 1', d: 'M0 0', label: 'Virga' } },
        ...extra
    });
    const part = (id, title, ids, ms = {}, extra) => {
        const built = { index: indexOf(title, ids, extra), manuscripts: Object.fromEntries(ids.map(i => [i, { id: i, rows: [{ pattern: '*u' }], snippets: [{ id: 's1', pattern: '*u', image: `images/${i}.jpg`, zoom: '' }], lines: [], ...ms[i] }])), files: [] };
        const source = createMemorySource(id, built);
        // pictures of a part are found relative to it
        source.assetUrl = (rel) => (/^https?:/.test(rel) ? rel : `https://${id}.example/${rel}`);
        return { id, source, index: built.index };
    };
    const a = part('a', 'Alpha', ['Ms01', 'Ms02']);
    const b = part('b', 'Beta', ['Ms01']);

    async function open(parts = [a, b]) {
        const cleaned = [];
        for (const p of parts) cleaned.push({ id: p.id, source: p.source, index: await p.source.loadIndex() });
        return createCombinedSource('combine:a,b', cleaned);
    }

    it('lists the manuscripts of all, with ids that differ even where the names are the same', async () => {
        const source = await open();
        const index = await source.loadIndex();
        expect(index.manuscripts.map(m => m.id)).toEqual(['a/Ms01', 'a/Ms02', 'b/Ms01']);
        expect(index.manuscripts.map(m => m.source)).toEqual(['Ms01', 'Ms02', 'Ms01']);
    });

    it('says which documentation each comes from, as a column to filter by and as what to cite', async () => {
        const index = await (await open()).loadIndex();
        expect(index.columns.map(c => c.key)).toEqual(['origin', '@documentation']);
        expect(index.columns[1].filter).toBe('values');
        expect(index.manuscripts[2].meta['@documentation']).toBe('Beta');
        expect(index.manuscripts[2].origin).toMatchObject({ title: 'Beta', authors: ['Author of Beta'], license: 'CC BY 4.0' });
        expect(index.info.parts.map(p => p.title)).toEqual(['Alpha', 'Beta']);
    });

    it('is no documentation of anybody: no authors of its own, the licence only if they agree', async () => {
        const index = await (await open()).loadIndex();
        expect(index.info).toMatchObject({ combined: true, authors: [], license: 'CC BY 4.0', title: 'Alpha + Beta' });
        const other = part('c', 'Gamma', ['Ms09'], {}, { info: { title: 'Gamma', authors: [], license: 'ODbL 1.0' } });
        const mixed = await (await open([a, other])).loadIndex();
        expect(mixed.info.license).toMatch(/Mixed/);
    });

    it('reads each manuscript from its own part, with its pictures made absolute', async () => {
        const source = await open();
        const index = await source.loadIndex();
        const ms = await source.loadManuscript(index.manuscripts[2]);
        expect(ms.id).toBe('b/Ms01');
        expect(ms.snippets[0].image).toBe('https://b.example/images/Ms01.jpg');
        await expect(source.loadManuscript({ id: 'x/none' })).rejects.toThrow(/not in this combination/);
        expect(source.assetUrl('https://b.example/images/Ms01.jpg')).toBe('https://b.example/images/Ms01.jpg');
        expect(source.assetUrl('images/relative.jpg')).toBe('');
    });

    it('notes signs that two documentations draw differently', async () => {
        const other = part('c', 'Gamma', ['Ms09'], {}, { signs: { V: { viewBox: '0 0 1 1', d: 'M5 5', label: 'Something else' } } });
        const index = await (await open([a, other])).loadIndex();
        expect(index.signClashes).toEqual(['V']);
        expect(index.signs.V.label).toBe('Virga');
        expect((await (await open()).loadIndex()).signClashes).toEqual([]);
    });
});

describe('the same column in two documentations', () => {
    const make = (id, columns, meta) => {
        const built = { index: { format: 'neume-docs', version: 1, info: { title: id }, columns, manuscripts: [{ id: 'M', file: 'data/M.json', meta }] }, manuscripts: { M: { id: 'M', rows: [], snippets: [] } }, files: [] };
        const source = createMemorySource(id, built);
        return source.loadIndex().then(index => ({ id, source, index }));
    };

    it('is one column when it has the same key, or only the same name', async () => {
        const a = await make('a', [{ key: 'x', label: 'Dating', type: 'century', filter: '' }, { key: 'o', label: 'Order', type: 'text', filter: 'values' }], { x: 's. XI', o: 'OSB' });
        const b = await make('b', [{ key: 'proj:7', label: 'dating ', type: 'century', filter: 'years' }, { key: 'o', label: 'Order', type: 'text', filter: '' }, { key: 'k', label: 'Kind', type: 'text', filter: '' }], { 'proj:7': 's. XII', o: 'OCist', k: 'psalter' });
        const index = await createCombinedSource('combine:a,b', [a, b]).loadIndex();
        expect(index.columns.map(c => c.label)).toEqual(['Dating', 'Order', 'Kind', 'Documentation']);
        expect(index.columns[0].filter).toBe('years'); // a filter that only one of them offers is kept
        expect(index.manuscripts[1].meta).toMatchObject({ x: 's. XII', o: 'OCist', k: 'psalter' });
        expect(index.manuscripts[1].meta['proj:7']).toBeUndefined();
    });
});

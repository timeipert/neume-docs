import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { resetNeumaReview, useNeumaReview } from './useNeumaReview';

/**
 * The review tool on the website: no server, the data under hung/, the decisions in the browser, the
 * documentation made in the browser and handed over as a ZIP.
 */
const catalogue = {
    origin: { name: 'Hungarian Neume Catalogue', url: 'https://neuma.zti.hu/en_attekinto.asp', authors: ['Gabriella Gilányi (content)'], publisher: 'p', note: 'n' },
    columns: [{ key: 'b', name: 'Pes', kind: 'shape', codes: ['[*u]'] }, { key: 'k', name: 'Combinations', kind: 'combination', codes: [] }],
    sources: [{ id: '007', siglum: 'A-GÜ 4/4', type: 'ANTIPHONALE', description: 'Antiphoner', collection: 'Güssing', date: '14/2', rism: '', provenance: '', notation: '', numerus: '', presentation: '', link: '', cells: { b: { image: '', width: 208, height: 126, snippets: 2 } } }]
};
const snippets = [
    { id: '007b-1', source: '007', column: 'b', index: 1, count: 2, file: 'snippets/007/b-1.png', width: 80, height: 70, box: { x: 1, y: 2, w: 80, h: 70 }, sig: '1,2,80,70', flags: [], suggestion: { code: '[*u]', alternatives: [], confidence: 'high' } },
    { id: '007b-2', source: '007', column: 'b', index: 2, count: 2, file: 'snippets/007/b-2.png', width: 60, height: 60, box: { x: 90, y: 2, w: 60, h: 60 }, sig: '90,2,60,60', flags: [], suggestion: { code: '[*u]', alternatives: [], confidence: 'high' } }
];

let storage;
let blobs;

beforeEach(() => {
    vi.useFakeTimers();
    resetNeumaReview();
    storage = new Map();
    blobs = [];
    vi.stubGlobal('localStorage', { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) });
    vi.stubGlobal('document', { baseURI: 'https://neumedocs.monodi.app/', createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b) => { blobs.push(b); return 'blob:x'; }, revokeObjectURL() {} }));
    vi.stubGlobal('fetch', vi.fn(async (url) => {
        const u = String(url);
        const json = (body) => ({ ok: true, status: 200, json: async () => body });
        if (u.includes('neuma-data/')) return { ok: false, status: 404 };
        if (u.endsWith('hung/catalogue.json')) return json(catalogue);
        if (u.endsWith('hung/snippets.json')) return json(snippets);
        if (u.includes('hung/snippets/')) return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('png:' + u).buffer };
        return { ok: false, status: 404 };
    }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function ready() {
    const review = useNeumaReview();
    await review.load();
    return review;
}

describe('the review tool without a server', () => {
    it('reads the data from hung/ and says it keeps the decisions in the browser', async () => {
        const review = await ready();
        expect(review.status.value).toBe('ready');
        expect(review.mode.value).toBe('static');
        expect(review.snippets.value).toHaveLength(2);
        expect(review.imageUrl(snippets[0])).toBe('https://neumedocs.monodi.app/hung/snippets/007/b-1.png');
        expect(review.cellUrl(snippets[0])).toBe(''); // the website carries no pictures of whole cells
    });

    it('says there is no data when hung/ has none', async () => {
        fetch.mockImplementation(async () => ({ ok: false, status: 404 }));
        const review = useNeumaReview();
        await review.load();
        expect(review.status.value).toBe('missing');
    });

    it('keeps a decision in the browser a moment after it was made, and takes it back on undo', async () => {
        const review = await ready();
        review.accept(snippets[0]);
        expect(storage.has('neume-docs:neuma-decisions')).toBe(false);
        await vi.advanceTimersByTimeAsync(600);
        const saved = JSON.parse(storage.get('neume-docs:neuma-decisions'));
        expect(saved.decisions['007b-1']).toMatchObject({ status: 'accepted', code: '[*u]', sig: '1,2,80,70' });
        expect(review.saving.value).toBe('saved');

        review.undo();
        await vi.advanceTimersByTimeAsync(600);
        expect(JSON.parse(storage.get('neume-docs:neuma-decisions')).decisions).toEqual({});
    });

    it('finds its decisions again in a new visit, and leaves out what is not well-formed', async () => {
        storage.set('neume-docs:neuma-decisions', JSON.stringify({ version: 1, decisions: { '007b-2': { status: 'corrected', code: '*u' }, '007b-1': { status: 'accepted' } } }));
        const review = await ready();
        expect(Object.keys(review.decisions)).toEqual(['007b-2']);
    });

    it('does not break when the browser keeps nothing: the decision stays pending', async () => {
        const review = await ready();
        localStorage.setItem = () => { throw new Error('quota'); };
        review.accept(snippets[0]);
        await vi.advanceTimersByTimeAsync(600);
        expect(review.saving.value).toBe('error');
        expect(review.decisions['007b-1'].status).toBe('accepted');
    });

    it('takes the decisions of a file, with their own place in the cell, and counts the ones that no longer fit', async () => {
        const review = await ready();
        const file = new Blob([JSON.stringify({ version: 1, decisions: {
            '007b-1': { status: 'corrected', code: '*u', sig: '1,2,80,70' },
            '007b-2': { status: 'accepted', code: '[*u]', sig: '9,9,9,9' },
            'nonsense': { status: 'x' }
        } })]);
        const result = await review.loadDecisionsFile(file);
        expect(result).toEqual({ count: 2, dropped: 1 });
        expect(review.decisions['007b-2'].sig).toBe('9,9,9,9');
        expect(review.stale.value).toBe(1);
    });

    it('refuses a file that is no decisions file', async () => {
        const review = await ready();
        await expect(review.loadDecisionsFile(new Blob(['not json']))).rejects.toThrow(/not JSON/);
        await expect(review.loadDecisionsFile(new Blob(['{"a":1}']))).rejects.toThrow(/no "decisions"/);
    });

    it('hands over the documentation as a ZIP: index, manuscript, and the pictures', async () => {
        vi.useRealTimers(); // zipping waits on real timers
        const review = await ready();
        review.accept(snippets[0]);
        review.setCode(snippets[1], '[*uV]');
        const progress = [];
        const result = await review.downloadDocumentation('reviewed', (done, total) => progress.push([done, total]));
        expect(result).toMatchObject({ manuscripts: 1, snippets: 2 });
        expect(progress.at(-1)).toEqual([2, 2]);

        expect(blobs).toHaveLength(1);
        const zip = await JSZip.loadAsync(await blobs[0].arrayBuffer());
        expect(Object.keys(zip.files).sort()).toEqual(['data/', 'data/007.json', 'images/', 'images/007/', 'images/007/007b-1.png', 'images/007/007b-2.png', 'neume-docs.json']);
        const index = JSON.parse(await zip.file('neume-docs.json').async('string'));
        expect(index.format).toBe('neume-docs');
        expect(index.manuscripts[0].meta.date).toBe('14th c., 2nd half');
        expect(Object.keys(index.signs)).toEqual(['V']);
        expect(await zip.file('images/007/007b-2.png').async('string')).toBe('png:https://neumedocs.monodi.app/hung/snippets/007/b-2.png');
        const ms = JSON.parse(await zip.file('data/007.json').async('string'));
        expect(ms.rows.map(r => r.pattern).sort()).toEqual(['[*uV]', '[*u]']);
    });

    it('says so when there is nothing to put in the documentation yet', async () => {
        const review = await ready();
        await expect(review.downloadDocumentation('reviewed')).rejects.toThrow(/nothing to put in it yet/);
        expect(blobs).toHaveLength(0);
    });

    it('can take the proposals as they are', async () => {
        vi.useRealTimers();
        const review = await ready();
        const result = await review.downloadDocumentation('proposed');
        expect(result.snippets).toBe(2);
        expect(result.counts.proposed).toBe(2);
    });

    it('gives the decisions as a file', async () => {
        const review = await ready();
        review.accept(snippets[0]);
        review.saveDecisionsFile();
        const file = JSON.parse(await blobs[0].text());
        expect(file.version).toBe(1);
        expect(file.decisions['007b-1'].code).toBe('[*u]');
    });
});

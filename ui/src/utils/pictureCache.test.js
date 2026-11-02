import { beforeEach, describe, expect, it } from 'vitest';
import { resetQueue } from './imageQueue';
import { savePicture, savePictures, savedAmong, sizeText } from './pictureCache';

/** A storage in memory with the same four doors as the browser's. */
function memoryStore() {
    const map = new Map();
    return {
        get: async (url) => map.get(url),
        put: async (record) => { map.set(record.url, record); },
        keys: async () => [...map.keys()],
        clear: async () => map.clear(),
        size: async () => ({ count: map.size, bytes: [...map.values()].reduce((n, r) => n + r.blob.size, 0) })
    };
}
const picture = () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' });
const okFetch = async () => new Response(picture(), { status: 200, headers: { 'Content-Type': 'image/jpeg' } });

beforeEach(resetQueue);

describe('saving a picture', () => {
    it('keeps what the server sends', async () => {
        const store = memoryStore();
        expect(await savePicture('https://lib.example/a.jpg', { store, fetchFn: okFetch })).toEqual({ ok: true });
        expect((await savedAmong(['https://lib.example/a.jpg', 'https://lib.example/b.jpg'], { store })).size).toBe(1);
    });
    it('says why it could not', async () => {
        const store = memoryStore();
        const refused = await savePicture('https://lib.example/a.jpg', { store, fetchFn: async () => new Response('no', { status: 403 }) });
        expect(refused).toEqual({ ok: false, reason: 'The server refused it (403).' });
        const blocked = await savePicture('https://lib.example/a.jpg', { store, fetchFn: async () => { throw new TypeError('cors'); } });
        expect(blocked.ok).toBe(false);
        const html = await savePicture('https://lib.example/a.jpg', { store, fetchFn: async () => new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }) });
        expect(html.reason).toMatch(/did not send a picture/);
        expect((await store.keys()).length).toBe(0);
    });
});

describe('a server that refuses to enlarge', () => {
    it('is asked for the same cut-out at its maximum, and the picture is kept under the first address', async () => {
        const store = memoryStore();
        const asked = [];
        const fetchFn = async (address) => { asked.push(address); return address.includes('/300,/') ? new Response('upscaling', { status: 400 }) : okFetch(); };
        const url = 'https://iiif.example/i/page.tif/pct:1,2,3,4/300,/0/default.jpg';
        expect(await savePicture(url, { store, fetchFn })).toEqual({ ok: true });
        expect(asked).toEqual([url, 'https://iiif.example/i/page.tif/pct:1,2,3,4/max/0/default.jpg']);
        expect((await savedAmong([url], { store })).size).toBe(1);
    });
    it('is not asked again at once when it says it is busy', async () => {
        const asked = [];
        const fetchFn = async (address) => { asked.push(address); return new Response('', { status: 429 }); };
        const result = await savePicture('https://iiif.example/i/page.tif/pct:1,2,3,4/300,/0/default.jpg', { store: memoryStore(), fetchFn });
        expect(result.reason).toMatch(/busy/);
        expect(asked).toHaveLength(1);
    });
});

describe('saving many pictures', () => {
    it('counts what was saved, what was there already and what failed, and reports progress', async () => {
        const store = memoryStore();
        await store.put({ url: 'https://lib.example/have.jpg', blob: picture(), savedAt: 0 });
        const fetchFn = async (url) => (url.includes('bad') ? new Response('', { status: 500 }) : okFetch());
        const steps = [];
        const result = await savePictures(
            ['https://lib.example/have.jpg', 'https://lib.example/new.jpg', 'https://lib.example/bad.jpg', 'https://lib.example/new.jpg'],
            { store, fetchFn, retryPause: 0, onProgress: p => steps.push(p) }
        );
        expect(result).toMatchObject({ total: 3, saved: 1, skipped: 1, stopped: false });
        expect(result.failures).toEqual([{ url: 'https://lib.example/bad.jpg', reason: 'The server refused it (500).' }]);
        expect(steps[0].done).toBe(0);
        expect(steps[steps.length - 1]).toMatchObject({ done: 3, total: 3, saved: 1, skipped: 1, failed: 1 });
    });
    it('tries a failed picture a second time', async () => {
        const store = memoryStore();
        let calls = 0;
        const fetchFn = async () => (++calls === 1 ? new Response('', { status: 429 }) : okFetch());
        const result = await savePictures(['https://lib.example/a.jpg'], { store, fetchFn, retryPause: 0 });
        expect(result.saved).toBe(1);
        expect(calls).toBe(2);
    });
    it('stops when asked', async () => {
        const store = memoryStore();
        const controller = new AbortController();
        controller.abort();
        const result = await savePictures(['https://lib.example/a.jpg'], { store, fetchFn: okFetch, signal: controller.signal });
        expect(result.stopped).toBe(true);
        expect(result.saved).toBe(0);
    });
});

describe('sizes', () => {
    it('are written for people', () => {
        expect(sizeText(512)).toBe('512 B');
        expect(sizeText(20480)).toBe('20 KB');
        expect(sizeText(3 * 1024 * 1024)).toBe('3.0 MB');
    });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { resetQueue, waitTurn } from './imageQueue';

const base = 'http://localhost/';
beforeEach(resetQueue);

describe('a few pictures at a time from one server', () => {
    it('lets a picture from the page\'s own origin through at once', async () => {
        const releases = await Promise.all(Array.from({ length: 10 }, () => waitTurn('http://localhost/img/a.jpg', { base, limit: 2 })));
        expect(releases).toHaveLength(10);
    });

    it('holds back the pictures of one server beyond the limit, and lets the next in as one is released', async () => {
        const url = 'https://gallica.example/iiif/x/f1/full/300,/0/default.jpg';
        const order = [];
        const asks = [1, 2, 3, 4].map(n => waitTurn(url, { base, limit: 2 }).then((release) => { order.push(n); return release; }));
        await Promise.resolve();
        await Promise.resolve();
        expect(order).toEqual([1, 2]);
        (await asks[0])();
        await asks[2];
        expect(order).toEqual([1, 2, 3]);
        (await asks[1])();
        await asks[3];
        expect(order).toEqual([1, 2, 3, 4]);
    });

    it('does not let a server wait for another', async () => {
        const a = await waitTurn('https://a.example/x.jpg', { base, limit: 1 });
        const b = await waitTurn('https://b.example/x.jpg', { base, limit: 1 });
        expect(typeof a).toBe('function');
        expect(typeof b).toBe('function');
    });

    it('counts a release once, however often it is called', async () => {
        const url = 'https://a.example/x.jpg';
        const first = await waitTurn(url, { base, limit: 1 });
        first();
        first();
        const second = await waitTurn(url, { base, limit: 1 });
        const order = [];
        waitTurn(url, { base, limit: 1 }).then(() => order.push('third'));
        await Promise.resolve();
        expect(order).toEqual([]);
        second();
    });
});

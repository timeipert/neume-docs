import { describe, it, expect } from 'vitest';
import { nativeWidth, pageUrls, regionUrls } from './iiifUrls';

const S = 'https://iiif.example/img/1';

describe('the addresses of a part of a page', () => {
    it('go from the width asked for to what always works', () => {
        expect(regionUrls(S, 'pct:10,10,5,4', 320)).toEqual([
            `${S}/pct:10,10,5,4/320,/0/default.jpg`,
            `${S}/pct:10,10,5,4/max/0/default.jpg`,
            `${S}/pct:10,10,5,4/full/0/default.jpg`
        ]);
    });

    it('take the width as a number, a string or with its comma', () => {
        const first = (w) => regionUrls(S, 'pct:1,1,2,2', w)[0];
        expect(first('480')).toBe(`${S}/pct:1,1,2,2/480,/0/default.jpg`);
        expect(first('480,')).toBe(first(480));
    });

    it('ask for the maximum or the full size once, not twice', () => {
        expect(regionUrls(S, 'pct:1,1,2,2', 'max')).toEqual([`${S}/pct:1,1,2,2/max/0/default.jpg`, `${S}/pct:1,1,2,2/full/0/default.jpg`]);
        expect(regionUrls(S, 'pct:1,1,2,2', 'full')).toEqual([`${S}/pct:1,1,2,2/full/0/default.jpg`, `${S}/pct:1,1,2,2/max/0/default.jpg`]);
    });

    it('hold the width to the part\'s own size as a second choice, when that is known and smaller', () => {
        // a part 20% wide of a page 2000 wide is 400 wide: 1400 asked for would be an enlargement
        const urls = regionUrls(S, 'pct:10,10,20,5', 1400, { pageWidth: 2000 });
        expect(urls[0]).toContain('/1400,/');
        expect(urls[1]).toContain('/400,/');
        expect(urls).toHaveLength(4);
    });

    it('does not hold it when the part is larger than asked, unknown, or tiny', () => {
        expect(regionUrls(S, 'pct:10,10,50,5', 300, { pageWidth: 2000 })).toHaveLength(3);
        expect(regionUrls(S, 'pct:10,10,20,5', 1400)).toHaveLength(3);
        expect(regionUrls(S, 'pct:10,10,1,1', 1400, { pageWidth: 2000 })).toHaveLength(3);
    });

    it('have nothing without a service or a region, and no double slash', () => {
        expect(regionUrls('', 'pct:1,1,2,2', 300)).toEqual([]);
        expect(regionUrls(S, '', 300)).toEqual([]);
        expect(regionUrls(`${S}/`, 'pct:1,1,2,2', 300)[0]).toBe(`${S}/pct:1,1,2,2/300,/0/default.jpg`);
    });
});

describe('what a part is at the page\'s own size', () => {
    it('is its share of the page\'s width', () => {
        expect(nativeWidth('pct:10,10,20,5', 2000)).toBe(400);
        expect(nativeWidth('pct:0,0,100,100', 3000)).toBe(3000);
    });
    it('is unknown without the page\'s width or for a region in pixels', () => {
        expect(nativeWidth('pct:10,10,20,5', 0)).toBeNull();
        expect(nativeWidth('10,10,200,50', 2000)).toBeNull();
    });
});

describe('the addresses of a whole page', () => {
    const IMG = `${S}/full/full/0/default.jpg`;

    it('start with what the manifest named, then the other keyword, then smaller pictures', () => {
        expect(pageUrls(S, IMG)).toEqual([
            IMG,
            `${S}/full/max/0/default.jpg`,
            `${S}/full/2400,/0/default.jpg`,
            `${S}/full/1600,/0/default.jpg`,
            `${S}/full/1000,/0/default.jpg`
        ]);
    });

    it('with a width, are a picture of that width first, and the page at its own size after', () => {
        const urls = pageUrls(S, IMG, { width: 600 });
        expect(urls[0]).toBe(`${S}/full/600,/0/default.jpg`);
        expect(urls).toContain(`${S}/full/max/0/default.jpg`);
        expect(urls[urls.length - 1]).toBe(IMG);
        expect(new Set(urls).size).toBe(urls.length);
    });

    it('are the one address of a page that has no service', () => {
        expect(pageUrls('', 'scans/A/1r.jpg')).toEqual(['scans/A/1r.jpg']);
        expect(pageUrls(null, null)).toEqual([]);
    });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

function installStorage() {
    const data = new Map();
    globalThis.localStorage = {
        getItem: (k) => (data.has(k) ? data.get(k) : null),
        setItem: (k, v) => { data.set(k, String(v)); },
        removeItem: (k) => { data.delete(k); },
        clear: () => data.clear()
    };
}

async function freshStore() {
    setActivePinia(createPinia());
    const { useIiifStore } = await import('./iiif');
    return useIiifStore();
}

const IMAGES = [['54v', 'https://iiif.example/iiif/3/book%2Ff54v.jpg'], ['55r', 'https://x.org/loris/p55.jp2']];

describe('pages taken from the corpus\'s document metadata', () => {
    beforeEach(() => { installStorage(); });

    it('shows a source\'s pages from image addresses', async () => {
        const iiif = await freshStore();
        expect(iiif.setFolioImages('NY 905', IMAGES)).toBe(true);
        const pages = iiif.parsedData['NY 905'];
        expect(pages.map(p => p.folio)).toEqual(['54v', '55r']);
        expect(pages[0].serviceUrl).toBe(IMAGES[0][1]);
        expect(iiif.manifestStatus['NY 905']).toMatchObject({ status: 'ok', fromDocuments: true });
        expect(iiif.folioImageSources['NY 905']).toBe(true);
    });

    it('asks a version 3 server for "max" and an older one for "full"', async () => {
        const iiif = await freshStore();
        iiif.setFolioImages('S', IMAGES);
        const [v3, older] = iiif.parsedData.S;
        expect(v3.imgUrl).toBe('https://iiif.example/iiif/3/book%2Ff54v.jpg/full/max/0/default.jpg');
        expect(older.imgUrl).toBe('https://x.org/loris/p55.jp2/full/full/0/default.jpg');
    });

    it('does not override a manifest the user linked', async () => {
        const iiif = await freshStore();
        iiif.links.S = 'https://example.org/manifest.json';
        expect(iiif.setFolioImages('S', IMAGES)).toBe(false);
        expect(iiif.parsedData.S).toBeUndefined();
    });

    it('does not override pages already loaded from a manifest', async () => {
        const iiif = await freshStore();
        iiif.parsedData.S = [{ folio: '1r', imgUrl: 'x', serviceUrl: 'y' }];
        expect(iiif.setFolioImages('S', IMAGES)).toBe(false);
        expect(iiif.parsedData.S[0].folio).toBe('1r');
    });

    it('can be replaced by newer addresses, and cleared', async () => {
        const iiif = await freshStore();
        iiif.setFolioImages('S', IMAGES);
        expect(iiif.setFolioImages('S', [IMAGES[0]])).toBe(true);
        expect(iiif.parsedData.S).toHaveLength(1);
        iiif.clearFolioImages('S');
        expect(iiif.parsedData.S).toBeUndefined();
        expect(iiif.folioImageSources.S).toBeUndefined();
    });

    it('leaves pages from a manifest alone when clearing', async () => {
        const iiif = await freshStore();
        iiif.parsedData.S = [{ folio: '1r' }];
        iiif.clearFolioImages('S');
        expect(iiif.parsedData.S).toHaveLength(1);
    });

    it('ignores an empty list', async () => {
        const iiif = await freshStore();
        expect(iiif.setFolioImages('S', [])).toBe(false);
        expect(iiif.setFolioImages('S', null)).toBe(false);
    });
});

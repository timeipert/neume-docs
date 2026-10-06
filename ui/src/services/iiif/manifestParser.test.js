import { describe, it, expect } from 'vitest';
import { parseManifest, manifestVersion, cleanLabel } from './manifestParser';

const v2 = canvases => ({
    '@context': 'http://iiif.io/api/presentation/2/context.json',
    sequences: [{ canvases }]
});
const canvasV2 = (label, id = 's', extra = {}) => ({
    '@id': `c-${label}`, label, images: [{ resource: { service: { '@id': id } } }], ...extra
});

describe('parseManifest', () => {
    it('reads v2 and v3, keeping each canvas\'s id and position', () => {
        const pages = parseManifest(v2([canvasV2('fol. 1r', 'a'), { label: 'no image', images: [] }, canvasV2('fol. 1v', 'b')]));
        expect(pages.map(p => [p.folio, p.canvasIndex, p.canvasId])).toEqual([['fol. 1r', 0, 'c-fol. 1r'], ['fol. 1v', 2, 'c-fol. 1v']]);
        expect(pages[0].imgUrl).toBe('a/full/full/0/default.jpg');

        const v3 = parseManifest({
            '@context': 'http://iiif.io/api/presentation/3/context.json',
            items: [{ id: 'c1', label: { none: ['12v'] }, items: [{ items: [{ body: { service: [{ id: 's3' }] } }] }] }]
        });
        expect(v3).toMatchObject([{ folio: '12v', serviceUrl: 's3', imgUrl: 's3/full/max/0/default.jpg', canvasId: 'c1', canvasIndex: 0 }]);
    });

    it('reads a v2 label given as a language value', () => {
        expect(parseManifest(v2([canvasV2([{ '@value': 'f. 3r' }])]))[0].folio).toBe('f. 3r');
    });

    it('applies a label rule, one canvas becoming two pages', () => {
        const rule = l => (l === '122v-122r' ? ['121v', '122r'] : l);
        expect(parseManifest(v2([canvasV2('122v-122r')]), { labelRule: rule }).map(p => [p.folio, p.originalFolio, p.canvasIndex]))
            .toEqual([['121v', '122v-122r', 0], ['122r', '122v-122r', 0]]);
    });

    it('knows the version from its @context', () => {
        expect(manifestVersion({ '@context': ['http://www.w3.org/ns/anno.jsonld', 'http://iiif.io/api/presentation/3/context.json'] })).toBe(3);
        expect(manifestVersion({})).toBe(null);
    });
});

describe('cleanLabel', () => {
    it('drops a page marker before a number only', () => {
        expect(cleanLabel('p. 12')).toBe('12');
        expect(cleanLabel('p12')).toBe('12');
        expect(cleanLabel('page de garde recto')).toBe('page de garde recto');
        expect(cleanLabel('plat supérieur')).toBe('plat supérieur');
    });
});

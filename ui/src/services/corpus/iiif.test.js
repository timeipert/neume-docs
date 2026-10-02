import { describe, it, expect } from 'vitest';
import { parseIiifUrls, imageBase, nextFolio, folioImagesOf } from './iiif';

const W = 'https://iiif-ls6.informatik.uni-wuerzburg.de/iiif/3/Geesebook2%2Ffolio_';

describe('parseIiifUrls', () => {
    it('reads a JSON list', () => {
        expect(parseIiifUrls(`["${W}0019.jpg"]`)).toEqual([`${W}0019.jpg`]);
    });

    it('reads a list whose quotes are escaped', () => {
        expect(parseIiifUrls('[\\"https://iiif.diamm.net/images/E/E-0221_111v.tif\\"]'))
            .toEqual(['https://iiif.diamm.net/images/E/E-0221_111v.tif']);
    });

    it('reads several addresses, a bare address and an array', () => {
        expect(parseIiifUrls(`["${W}0054v.jpg","${W}0055.jpg"]`)).toHaveLength(2);
        expect(parseIiifUrls('https://example.org/iiif/x')).toEqual(['https://example.org/iiif/x']);
        expect(parseIiifUrls(['https://a/1', 'https://b/2'])).toEqual(['https://a/1', 'https://b/2']);
    });

    it('gives nothing for nothing', () => {
        expect(parseIiifUrls('')).toEqual([]);
        expect(parseIiifUrls(null)).toEqual([]);
        expect(parseIiifUrls('[]')).toEqual([]);
    });
});

describe('imageBase', () => {
    it('leaves a base address alone', () => {
        expect(imageBase(`${W}0019.jpg`)).toBe(`${W}0019.jpg`);
    });

    it('cuts a complete image request back to the base', () => {
        expect(imageBase('https://www.e-codices.unifr.ch/loris/sbe/sbe-0366/sbe-0366_053.jp2/full/full/0/default/jpg'))
            .toBe('https://www.e-codices.unifr.ch/loris/sbe/sbe-0366/sbe-0366_053.jp2');
        expect(imageBase('https://x.org/iiif/img1/full/max/0/default.jpg')).toBe('https://x.org/iiif/img1');
        expect(imageBase('https://x.org/iiif/img1/0,0,512,512/256,/0/default.jpg')).toBe('https://x.org/iiif/img1');
    });

    it('drops info.json and a trailing slash', () => {
        expect(imageBase('https://x.org/iiif/img1/info.json')).toBe('https://x.org/iiif/img1');
        expect(imageBase('https://x.org/iiif/img1/')).toBe('https://x.org/iiif/img1');
    });
});

describe('nextFolio', () => {
    it('steps recto, verso, next recto', () => {
        expect(nextFolio('54r')).toBe('54v');
        expect(nextFolio('54v')).toBe('55r');
        expect(nextFolio('')).toBe('');
        expect(nextFolio('guard')).toBe('');
    });
});

describe('folioImagesOf', () => {
    it('gives the first image to the start folio', () => {
        expect(folioImagesOf('0054v', [`${W}0054v.jpg`])).toEqual([['54v', `${W}0054v.jpg`]]);
        expect(folioImagesOf('113', ['https://x/a'])).toEqual([['113r', 'https://x/a']]);
    });

    it('gives a further image to the next folio when its file name agrees', () => {
        expect(folioImagesOf('0054v', [`${W}0054v.jpg`, `${W}0055.jpg`])).toEqual([
            ['54v', `${W}0054v.jpg`], ['55r', `${W}0055.jpg`]
        ]);
        expect(folioImagesOf('0029', [`${W}0029.jpg`, `${W}0029v.jpg`])).toHaveLength(2);
    });

    it('does not trust a file number that is only an image index', () => {
        const u = ['https://x/iiif/Graduale%2F0384.png', 'https://x/iiif/Graduale%2F0385.png'];
        expect(folioImagesOf('192v', u)).toEqual([['192v', u[0]]]);
    });

    it('needs a start folio', () => {
        expect(folioImagesOf('', ['https://x/a'])).toEqual([]);
        expect(folioImagesOf('1r', [])).toEqual([]);
    });
});

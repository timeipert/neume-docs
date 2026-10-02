import { describe, it, expect } from 'vitest';
import { normalise, shelfTokens, parseSiglum, dateRangeOf, buildIndex, suggest, search, metadataFrom } from './matching';

const R = (o) => ({ id: o.id, siglum: o.siglum, rism: o.rism, country: o.country, city: o.city, archive: o.archive, shelfmark: o.shelfmark, origin: o.origin, centuries: o.centuries, years: o.years, types: o.types, manifest: o.manifest });

const catalogue = [
    R({ id: 1, siglum: 'D-Eu : 84', rism: 'D-Eu', country: 'Germany', city: 'Eichstätt', archive: 'Universitätsbibliothek', shelfmark: '84', origin: 'Allemagne, Eichstätt', centuries: ['XV'], types: ['Graduale'], manifest: 'https://iiif.example.org/eu84/manifest.json' }),
    R({ id: 2, siglum: 'D-Mbs : Clm 84', rism: 'D-Mbs', country: 'Germany', city: 'München', archive: 'Bayerische Staatsbibliothek', shelfmark: 'Clm 84', centuries: ['XII'], types: ['Missale'] }),
    R({ id: 3, siglum: 'CZ-Pnk : VI G 5', rism: 'CZ-Pnk', country: 'Czech Republic', city: 'Praha', archive: 'Národní knihovna', shelfmark: 'VI G 5', centuries: ['XIV'], types: ['Processionale'], manifest: 'https://iiif.example.org/pnk/vig5.json' }),
    R({ id: 4, siglum: 'CZ-Pnk : VI G 10a', rism: 'CZ-Pnk', city: 'Praha', archive: 'Národní knihovna', shelfmark: 'VI G 10a', centuries: ['XIII', 'XIV'] }),
    R({ id: 5, siglum: 'A-A : Cod. 511', rism: 'A-A', city: 'Admont', archive: 'Benediktinerstift', shelfmark: 'Cod. 511', years: '1070-1080', centuries: ['XI'], manifest: 'https://iiif.diamm.net/manifests/A-A_511/manifest.json' }),
    R({ id: 6, siglum: 'A-Wn : Cod. 84', rism: 'A-Wn', city: 'Wien', archive: 'Österreichische Nationalbibliothek', shelfmark: 'Cod. 84', centuries: ['XIII'] })
];
const index = buildIndex(catalogue);
const ids = (list) => list.map(s => s.record.id);

describe('normalising', () => {
    it('drops accents, case and punctuation', () => {
        expect(normalise('Eichstätt, Ü.B. 84')).toBe('eichstatt u b 84');
    });
    it('ignores the words that are not part of a shelfmark', () => {
        expect(shelfTokens('Cod. 511')).toEqual(['511']);
        expect(shelfTokens('Cod. 084')).toEqual(['84']);
        expect(shelfTokens('VI G 5')).toEqual(['vi', 'g', '5']);
    });
    it('splits a library siglum from a shelfmark', () => {
        expect(parseSiglum('D-Eu 84')).toEqual({ rism: 'D-Eu', shelfmark: '84' });
        expect(parseSiglum('A-A : Cod. 511')).toEqual({ rism: 'A-A', shelfmark: 'Cod. 511' });
        expect(parseSiglum('Prague VI G 5')).toEqual({ rism: '', shelfmark: 'Prague VI G 5' });
    });
});

describe('reading dates', () => {
    it('reads how the CM and MMMO write them', () => {
        expect(dateRangeOf({ date: '15.' })).toEqual({ start: 1401, end: 1500 });
        expect(dateRangeOf({ date: '14.0' })).toEqual({ start: 1301, end: 1400 });
        expect(dateRangeOf({ date: '13 or 14' })).toEqual({ start: 1201, end: 1400 });
        expect(dateRangeOf({ centuries: ['XIII', 'XIV'] })).toEqual({ start: 1201, end: 1400 });
        expect(dateRangeOf({ years: '1070-1080', centuries: ['XI'] })).toEqual({ start: 1070, end: 1080 });
        expect(dateRangeOf({ date: 'unknown' })).toBeNull();
    });
});

describe('suggesting a manuscript', () => {
    it('finds the same library siglum and shelfmark with high confidence', () => {
        const [best] = suggest(index, { siglum: 'D-Eu 84', date: '15.' });
        expect(best.record.id).toBe(1);
        expect(best.confidence).toBe('high');
        expect(best.reasons).toContain('same library (D-Eu)');
        expect(best.reasons).toContain('dates overlap');
    });

    it('does not mistake the same shelfmark in another library', () => {
        const found = suggest(index, { siglum: 'D-Eu 84' });
        expect(ids(found)[0]).toBe(1);
        // "84" alone in other libraries is not enough to be offered
        expect(ids(found)).not.toContain(2);
        expect(ids(found)).not.toContain(6);
    });

    it('matches by city and shelfmark when there is no library siglum', () => {
        const found = suggest(index, { siglum: 'Prague VI G 5', city: 'Praha', shelfmark: 'VI G 5' });
        expect(found[0].record.id).toBe(3);
        expect(found[0].reasons).toContain('same city (Praha)');
    });

    it('knows a city by its other names', () => {
        expect(suggest(index, { city: 'Wien', shelfmark: 'Cod. 84' })[0].record.id).toBe(6);
        expect(suggest(index, { city: 'Vienna', shelfmark: '84' })[0].record.id).toBe(6);
    });

    it('works from a bare "City number" siglum', () => {
        const found = suggest(index, { siglum: 'Eichstätt 84' });
        expect(found[0].record.id).toBe(1);
    });

    it('prefers the better date and warns about one that does not fit', () => {
        const fits = suggest(index, { siglum: 'A-A Cod. 511', date: '11th c.' })[0];
        const clashes = suggest(index, { siglum: 'A-A Cod. 511', date: '15th c.' })[0];
        expect(fits.score).toBeGreaterThan(clashes.score);
        expect(clashes.reasons).toContain('dates differ');
    });

    it('finds nothing for an unknown manuscript', () => {
        expect(suggest(index, { siglum: 'X-Y 9999' })).toEqual([]);
        expect(suggest(index, {})).toEqual([]);
    });

    it('lets a manifest break a tie', () => {
        const twins = buildIndex([
            R({ id: 10, siglum: 'F-P : 5', rism: 'F-P', city: 'Paris', shelfmark: '5' }),
            R({ id: 11, siglum: 'F-P : 5', rism: 'F-P', city: 'Paris', shelfmark: '5', manifest: 'https://iiif.example.org/m' })
        ]);
        expect(ids(suggest(twins, { siglum: 'F-P 5' }))[0]).toBe(11);
    });
});

describe('searching in words', () => {
    it('needs every word, anywhere in the record', () => {
        expect(search(index, 'praha vi g').map(r => r.id).sort()).toEqual([3, 4]);
        expect(search(index, 'benediktiner admont').map(r => r.id)).toEqual([5]);
        expect(search(index, 'graduale eichstatt').map(r => r.id)).toEqual([1]);
        expect(search(index, 'nothing here')).toEqual([]);
    });
});

describe('what a record can tell the metadata table', () => {
    it('names the fields as the table does', () => {
        expect(metadataFrom(catalogue[4])).toEqual({
            bibliotheksort: 'Admont', bibliothek: 'Benediktinerstift', bibliothekssignatur: 'Cod. 511',
            datierung: '1070-1080', cantus_siglum: 'A-A Cod. 511'
        });
    });
});

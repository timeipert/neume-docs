import { describe, expect, it } from 'vitest';
import { cleanPublication, defaultPublication, parseAuthors, publicationGaps, publishedColumns } from './publication';

const COLUMNS = [
    { key: 'source', group: 'id' },
    { key: 'cat:herkunftsort', group: 'catalogue', field: 'herkunftsort' },
    { key: 'cat:kommentar', group: 'catalogue', field: 'kommentar' },
    { key: 'cat:datierung', group: 'catalogue', field: 'datierung' },
    { key: 'iiif:manifest', group: 'iiif' },
    { key: 'proj:ink', group: 'project', field: 'ink' },
    { key: 'stat:neumes', group: 'corpus' }
];
const keys = (list) => list.map(c => c.key);

describe('what is said about a publication', () => {
    it('cleans what is read back', () => {
        expect(cleanPublication(null)).toEqual(defaultPublication());
        const p = cleanPublication({ title: ' T ', authors: ['A', ' ', 7, 'B'], year: '20x6', columns: ['a', 'a', 5], license: 'CC BY', url: 'x' });
        expect(p).toMatchObject({ title: 'T', authors: ['A', 'B'], year: '', columns: ['a'], license: 'CC BY' });
        expect(cleanPublication({ year: 2026 }).year).toBe('2026');
    });

    it('takes authors one on each line', () => {
        expect(parseAuthors('Anna Author\n Ben Beispiel ;\n\n')).toEqual(['Anna Author', 'Ben Beispiel']);
    });
});

describe('which columns readers are shown', () => {
    it('is the safe ones unless the publisher chose: no comments, no images, no statistics', () => {
        expect(keys(publishedColumns(COLUMNS, defaultPublication()))).toEqual(['cat:herkunftsort', 'cat:datierung', 'proj:ink']);
    });

    it('is what the publisher ticked, among the columns that exist', () => {
        const p = { ...defaultPublication(), columns: ['cat:kommentar', 'gone', 'stat:neumes'] };
        expect(keys(publishedColumns(COLUMNS, p))).toEqual(['cat:kommentar']);
        expect(publishedColumns(COLUMNS, { ...defaultPublication(), columns: [] })).toEqual([]);
    });
});

describe('what is missing', () => {
    it('says so in a sentence each', () => {
        expect(publicationGaps(defaultPublication(), 0)).toHaveLength(4);
        expect(publicationGaps({ ...defaultPublication(), title: 'T', authors: ['A'], license: 'CC BY' }, 2)).toEqual([]);
    });
});

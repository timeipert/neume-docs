import { describe, it, expect } from 'vitest';
import { legacyDrafts, tableKey, collectionKey, freeCollectionFor } from './projectLegacy';

const table = (source, rows) => ({ id: 't', source, rows: rows.map(([pattern, tier]) => ({ pattern, ...(tier ? { tier } : {}) })) });

describe('old neume tables as projects', () => {
    it('makes a project of a table with rows, its standard rows as columns', () => {
        const [d] = legacyDrafts({
            tables: [table('Aa 13', [['*ud', 'standard'], ['*d'], ['*ddd', 'expanded'], ['*uuL', 'expanded']])],
            corpusSources: new Set(['Aa 13'])
        });
        expect(d).toMatchObject({
            name: 'Aa 13', source: 'Aa 13', focus: 'transcription', images: 'iiif', snippets: 'lines',
            columns: ['*ud', '*d'], extended: ['*ddd', '*uuL'], legacyKey: tableKey('Aa 13'), columnsChosen: true
        });
    });

    it('stays published when the table was', () => {
        const [d] = legacyDrafts({ tables: [{ ...table('Aa 13', [['*u']]), isPublished: true }] });
        expect(d.published).toBe(true);
    });

    it('is manuscript-centred when the manuscript is not in the corpus', () => {
        const [d] = legacyDrafts({ tables: [table('Mine', [['*u', 'standard']])], corpusSources: new Set() });
        expect(d.focus).toBe('manuscript');
    });

    it('moves a fourth constellation to the extended table instead of breaking the rule', () => {
        const [d] = legacyDrafts({
            tables: [table('Aa 13', [['*dL', 'standard'], ['*uL', 'standard'], ['*ddL', 'standard'], ['*uuL', 'standard']])]
        });
        expect(d.columns).toEqual(['*dL', '*uL', '*ddL']);
        expect(d.extended).toEqual(['*uuL']);
    });

    it('skips empty tables and tables without a manuscript', () => {
        expect(legacyDrafts({ tables: [table('Aa 13', []), table('', [['*u']])] })).toEqual([]);
    });

    it('does not give a manuscript a second project from its table', () => {
        expect(legacyDrafts({ tables: [table('Aa 13', [['*u']])], projects: [{ source: 'Aa 13', legacyKey: '' }] })).toEqual([]);
    });

    it('does not adopt the same table twice, nor one that was dismissed', () => {
        const tables = [table('Aa 13', [['*u']]), table('Bb 2', [['*u']])];
        expect(legacyDrafts({ tables, projects: [{ legacyKey: tableKey('Aa 13') }] }).map(d => d.source)).toEqual(['Bb 2']);
        expect(legacyDrafts({ tables, dismissed: [tableKey('Bb 2')] }).map(d => d.source)).toEqual(['Aa 13']);
    });
});

describe('old custom collections as projects', () => {
    const collection = { id: 'dc1', source: 'Mine', name: 'My hand', patterns: [{ code: '*ud' }], snippets: [{ pattern: '*ud' }, { pattern: '*uud' }] };

    it('links the collection and its patterns as columns', () => {
        const [d] = legacyDrafts({ collections: [collection] });
        expect(d).toMatchObject({
            name: 'My hand', source: 'Mine', focus: 'manuscript', images: 'screenshots', snippets: 'signs',
            collectionId: 'dc1', columns: ['*ud', '*uud'], legacyKey: collectionKey('dc1')
        });
    });

    it('is not adopted when a project already holds it', () => {
        expect(legacyDrafts({ collections: [collection], projects: [{ collectionId: 'dc1', legacyKey: '' }] })).toEqual([]);
    });

    it('is adopted once', () => {
        expect(legacyDrafts({ collections: [collection], projects: [{ legacyKey: collectionKey('dc1') }] })).toEqual([]);
    });
});

describe('screenshots left behind by a deleted project', () => {
    const collections = [{ id: 'a', source: 'Mine' }, { id: 'b', source: 'Mine' }, { id: 'c', source: 'Other' }];

    it('are taken up again by a new project for the same manuscript', () => {
        expect(freeCollectionFor('Mine', collections, [])).toEqual({ id: 'a', source: 'Mine' });
        expect(freeCollectionFor('Other', collections, [])).toEqual({ id: 'c', source: 'Other' });
    });

    it('are not taken from a project that holds them', () => {
        expect(freeCollectionFor('Mine', collections, [{ collectionId: 'a' }])).toEqual({ id: 'b', source: 'Mine' });
        expect(freeCollectionFor('Mine', collections, [{ collectionId: 'a' }, { collectionId: 'b' }])).toBeNull();
    });

    it('are not looked for without a manuscript', () => {
        expect(freeCollectionFor('', collections, [])).toBeNull();
        expect(freeCollectionFor('Unknown', collections, [])).toBeNull();
    });
});

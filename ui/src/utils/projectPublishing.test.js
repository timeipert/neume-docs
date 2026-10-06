import { describe, it, expect } from 'vitest';
import { publicationPlan } from './projectPublishing';

const project = (over = {}) => ({ id: 'p1', source: 'Aa 13', images: 'iiif', published: true, columns: ['*ud', '*d'], extended: ['*ddd'], ...over });

describe('publishing a project', () => {
    it('gives the manuscript a published table with the columns of the project', () => {
        const plan = publicationPlan({ projects: [project()], tables: [], collections: [] });
        expect(plan.tables).toEqual([{
            source: 'Aa 13', isPublished: true,
            rows: [
                { pattern: '*ud', customId: '', notes: '', tier: 'standard' },
                { pattern: '*d', customId: '', notes: '', tier: 'standard' },
                { pattern: '*ddd', customId: '', notes: '', tier: 'expanded' }
            ]
        }]);
    });

    it('takes the columns of every published project on the manuscript, once', () => {
        const plan = publicationPlan({
            projects: [project(), project({ id: 'p2', columns: ['*ud', '*u'], extended: [] }), project({ id: 'p3', published: false, columns: ['*uu'] })],
            tables: [], collections: []
        });
        expect(plan.tables[0].rows.map(r => r.pattern)).toEqual(['*ud', '*d', '*u', '*ddd']);
    });

    it('keeps the reference IDs and notes of rows that are already there, and fills the others from the library', () => {
        const plan = publicationPlan({
            projects: [project({ extended: [] })],
            tables: [{ source: 'Aa 13', rows: [{ pattern: '*ud', customId: 'A1', notes: 'n' }] }],
            collections: [],
            globalId: (c) => (c === '*d' ? 'B2' : '')
        });
        expect(plan.tables[0].rows).toEqual([
            { pattern: '*ud', customId: 'A1', notes: 'n', tier: 'standard' },
            { pattern: '*d', customId: 'B2', notes: '', tier: 'standard' }
        ]);
    });

    it('changes nothing when the table is already as it should be', () => {
        const first = publicationPlan({ projects: [project()], tables: [], collections: [] });
        const table = { source: 'Aa 13', ...first.tables[0], fromProjects: true };
        expect(publicationPlan({ projects: [project()], tables: [table], collections: [] }).tables).toEqual([]);
    });

    it('unpublishes a table that was published from a project, and only that', () => {
        const tables = [
            { source: 'Aa 13', rows: [], isPublished: true, fromProjects: true },
            { source: 'By hand', rows: [], isPublished: true }
        ];
        const plan = publicationPlan({ projects: [project({ published: false })], tables, collections: [] });
        expect(plan.tables).toEqual([{ source: 'Aa 13', isPublished: false }]);
    });

    it('publishes the collection of a screenshot project, and unpublishes it with the project', () => {
        const collections = [{ id: 'dc1', isPublished: false }];
        const shots = (published) => project({ images: 'screenshots', collectionId: 'dc1', published });
        expect(publicationPlan({ projects: [shots(true)], tables: [], collections }).collections).toEqual([{ id: 'dc1', isPublished: true }]);
        expect(publicationPlan({ projects: [shots(false)], tables: [], collections: [{ id: 'dc1', isPublished: true }] }).collections)
            .toEqual([{ id: 'dc1', isPublished: false }]);
        expect(publicationPlan({ projects: [shots(false)], tables: [], collections }).collections).toEqual([]);
    });

    it('leaves a screenshot project without a collection alone', () => {
        expect(publicationPlan({ projects: [project({ images: 'screenshots', collectionId: '' })], tables: [], collections: [] }))
            .toEqual({ tables: [], collections: [] });
    });
});

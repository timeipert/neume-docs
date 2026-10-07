import { describe, expect, it } from 'vitest';
import {
    addCategory, arrangeColumns, arrangeFields, checkProblem, cleanMetadataSchema, compileCheck, defaultMetadataSchema,
    describeCheck, forgetColumn, fromDraft, misfits, moveCategory, moveColumn, normaliseCheck, parseList,
    placeColumn, removeCategory, removeView, renameCategory, resolveCategories, saveView, schemaChanges, setCheck, setFilterConfig, toDraft
} from './metadataSchema';

const COLUMNS = [
    { key: 'source', group: 'id', frozen: true },
    { key: 'cat:herkunftsort', group: 'catalogue' },
    { key: 'cat:datierung', group: 'catalogue' },
    { key: 'iiif:manifest', group: 'iiif' },
    { key: 'proj:ink', group: 'project' },
    { key: 'proj:clef', group: 'project' },
    { key: 'stat:neumes', group: 'corpus' }
];
const keys = (list) => list.map(c => c.key);

describe('categories', () => {
    it('starts with the four the table always had', () => {
        expect(resolveCategories(defaultMetadataSchema()).map(c => c.key)).toEqual(['catalogue', 'iiif', 'project', 'corpus']);
    });

    it('adds a category of your own, with every other one written out so their order is kept', () => {
        const { schema, key } = addCategory(defaultMetadataSchema(), 'Notation');
        expect(key).toBe('notation');
        expect(resolveCategories(schema).map(c => c.label)).toEqual(['Corpus catalogue', 'IIIF', 'Your fields', 'Corpus', 'Notation']);
    });

    it('does not add an empty or a taken name', () => {
        expect(addCategory(defaultMetadataSchema(), '  ')).toBeNull();
        expect(addCategory(defaultMetadataSchema(), 'iiif')).toBeNull();
        const { schema } = addCategory(defaultMetadataSchema(), 'Notation');
        expect(addCategory(schema, 'notation')).toBeNull();
    });

    it('never gives a new category the key of a built-in one', () => {
        const { schema, key } = addCategory(defaultMetadataSchema(), 'Corpus!');
        expect(key).not.toBe('corpus');
        expect(resolveCategories(schema).filter(c => c.key === 'corpus')).toHaveLength(1);
    });

    it('renames a category, built-in ones too', () => {
        const next = renameCategory(defaultMetadataSchema(), 'project', 'Own');
        expect(resolveCategories(next).find(c => c.key === 'project').label).toBe('Own');
        expect(renameCategory(next, 'project', 'IIIF')).toBe(next);
    });

    it('moves a category up and down, and not past the ends', () => {
        const a = moveCategory(defaultMetadataSchema(), 'corpus', -1);
        expect(resolveCategories(a).map(c => c.key)).toEqual(['catalogue', 'iiif', 'corpus', 'project']);
        expect(moveCategory(a, 'catalogue', -1)).toBe(a);
        expect(moveCategory(a, 'project', 1)).toBe(a);
    });

    it('removes a category of your own and sends its columns back where they came from', () => {
        let { schema } = addCategory(defaultMetadataSchema(), 'Notation');
        schema = placeColumn(schema, 'proj:ink', 'notation', 'project');
        const next = removeCategory(schema, 'notation');
        expect(resolveCategories(next).map(c => c.key)).toEqual(['catalogue', 'iiif', 'project', 'corpus']);
        expect(next.placement).toEqual({});
        expect(keys(arrangeColumns(COLUMNS, next))).toEqual(keys(arrangeColumns(COLUMNS, defaultMetadataSchema())));
    });

    it('keeps the four built-in categories', () => {
        const schema = defaultMetadataSchema();
        expect(resolveCategories(removeCategory(schema, 'iiif')).map(c => c.key)).toContain('iiif');
    });
});

describe('arranging the columns', () => {
    it('keeps the order they come in, grouped by where they come from', () => {
        const out = arrangeColumns(COLUMNS, defaultMetadataSchema());
        expect(keys(out)).toEqual(['source', 'cat:herkunftsort', 'cat:datierung', 'iiif:manifest', 'proj:ink', 'proj:clef', 'stat:neumes']);
        expect(out.map(c => c.band)).toEqual(['id', 'catalogue', 'catalogue', 'iiif', 'project', 'project', 'corpus']);
    });

    it('puts a column under a category of your own, after the categories before it', () => {
        let { schema } = addCategory(defaultMetadataSchema(), 'Notation');
        schema = placeColumn(schema, 'proj:ink', 'notation', 'project');
        schema = placeColumn(schema, 'proj:clef', 'notation', 'project');
        schema = placeColumn(schema, 'cat:datierung', 'notation', 'catalogue');
        const out = arrangeColumns(COLUMNS, schema);
        expect(keys(out)).toEqual(['source', 'cat:herkunftsort', 'iiif:manifest', 'stat:neumes', 'cat:datierung', 'proj:ink', 'proj:clef']);
        expect(out.slice(-3).every(c => c.band === 'notation')).toBe(true);
    });

    it('moves a category, and its columns with it', () => {
        let { schema } = addCategory(defaultMetadataSchema(), 'Notation');
        schema = placeColumn(schema, 'proj:ink', 'notation', 'project');
        schema = moveCategory(moveCategory(moveCategory(moveCategory(schema, 'notation', -1), 'notation', -1), 'notation', -1), 'notation', -1);
        expect(keys(arrangeColumns(COLUMNS, schema)).slice(0, 3)).toEqual(['source', 'proj:ink', 'cat:herkunftsort']);
    });

    it('always keeps the identity column first and out of the categories', () => {
        const schema = moveCategory(defaultMetadataSchema(), 'corpus', -3);
        const out = arrangeColumns(COLUMNS, schema);
        expect(out[0].key).toBe('source');
        expect(out[0].band).toBe('id');
    });

    it('ignores a placement in a category that is gone', () => {
        const schema = { ...defaultMetadataSchema(), placement: { 'proj:ink': 'nowhere' } };
        expect(arrangeColumns(COLUMNS, schema).find(c => c.key === 'proj:ink').band).toBe('project');
    });

    it('moves a column up and down within its category', () => {
        const all = ['cat:herkunftsort', 'cat:datierung', 'iiif:manifest', 'proj:ink', 'proj:clef', 'stat:neumes'];
        const moved = moveColumn(defaultMetadataSchema(), 'proj:clef', -1, ['proj:ink', 'proj:clef'], all);
        expect(keys(arrangeColumns(COLUMNS, moved))).toEqual(['source', 'cat:herkunftsort', 'cat:datierung', 'iiif:manifest', 'proj:clef', 'proj:ink', 'stat:neumes']);
    });

    it('does not move a column past the end of its category', () => {
        const all = ['proj:ink', 'proj:clef'];
        const schema = defaultMetadataSchema();
        expect(moveColumn(schema, 'proj:ink', -1, all, all)).toBe(schema);
        expect(moveColumn(schema, 'proj:clef', 1, all, all)).toBe(schema);
    });

    it('lets a column added later come after those that were moved', () => {
        const all = ['proj:ink', 'proj:clef'];
        const moved = moveColumn(defaultMetadataSchema(), 'proj:clef', -1, all, all);
        const more = [...COLUMNS, { key: 'proj:new', group: 'project' }];
        expect(keys(arrangeColumns(more, moved)).filter(k => k.startsWith('proj:'))).toEqual(['proj:clef', 'proj:ink', 'proj:new']);
    });

    it('placing a column where it already is leaves no trace', () => {
        const next = placeColumn(defaultMetadataSchema(), 'proj:ink', 'project', 'project');
        expect(next.placement).toEqual({});
    });
});

describe('the fields of your own, listed elsewhere', () => {
    it('come in the order they were arranged in', () => {
        const fields = [{ key: 'ink' }, { key: 'clef' }, { key: 'region' }];
        let { schema } = addCategory(defaultMetadataSchema(), 'Notation');
        schema = placeColumn(schema, 'proj:clef', 'notation', 'project');
        schema = moveCategory(schema, 'notation', -4);
        expect(arrangeFields(fields, schema).map(f => f.key)).toEqual(['clef', 'ink', 'region']);
        expect(arrangeFields(fields, defaultMetadataSchema()).map(f => f.key)).toEqual(['ink', 'clef', 'region']);
    });
});

describe('checks', () => {
    it('reads a list from lines or semicolons, once each', () => {
        expect(parseList('Ink\n  Clef \n\nInk;Staff')).toEqual(['Ink', 'Clef', 'Staff']);
    });

    it('one of a list: what is in it fits, what is not is named', () => {
        const check = { kind: 'list', values: ['Ink', 'Clef'] };
        expect(checkProblem(check, 'Ink')).toBe('');
        expect(checkProblem(check, 'Pen')).toBe('Expected one of: Ink, Clef');
    });

    it('a list is case-sensitive unless it says otherwise', () => {
        expect(checkProblem({ kind: 'list', values: ['Ink'] }, 'ink')).not.toBe('');
        expect(checkProblem({ kind: 'list', values: ['Ink'], ignoreCase: true }, 'ink')).toBe('');
    });

    it('a pattern has to match the whole value', () => {
        const check = { kind: 'regex', pattern: 's\\. (X|XI|XII)' };
        expect(checkProblem(check, 's. XI')).toBe('');
        expect(checkProblem(check, 's. XIII')).not.toBe('');
        expect(checkProblem(check, 'about s. XI')).not.toBe('');
    });

    it('a pattern with alternatives is not cut in two by the anchors', () => {
        const check = { kind: 'regex', pattern: 'a|b' };
        expect(checkProblem(check, 'a')).toBe('');
        expect(checkProblem(check, 'ab')).not.toBe('');
    });

    it('an empty cell is never a problem', () => {
        expect(checkProblem({ kind: 'list', values: ['Ink'] }, '')).toBe('');
        expect(checkProblem({ kind: 'regex', pattern: '\\d+' }, '   ')).toBe('');
    });

    it('says what the check itself says, if it has a message', () => {
        expect(checkProblem({ kind: 'regex', pattern: '\\d+', message: 'A number, please' }, 'x')).toBe('A number, please');
    });

    it('a pattern that is not valid checks nothing and says why', () => {
        const check = { kind: 'regex', pattern: '(' };
        const c = compileCheck(check);
        expect(c.ok).toBe(false);
        expect(c.error).toMatch(/^Not a valid pattern: /);
        expect(c.error).not.toContain('^(?:');
        expect(checkProblem(check, 'anything')).toBe('');
    });

    it('names the distinct values that do not fit', () => {
        expect(misfits({ kind: 'list', values: ['a'] }, ['a', 'b', 'b', ' ', 'c'])).toEqual(['b', 'c']);
    });

    it('a check that says nothing is no check', () => {
        expect(normaliseCheck({ kind: 'list', values: [] })).toBeNull();
        expect(normaliseCheck({ kind: 'regex', pattern: '  ' })).toBeNull();
        expect(normaliseCheck({ kind: 'other' })).toBeNull();
        expect(normaliseCheck(null)).toBeNull();
        expect(compileCheck(null)).toBeNull();
    });

    it('describes a check in a few words', () => {
        expect(describeCheck({ kind: 'list', values: ['a', 'b'] })).toBe('one of 2');
        expect(describeCheck({ kind: 'regex', pattern: 'x' })).toBe('pattern');
        expect(describeCheck(null)).toBe('');
    });

    it('round-trips through what the dialog edits', () => {
        const check = { kind: 'list', values: ['Ink', 'Clef'], ignoreCase: true, message: 'Pick one' };
        expect(fromDraft(toDraft(check))).toEqual(check);
        const re = { kind: 'regex', pattern: '\\d+', ignoreCase: false, message: '' };
        expect(fromDraft(toDraft(re))).toEqual(re);
        expect(toDraft(null).kind).toBe('none');
        expect(fromDraft({ kind: 'none', listText: 'a', pattern: 'b' })).toBeNull();
    });

    it('sets and takes away the check of a column', () => {
        const set = setCheck(defaultMetadataSchema(), 'proj:ink', { kind: 'list', values: ['Ink'] });
        expect(set.checks['proj:ink'].values).toEqual(['Ink']);
        expect(setCheck(set, 'proj:ink', null).checks).toEqual({});
    });
});

describe('what is kept', () => {
    it('cleans what comes from a file, and keeps what is good', () => {
        const clean = cleanMetadataSchema({
            categories: [{ key: 'notation', label: ' Notation ' }, { key: 'notation', label: 'Again' }, { key: 'id', label: 'No' }, { key: '', label: 'x' }, { key: 'k' }],
            placement: { 'proj:ink': 'notation', 'proj:bad': 3 },
            order: ['a', 'a', 'b', 4],
            checks: { 'proj:ink': { kind: 'list', values: ['Ink', 'Ink'] }, 'proj:none': { kind: 'list', values: [] } }
        });
        expect(clean.categories).toEqual([{ key: 'notation', label: 'Notation' }]);
        expect(clean.placement).toEqual({ 'proj:ink': 'notation' });
        expect(clean.order).toEqual(['a', 'b']);
        expect(Object.keys(clean.checks)).toEqual(['proj:ink']);
        expect(clean.checks['proj:ink'].values).toEqual(['Ink']);
    });

    it('survives anything that is not a schema', () => {
        for (const bad of [null, undefined, 'x', 4, [], { categories: 'x', placement: [], order: {}, checks: 7 }]) {
            expect(cleanMetadataSchema(bad)).toEqual(defaultMetadataSchema());
        }
    });

    it('forgets a column that is gone', () => {
        let schema = setCheck(placeColumn(defaultMetadataSchema(), 'proj:ink', 'iiif', 'project'), 'proj:ink', { kind: 'list', values: ['x'] });
        schema = { ...schema, order: ['proj:ink', 'proj:clef'] };
        const next = forgetColumn(schema, 'proj:ink');
        expect(next.placement).toEqual({});
        expect(next.checks).toEqual({});
        expect(next.order).toEqual(['proj:clef']);
    });

    it('counts what differs from a table nobody has arranged', () => {
        expect(schemaChanges(defaultMetadataSchema())).toEqual({ categories: 0, renamed: 0, placed: 0, moved: 0, checks: 0, filters: 0, views: 0 });
        let { schema } = addCategory(defaultMetadataSchema(), 'Notation');
        schema = setCheck(placeColumn(schema, 'proj:ink', 'notation', 'project'), 'proj:ink', { kind: 'list', values: ['x'] });
        schema = renameCategory(schema, 'project', 'Own');
        expect(schemaChanges(schema)).toEqual({ categories: 1, renamed: 1, placed: 1, moved: 0, checks: 1, filters: 0, views: 0 });
    });
});

describe('which columns are offered as filters', () => {
    it('keeps what is said, and goes back to the default when it is taken away', () => {
        let s = setFilterConfig(defaultMetadataSchema(), 'cat:herkunftsort', { on: false });
        expect(s.filters).toEqual({ 'cat:herkunftsort': { on: false } });
        s = setFilterConfig(s, 'cat:herkunftsort', { kind: 'text' });
        expect(s.filters['cat:herkunftsort']).toEqual({ on: false, kind: 'text' });
        s = setFilterConfig(s, 'cat:herkunftsort', { on: null });
        expect(s.filters['cat:herkunftsort']).toEqual({ kind: 'text' });
        s = setFilterConfig(s, 'cat:herkunftsort', { kind: null });
        expect(s.filters).toEqual({});
    });

    it('cleans what is read back and ignores kinds that do not exist', () => {
        const s = cleanMetadataSchema({ filters: { a: { on: true, kind: 'years' }, b: { kind: 'nonsense' }, c: 5, d: { on: 'yes' } } });
        expect(s.filters).toEqual({ a: { on: true, kind: 'years' } });
    });

    it('is forgotten with the column', () => {
        const s = forgetColumn(setFilterConfig(defaultMetadataSchema(), 'proj:ink', { on: true }), 'proj:ink');
        expect(s.filters).toEqual({});
    });
});

describe('filters kept under a name', () => {
    const filter = { mode: 'any', rules: { 'cat:herkunftsort': { kind: 'values', values: ['Köln'] } } };

    it('saves, replaces by name (whatever the case) and removes', () => {
        let s = saveView(defaultMetadataSchema(), 'Rhineland', filter);
        expect(s.views.map(v => v.name)).toEqual(['Rhineland']);
        s = saveView(s, 'rhineland', { mode: 'all', rules: { x: { kind: 'text', op: 'filled' } } });
        expect(s.views).toHaveLength(1);
        expect(s.views[0].name).toBe('rhineland');
        expect(removeView(s, 'rhineland').views).toEqual([]);
    });

    it('does not keep a filter that filters nothing, or a name that is empty', () => {
        expect(saveView(defaultMetadataSchema(), 'Nothing', { mode: 'all', rules: {} }).views).toEqual([]);
        expect(saveView(defaultMetadataSchema(), '  ', filter).views).toEqual([]);
    });

    it('cleans the views it reads back', () => {
        const s = cleanMetadataSchema({ views: [{ name: 'A', filter }, { name: 'a', filter }, { name: '', filter }, { name: 'B', filter: { rules: { x: { kind: 'bogus' } } } }, 7] });
        expect(s.views.map(v => v.name)).toEqual(['A']);
        expect(s.views[0].filter.mode).toBe('any');
    });
});

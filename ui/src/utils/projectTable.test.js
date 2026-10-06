import { describe, it, expect } from 'vitest';
import { buildFrequency, STANDARD_DIRECTIONS } from './neumeTable';
import {
    categoryOf,
    buildLibrary,
    groupSelected,
    tableCodes,
    columnsToShow,
    selectColumn,
    deselectColumn,
    suggestColumns,
    filledCount,
    checkCode
} from './projectTable';

const CM = {
    '*': 689699,
    '*d': 488, '[*d]': 59000, '*dL': 12223,
    '*u': 58913, '[*u]': 5000, '[*uL]': 6465, '*uO': 340,
    '*e': 3794,
    '*dd': 17263, '*ud': 14809, '[*u]d': 1500, '[*ud]': 478, '*[ud]': 300,
    '*uu': 7814, '*uuQ': 2249, '*du': 6319,
    '*udd': 6226, '*ddd': 4400, '*uud': 2433, '*ddu': 2785
};
const freq = buildFrequency(CM);
const library = buildLibrary(Object.keys(CM), freq);
const cat = (key) => library.byKey.get(key);
const codes = (key) => cat(key).columns.map(c => c.code);

describe('the category of a code', () => {
    it('is its movement, whatever the brackets', () => {
        expect(categoryOf('[*u]d')).toMatchObject({ key: 'dir:*ud', label: '*ud', standard: true });
        expect(categoryOf('*[ud]').key).toBe('dir:*ud');
    });

    it('is its movement too when it carries signs', () => {
        expect(categoryOf('*dL')).toMatchObject({ key: 'dir:*d', label: '*d', standard: true });
        expect(categoryOf('*uOd').key).toBe('dir:*ud');
        expect(categoryOf('*uuS')).toMatchObject({ key: 'dir:*uu', standard: true });
    });

    it('is its movement for a sign of the project as well, but only an addition', () => {
        expect(categoryOf('*uVd')).toMatchObject({ key: 'dir:*ud', standard: false });
    });

    it('marks movements outside the brief as extended-only', () => {
        expect(categoryOf('*ddd').standard).toBe(false);
        expect(categoryOf('*uud').standard).toBe(true);
    });

    it('has clef and custos together, and nothing for what is not a shape', () => {
        expect(categoryOf('(Clef)')).toMatchObject({ key: 'other', label: 'Clef · Custos', standard: true });
        expect(categoryOf('(Custos)').key).toBe('other');
        expect(categoryOf('(Start)')).toBeNull();
    });
});

describe('the library as two levels', () => {
    it('orders the movements by tones, then by frequency', () => {
        const movements = library.categories.filter(c => c.group === 'direction').map(c => c.label);
        expect(movements.slice(0, 4)).toEqual(['*', '*d', '*u', '*e']);
        expect(movements.slice(4, 8)).toEqual(['*dd', '*ud', '*uu', '*du']);
    });

    it('puts clef and custos last, as one group', () => {
        const keys = library.categories.map(c => c.key);
        expect(keys[keys.length - 1]).toBe('other');
        expect(keys.filter(k => k === 'other')).toHaveLength(1);
        expect(codes('other')).toEqual(['(Clef)', '(Custos)']);
    });

    it('has one rule for the shapes and for the codes under them: fewer notes first, then the more frequent', () => {
        const tones = library.categories.filter(c => c.group === 'direction').map(c => c.columns[0].tones);
        expect(tones).toEqual([...tones].sort((a, b) => a - b));
        // under *u: the plain ways by how often the signature is written, then the signs by theirs
        expect(codes('dir:*u')).toEqual(['*u', '[*u]', '[*uL]', '*uO']);
        expect(codes('dir:*d')).toEqual(['[*d]', '*d', '*dL']);
    });

    it('lists every way of writing a movement, the most frequent first', () => {
        expect(codes('dir:*ud')).toEqual(['*ud', '[*u]d', '[*ud]', '*[ud]']);
        expect(codes('dir:*u').slice(0, 2)).toEqual(['*u', '[*u]']);
    });

    it('has the standard shapes even for an empty library', () => {
        const empty = buildLibrary([], freq);
        const labels = empty.categories.filter(c => c.group === 'direction').map(c => c.label);
        for (const d of STANDARD_DIRECTIONS) expect(labels).toContain(d);
        expect(empty.byKey.get('other').columns.map(c => c.code)).toEqual(['(Clef)', '(Custos)']);
    });

    it('says which columns can be in the standard table', () => {
        expect(library.byCode.get('*dL').standard).toBe(true);
        expect(library.byCode.get('*ddd').standard).toBe(false);
        expect(buildLibrary(['*uVd'], freq).byCode.get('*uVd').standard).toBe(false);
    });

    it('counts a code once, however often it is offered', () => {
        const twice = buildLibrary(['*ud', '*ud', '*ud b'], freq);
        expect(twice.byKey.get('dir:*ud').columns).toHaveLength(1);
    });

    it('finds a column by its code', () => {
        expect(library.byCode.get('[*u]d')).toMatchObject({ categoryKey: 'dir:*ud', tones: 3 });
    });
});

describe('code variants', () => {
    const variants = new Map([['*uVd', { base: '*ud', label: 'curved', id: 'cv1' }], ['*uVuVd', { base: '[*u]d', label: 'two', id: 'cv2' }]]);
    const withVariants = buildLibrary([...Object.keys(CM), '*uVd', '*uVuVd'], freq, { variants });

    it('are columns of the category of the code they come from', () => {
        expect(withVariants.byKey.get('dir:*ud').columns.map(c => c.code)).toContain('*uVd');
        expect(withVariants.byCode.get('*uVd').standard).toBe(true);
        expect(withVariants.byCode.get('*uVd')).toMatchObject({ categoryKey: 'dir:*ud', variantOf: '*ud', variantLabel: 'curved', variantId: 'cv1' });
    });

    it('follow the code they come from, not the end of the category', () => {
        const codes = withVariants.byKey.get('dir:*ud').columns.map(c => c.code);
        expect(codes.slice(0, 3)).toEqual(['*ud', '*uVd', '[*u]d']);
        expect(codes.indexOf('[*u]d') + 1).toBe(codes.indexOf('*uVuVd'));
    });

    it('are told apart from their code by variantOf', () => {
        expect(withVariants.variantOf('*uVd')).toBe('*ud');
        expect(withVariants.variantOf('*ud')).toBe('');
    });

    it('can be chosen for the standard table like their code', () => {
        const r = selectColumn([], '*uVd', 3, withVariants.variantOf);
        expect(r).toEqual({ ok: true, columns: ['*uVd'] });
    });

    it('count as the constellation of their code', () => {
        const v = new Map([['*dVL', { base: '*dL' }]]);
        const lib = buildLibrary(['*dL', '*dVL', '*uL', '*ddL', '*uuL'], freq, { variants: v });
        let columns = [];
        for (const c of ['*dL', '*dVL', '*uL', '*ddL']) columns = selectColumn(columns, c, 3, lib.variantOf).columns;
        expect(columns).toEqual(['*dL', '*dVL', '*uL', '*ddL']);
        expect(selectColumn(columns, '*uuL', 3, lib.variantOf).ok).toBe(false);
    });

    it('are refused for the standard table when their code is not a standard shape', () => {
        const v = new Map([['*dVdd', { base: '*ddd' }]]);
        const lib = buildLibrary(['*ddd', '*dVdd'], freq, { variants: v });
        expect(selectColumn([], '*dVdd', 3, lib.variantOf).ok).toBe(false);
    });

    it('without variants, a code with a sign of the project is under its shape, as an addition', () => {
        const lib = buildLibrary(['*uVd'], freq);
        expect(lib.byKey.get('dir:*ud').columns.find(c => c.code === '*uVd')).toMatchObject({ standard: false });
        expect(selectColumn([], '*uVd').ok).toBe(false);
    });
});

describe('what a project shows', () => {
    const project = { columns: ['*ud', '*dL'], extended: ['*ddd', '*ud'] };

    it('is the standard selection, or with the extended additions once each', () => {
        expect(tableCodes(project, 'standard')).toEqual(['*ud', '*dL']);
        expect(tableCodes(project, 'extended')).toEqual(['*ud', '*dL', '*ddd']);
    });

    it('groups the chosen columns under their categories, in library order', () => {
        const groups = groupSelected(library, tableCodes(project, 'extended'));
        expect(groups.map(g => g.key)).toEqual(['dir:*d', 'dir:*ud', 'dir:*ddd']);
        expect(groups[1].columns.map(c => c.code)).toEqual(['*ud']);
    });
});

describe('choosing which columns to draw', () => {
    it('draws the most frequent few, and whatever is kept', () => {
        const big = buildLibrary(['*ud', '[*u]d', '[*ud]', '*[ud]'], buildFrequency({ '*ud': 10, '[*u]d': 9, '[*ud]': 8, '*[ud]': 1 }));
        const c = big.byKey.get('dir:*ud');
        expect(columnsToShow(c, { top: 2 }).map(x => x.code)).toEqual(['*ud', '[*u]d']);
        expect(columnsToShow(c, { top: 2, keep: new Set(['*[ud]']) }).map(x => x.code)).toEqual(['*ud', '[*u]d', '*[ud]']);
        expect(columnsToShow(c, { top: 2, expanded: true })).toHaveLength(4);
    });

    it('draws all of a small category', () => {
        expect(columnsToShow(cat('dir:*ud'), { top: 4 })).toHaveLength(4);
    });
});

describe('selecting columns for the standard table', () => {
    it('adds a column, once', () => {
        const a = selectColumn([], '*ud');
        expect(a).toEqual({ ok: true, columns: ['*ud'] });
        expect(selectColumn(a.columns, '*ud').columns).toEqual(['*ud']);
    });

    it('refuses a movement the standard table does not have', () => {
        const r = selectColumn([], '*ddd');
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/extended/);
    });

    it('allows three constellations per special sign, not four', () => {
        let columns = [];
        for (const code of ['*dL', '*uL', '*ddL']) columns = selectColumn(columns, code).columns;
        const fourth = selectColumn(columns, '*uuL');
        expect(fourth.ok).toBe(false);
        expect(fourth.reason).toMatch(/At most 3/);
        // another way of writing a chosen constellation is fine
        expect(selectColumn(columns, '[*dL]').ok).toBe(true);
        // and another sign has its own three
        expect(selectColumn(columns, '*uQ').ok).toBe(true);
    });

    it('refuses what is not a neume shape', () => {
        expect(selectColumn([], '(Start)').ok).toBe(false);
    });

    it('takes a column out again', () => {
        expect(deselectColumn(['*ud', '*dL'], '*ud')).toEqual(['*dL']);
    });
});

describe('suggesting columns to start from', () => {
    it('takes what already has snippets', () => {
        const s = suggestColumns(library, { annotated: new Map([['[*u]d', 3], ['*dL', 1]]) });
        expect(s.fromAnnotations).toEqual(['[*u]d', '*dL']);
        expect(s.fromTranscription).toEqual([]);
    });

    it('takes the most frequent code of each category that has none, from the transcription', () => {
        const occurring = new Map([['*ud', 40], ['[*u]d', 90], ['*d', 5], ['*ddd', 70]]);
        const s = suggestColumns(library, { occurring });
        // *ddd is not a standard category; *ud has two ways, the more frequent wins
        expect(s.fromTranscription).toEqual(['*d', '[*u]d']);
    });

    it('does not suggest a category that is already covered', () => {
        const s = suggestColumns(library, {
            annotated: new Map([['*ud', 2]]),
            occurring: new Map([['[*u]d', 90], ['*d', 5]])
        });
        expect(s.fromAnnotations).toEqual(['*ud']);
        expect(s.fromTranscription).toEqual(['*d']);
    });

    it('leaves out what is already selected, and what the rules refuse', () => {
        const current = ['*dL', '*uL', '*ddL'];
        const s = suggestColumns(library, { annotated: new Map([['*dL', 9], ['*uuL', 4], ['*ddd', 4]]), current });
        expect(s.fromAnnotations).toEqual([]);
    });
});

describe('how much is filled', () => {
    it('counts the codes that have a snippet', () => {
        const snippets = new Map([['*ud', [{ id: 1 }]], ['*dL', []]]);
        expect(filledCount(['*ud', '*dL', '*d'], snippets)).toBe(1);
    });
});

describe('a code of one\'s own', () => {
    it.each(['*', '*u', '[*u]d', '*[ud]', '*udL', '*uOd', '*uVd', '{*u}d', '*uuQud'])('takes %s', (code) => {
        expect(checkCode(code).ok).toBe(true);
    });

    it('says which category it belongs to', () => {
        expect(checkCode(' *udL ').category.key).toBe('dir:*ud');
        expect(checkCode('[*u]d')).toMatchObject({ code: '[*u]d', category: { key: 'dir:*ud', standard: true } });
        expect(checkCode('*dddd').category.standard).toBe(false);
    });

    it.each([
        ['', ''],
        ['u*d', 'A code starts with * (the first note).'],
        ['*ux', 'A code is made of * u d e, upper-case signs, and [ ] for groups.'],
        ['*u d', 'A code has no spaces.'],
        ['[*ud', 'A bracket is not closed.'],
        ['*ud]', 'A bracket is closed that was not opened.'],
        ['**', 'After the first note come only u (up), d (down) and e (equal).'],
        ['L*u', 'A sign belongs after a note.']
    ])('refuses %j', (text, message) => {
        const r = checkCode(text);
        expect(r.ok).toBe(false);
        expect(r.message).toBe(message);
    });
});

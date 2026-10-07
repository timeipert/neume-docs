import { describe, expect, it } from 'vitest';
import {
    autoKind, centuryBuckets, cleanFilter, cleanRule, decodeFilter, describeColumnFilter, describeRule, encodeFilter, emptyFilter, filterRows, fold, matchRule,
    numberInfo, offeredByDefault, readYears, rowsForFacet, ruleProblem, valueCounts, withRule, yearInfo
} from './manuscriptFilter';

const TABLE = {
    A: { place: 'Köln', date: 's. XI', neumes: '120', order: 'OSB' },
    B: { place: 'koln', date: 's. XII in.', neumes: '30', order: 'OSB' },
    C: { place: 'Trier', date: '1050-1075', neumes: '', order: 'OCist' },
    D: { place: '', date: 'unleserlich', neumes: '5', order: '' },
    E: { place: 'Paris', date: 'before 1100', neumes: '80', order: 'OCist' }
};
const IDS = Object.keys(TABLE);
const textOf = (id, key) => TABLE[id][key] ?? '';

const values = (...v) => ({ kind: 'values', values: v });
const run = (filter) => filterRows(filter, IDS, textOf);

describe('what a rule is', () => {
    it('keeps a values rule once, whatever the spelling, and drops an empty one', () => {
        expect(cleanRule({ kind: 'values', values: ['Köln', 'koln', ' ', 'Trier'] }).values).toEqual(['Köln', 'Trier']);
        expect(cleanRule({ kind: 'values', values: [] })).toBeNull();
        expect(cleanRule({ kind: 'values', values: [], empty: true })).toMatchObject({ empty: true });
    });

    it('needs a text for the text operators that compare, none for empty / filled', () => {
        expect(cleanRule({ kind: 'text', op: 'contains', text: '  ' })).toBeNull();
        expect(cleanRule({ kind: 'text', op: 'empty' })).toMatchObject({ op: 'empty', text: '' });
        expect(cleanRule({ kind: 'text', op: 'nonsense', text: 'x' }).op).toBe('contains');
    });

    it('orders the ends of a range and needs at least one', () => {
        expect(cleanRule({ kind: 'years', from: 1200, to: 1100 })).toMatchObject({ from: 1100, to: 1200 });
        expect(cleanRule({ kind: 'years' })).toBeNull();
        expect(cleanRule({ kind: 'number', min: 'x', max: null })).toBeNull();
        expect(cleanRule({ kind: 'number', min: 5 })).toMatchObject({ min: 5, max: null });
    });

    it('cleans what comes from storage, rule by rule', () => {
        const f = cleanFilter({ mode: 'any', rules: { a: { kind: 'values', values: ['x'] }, b: { kind: 'bogus' }, c: 7 } });
        expect(f.mode).toBe('any');
        expect(Object.keys(f.rules)).toEqual(['a']);
        expect(cleanFilter(null)).toEqual(emptyFilter());
        expect(cleanFilter({ mode: 'whatever' }).mode).toBe('all');
    });

    it('sets and takes away a rule without touching the others', () => {
        let f = withRule(emptyFilter(), 'place', values('Köln'));
        f = withRule(f, 'order', values('OSB'));
        expect(Object.keys(f.rules)).toEqual(['place', 'order']);
        expect(Object.keys(withRule(f, 'place', null).rules)).toEqual(['order']);
        expect(Object.keys(withRule(f, 'place', { kind: 'values', values: [] }).rules)).toEqual(['order']);
    });
});

describe('matching', () => {
    it('compares values without case, accents or space', () => {
        expect(fold('  KÖLN ')).toBe('koln');
        expect(run(withRule(emptyFilter(), 'place', values('köln')))).toEqual(['A', 'B']);
    });

    it('can ask for the empty cells, alone or with values', () => {
        expect(run(withRule(emptyFilter(), 'place', { kind: 'values', values: [], empty: true }))).toEqual(['D']);
        expect(run(withRule(emptyFilter(), 'place', { kind: 'values', values: ['Paris'], empty: true }))).toEqual(['D', 'E']);
    });

    it('turns a rule round with not, empty cells included', () => {
        expect(run(withRule(emptyFilter(), 'place', { kind: 'values', values: ['Köln'], not: true }))).toEqual(['C', 'D', 'E']);
    });

    it('matches text four ways, and empty / filled', () => {
        const t = (op, text = '') => run(withRule(emptyFilter(), 'place', { kind: 'text', op, text }));
        expect(t('contains', 'ri')).toEqual(['C', 'E']);
        expect(t('equals', 'paris')).toEqual(['E']);
        expect(t('starts', 'k')).toEqual(['A', 'B']);
        expect(t('regex', '^(Trier|Paris)$')).toEqual(['C', 'E']);
        expect(t('empty')).toEqual(['D']);
        expect(t('filled')).toEqual(['A', 'B', 'C', 'E']);
    });

    it('lets everything through for a pattern that is not valid, and says so', () => {
        const rule = { kind: 'text', op: 'regex', text: '(' };
        expect(run(withRule(emptyFilter(), 'place', rule))).toEqual(IDS);
        expect(ruleProblem(rule)).toMatch(/not a valid/i);
        expect(ruleProblem({ kind: 'text', op: 'regex', text: '^a' })).toBe('');
    });

    it('keeps the datings that overlap a range, and the undated only if asked', () => {
        // A 1001–1100, B ≈1101–1133, C 1050–1075, D unreadable, E open start up to 1100
        const years = (extra) => run(withRule(emptyFilter(), 'date', { kind: 'years', from: 1050, to: 1100, ...extra }));
        expect(years({})).toEqual(['A', 'C', 'E']);
        expect(years({ undated: true })).toEqual(['A', 'C', 'D', 'E']);
        expect(years({ within: true })).toEqual(['C']);
        expect(run(withRule(emptyFilter(), 'date', { kind: 'years', from: 1101 }))).toEqual(['B']);
        expect(run(withRule(emptyFilter(), 'date', { kind: 'years', to: 1000 }))).toEqual(['E']);
    });

    it('reads a bare number in a column of datings as the century', () => {
        expect(readYears('11')).toEqual({ start: 1001, end: 1100 });
        expect(readYears('12.')).toEqual({ start: 1101, end: 1200 });
        expect(readYears('1100')).toEqual({ start: 1100, end: 1100 });
        expect(readYears('')).toBeNull();
    });

    it('reads numbers and leaves out cells that have none', () => {
        const n = (r) => run(withRule(emptyFilter(), 'neumes', { kind: 'number', ...r }));
        expect(n({ min: 30 })).toEqual(['A', 'B', 'E']);
        expect(n({ min: 10, max: 100 })).toEqual(['B', 'E']);
        expect(n({ max: 10, not: true })).toEqual(['A', 'B', 'C', 'E']);
    });
});

describe('combining columns', () => {
    const place = values('Köln', 'Trier');
    const order = values('OCist');

    it('and: each rule narrows', () => {
        let f = withRule(emptyFilter(), 'place', place);
        f = withRule(f, 'order', order);
        expect(run(f)).toEqual(['C']);
    });

    it('or: one rule is enough', () => {
        let f = withRule(emptyFilter(), 'place', place);
        f = withRule({ ...f, mode: 'any' }, 'order', order);
        expect(run(f)).toEqual(['A', 'B', 'C', 'E']);
    });

    it('shows everything when no rule is set', () => {
        expect(run(emptyFilter())).toEqual(IDS);
        expect(run({ mode: 'any', rules: {} })).toEqual(IDS);
    });

    it('counts a column over the rows the other rules leave, not its own', () => {
        let f = withRule(emptyFilter(), 'place', values('Köln'));
        f = withRule(f, 'order', values('OSB'));
        expect(rowsForFacet(f, IDS, textOf, 'place')).toEqual(['A', 'B']);
        expect(rowsForFacet(f, IDS, textOf, 'order')).toEqual(['A', 'B']);
        // with "any" the other rules do not narrow what is offered
        expect(rowsForFacet({ ...f, mode: 'any' }, IDS, textOf, 'order')).toEqual(IDS);
    });
});

describe('what a column offers', () => {
    it('counts values, merging spellings and naming the most common one', () => {
        const { items, empty } = valueCounts(IDS, (id) => textOf(id, 'place'));
        expect(empty).toBe(1);
        expect(items[0]).toMatchObject({ count: 2, label: 'Köln' });
        expect(items.map(i => i.label)).toEqual(['Köln', 'Paris', 'Trier']);
    });

    it('draws datings for the timeline, with the bounds of the data and what could not be read', () => {
        const info = yearInfo(IDS, (id) => textOf(id, 'date'));
        expect(info.points).toHaveLength(4);
        expect(info.unreadable).toEqual(['unleserlich']);
        expect(info.known).toBe(true);
        expect(info.min % 50).toBe(0);
        expect(info.min).toBeLessThanOrEqual(1001);
        expect(info.max).toBeGreaterThanOrEqual(1133);
        // "before 1100" is drawn from the start of the axis
        expect(info.points.find(p => p.id === 'E').start).toBe(info.min);
        expect(yearInfo(['D'], (id) => textOf(id, 'date')).known).toBe(false);
    });

    it('gives the centuries the datings touch', () => {
        const { points } = yearInfo(IDS, (id) => textOf(id, 'date'));
        const b = centuryBuckets(points);
        expect(b.find(x => x.century === 11)).toMatchObject({ from: 1001, to: 1100 });
        expect(b.map(x => x.century)).toEqual([...b.map(x => x.century)].sort((x, y) => x - y));
    });

    it('finds the range of a number column', () => {
        expect(numberInfo(IDS, (id) => textOf(id, 'neumes'))).toEqual({ count: 4, min: 5, max: 120 });
        expect(numberInfo(['C'], (id) => textOf(id, 'neumes'))).toEqual({ count: 0, min: null, max: null });
    });
});

describe('how a column is filtered when nobody said', () => {
    it('reads dates and numbers by what the column is', () => {
        expect(autoKind({ declared: 'century', distinct: 90, filled: 90 })).toBe('years');
        expect(autoKind({ numeric: true, distinct: 90, filled: 90 })).toBe('number');
    });

    it('ticks a column with few values and searches one with many', () => {
        expect(autoKind({ distinct: 12, filled: 100 })).toBe('values');
        expect(autoKind({ distinct: 200, filled: 200 })).toBe('text');
        expect(autoKind({ distinct: 0, filled: 0 })).toBe('values');
    });

    it('offers a column by itself only where it helps', () => {
        expect(offeredByDefault('values', { distinct: 8, filled: 100 })).toBe(true);
        expect(offeredByDefault('values', { distinct: 50, filled: 55 })).toBe(false); // nearly all different
        expect(offeredByDefault('values', { distinct: 0, filled: 0 })).toBe(false);
        expect(offeredByDefault('text', { distinct: 300, filled: 300 })).toBe(false);
        expect(offeredByDefault('years', { distinct: 40, filled: 40 })).toBe(true);
        expect(offeredByDefault('years', { distinct: 0, filled: 0 })).toBe(false);
    });
});

describe('saying what a rule does', () => {
    it('is short', () => {
        expect(describeRule(values('Köln', 'Trier', 'Paris', 'Bonn'))).toBe('Köln, Trier, Paris +1');
        expect(describeRule({ kind: 'values', values: ['x'], empty: true, not: true })).toBe('not x, empty');
        expect(describeRule({ kind: 'text', op: 'starts', text: 'k' })).toBe('starts with “k”');
        expect(describeRule({ kind: 'text', op: 'empty', not: true })).toBe('has a value');
        expect(describeRule({ kind: 'years', from: 1050, to: 1100, within: true, undated: true })).toBe('1050–1100 (fully within) + undated');
        expect(describeRule({ kind: 'years', from: null, to: 1100 })).toBe('until 1100');
        expect(describeRule({ kind: 'number', min: 5, max: null })).toBe('≥ 5');
    });
});

describe('a column, from its cells and what was said', () => {
    it('suggests from the cells', () => {
        const c = describeColumnFilter(['Köln', 'koln', 'Trier', '', 'Paris'], {});
        expect(c).toMatchObject({ kind: 'values', auto: 'values', distinct: 3, filled: 4, offered: true, saidKind: '' });
        expect(describeColumnFilter(['20', '37', '54'], {}).kind).toBe('number');
        expect(describeColumnFilter(['s. XI', 's. XII'], { declared: 'century' }).kind).toBe('years');
    });

    it('does what was said, and remembers what it would have done', () => {
        const c = describeColumnFilter(['a', 'b'], { said: { on: false, kind: 'text' } });
        expect(c).toMatchObject({ kind: 'text', auto: 'values', offered: false, saidKind: 'text' });
        expect(describeColumnFilter(Array.from({ length: 80 }, (_, i) => `v${i}`), {})).toMatchObject({ kind: 'text', offered: false });
        expect(describeColumnFilter(Array.from({ length: 80 }, (_, i) => `v${i}`), { said: { on: true } }).offered).toBe(true);
    });
});

describe('a filter in an address', () => {
    it('goes in and comes out the same, accents and all', () => {
        let f = withRule(emptyFilter(), 'place', values('Köln', 'Zürich'));
        f = withRule({ ...f, mode: 'any' }, 'date', { kind: 'years', from: 1050, to: 1100, undated: true });
        const text = encodeFilter(f);
        expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(decodeFilter(text)).toEqual(cleanFilter(f));
    });

    it('is nothing for no filter, and a filter that filters nothing for anything else', () => {
        expect(encodeFilter(emptyFilter())).toBe('');
        expect(decodeFilter('')).toEqual(emptyFilter());
        expect(decodeFilter('%%%')).toEqual(emptyFilter());
        expect(decodeFilter(btoa('not json'))).toEqual(emptyFilter());
        expect(decodeFilter('x'.repeat(9000))).toEqual(emptyFilter());
    });

    it('is cleaned on the way in, so a made-up address cannot smuggle in a rule that is not one', () => {
        const forged = btoa(JSON.stringify({ mode: 'any', rules: { a: { kind: 'bogus' }, b: { kind: 'values', values: ['x'] } } })).replace(/=+$/, '');
        expect(Object.keys(decodeFilter(forged).rules)).toEqual(['b']);
    });
});

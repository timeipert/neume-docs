import { describe, it, expect } from 'vitest';
import {
    detectDelimiter, parseDelimited, formatDelimited,
    normalizeRange, rangeSize, inRange, matrixOf,
    planPaste, planFill, planClear, planMap, planReplace, CLEAN_UP,
    matchesFilter, compareCells, planImport
} from './gridOps';

/** A grid of text with read-only columns, as the tests' stand-in for the real one. */
function grid(rows, readonlyCols = []) {
    const cells = rows.map(r => [...r]);
    return {
        cells,
        rowCount: cells.length,
        colCount: cells[0].length,
        get: (r, c) => cells[r][c],
        isReadonly: (r, c) => readonlyCols.includes(c)
    };
}
const apply = (g, plan) => { for (const ch of plan.changes) g.cells[ch.r][ch.c] = ch.value; return g.cells; };

describe('delimited text', () => {
    it('detects tabs, semicolons and commas', () => {
        expect(detectDelimiter('a\tb\tc')).toBe('\t');
        expect(detectDelimiter('a;b;c')).toBe(';');
        expect(detectDelimiter('a,b,c')).toBe(',');
        expect(detectDelimiter('"a;b",c')).toBe(',');
    });

    it('parses what Excel copies', () => {
        expect(parseDelimited('a\tb\nc\td\n')).toEqual([['a', 'b'], ['c', 'd']]);
        expect(parseDelimited('a\tb\r\nc\td')).toEqual([['a', 'b'], ['c', 'd']]);
    });

    it('keeps empty cells and a lone cell', () => {
        expect(parseDelimited('a\t\tc')).toEqual([['a', '', 'c']]);
        expect(parseDelimited('x')).toEqual([['x']]);
        expect(parseDelimited('')).toEqual([]);
    });

    it('reads quoted cells with delimiters, quotes and line breaks', () => {
        expect(parseDelimited('"a,b",c', ',')).toEqual([['a,b', 'c']]);
        expect(parseDelimited('"say ""hi""",x', ',')).toEqual([['say "hi"', 'x']]);
        expect(parseDelimited('"two\nlines"\tb')).toEqual([['two\nlines', 'b']]);
    });

    it('drops a byte order mark', () => {
        expect(parseDelimited('﻿a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
    });

    it('writes delimited text, quoting only where needed', () => {
        expect(formatDelimited([['a', 'b,c'], ['"q"', 'x\ny']], ',')).toBe('a,"b,c"\r\n"""q""","x\ny"');
        expect(formatDelimited([['a', 'b']])).toBe('a\tb');
    });

    it('reads back what it wrote', () => {
        const rows = [['Siglum', 'Place'], ['Aa 13', 'Aachen; Rhine'], ['X', 'say "hi"\nnow']];
        for (const d of ['\t', ',', ';']) expect(parseDelimited(formatDelimited(rows, d), d)).toEqual(rows);
    });
});

describe('ranges', () => {
    it('normalises corners given in any order', () => {
        expect(normalizeRange({ r: 3, c: 4 }, { r: 1, c: 2 })).toEqual({ r0: 1, c0: 2, r1: 3, c1: 4 });
    });
    it('measures and tests a range', () => {
        const range = { r0: 1, c0: 1, r1: 2, c1: 3 };
        expect(rangeSize(range)).toBe(6);
        expect(inRange(range, 2, 3)).toBe(true);
        expect(inRange(range, 0, 1)).toBe(false);
        expect(inRange(null, 0, 0)).toBe(false);
    });
    it('copies a range as a matrix', () => {
        const g = grid([['a', 'b', 'c'], ['d', 'e', 'f']]);
        expect(matrixOf({ r0: 0, c0: 1, r1: 1, c1: 2 }, g.get)).toEqual([['b', 'c'], ['e', 'f']]);
    });
});

describe('planPaste', () => {
    it('writes a block from the active cell', () => {
        const g = grid([['', '', ''], ['', '', ''], ['', '', '']]);
        const plan = planPaste({ matrix: [['1', '2'], ['3', '4']], anchor: { r: 1, c: 1 }, ...g });
        expect(apply(g, plan)).toEqual([['', '', ''], ['', '1', '2'], ['', '3', '4']]);
    });

    it('fills a whole selection with one pasted value', () => {
        const g = grid([['a', 'b'], ['c', 'd'], ['e', 'f']]);
        const plan = planPaste({ matrix: [['X']], anchor: { r: 0, c: 0 }, selection: { r0: 0, c0: 1, r1: 2, c1: 1 }, ...g });
        expect(apply(g, plan)).toEqual([['a', 'X'], ['c', 'X'], ['e', 'X']]);
    });

    it('starts at the selection\'s top-left corner', () => {
        const g = grid([['', '', ''], ['', '', '']]);
        const plan = planPaste({ matrix: [['1', '2']], anchor: { r: 1, c: 2 }, selection: { r0: 0, c0: 1, r1: 1, c1: 2 }, ...g });
        expect(apply(g, plan)).toEqual([['', '1', '2'], ['', '', '']]);
    });

    it('skips what falls outside and what is read-only, and says how much', () => {
        const g = grid([['a', 'b'], ['c', 'd']], [0]);
        const plan = planPaste({ matrix: [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']], anchor: { r: 0, c: 0 }, ...g });
        expect(apply(g, plan)).toEqual([['a', '2'], ['c', '5']]);
        expect(plan.skippedReadonly).toBe(2);
        expect(plan.skippedOutside).toBe(5);
    });

    it('leaves out cells that would not change', () => {
        const g = grid([['a', 'b']]);
        const plan = planPaste({ matrix: [['a', 'X']], anchor: { r: 0, c: 0 }, ...g });
        expect(plan.changes).toEqual([{ r: 0, c: 1, before: 'b', value: 'X' }]);
    });
});

describe('planFill', () => {
    it('fills down from the first row of the range', () => {
        const g = grid([['x', '1'], ['', ''], ['', '']]);
        apply(g, planFill({ range: { r0: 0, c0: 0, r1: 2, c1: 1 }, direction: 'down', ...g }));
        expect(g.cells).toEqual([['x', '1'], ['x', '1'], ['x', '1']]);
    });

    it('fills one row from the row above it', () => {
        const g = grid([['x'], ['']]);
        apply(g, planFill({ range: { r0: 1, c0: 0, r1: 1, c1: 0 }, direction: 'down', ...g }));
        expect(g.cells).toEqual([['x'], ['x']]);
    });

    it('fills right from the first column of the range', () => {
        const g = grid([['a', '', ''], ['b', '', '']]);
        apply(g, planFill({ range: { r0: 0, c0: 0, r1: 1, c1: 2 }, direction: 'right', ...g }));
        expect(g.cells).toEqual([['a', 'a', 'a'], ['b', 'b', 'b']]);
    });

    it('does nothing from the first row or column on its own', () => {
        const g = grid([['a', 'b']]);
        expect(planFill({ range: { r0: 0, c0: 0, r1: 0, c1: 1 }, direction: 'down', ...g }).changes).toEqual([]);
        expect(planFill({ range: { r0: 0, c0: 0, r1: 0, c1: 0 }, direction: 'right', ...g }).changes).toEqual([]);
    });

    it('does not touch read-only cells', () => {
        const g = grid([['a', 'b'], ['', '']], [1]);
        const plan = planFill({ range: { r0: 0, c0: 0, r1: 1, c1: 1 }, direction: 'down', ...g });
        expect(apply(g, plan)).toEqual([['a', 'b'], ['a', '']]);
        expect(plan.skippedReadonly).toBe(1);
    });
});

describe('clearing and cleaning up', () => {
    it('empties writable cells', () => {
        const g = grid([['a', 'b'], ['c', 'd']], [1]);
        expect(apply(g, planClear({ range: { r0: 0, c0: 0, r1: 1, c1: 1 }, ...g }))).toEqual([['', 'b'], ['', 'd']]);
    });

    it('cleans up text', () => {
        expect(CLEAN_UP.trim('  Aa   13 ')).toBe('Aa 13');
        expect(CLEAN_UP.upper('Köln')).toBe('KÖLN');
        expect(CLEAN_UP.lower('KÖLN')).toBe('köln');
        expect(CLEAN_UP.title('quellen deutscher herkunft')).toBe('Quellen Deutscher Herkunft');
        expect(CLEAN_UP.title('saint-gall (monastery)')).toBe('Saint-Gall (Monastery)');
    });

    it('applies a function over a range', () => {
        const g = grid([['  a ', 'b']]);
        apply(g, planMap({ range: { r0: 0, c0: 0, r1: 0, c1: 1 }, fn: CLEAN_UP.trim, ...g }));
        expect(g.cells).toEqual([['a', 'b']]);
    });
});

describe('planReplace', () => {
    const range = { r0: 0, c0: 0, r1: 2, c1: 0 };

    it('replaces text, ignoring case by default', () => {
        const g = grid([['Quellen deutscher Herkunft'], ['quellen deutscher herkunft'], ['other']]);
        const plan = planReplace({ range, find: 'quellen deutscher herkunft', replace: 'German origin', ...g });
        expect(apply(g, plan)).toEqual([['German origin'], ['German origin'], ['other']]);
    });

    it('can match case and whole cells', () => {
        const g = grid([['Aa'], ['aa'], ['Aa 13']]);
        const plan = planReplace({ range, find: 'Aa', replace: 'X', matchCase: true, wholeCell: true, ...g });
        expect(apply(g, plan)).toEqual([['X'], ['aa'], ['Aa 13']]);
    });

    it('treats the text literally unless asked for a pattern', () => {
        const g = grid([['a.b'], ['axb'], ['']]);
        expect(apply(g, planReplace({ range, find: 'a.b', replace: 'Z', ...g }))).toEqual([['Z'], ['axb'], ['']]);
        const h = grid([['a.b'], ['axb'], ['']]);
        expect(apply(h, planReplace({ range, find: 'a.b', replace: 'Z', regex: true, ...h }))).toEqual([['Z'], ['Z'], ['']]);
    });

    it('uses capture groups in a pattern replacement', () => {
        const g = grid([['12. Jh'], [''], ['']]);
        expect(apply(g, planReplace({ range, find: '(\\d+)\\. Jh', replace: '$1th c.', regex: true, ...g }))[0]).toEqual(['12th c.']);
    });

    it('keeps $ literal when not using a pattern', () => {
        const g = grid([['a'], [''], ['']]);
        expect(apply(g, planReplace({ range, find: 'a', replace: '$1', ...g }))[0]).toEqual(['$1']);
    });

    it('reports a bad pattern', () => {
        const g = grid([['a'], [''], ['']]);
        expect(planReplace({ range, find: '(', replace: 'x', regex: true, ...g }).error).toMatch(/Not a valid pattern/);
    });

    it('skips read-only cells and an empty search', () => {
        const g = grid([['a', 'a']], [1]);
        const plan = planReplace({ range: { r0: 0, c0: 0, r1: 0, c1: 1 }, find: 'a', replace: 'b', ...g });
        expect(apply(g, plan)).toEqual([['b', 'a']]);
        expect(planReplace({ range, find: '', replace: 'x', ...g }).changes).toEqual([]);
    });
});

describe('filters and order', () => {
    it('filters by contains, exact, empty and not', () => {
        expect(matchesFilter('Aachen', 'aach')).toBe(true);
        expect(matchesFilter('Aachen', 'köln')).toBe(false);
        expect(matchesFilter('Aachen', '=aachen')).toBe(true);
        expect(matchesFilter('Aachen', '=aach')).toBe(false);
        expect(matchesFilter('', '=')).toBe(true);
        expect(matchesFilter('x', '=')).toBe(false);
        expect(matchesFilter('x', '!')).toBe(true);
        expect(matchesFilter('', '!')).toBe(false);
        expect(matchesFilter('Aachen', '!köln')).toBe(true);
        expect(matchesFilter('Aachen', '!aach')).toBe(false);
        expect(matchesFilter('anything', '')).toBe(true);
    });

    it('sorts naturally with empty cells last', () => {
        const list = ['Aa 13', '', 'Aa 2', 'Aa 10'];
        expect([...list].sort((a, b) => compareCells(a, b))).toEqual(['Aa 2', 'Aa 10', 'Aa 13', '']);
        expect([...list].sort((a, b) => compareCells(a, b, true))).toEqual(['Aa 13', 'Aa 10', 'Aa 2', '']);
    });
});

describe('planImport', () => {
    const columns = [{ key: 'source', label: 'Siglum' }, { key: 'place', label: 'Place' }, { key: 'date', label: 'Date' }, { key: 'neumes', label: 'Neumes' }];
    const make = () => {
        const g = grid([['Aa 13', 'Aachen', '12. Jh', '100'], ['Bb 2', '', '', '5']], [0, 3]);
        return { g, rowIndexByKey: new Map([['aa 13', 0], ['bb 2', 1]]), keyColumn: 'source', columns, get: g.get, isReadonly: g.isReadonly };
    };

    it('matches rows by siglum and columns by label or key', () => {
        const ctx = make();
        const result = planImport([['siglum', 'PLACE', 'date'], ['Aa 13', 'Aachen', '13. Jh'], ['bb 2', 'Köln', '']], ctx);
        expect(result.matchedRows).toBe(2);
        expect(result.changes).toEqual([
            { r: 0, c: 2, before: '12. Jh', value: '13. Jh' },
            { r: 1, c: 1, before: '', value: 'Köln' }
        ]);
    });

    it('reports unknown rows, unknown columns and read-only columns', () => {
        const ctx = make();
        const result = planImport([['Siglum', 'Place', 'Extra', 'Neumes'], ['Aa 13', 'X', 'y', '999'], ['Zz 9', 'Q', '', '1']], ctx);
        expect(result.unmatchedRows).toEqual(['Zz 9']);
        expect(result.unknownColumns).toEqual(['Extra']);
        expect(result.readonlyColumns).toEqual(['Neumes']);
        expect(result.changes).toHaveLength(1);
    });

    it('needs a key column and some data', () => {
        const ctx = make();
        expect(planImport([['Place'], ['X']], ctx).error).toMatch(/Siglum/);
        expect(planImport([['Siglum']], ctx).error).toMatch(/header row/);
    });
});

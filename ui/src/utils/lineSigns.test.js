import { describe, it, expect } from 'vitest';
import {
    boxFromCorners, moveBox, resizeBox, signsOfLine, lineLabel, sortedLines, findLine,
    withLine, withLinePatched, withoutLine, withLineRestored, neumeForBox, syllableOf, placeOfSnippet
} from './lineSigns';

const sign = (id, x, over = {}) => ({ id, pattern: '*u', image: 'x', lineId: 'L1', box: { x, y: 10, w: 10, h: 50 }, ...over });
const collection = () => ({
    lines: [
        { id: 'L1', image: 'a', attrs: { folio: '12r', line: '3' } },
        { id: 'L2', image: 'b', attrs: { folio: '2v', line: '1' } },
        { id: 'L3', image: 'c', attrs: {} }
    ],
    snippets: [sign('s2', 50), sign('s1', 10), sign('s3', 80, { lineId: 'L2' }), { id: 'lone', pattern: '*d', image: 'z', attrs: { folio: '5r', line: '2' } }]
});

describe('a box', () => {
    it('is made from two corners in any order, inside the image', () => {
        expect(boxFromCorners({ x: 40, y: 60 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, w: 30, h: 40 });
        expect(boxFromCorners({ x: -5, y: 0 }, { x: 120, y: 50 })).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    });

    it('is nothing when it is only a click', () => {
        expect(boxFromCorners({ x: 10, y: 10 }, { x: 10.5, y: 40 })).toBeNull();
    });

    it('moves, but stays in the image', () => {
        expect(moveBox({ x: 10, y: 10, w: 20, h: 20 }, 5, -50)).toEqual({ x: 15, y: 0, w: 20, h: 20 });
        expect(moveBox({ x: 10, y: 10, w: 20, h: 20 }, 500, 0).x).toBe(80);
    });

    it('is resized by a corner, the opposite one stays', () => {
        expect(resizeBox({ x: 10, y: 10, w: 20, h: 20 }, 'se', { x: 50, y: 40 })).toEqual({ x: 10, y: 10, w: 40, h: 30 });
        expect(resizeBox({ x: 10, y: 10, w: 20, h: 20 }, 'nw', { x: 0, y: 5 })).toEqual({ x: 0, y: 5, w: 30, h: 25 });
    });

    it('keeps the old box when a resize would make it nothing', () => {
        const box = { x: 10, y: 10, w: 20, h: 20 };
        expect(resizeBox(box, 'se', { x: 10, y: 10 })).toBe(box);
    });
});

describe('the signs of a line', () => {
    it('are listed left to right', () => {
        expect(signsOfLine(collection(), 'L1').map(s => s.id)).toEqual(['s1', 's2']);
    });

    it('leave out other lines and signs without a place on the line', () => {
        const c = collection();
        c.snippets.push(sign('nobox', 0, { box: undefined }));
        expect(signsOfLine(c, 'L1').map(s => s.id)).toEqual(['s1', 's2']);
        expect(signsOfLine(c, 'L2').map(s => s.id)).toEqual(['s3']);
    });
});

describe('lines', () => {
    it('are labelled by their place', () => {
        expect(lineLabel({ attrs: { folio: '12r', line: '3' } })).toBe('f. 12r · l. 3');
        expect(lineLabel({ attrs: { folio: '12r' } })).toBe('f. 12r');
        expect(lineLabel({ attrs: {} })).toBe('Line without a place');
        expect(lineLabel(null)).toBe('Line without a place');
    });

    it('are sorted by folio, then line, those without a place last', () => {
        expect(sortedLines(collection()).map(l => l.id)).toEqual(['L2', 'L1', 'L3']);
        const c = { lines: [{ id: 'a', attrs: { folio: '3r', line: '10' } }, { id: 'b', attrs: { folio: '3r', line: '2' } }] };
        expect(sortedLines(c).map(l => l.id)).toEqual(['b', 'a']);
    });

    it('are found by their place', () => {
        expect(findLine(collection(), '12r', 3).id).toBe('L1');
        expect(findLine(collection(), '12r', 4)).toBeNull();
    });

    it('are added with an id, and the others stay', () => {
        const { lines, line } = withLine(collection(), { image: 'i', width: 10, height: 5, attrs: { folio: '1r', line: '1' } });
        expect(lines).toHaveLength(4);
        expect(line.id).toMatch(/^dl_/);
        expect(line.attrs).toEqual({ folio: '1r', line: '1' });
        expect(withLine({}, { image: 'i' }).lines).toHaveLength(1);
    });

    it('are changed without touching the others', () => {
        const lines = withLinePatched(collection(), 'L1', { attrs: { folio: '13r', line: '1' } });
        expect(lines.find(l => l.id === 'L1').attrs).toEqual({ folio: '13r', line: '1' });
        expect(lines.find(l => l.id === 'L2').attrs.folio).toBe('2v');
    });

    it('are taken out with their signs, and put back as they were', () => {
        const c = collection();
        const out = withoutLine(c, 'L1');
        expect(out.lines.map(l => l.id)).toEqual(['L2', 'L3']);
        expect(out.snippets.map(s => s.id)).toEqual(['s3', 'lone']);
        expect(out.removed.signs.map(s => s.id)).toEqual(['s2', 's1']);

        const back = withLineRestored({ lines: out.lines, snippets: out.snippets }, out.removed);
        expect(back.lines.map(l => l.id).sort()).toEqual(['L1', 'L2', 'L3']);
        expect(back.snippets.map(s => s.id).sort()).toEqual(['lone', 's1', 's2', 's3']);
        // putting it back twice does not double it
        expect(withLineRestored({ lines: back.lines, snippets: back.snippets }, out.removed).snippets).toHaveLength(4);
    });

    it('are left alone when taking out one that is not there', () => {
        const out = withoutLine(collection(), 'nope');
        expect(out.removed).toBeNull();
        expect(out.lines).toHaveLength(3);
    });
});

describe('the transcription of a line, for the next sign', () => {
    const neumes = [
        { pattern: '*', sysId: 'd|12r|3|Glo-|x' },
        { pattern: '*u', sysId: 'd|12r|3|ri-|y' },
        { pattern: '*d', sysId: 'd|12r|3|a|z' }
    ];

    it('gives the neume that stands at the place of the new box', () => {
        const signs = [{ box: { x: 10, w: 10 } }, { box: { x: 60, w: 10 } }];
        expect(neumeForBox(neumes, [], { x: 5, w: 10 })).toMatchObject({ pattern: '*', syllable: 'Glo-' });
        // between the two signs that are there: the second neume
        expect(neumeForBox(neumes, signs, { x: 30, w: 10 })).toMatchObject({ pattern: '*u', syllable: 'ri-' });
        // after both: the third
        expect(neumeForBox(neumes, signs, { x: 70, w: 10 })).toMatchObject({ pattern: '*d', syllable: 'a' });
        expect(neumeForBox(neumes, signs.slice(0, 1), { x: 40, w: 10 })).toMatchObject({ pattern: '*u', sysId: 'd|12r|3|ri-|y' });
    });

    it('gives nothing when the line has no more neumes, or none is known', () => {
        const three = [{ box: { x: 0, w: 5 } }, { box: { x: 10, w: 5 } }, { box: { x: 20, w: 5 } }];
        expect(neumeForBox(neumes, three, { x: 90, w: 5 })).toBeNull();
        expect(neumeForBox([], [], { x: 0, w: 5 })).toBeNull();
        expect(neumeForBox(null, [], { x: 0, w: 5 })).toBeNull();
    });

    it('reads the syllable out of the occurrence', () => {
        expect(syllableOf('d|12r|3|Glo-|x')).toBe('Glo-');
        expect(syllableOf('d|12r')).toBe('');
        expect(syllableOf('')).toBe('');
    });
});

describe('where a snippet comes from', () => {
    it('is its line and its place on it', () => {
        const c = collection();
        expect(placeOfSnippet(c, c.snippets.find(s => s.id === 's2'))).toEqual({ folio: '12r', line: '3', position: 2, label: 'f. 12r · l. 3 · sign 2' });
    });

    it('is what a lone sign says itself, else its caption', () => {
        const c = collection();
        expect(placeOfSnippet(c, c.snippets.find(s => s.id === 'lone')).label).toBe('f. 5r · l. 2');
        expect(placeOfSnippet(c, { id: 'old', caption: '118r, line 2' }).label).toBe('118r, line 2');
    });
});

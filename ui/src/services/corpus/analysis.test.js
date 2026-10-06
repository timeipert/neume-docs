import { describe, it, expect } from 'vitest';
import { extractPattern, analyzeDocument, noteSuffix, pitchToMidi, firstNoteUuid } from './analysis';
import { normalizeFolio, applyFolioQuirk } from './folio';

const note = (base, octave, extra = {}) => ({
    uuid: `${base}${octave}`, base, octave, noteType: 'Normal', liquescent: false, focus: false, ...extra
});
const group = (...notes) => ({ grouped: notes });
const syllable = (text, ...nonSpaced) => ({
    kind: 'Syllable', uuid: text, text, syllableType: 'Normal',
    notes: { spaced: nonSpaced.map(ns => ({ nonSpaced: ns })) }
});
const line = () => ({ kind: 'LineChange', uuid: 'l', focus: false });
const folio = (text) => ({ kind: 'FolioChange', uuid: 'f', text, focus: false });
const root = (...children) => ({ kind: 'RootContainer', uuid: 'r', children });

describe('normalizeFolio', () => {
    it.each([
        ['113', '113r'],
        ['113 r', '113r'],
        ['113v', '113v'],
        ['(113v)', '113v'],
        ['p. 12', '12r'],
        ['0007v', '7v'],
        ['113ra', '113r'],
        ['113r-b', '113r'],
        ['12 recto', '12r'],
        ['12 verso', '12v'],
        ['Guard', 'guard'],
        ['', ''],
        [null, ''],
        [undefined, '']
    ])('%j -> %j', (input, expected) => {
        expect(normalizeFolio(input)).toBe(expected);
    });
});

describe('folio quirks', () => {
    it('shifts Tri 2254 from f. 334 on', () => {
        expect(applyFolioQuirk('Tri 2254', '334r')).toBe('332r');
        expect(applyFolioQuirk('Tri 2254', '333v')).toBe('333v');
    });
    it('leaves every other source alone', () => {
        expect(applyFolioQuirk('Aa 13', '400r')).toBe('400r');
    });
});

describe('note shapes', () => {
    it('maps shapes to suffixes', () => {
        expect(noteSuffix('Normal', false)).toBe('');
        expect(noteSuffix('Oriscus', false)).toBe('O');
        expect(noteSuffix('Quilisma', false)).toBe('Q');
        expect(noteSuffix('Strophicus', false)).toBe('S');
        expect(noteSuffix('Ascending', false)).toBe('LA');
        expect(noteSuffix('Descending', false)).toBe('LD');
        expect(noteSuffix('Liquescent', false)).toBe('L');
        expect(noteSuffix('Normal', true)).toBe('L');
        expect(noteSuffix('Liquescent', true)).toBe('L');
    });

    it('compares pitches across octaves', () => {
        expect(pitchToMidi('C', 5)).toBeGreaterThan(pitchToMidi('B', 4));
        expect(pitchToMidi('G', 4)).toBeLessThan(pitchToMidi('A', 4));
    });
});

describe('extractPattern', () => {
    it('reads a single note as *', () => {
        expect(extractPattern([group(note('G', 4))])).toEqual({ pattern: '*', notes: 'G4' });
    });

    it('reads separate notes by direction', () => {
        const up = extractPattern([group(note('G', 4)), group(note('A', 4))]);
        expect(up.pattern).toBe('*u');
        const down = extractPattern([group(note('A', 4)), group(note('G', 4)), group(note('G', 4))]);
        expect(down.pattern).toBe('*de');
    });

    it('brackets a connected group', () => {
        expect(extractPattern([group(note('G', 4), note('A', 4))]).pattern).toBe('[*u]');
    });

    it('combines groups: a connected pair followed by two single notes', () => {
        const found = extractPattern([
            group(note('G', 4), note('A', 4)),
            group(note('G', 4)),
            group(note('F', 4))
        ]);
        expect(found).toEqual({ pattern: '[*u]dd', notes: 'G4-A4-G4-F4' });
    });

    it('marks special shapes with their sign', () => {
        expect(extractPattern([group(note('G', 4), note('F', 4, { liquescent: true }))]).pattern).toBe('[*dL]');
        expect(extractPattern([group(note('G', 4, { noteType: 'Oriscus' }))]).pattern).toBe('*O');
        expect(extractPattern([group(note('G', 4)), group(note('A', 4, { noteType: 'Quilisma' }))]).pattern).toBe('*uQ');
        expect(extractPattern([group(note('G', 4, { noteType: 'Descending' }))]).pattern).toBe('*LD');
    });

    it('measures direction across octaves', () => {
        expect(extractPattern([group(note('B', 4)), group(note('C', 5))]).pattern).toBe('*u');
    });

    it('treats a flat as an ordinary pitched note', () => {
        expect(extractPattern([group(note('B', 4, { noteType: 'Flat' })), group(note('A', 4))]).pattern).toBe('*d');
    });

    it('gives nothing for empty or unpitched input', () => {
        expect(extractPattern([])).toBeNull();
        expect(extractPattern(null)).toBeNull();
        expect(extractPattern([{ grouped: [] }])).toBeNull();
        expect(extractPattern([group({ uuid: 'x' })])).toBeNull();
    });
});

describe('analyzeDocument', () => {
    const run = (tree, ctx = {}) => {
        const out = [];
        const stats = analyzeDocument(tree, { source: 'Aa 13', documentId: 'D1', foliostart: '10v', zeilenstart: '3', ...ctx },
            (pattern, info) => out.push({ pattern, info }));
        return { out, stats };
    };

    it('starts at the document\'s folio and line', () => {
        const { out } = run(root(syllable('Pa-', [group(note('G', 4))])));
        expect(out).toEqual([{ pattern: '*', info: ['D1', '10v', '3', 'Pa-', 'G4'] }]);
    });

    it('counts a line change', () => {
        const { out } = run(root(
            syllable('a', [group(note('G', 4))]),
            line(),
            syllable('b', [group(note('A', 4))])
        ));
        expect(out.map(o => o.info[2])).toEqual(['3', '4']);
    });

    it('restarts the line count on a new folio', () => {
        const { out, stats } = run(root(
            syllable('a', [group(note('G', 4))]),
            folio('11r'),
            syllable('b', [group(note('A', 4))]),
            line(),
            syllable('c', [group(note('A', 4))])
        ));
        expect(out.map(o => [o.info[1], o.info[2]])).toEqual([['10v', '3'], ['11r', '1'], ['11r', '2']]);
        expect([...stats.folios].sort()).toEqual(['10v', '11r']);
    });

    it('returns to the start line when the start folio comes round again', () => {
        const { out } = run(root(
            folio('11r'),
            line(),
            folio('10v'),
            syllable('x', [group(note('G', 4))])
        ));
        expect(out[0].info.slice(1, 3)).toEqual(['10v', '3']);
    });

    it('counts | marks in paratext as line breaks', () => {
        const { out } = run(root(
            { kind: 'ParatextContainer', text: 'rubric | more |', uuid: 'p' },
            syllable('a', [group(note('G', 4))])
        ));
        expect(out[0].info[2]).toBe('5');
    });

    it('descends through containers', () => {
        const { out } = run(root({
            kind: 'FormteilContainer', uuid: 'f',
            children: [{ kind: 'ZeileContainer', uuid: 'z', children: [syllable('a', [group(note('G', 4))])] }]
        }));
        expect(out).toHaveLength(1);
    });

    it('reports one pattern per spaced item', () => {
        const { out, stats } = run(root(syllable('a', [group(note('G', 4))], [group(note('A', 4)), group(note('G', 4))])));
        expect(out.map(o => o.pattern)).toEqual(['*', '*d']);
        expect(stats.patterns).toBe(2);
    });

    it('skips syllables that are not Normal', () => {
        const s = syllable('a', [group(note('G', 4))]);
        s.syllableType = 'Other';
        expect(run(root(s)).out).toHaveLength(0);
    });

    it('counts clefs', () => {
        const { stats } = run(root({ kind: 'Clef', uuid: 'c', base: 'C', octave: 5, shape: 'C' }, { kind: 'Clef', uuid: 'c2' }));
        expect(stats.clefs).toBe(2);
    });

    it('applies the folio correction of Tri 2254', () => {
        const { out } = run(root(syllable('a', [group(note('G', 4))])), { source: 'Tri 2254', foliostart: '335' });
        expect(out[0].info[1]).toBe('333r');
    });

    it('falls back to line 1 when the start line is missing or not a number', () => {
        expect(run(root(syllable('a', [group(note('G', 4))])), { zeilenstart: '' }).out[0].info[2]).toBe('1');
        expect(run(root(syllable('a', [group(note('G', 4))])), { zeilenstart: '3a' }).out[0].info[2]).toBe('1');
    });
});

describe('uuids for Monodi-Zero', () => {
    const run = (tree, ctx = {}) => {
        const out = [];
        const stats = analyzeDocument(tree, { source: 'Aa 13', documentId: 'D1', foliostart: '10v', zeilenstart: '1', ...ctx },
            (pattern, info, noteUuid) => out.push({ pattern, info, noteUuid }));
        return { out, stats };
    };
    const lc = (uuid) => ({ kind: 'LineChange', uuid, focus: false });

    it('points at a neume by its first note', () => {
        expect(firstNoteUuid([group(note('G', 4), note('A', 4)), group(note('F', 4))])).toBe('G4');
        expect(firstNoteUuid([])).toBe('');
        expect(firstNoteUuid([group({ base: 'G', octave: 4 })])).toBe('');
    });

    it('reports the first note\'s uuid beside each occurrence, leaving the occurrence itself alone', () => {
        const { out } = run(root(syllable('a', [group(note('G', 4), note('A', 4)), group(note('F', 4))])));
        expect(out[0].pattern).toBe('[*u]d');
        expect(out[0].noteUuid).toBe('G4');
        expect(out[0].info).toHaveLength(5); // its join('|') is the sysId of snippet links
    });

    it('records the LineChange that ends each line, per folio', () => {
        const { stats } = run(root(
            syllable('a', [group(note('G', 4))]), lc('end-1'),
            syllable('b', [group(note('A', 4))]), lc('end-2'),
            folio('11r'),
            syllable('c', [group(note('B', 4))]), lc('end-of-11r-1'),
            syllable('d', [group(note('C', 5))])
        ));
        expect(stats.lineUuids).toEqual({
            '10v': { '1': 'end-1', '2': 'end-2' },
            '11r': { '1': 'end-of-11r-1' }
        });
    });
});

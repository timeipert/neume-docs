import { describe, it, expect } from 'vitest';
import {
    folioInRange,
    foliosInRange,
    describeRange,
    collectSnippets,
    collectOccurrences,
    collectionSnippets
} from './projectData';

describe('a folio range', () => {
    it('includes both ends, and what lies between', () => {
        expect(folioInRange('12r', '12r', '20v')).toBe(true);
        expect(folioInRange('20v', '12r', '20v')).toBe(true);
        expect(folioInRange('15v', '12r', '20v')).toBe(true);
        expect(folioInRange('11v', '12r', '20v')).toBe(false);
        expect(folioInRange('21r', '12r', '20v')).toBe(false);
    });

    it('compares leaves as numbers, not text', () => {
        expect(folioInRange('9r', '2r', '10v')).toBe(true);
        expect(folioInRange('100r', '2r', '10v')).toBe(false);
    });

    it('is open at an empty end', () => {
        expect(folioInRange('1r', '', '20v')).toBe(true);
        expect(folioInRange('300r', '12r', '')).toBe(true);
        expect(folioInRange('300r', '', '')).toBe(true);
        expect(folioInRange('', '', '')).toBe(false);
    });

    it('picks the folios of a list, in reading order', () => {
        expect(foliosInRange(['20v', '3r', '12r', '12v', '2v'], '3r', '12r')).toEqual(['3r', '12r']);
    });

    it('is described in words', () => {
        expect(describeRange('12r', '20v')).toBe('f. 12r–20v');
        expect(describeRange('12r', '12r')).toBe('f. 12r');
        expect(describeRange('12r', '')).toBe('from f. 12r');
        expect(describeRange('', '20v')).toBe('up to f. 20v');
        expect(describeRange('', '')).toBe('all folios');
    });
});

describe('the snippets of a range', () => {
    const annotations = {
        'Aa 13_2r_*ud': [{ id: 'a1', points: '1,1 2,2' }],
        'Aa 13_30r_*ud': [{ id: 'a2', points: '1,1 2,2' }],
        'Aa 13_3v_*d b': [{ id: 'a3', points: '1,1 2,2' }],
        'Aa 130_2r_*ud': [{ id: 'other', points: '1,1 2,2' }],
        'Aa 13_2v_*ud': [{ id: 'no-shape' }]
    };
    const regions = {
        'Aa 13_2r': [{ id: 'r1', name: 'Line 1', points: '0,0' }],
        'Aa 13_40r': [{ id: 'r2', name: 'Line 1', points: '0,0' }]
    };
    const regionItems = {
        r1: [{ id: 'i1', pattern: '*ud', points: '3,3 4,4' }, { id: 'a1', pattern: '*ud', points: '1,1 2,2' }],
        r2: [{ id: 'i2', pattern: '*ud', points: '3,3 4,4' }]
    };

    const run = (extra = {}) => collectSnippets({ source: 'Aa 13', from: '2r', to: '10v', annotations, regions, regionItems, ...extra });

    it('collects those of the folios in range, by code', () => {
        const s = run();
        expect([...s.keys()].sort()).toEqual(['*d', '*ud']);
        expect(s.get('*ud').map(x => x.folio)).toEqual(['2r', '2r']);
    });

    it('counts a code variant for its code', () => {
        expect(run().get('*d')[0]).toMatchObject({ folio: '3v', pattern: '*d b', kind: 'sign' });
    });

    it('counts a snippet that is in both places once', () => {
        const ids = run().get('*ud').map(x => x.id);
        expect(ids.sort()).toEqual(['a1', 'i1']);
    });

    it('says whether it was drawn on a line', () => {
        const kinds = Object.fromEntries(run().get('*ud').map(x => [x.id, x.kind]));
        expect(kinds).toEqual({ i1: 'line', a1: 'line' });
    });

    it('does not mix up a manuscript whose name starts the same', () => {
        expect(run().get('*ud').some(x => x.id === 'other')).toBe(false);
    });

    it('with no range, takes all folios', () => {
        const s = run({ from: '', to: '' });
        expect(s.get('*ud').map(x => x.id).sort()).toEqual(['a1', 'a2', 'i1', 'i2']);
    });

    it('is empty without a manuscript', () => {
        expect(collectSnippets({ source: '', annotations }).size).toBe(0);
    });
});

describe('the transcription of a range', () => {
    const occurrences = {
        '*ud': [['d1', '2r', 1, 1, []], ['d1', '2r', 3, 2, []], ['d2', '30r', 1, 1, []]],
        '[*u]d': [['d1', '3v', 2, 1, []]],
        '*d b': [['d1', '3r', 1, 1, []]]
    };

    it('counts where each code stands, in reading order', () => {
        const o = collectOccurrences(occurrences, '2r', '10v');
        expect(o.get('*ud').count).toBe(2);
        expect(o.get('*ud').places).toEqual([
            { document: 'd1', folio: '2r', line: 1 },
            { document: 'd1', folio: '2r', line: 3 }
        ]);
        expect(o.get('[*u]d').places[0].folio).toBe('3v');
        expect(o.get('*d').count).toBe(1);
    });

    it('leaves out what is outside', () => {
        expect(collectOccurrences(occurrences, '31r', '40v').size).toBe(0);
    });

    it('takes everything without a range', () => {
        expect(collectOccurrences(occurrences).get('*ud').count).toBe(3);
    });

    it('copes with no data', () => {
        expect(collectOccurrences(null).size).toBe(0);
    });
});

describe('the snippets of a collection', () => {
    it('groups images by code', () => {
        const s = collectionSnippets({ snippets: [{ id: 's1', pattern: '*ud' }, { id: 's2', pattern: '*ud b' }, { id: 's3', pattern: '' }] });
        expect(s.get('*ud').map(x => x.id)).toEqual(['s1', 's2']);
        expect(s.size).toBe(1);
    });

    it('says which line a sign was cut from, and where on it', () => {
        const s = collectionSnippets({
            lines: [{ id: 'L', attrs: { folio: '12r', line: '3' } }],
            snippets: [
                { id: 'a', pattern: '*u', lineId: 'L', box: { x: 50, y: 0, w: 10, h: 10 } },
                { id: 'b', pattern: '*u', lineId: 'L', box: { x: 10, y: 0, w: 10, h: 10 } },
                { id: 'c', pattern: '*u', caption: 'old note' }
            ]
        });
        expect(s.get('*u').map(x => [x.id, x.place.label])).toEqual([
            ['a', 'f. 12r · l. 3 · sign 2'], ['b', 'f. 12r · l. 3 · sign 1'], ['c', 'old note']
        ]);
    });

    it('copes with none', () => {
        expect(collectionSnippets(null).size).toBe(0);
    });
});

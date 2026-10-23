import { describe, it, expect } from 'vitest';
import {
    cleanPaleoAttributes, codeNotes, exportPaleo, filterByPaleo, normalizePaleo, paleoOf, paleoSlots, slotKey, splitPaleo, validatePaleoKey, withPaleo
} from './paleo';

describe('a key', () => {
    it('is lower-case letters and digits, and can be longer than one letter', () => {
        expect(validatePaleoKey('r')).toBe('');
        expect(validatePaleoKey('rl')).toBe('');
        expect(validatePaleoKey('t2')).toBe('');
        expect(validatePaleoKey('')).not.toBe('');
        expect(validatePaleoKey('R')).not.toBe('');
        expect(validatePaleoKey('r,l')).not.toBe('');
        expect(validatePaleoKey('averylongkeyindeed')).not.toBe('');
    });

    it('is never two or more letters of a movement, which braces use for a group of notes', () => {
        for (const k of ['ud', 'dde', 'ee']) expect(validatePaleoKey(k)).toMatch(/group of notes/);
        expect(validatePaleoKey('ue1')).toBe('');
    });

    it('can be a single letter, even one of a movement: e for an episem', () => {
        for (const k of ['e', 'u', 'd']) expect(validatePaleoKey(k)).toBe('');
    });

    it('is not defined twice', () => {
        expect(validatePaleoKey('r', ['r'])).toMatch(/already/);
    });
});

describe('the vocabulary', () => {
    it('keeps what is usable, once, in order', () => {
        expect(cleanPaleoAttributes([{ key: 'r', label: 'Right' }, { key: 'r' }, { key: 'X' }, null, { key: 'rl' }]))
            .toEqual([{ key: 'r', label: 'Right', description: '' }, { key: 'rl', label: 'rl', description: '' }]);
        expect(cleanPaleoAttributes('nope')).toEqual([]);
    });
});

describe('the attributes in a code', () => {
    const at = (key, note) => ({ key, note });

    it('are on the note they stand after, in braces', () => {
        expect(withPaleo('*Vdu', [at('r', 0)])).toBe('*V{r}du');
        expect(withPaleo('*Vdu', [at('r', 2)])).toBe('*Vdu{r}');
        expect(withPaleo('*Vdu', [at('r', 0), at('l', 0), at('t2', 2)])).toBe('*V{r,l}du{t2}');
        expect(withPaleo('*Vdu', [])).toBe('*Vdu');
        expect(withPaleo('*', [at('r', 0)])).toBe('*{r}');
    });

    it('stand inside brackets, after the note and its signs', () => {
        expect(withPaleo('[*Vd]', [at('r', 0)])).toBe('[*V{r}d]');
        expect(withPaleo('[*Vd]', [at('r', 1)])).toBe('[*Vd{r}]');
        expect(withPaleo('*u[uVd]', [at('l', 2)])).toBe('*u[uV{l}d]');
        expect(withPaleo('[*VdL]', [at('r', 1)])).toBe('[*VdL{r}]');
    });

    it('replace the ones a code already has', () => {
        expect(withPaleo('*Vdu{l}', [at('r', 1)])).toBe('*Vd{r}u');
    });

    it('are told from the code they stand in', () => {
        expect(splitPaleo('*Vdu{r}')).toEqual({ base: '*Vdu', keys: ['r'], entries: [at('r', 2)] });
        expect(splitPaleo('*V{r}d{rl,t2}u')).toEqual({ base: '*Vdu', keys: ['r', 'rl', 't2'], entries: [at('r', 0), at('rl', 1), at('t2', 1)] });
        expect(splitPaleo('[*V{r}d]').base).toBe('[*Vd]');
        expect(splitPaleo('*Vdu')).toEqual({ base: '*Vdu', keys: [], entries: [] });
    });

    it('can be an episem: [*Vd] with an e on the virga is [*V{e}d]', () => {
        expect(withPaleo('[*Vd]', [at('e', 0)])).toBe('[*V{e}d]');
        expect(splitPaleo('[*V{e}d]')).toEqual({ base: '[*Vd]', keys: ['e'], entries: [at('e', 0)] });
    });

    it('are not mistaken for braces that write a group of notes', () => {
        expect(splitPaleo('*u{ud}')).toEqual({ base: '*u{ud}', keys: [], entries: [] });
        expect(splitPaleo('{*ud}').entries).toEqual([]);
        expect(splitPaleo('*u{ud}d{r}').entries).toEqual([at('r', 4)]);
    });

    it('go both ways', () => {
        for (const code of ['*V{r}du', '[*V{r}d{l}]', '*u[uV{rl}d]d']) {
            const { base, entries } = splitPaleo(code);
            expect(withPaleo(base, entries)).toBe(code);
        }
    });
});

describe('the notes of a code', () => {
    it('are the movements with the signs on them', () => {
        expect(codeNotes('*Vdu').map(n => n.text)).toEqual(['*V', 'd', 'u']);
        expect(codeNotes('[*uVdL]').map(n => n.text)).toEqual(['*', 'uV', 'dL']);
        expect(codeNotes('(Clef-C)')).toEqual([]);
    });
});

describe('the attributes of a snippet', () => {
    it('are one to a note and key, by note, then in the order of the vocabulary', () => {
        const got = normalizePaleo([{ key: 'l', note: 2 }, { key: 'r', note: 0 }, { key: 'l', note: 0 }, { key: 'r', note: 0 }], ['r', 'l'], '*Vdu');
        expect(got).toEqual([{ key: 'r', note: 0 }, { key: 'l', note: 0 }, { key: 'l', note: 2 }]);
        expect(normalizePaleo(undefined)).toEqual([]);
    });

    it('that are plain keys, from before they had a note, are on the last note', () => {
        expect(normalizePaleo(['r', 'l'], ['r', 'l'], '*Vdu')).toEqual([{ key: 'r', note: 2 }, { key: 'l', note: 2 }]);
        expect(paleoOf({ pattern: '*Vd', paleo: ['r'] })).toEqual([{ key: 'r', note: 1 }]);
    });

    it('cannot be on a note the code has not', () => {
        expect(normalizePaleo([{ key: 'r', note: 9 }], [], '*Vd')).toEqual([{ key: 'r', note: 1 }]);
    });

    it('are exported with their note', () => {
        expect(exportPaleo([{ key: 'r', note: 1 }, 'l', { key: '' }])).toEqual([{ key: 'r', note: 1 }, 'l']);
    });
});

describe('the places under a code', () => {
    const order = ['r', 'l', 'rl'];
    const code = '*Vdu';
    const s = (...paleo) => ({ pattern: code, paleo });
    const at = (key, note) => ({ key, note });

    it('are the sets of attributes the snippets have, those without first, then by note and vocabulary, named by the whole pattern', () => {
        const slots = paleoSlots([s(at('l', 2)), s(), s(at('r', 0), at('l', 2)), s(at('r', 2)), s(at('l', 2)), s(at('r', 0))], order, code);
        expect(slots.map(x => x.label)).toEqual(['', '*V{r}du', '*V{r}du{l}', '*Vdu{r}', '*Vdu{l}']);
    });

    it('tell the same attribute on another note apart', () => {
        const slots = paleoSlots([s(at('r', 0)), s(at('r', 1)), s(at('r', 2))], order, code);
        expect(slots.map(x => x.label)).toEqual(['*V{r}du', '*Vd{r}u', '*Vdu{r}']);
    });

    it('are the same wherever the snippets come from, so two manuscripts line up', () => {
        const one = paleoSlots([s(at('r', 0)), s(at('l', 2))], order, code).map(x => x.key);
        const other = paleoSlots([s(at('l', 2)), s(at('r', 0))], order, code).map(x => x.key);
        expect(one).toEqual(other);
    });

    it('are only those somebody has', () => {
        expect(paleoSlots([s(at('rl', 1))], order, code).map(x => x.key)).toEqual(['1:rl']);
        expect(paleoSlots([], order, code)).toEqual([]);
        expect(slotKey([at('r', 0), at('l', 2)])).toBe('0:r,2:l');
    });
});

describe('asking for an attribute', () => {
    const list = [
        { id: 1, pattern: '*Vdu', paleo: [{ key: 'r', note: 0 }] },
        { id: 2, pattern: '*Vdu', paleo: [{ key: 'r', note: 1 }, { key: 'l', note: 2 }] },
        { id: 3, pattern: '*Vdu' }
    ];

    it('keeps the snippets that have it, on whichever note, and drops all the others', () => {
        expect(filterByPaleo(list, ['r']).map(x => x.id)).toEqual([1, 2]);
        expect(filterByPaleo(list, ['r', 'l']).map(x => x.id)).toEqual([2]);
        expect(filterByPaleo(list, ['l']).map(x => x.id)).toEqual([2]);
    });

    it('can ask for those without any', () => {
        expect(filterByPaleo(list, ['-']).map(x => x.id)).toEqual([3]);
    });

    it('keeps all when nothing is asked', () => {
        expect(filterByPaleo(list, []).length).toBe(3);
    });
});

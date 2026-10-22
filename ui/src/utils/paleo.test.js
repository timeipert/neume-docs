import { describe, it, expect } from 'vitest';
import {
    cleanPaleoAttributes, filterByPaleo, normalizePaleo, paleoSlots, paleoSuffix, slotKey, splitPaleo, validatePaleoKey, withPaleo
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

    it('is never only the letters of a movement, which braces use for a group', () => {
        for (const k of ['u', 'd', 'e', 'ud', 'dde']) expect(validatePaleoKey(k)).toMatch(/group of notes/);
        expect(validatePaleoKey('ue1')).toBe('');
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

describe('the attributes after a code', () => {
    it('are written in braces, with a comma between several', () => {
        expect(paleoSuffix(['r'])).toBe('{r}');
        expect(paleoSuffix(['r', 'l'])).toBe('{r,l}');
        expect(paleoSuffix([])).toBe('');
        expect(withPaleo('*Vdu', ['r'])).toBe('*Vdu{r}');
        expect(withPaleo('*Vdu{l}', ['r'])).toBe('*Vdu{r}');
    });

    it('are told from the code they stand after', () => {
        expect(splitPaleo('*Vdu{r}')).toEqual({ base: '*Vdu', keys: ['r'] });
        expect(splitPaleo('[*Vd]{rl,t2}')).toEqual({ base: '[*Vd]', keys: ['rl', 't2'] });
        expect(splitPaleo('*Vdu')).toEqual({ base: '*Vdu', keys: [] });
    });

    it('are not mistaken for braces that write a group of notes', () => {
        expect(splitPaleo('*u{ud}').keys).toEqual([]);
        expect(splitPaleo('*u{ud}').base).toBe('*u{ud}');
        expect(splitPaleo('{*ud}').keys).toEqual([]);
    });

    it('are kept in the order of the vocabulary, once each', () => {
        expect(normalizePaleo(['l', 'r', 'l'], ['r', 'l'])).toEqual(['r', 'l']);
        expect(normalizePaleo(['zz', 'l', 'r'], ['r', 'l'])).toEqual(['r', 'l', 'zz']);
        expect(normalizePaleo(undefined)).toEqual([]);
    });
});

describe('the places under a code', () => {
    const order = ['r', 'l', 'rl'];
    const s = (...paleo) => ({ paleo });

    it('are the sets of attributes the snippets have, those without first, then in the order of the vocabulary', () => {
        const slots = paleoSlots([s('l'), s(), s('r', 'l'), s('r'), s('l')], order);
        expect(slots.map(x => x.key)).toEqual(['', 'r', 'r,l', 'l']);
        expect(slots.map(x => x.label)).toEqual(['', '{r}', '{r,l}', '{l}']);
    });

    it('are the same wherever the snippets come from, so two manuscripts line up', () => {
        const one = paleoSlots([s('r'), s('l')], order).map(x => x.key);
        const other = paleoSlots([s('l'), s('r')], order).map(x => x.key);
        expect(one).toEqual(other);
    });

    it('are only those somebody has', () => {
        expect(paleoSlots([s('rl')], order).map(x => x.key)).toEqual(['rl']);
        expect(paleoSlots([], order)).toEqual([]);
        expect(slotKey(['r', 'l'])).toBe('r,l');
    });
});

describe('asking for an attribute', () => {
    const list = [{ id: 1, paleo: ['r'] }, { id: 2, paleo: ['r', 'l'] }, { id: 3 }];

    it('keeps the snippets that have it, and drops all the others', () => {
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

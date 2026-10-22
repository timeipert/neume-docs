import { describe, it, expect } from 'vitest';
import { isFavorite, notShown, representative, shownOf } from './favorites';

const s = (id, favorite) => ({ id, ...(favorite ? { favorite: true } : {}) });

describe('favourite snippets', () => {
    it('are the ones that are shown, in order, however many there are', () => {
        expect(shownOf([s(1), s(2, true), s(3), s(4, true)]).map(x => x.id)).toEqual([2, 4]);
    });

    it('leave the first snippet shown when none is a favourite', () => {
        expect(shownOf([s(1), s(2)]).map(x => x.id)).toEqual([1]);
        expect(shownOf([])).toEqual([]);
        expect(shownOf(undefined)).toEqual([]);
    });

    it('count what is not shown', () => {
        expect(notShown([s(1), s(2, true), s(3)])).toBe(2);
        expect(notShown([s(1), s(2)])).toBe(1);
        expect(notShown([s(1, true)])).toBe(0);
        expect(notShown(undefined)).toBe(0);
    });

    it('have one that stands for the place', () => {
        expect(representative([s(1), s(2, true)]).id).toBe(2);
        expect(representative([s(1), s(2)]).id).toBe(1);
        expect(representative([])).toBeNull();
        expect(isFavorite(s(1, true))).toBe(true);
        expect(isFavorite(null)).toBe(false);
    });
});

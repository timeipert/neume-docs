import { describe, it, expect } from 'vitest';
import {
    checkCode, virgaNotes, toggleVirga, withoutVirga, quickChoices, stateOf, filterSnippets, summarize,
    summarizeByColumn, combinationCodes, decisionFor, oddReason, isStale, countStale
} from './neumaReview';
import { buildFrequency } from './neumeTable';

const snip = (id, column, code, confidence = 'high', alternatives = []) => ({
    id, source: id.slice(0, 3), column, suggestion: { code, alternatives, confidence }
});

describe('checkCode', () => {
    it('takes codes the library can hold', () => {
        for (const c of ['*', '[*u]', '*uVd', '*[ud]L', '*SeS', '(Clef)', '(Custos)']) expect(checkCode(c).ok, c).toBe(true);
    });
    it('says what is wrong with the others', () => {
        expect(checkCode('').ok).toBe(false);
        expect(checkCode('ud').error).toMatch(/starts with/);
        expect(checkCode('[*u').error).toMatch(/not closed/);
        expect(checkCode('*u]').error).toMatch(/no opening/);
        expect(checkCode('*u d').error).toMatch(/notes/);
        expect(checkCode('[]*').ok).toBe(true); // brackets around nothing are harmless: the note is there
    });
});

describe('the virga letter', () => {
    it('finds the notes that carry it', () => {
        expect(virgaNotes('*uVd')).toEqual([1]);
        expect(virgaNotes('[*Vd]')).toEqual([0]);
        expect(virgaNotes('*V')).toEqual([0]);
        expect(virgaNotes('*ud')).toEqual([]);
    });
    it('puts it on a note and takes it off again', () => {
        expect(toggleVirga('*ud', 0)).toBe('*Vud');
        expect(toggleVirga('*ud', 1)).toBe('*uVd');
        expect(toggleVirga('*uVd', 1)).toBe('*ud');
        expect(toggleVirga('[*du]', 2)).toBe('[*duV]');
        expect(toggleVirga('*Vud', 0)).toBe('*ud');
        expect(toggleVirga(toggleVirga('*dd', 2), 2)).toBe('*dd');
    });
    it('leaves a sign that is not a virga where it is', () => {
        expect(toggleVirga('[*dL]', 0)).toBe('[*VdL]');
        expect(withoutVirga('*uVdL')).toBe('*udL');
    });
});

describe('quickChoices', () => {
    it('starts with the proposal, then the alternatives, then the virga on its notes', () => {
        const s = snip('007b-1', 'b', '[*u]', 'high', ['*u']);
        expect(quickChoices(s)).toEqual(['[*u]', '*u', '[*Vu]', '[*uV]']);
    });
    it('has nothing to offer for a combination, which has no proposal', () => {
        expect(quickChoices(snip('007k-1', 'k', '', 'none'))).toEqual([]);
    });
    it('offers a punctum as a virga', () => {
        expect(quickChoices(snip('007a-1', 'a', '*', 'medium', ['*V']))).toEqual(['*', '*V']);
    });
});

describe('the state of a snippet', () => {
    const s = snip('007b-1', 'b', '[*u]');
    it('is undecided with the proposal until somebody decides', () => {
        expect(stateOf(s, undefined)).toEqual({ state: 'undecided', code: '[*u]', decided: false });
    });
    it('is what was decided', () => {
        expect(stateOf(s, { status: 'corrected', code: '*u' })).toEqual({ state: 'corrected', code: '*u', decided: true });
        expect(stateOf(s, { status: 'discarded' })).toEqual({ state: 'discarded', code: '', decided: true });
    });
    it('is still taken to be the proposal when it was set aside', () => {
        expect(stateOf(s, { status: 'later' })).toEqual({ state: 'later', code: '[*u]', decided: true });
    });
    it('ignores a decision it does not know', () => {
        expect(stateOf(s, { status: 'maybe', code: 'x' }).state).toBe('undecided');
    });
    it('is accepted when the code is the proposal, corrected when it is not', () => {
        expect(decisionFor(s, '[*u]')).toEqual({ code: '[*u]', status: 'accepted' });
        expect(decisionFor(s, '*u')).toEqual({ code: '*u', status: 'corrected' });
        expect(decisionFor(snip('007k-1', 'k', '', 'none'), '*udd').status).toBe('corrected');
    });
});

describe('filtering and counting', () => {
    const list = [snip('007b-1', 'b', '[*u]'), snip('007b-2', 'b', '[*u]', 'medium'), snip('008c-1', 'c', '[*d]'), snip('008k-1', 'k', '', 'none')];
    const decisions = { '007b-1': { status: 'accepted', code: '[*u]' }, '008c-1': { status: 'later' }, '008k-1': { status: 'discarded' } };

    it('filters by column, source, state, confidence and what a snippet is taken to be', () => {
        expect(filterSnippets(list, decisions, { column: 'b' }).map(s => s.id)).toEqual(['007b-1', '007b-2']);
        expect(filterSnippets(list, decisions, { source: '008' }).map(s => s.id)).toEqual(['008c-1', '008k-1']);
        expect(filterSnippets(list, decisions, { state: 'undecided' }).map(s => s.id)).toEqual(['007b-2']);
        expect(filterSnippets(list, decisions, { state: 'open' }).map(s => s.id)).toEqual(['007b-2', '008c-1']);
        expect(filterSnippets(list, decisions, { confidence: 'none' }).map(s => s.id)).toEqual(['008k-1']);
        expect(filterSnippets(list, decisions, { code: '[*d]' }).map(s => s.id)).toEqual(['008c-1']);
    });
    it('finds the cuts that look odd', () => {
        const odd = [{ ...snip('009b-1', 'b', '[*u]'), flags: ['parts'] }, { ...snip('009b-2', 'b', '[*u]'), flags: [] }, snip('009b-3', 'b', '[*u]')];
        expect(filterSnippets(odd, {}, { odd: true }).map(s => s.id)).toEqual(['009b-1']);
        expect(oddReason(odd[0])).toMatch(/white band/);
        expect(oddReason(odd[1])).toBe('');
    });
    it('counts by state, and what is done', () => {
        expect(summarize(list, decisions)).toEqual({ total: 4, undecided: 1, accepted: 1, corrected: 0, later: 1, discarded: 1, done: 2 });
    });
    it('counts by column', () => {
        expect(summarizeByColumn(list, decisions)).toEqual({ b: { total: 2, done: 1 }, c: { total: 1, done: 0 }, k: { total: 1, done: 1 } });
    });
});

describe('combinationCodes', () => {
    it('gives the most common of the longer patterns', () => {
        const freq = buildFrequency({ '*': 100, '[*u]': 80, '*udd': 30, '*uud': 50, '[*ud]': 40, '*ddd': 70, '(Clef)': 9 });
        expect(combinationCodes(Object.keys({ '*': 1, '[*u]': 1, '*udd': 1, '*uud': 1, '[*ud]': 1, '*ddd': 1, '(Clef)': 1 }), freq, { limit: 3 }))
            .toEqual(['*ddd', '*uud', '[*ud]']);
    });
});

describe('a decision whose snippet has moved', () => {
    const s = { ...snip('007b-1', 'b', '[*u]'), sig: '45,63,92,81' };
    it('is stale when the signature differs, and then the snippet is undecided again', () => {
        expect(isStale(s, { status: 'accepted', code: '[*u]', sig: '1,1,1,1' })).toBe(true);
        expect(stateOf(s, { status: 'accepted', code: '[*u]', sig: '1,1,1,1' })).toEqual({ state: 'undecided', code: '[*u]', decided: false, stale: true });
    });
    it('counts when the signature is the same, or there is none to compare', () => {
        expect(isStale(s, { status: 'accepted', code: '[*u]', sig: '45,63,92,81' })).toBe(false);
        expect(isStale(s, { status: 'accepted', code: '[*u]' })).toBe(false);
        expect(isStale(snip('007b-2', 'b', '[*u]'), { status: 'accepted', code: '[*u]', sig: '1,1,1,1' })).toBe(false);
    });
    it('is counted', () => {
        expect(countStale([s, { ...s, id: '007b-3' }], { '007b-1': { status: 'later', sig: '0,0,0,0' }, '007b-3': { status: 'later', sig: '45,63,92,81' } })).toBe(1);
    });
});

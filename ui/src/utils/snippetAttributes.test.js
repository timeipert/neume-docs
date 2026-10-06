import { describe, it, expect } from 'vitest';
import {
    defaultSnippetAttributes,
    cleanSnippetAttributes,
    loneSignAttributes,
    validateAttribute,
    validateAttributes,
    folioProblem,
    attributeKey,
    normalizeValue
} from './snippetAttributes';

const defs = defaultSnippetAttributes();
const folio = defs.line[0];
const line = defs.line[1];
const syllable = defs.sign[0];

describe('the default attributes', () => {
    it('are a folio and a line for a line, and a syllable for a sign', () => {
        expect(defs.line.map(d => d.key)).toEqual(['folio', 'line']);
        expect(defs.sign.map(d => d.key)).toEqual(['syllable']);
        expect(defs.line.every(d => d.required && d.validate)).toBe(true);
        expect(syllable.required).toBe(false);
    });

    it('are new objects every time', () => {
        defaultSnippetAttributes().line[0].label = 'changed';
        expect(defaultSnippetAttributes().line[0].label).toBe('Folio');
    });
});

describe('a folio', () => {
    it.each(['12r', '12v', '1r', '300v', '0r'])('accepts %s', (v) => {
        expect(validateAttribute(folio, v).ok).toBe(true);
    });

    it.each(['12', 'r12', '12a', '12rv', 'f. 12', '12 r b', ''])('refuses %j', (v) => {
        expect(validateAttribute(folio, v).ok).toBe(false);
    });

    it('is tidied: blanks go, case goes', () => {
        expect(validateAttribute(folio, ' 12 R ')).toEqual({ ok: true, value: '12r', message: '' });
    });

    it('explains itself', () => {
        expect(validateAttribute(folio, '12').message).toBe('A folio is a number and r or v, e.g. 12r.');
    });
});

describe('a line', () => {
    it('is a number', () => {
        expect(validateAttribute(line, '3').ok).toBe(true);
        expect(validateAttribute(line, '12').ok).toBe(true);
        expect(validateAttribute(line, '3a').ok).toBe(false);
        expect(validateAttribute(line, 'three').ok).toBe(false);
        expect(validateAttribute(line, '').message).toBe('Line is required.');
    });
});

describe('the check can be switched off or replaced', () => {
    it('lets anything through when it is off', () => {
        expect(validateAttribute({ ...folio, validate: false }, 'f. 12 verso').ok).toBe(true);
    });

    it('still asks for a value that is required', () => {
        expect(validateAttribute({ ...folio, validate: false }, '').ok).toBe(false);
    });

    it('lets an optional value be empty', () => {
        expect(validateAttribute({ ...folio, required: false }, '').ok).toBe(true);
    });

    it('takes a pattern of its own for a text', () => {
        const hand = { key: 'hand', label: 'Hand', type: 'text', validate: true, pattern: '^[A-C]$', hint: 'A, B or C' };
        expect(validateAttribute(hand, 'B').ok).toBe(true);
        expect(validateAttribute(hand, 'D').message).toBe('Hand does not look right (A, B or C).');
    });

    it('ignores a pattern that is not a pattern', () => {
        expect(validateAttribute({ key: 'x', label: 'X', type: 'text', validate: true, pattern: '(' }, 'a').ok).toBe(true);
    });

    it('checks a choice against its list', () => {
        const ink = { key: 'ink', label: 'Ink', type: 'choice', validate: true, options: ['brown', 'red'] };
        expect(validateAttribute(ink, 'red').ok).toBe(true);
        expect(validateAttribute(ink, 'blue').message).toBe('Ink is one of: brown, red.');
    });

    it('checks a number', () => {
        const n = { key: 'n', label: 'N', type: 'number', validate: true };
        expect(['3', '-2', '1.5', '1,5'].every(v => validateAttribute(n, v).ok)).toBe(true);
        expect(validateAttribute(n, 'x').ok).toBe(false);
    });
});

describe('a set of attributes', () => {
    it('collects the values that are there and the problems', () => {
        const r = validateAttributes(defs.line, { folio: '12R', line: 'x' });
        expect(r.ok).toBe(false);
        expect(r.values).toEqual({ folio: '12r', line: 'x' });
        expect(Object.keys(r.errors)).toEqual(['line']);
    });

    it('is fine when everything is right, and leaves out what is empty', () => {
        const r = validateAttributes([...defs.line, ...defs.sign], { folio: '1v', line: '2' });
        expect(r).toEqual({ ok: true, values: { folio: '1v', line: '2' }, errors: {} });
    });
});

describe('a sign that stands alone', () => {
    it('has the place of a line, not required, and its own attributes', () => {
        const lone = loneSignAttributes(defs);
        expect(lone.map(d => d.key)).toEqual(['folio', 'line', 'syllable']);
        expect(lone.some(d => d.required)).toBe(false);
        expect(validateAttributes(lone, {}).ok).toBe(true);
        expect(validateAttributes(lone, { folio: 'x' }).ok).toBe(false);
    });
});

describe('attributes read from storage', () => {
    it('are the defaults when there is nothing', () => {
        expect(cleanSnippetAttributes(null)).toEqual(expect.objectContaining({ line: expect.any(Array), sign: expect.any(Array) }));
        expect(cleanSnippetAttributes(undefined).line.map(d => d.key)).toEqual(['folio', 'line']);
    });

    it('drop what is broken and what repeats', () => {
        const c = cleanSnippetAttributes({ line: [null, { label: 'no key' }, { key: 'folio', label: 'F' }, { key: 'folio' }], sign: [{ key: 'a', type: 'nonsense' }] });
        expect(c.line.map(d => d.key)).toEqual(['folio', 'line']);
        expect(c.sign).toEqual([expect.objectContaining({ key: 'a', type: 'text', label: 'a' })]);
    });

    it('always keep the folio and the line of a line, as what they are', () => {
        const c = cleanSnippetAttributes({ line: [{ key: 'folio', type: 'text', label: 'Page' }], sign: [] });
        expect(c.line.map(d => [d.key, d.type, d.builtin])).toEqual([['folio', 'folio', true], ['line', 'line', true]]);
        expect(c.line.find(d => d.key === 'folio').label).toBe('Page');
    });

    it('keep the extensions of a person', () => {
        const c = cleanSnippetAttributes({ line: [...defs.line, { key: 'hand', label: 'Hand', type: 'text' }], sign: [...defs.sign, { key: 'ink', label: 'Ink', type: 'choice', options: ['red', ' brown ', ''] }] });
        expect(c.line.map(d => d.key)).toEqual(['folio', 'line', 'hand']);
        expect(c.sign[1].options).toEqual(['red', 'brown']);
    });
});

describe('the folio of a range', () => {
    it('is checked the way a folio attribute is', () => {
        expect(folioProblem(defs, '12r')).toBe('');
        expect(folioProblem(defs, '12')).toMatch(/number and r or v/);
        expect(folioProblem(defs, '')).toBe('');
    });

    it('is not checked when the check is off', () => {
        const off = { ...defs, line: defs.line.map(d => (d.key === 'folio' ? { ...d, validate: false } : d)) };
        expect(folioProblem(off, 'f. 12')).toBe('');
    });
});

describe('keys and values', () => {
    it('makes a key from a label, never a taken one', () => {
        expect(attributeKey('Ink colour')).toBe('ink_colour');
        expect(attributeKey('Ink colour', ['ink_colour'])).toBe('ink_colour_2');
        expect(attributeKey('  !!  ')).toBe('attribute');
    });

    it('keeps the case of a text', () => {
        expect(normalizeValue({ type: 'text' }, '  A-men ')).toBe('A-men');
    });
});

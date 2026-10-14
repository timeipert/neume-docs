import { describe, it, expect } from 'vitest';
import { cleanIndex, cleanManuscript } from './documentation';
import { buildDocumentation, META_COLUMNS, virgaSign } from '../../../neuma-import/src/documentation.mjs';
import { ORIGIN } from '../../../neuma-import/src/origin.mjs';
import { COLUMNS } from '../../../neuma-import/src/columns.mjs';
import { checkCode } from './neumaReview';
import { classify } from './neumeTable';
import { GLYPHS } from '../data/glyphs';

/**
 * `neuma-import` writes documentations without knowing this app, so that it can stay a module of its
 * own. This is where the two are held together: what it writes must be read by the app's own reader
 * without losing anything, and what it proposes must be codes the app understands.
 */
const catalogue = {
    origin: ORIGIN,
    sources: [{
        id: '007', siglum: 'A-GÜ 4/4 etc.', type: 'ANTIPHONALE', description: 'Antiphoner (fragment)', collection: 'Güssing (A)',
        date: '14/2', rism: 'A-GÜ 4/4', provenance: 'Transylvania', notation: 'Esztergom', numerus: 'F496', presentation: 'Four-line', link: ''
    }]
};
const snippets = ['b-1', 'b-2', 'a-1'].map((id, n) => ({
    id: `007${id}`, source: '007', column: id[0], index: n + 1, count: 2, file: `snippets/007/${id}.png`, suggestion: { code: id[0] === 'b' ? '[*u]' : '*' }
}));
const decisions = {
    '007b-1': { status: 'accepted', code: '[*u]' },
    '007b-2': { status: 'corrected', code: '[*uVd]' },
    '007a-1': { status: 'corrected', code: '*V' }
};
const V = virgaSign(GLYPHS.note).V;

describe('what neuma-import writes, the app reads', () => {
    const doc = buildDocumentation({ catalogue, snippets, decisions, signs: { V }, generated: '2026-10-14' });

    it('is an index the viewer accepts, with all its manuscripts, columns and signs', () => {
        const { index, error } = cleanIndex(doc.index);
        expect(error).toBeUndefined();
        expect(index.manuscripts).toHaveLength(1);
        expect(index.manuscripts[0].meta.date).toBe('14th c., 2nd half');
        expect(index.columns.map(c => c.key)).toEqual(META_COLUMNS.map(c => c.key));
        expect(index.columns.find(c => c.key === 'date').filter).toBe('years');
        expect(Object.keys(index.signs)).toEqual(['V']);
        expect(index.info.title).toBe(doc.index.info.title);
        expect(index.info.preferredCitation).toMatch(/neuma\.zti\.hu/);
        expect(index.info.url).toBe(ORIGIN.url);
    });

    it('is a manuscript file the viewer accepts, with every snippet and its picture', () => {
        const { manuscript, error } = cleanManuscript(doc.manuscripts['007'], '007');
        expect(error).toBeUndefined();
        expect(manuscript.snippets).toHaveLength(3);
        expect(manuscript.snippets.every(s => s.image && s.image.startsWith('images/007/'))).toBe(true);
        expect(manuscript.rows.map(r => r.pattern).sort()).toEqual(['*V', '[*u]', '[*uVd]'].sort());
        expect(manuscript.kind).toBe('collection');
    });

    it('points at the files that are copied', () => {
        for (const { to } of doc.images) expect(to).toMatch(/^images\/007\/007[ab]-\d\.png$/);
        for (const entry of doc.index.manuscripts) expect(entry.file).toBe('data/007.json');
    });
});

describe('what neuma-import proposes, the app understands', () => {
    it('proposes only codes the app can hold, each with the notes its name says', () => {
        const codes = COLUMNS.flatMap(c => c.codes);
        expect(codes.length).toBeGreaterThan(30);
        for (const code of codes) expect(checkCode(code), code).toEqual({ ok: true, error: '' });
    });

    it('proposes the clef and the custos as the pseudo-patterns the neume table knows', () => {
        expect(classify(COLUMNS.find(c => c.key === 'l').codes[0]).kind).toBe('clef');
        expect(classify(COLUMNS.find(c => c.key === 'm').codes[0]).kind).toBe('custos');
    });
});

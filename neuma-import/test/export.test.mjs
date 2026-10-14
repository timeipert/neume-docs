import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDocumentation, readableDate, fileSlug, META_COLUMNS } from '../src/export.mjs';
import { ORIGIN } from '../src/origin.mjs';

test('the catalogue\'s datings become ones the app can read as years', () => {
    const cases = {
        '15': '15th c.', '12': '12th c.', '13': '13th c.', '21': '21st c.', '22': '22nd c.', '23': '23rd c.',
        '15/in': '15th c., beginning', '15/m': '15th c., middle', '13/ex': '13th c., end',
        '14/1': '14th c., 1st half', '14/2': '14th c., 2nd half',
        '15/16': '15th c.–16th c.', '1192–1195': '1192–1195', '1487‒1488': '1487–1488',
        'cc. 1487': 'c. 1487', '1450 után': 'after 1450', '1745': '1745', 'b. 1360': 'b. 1360', '': ''
    };
    for (const [from, to] of Object.entries(cases)) assert.equal(readableDate(from), to, from);
});

test('a file name is safe', () => {
    assert.equal(fileSlug('A-GÜ 4/4 etc.'), 'A-G_4_4_etc.');
    assert.equal(fileSlug('..'), 'item');
});

const catalogue = {
    origin: ORIGIN,
    sources: [
        { id: '007', siglum: 'A-GÜ 4/4 etc.', type: 'ANTIPHONALE', description: 'Antiphoner (fragment)', collection: 'Güssing', date: '14/2', rism: 'A-GÜ 4/4', provenance: 'Transylvania', notation: 'Esztergom', numerus: 'F496', presentation: 'Four-line', link: '' },
        { id: '008', siglum: 'H-Bs', type: 'GRADUALE', description: '', collection: '', date: '15', rism: '', provenance: '', notation: '', numerus: '', presentation: '', link: '' },
        { id: '009', siglum: 'A-Wn', type: 'MISSALE', description: '', collection: '', date: '', rism: '', provenance: '', notation: '', numerus: '', presentation: '', link: '' }
    ]
};
const snippets = [
    { id: '007b-1', source: '007', column: 'b', index: 1, count: 2, file: 'snippets/007/b-1.png', suggestion: { code: '[*u]' } },
    { id: '007b-2', source: '007', column: 'b', index: 2, count: 2, file: 'snippets/007/b-2.png', suggestion: { code: '[*u]' } },
    { id: '007a-1', source: '007', column: 'a', index: 1, count: 1, file: 'snippets/007/a-1.png', suggestion: { code: '*' } },
    { id: '008k-1', source: '008', column: 'k', index: 1, count: 1, file: 'snippets/008/k-1.png', suggestion: { code: '' } },
    { id: '008c-1', source: '008', column: 'c', index: 1, count: 1, file: 'snippets/008/c-1.png', suggestion: { code: '[*d]' } }
];
const V = { viewBox: '0 0 10 10', d: 'M0 0L1 1', label: 'Virga', abbrev: 'v' };

test('only what was looked at is in the documentation', () => {
    const decisions = {
        '007b-1': { status: 'accepted', code: '[*u]' },
        '007b-2': { status: 'corrected', code: '[*uV]' },
        '007a-1': { status: 'discarded' },
        '008k-1': { status: 'later' }
    };
    const { index, manuscripts, images, counts } = buildDocumentation({ catalogue, snippets, decisions, signs: { V }, generated: '2026-10-14' });
    assert.deepEqual(index.manuscripts.map(m => m.id), ['007']);
    assert.equal(manuscripts['007'].snippets.length, 2);
    assert.deepEqual(manuscripts['007'].rows.map(r => r.pattern), ['[*u]', '[*uV]']);
    assert.deepEqual(images, [
        { from: 'snippets/007/b-1.png', to: 'images/007/007b-1.png' },
        { from: 'snippets/007/b-2.png', to: 'images/007/007b-2.png' }
    ]);
    assert.deepEqual(counts, { snippets: 5, reviewed: 2, proposed: 0, left: 2, discarded: 1, stale: 0 });
    assert.deepEqual(Object.keys(index.signs), ['V']);
});

test('with the proposals taken, what is not decided is in too — except what has no proposal', () => {
    const { index, counts } = buildDocumentation({ catalogue, snippets, decisions: { '007a-1': { status: 'discarded' } }, include: 'proposed' });
    assert.deepEqual(index.manuscripts.map(m => m.id), ['007', '008']);
    assert.equal(counts.proposed, 3);
    assert.equal(counts.left, 1); // the combination
});

test('the index carries the catalogue\'s text as metadata, and the credit', () => {
    const { index } = buildDocumentation({ catalogue, snippets, decisions: { '007b-1': { status: 'accepted', code: '[*u]' } }, generated: '2026-10-14' });
    const m = index.manuscripts[0];
    assert.equal(m.source, 'A-GÜ 4/4 etc.');
    assert.equal(m.kind, 'collection');
    assert.equal(m.meta.date, '14th c., 2nd half');
    assert.equal(m.meta.provenance, 'Transylvania');
    assert.equal(m.file, 'data/007.json');
    assert.deepEqual(index.columns, META_COLUMNS);
    assert.match(index.info.description, /Gilányi/);
    assert.match(index.info.preferredCitation, /neuma\.zti\.hu/);
    assert.equal(index.info.year, '2026');
});

test('a snippet says where it is in the catalogue', () => {
    const { manuscripts } = buildDocumentation({ catalogue, snippets, decisions: { '007b-2': { status: 'accepted', code: '[*u]' } } });
    const s = manuscripts['007'].snippets[0];
    assert.equal(s.id, '007b-2');
    assert.equal(s.image, 'images/007/007b-2.png');
    assert.match(s.caption, /Pes \(2 of 2/);
});

test('signs the library does not draw itself are given a glyph', () => {
    const decisions = { '007b-1': { status: 'corrected', code: '[*uVd]' }, '007a-1': { status: 'corrected', code: '*L' } };
    const { index } = buildDocumentation({ catalogue, snippets, decisions, signs: { V } });
    assert.deepEqual(Object.keys(index.signs), ['V']);
});

test('a decision about a snippet that has since moved is not applied', () => {
    const moved = snippets.map(s => ({ ...s, sig: '1,2,30,40' }));
    const decisions = { '007b-1': { status: 'accepted', code: '[*u]', sig: '1,2,30,40' }, '007b-2': { status: 'corrected', code: '*u', sig: '9,9,9,9' }, '007a-1': { status: 'accepted', code: '*' } };
    const { manuscripts, counts } = buildDocumentation({ catalogue, snippets: moved, decisions });
    assert.deepEqual(manuscripts['007'].snippets.map(s => s.id).sort(), ['007a-1', '007b-1']);
    assert.equal(counts.stale, 1);
    assert.equal(counts.left, 3);
});

import { describe, expect, it } from 'vitest';
import { buildDocumentation, documentationFiles, fileSlug } from './buildDocumentation';
import { cleanIndex, cleanManuscript } from './documentation';
import { defaultPublication } from './publication';

const publication = { ...defaultPublication(), title: 'Rhineland neumes', authors: ['A. Author'], license: 'CC BY 4.0', year: '2026' };

const tables = [
    { source: 'Ms02', name: 'Second', notes: 'N', isPublished: true, rows: [{ pattern: '*ud', customId: '3' }, { pattern: '*uudd', customId: '', tier: 'expanded', notes: 'a note' }] },
    { source: 'Ms01', name: 'First', isPublished: true, rows: [{ pattern: '*u', customId: '1' }] },
    { source: 'Hidden', isPublished: false, rows: [] },
    { source: 'NoWork', isPublished: true, rows: [{ pattern: '*u' }] }
];
const regions = {
    Ms01_12r: [{ id: 'r1', name: '4', points: '10,10 20,10 20,20 10,20' }],
    Ms01_2v: [{ id: 'r2', name: '1', points: '0,0 1,1' }],
    Ms02_1r: [{ id: 'r3', name: '2', points: '0,0 1,1' }],
    Hidden_1r: [{ id: 'r4', name: '1', points: '0,0 1,1' }]
};
const regionItems = {
    r1: [{ id: 'a1', pattern: '*u', points: '10,10 20,10 20,20 10,20' }, { id: 'a2', pattern: '*uVd', points: '30,10 40,10 40,20 30,20', variant: 'b' }, { id: 'nopoints', pattern: '*u' }],
    r2: [{ id: 'a3', pattern: '*u', points: '5,5 6,6' }],
    r3: [{ id: 'b1', pattern: '*ud', points: '1,1 2,2' }]
};
const collections = [
    {
        id: 'c1', source: 'Shots', name: 'From screenshots', isPublished: true,
        patterns: [{ code: '*ud', label: 'Clivis' }],
        lines: [{ id: 'l1', attrs: { folio: '3v', line: '5' }, image: 'data:image/png;base64,BBBB' }],
        snippets: [
            { id: 's1', pattern: '*ud', image: 'data:image/png;base64,AAAA', refId: '7', lineId: 'l1', box: { x: 10, y: 20, w: 30, h: 40 }, attrs: { syllable: 'Glo' } },
            { id: 's2', pattern: '*uu', image: '', caption: 'no picture' }
        ]
    },
    { id: 'c2', source: 'Private', isPublished: false, snippets: [] }
];
const META = { Ms01: { origin: 'Köln', dating: 's. XI' }, Ms02: { origin: 'Trier', dating: '1050-1075' }, Shots: { origin: 'Köln' } };

const build = (extra = {}) => buildDocumentation({
    publication, generated: '2026-10-07',
    columns: [{ key: 'origin', label: 'Origin', type: 'location' }, { key: 'dating', label: 'Dating', type: 'century' }],
    metaOf: (s, k) => (META[s] || {})[k] || '',
    tables, regions, regionItems, collections,
    customSigns: [{ key: 'V', abbrev: 'v', label: 'Virga' }], signGlyphs: { V: { viewBox: '0 0 10 10', d: 'M0 0 L1 1' } },
    globalId: (code) => (code === '*uudd' ? 'G9' : ''),
    regionUrl: (source, folio, region, width) => `https://iiif.example/${source}/${folio}/${region}/${width},/0/default.jpg`,
    ...extra
});

describe('what is published', () => {
    it('takes the published manuscripts that have annotated pages, and the published collections', () => {
        const { index } = build();
        expect(index.manuscripts.map(m => m.id)).toEqual(['Ms01', 'Ms02', 'Shots']);
        expect(index.manuscripts.map(m => m.kind)).toEqual(['iiif', 'iiif', 'collection']);
    });

    it('says who made it', () => {
        const { index } = build();
        expect(index).toMatchObject({ format: 'neume-docs', version: 1, generated: '2026-10-07', info: { title: 'Rhineland neumes', authors: ['A. Author'], license: 'CC BY 4.0' } });
        expect(index.signs.V.d).toBe('M0 0 L1 1');
    });

    it('is a documentation the viewer accepts, file by file', () => {
        const built = build();
        expect(cleanIndex(built.index).error).toBeUndefined();
        for (const file of documentationFiles(built)) {
            const raw = JSON.parse(file.text);
            if (file.path !== 'neume-docs.json') expect(cleanManuscript(raw).error).toBeUndefined();
        }
    });
});

describe('a manuscript on IIIF pages', () => {
    it('has its rows with their Ref IDs and tiers', () => {
        const ms = build().manuscripts.Ms02;
        expect(ms.rows).toEqual([
            { pattern: '*ud', refId: '3', notes: '', tier: 'standard' },
            { pattern: '*uudd', refId: 'G9', notes: 'a note', tier: 'expanded' }
        ]);
    });

    it('has a snippet for every annotated item with a polygon, in the order of the folios', () => {
        const ms = build().manuscripts.Ms01;
        expect(ms.snippets.map(s => s.id)).toEqual(['a3', 'a1', 'a2']); // f. 2v comes before f. 12r
        expect(ms.snippets[1]).toMatchObject({ pattern: '*u', folio: '12r', line: '4', refId: '1', variant: '' });
    });

    it('points each snippet at its crop on the IIIF server', () => {
        const s = build().manuscripts.Ms01.snippets.find(x => x.id === 'a1');
        expect(s.image).toBe('https://iiif.example/Ms01/12r/pct:9.000,9.000,12.000,12.000/300,/0/default.jpg');
        expect(s.zoom).toContain('/1200,/');
        expect(build({ regionUrl: () => null }).manuscripts.Ms01.snippets[0].image).toBe('');
    });

    it('calls a code variant by the row of the code without its signs, and marks the sign and the variant', () => {
        const s = build().manuscripts.Ms01.snippets.find(x => x.id === 'a2');
        expect(s.pattern).toBe('*uVd');
        expect(s.variant).toBe('b');
        expect(s.refId).toBe('-·vb'); // no row for *ud here: no Ref ID, the sign's marker, the variant
        expect(build({ discriminateSigns: false }).manuscripts.Ms01.snippets.find(x => x.id === 'a2').refId).toBe('-b');
    });
});

describe('a manuscript from screenshots', () => {
    it('has its patterns, and those only its snippets name', () => {
        const ms = build().manuscripts.Shots;
        expect(ms.kind).toBe('collection');
        expect(ms.rows.map(r => r.pattern)).toEqual(['*ud', '*uu']);
    });

    it('takes folio and line from the line a sign was cut from, and the syllable from the sign', () => {
        const s = build().manuscripts.Shots.snippets.find(x => x.id === 's1');
        expect(s).toMatchObject({ folio: '3v', line: '5', syllable: 'Glo', refId: '7' });
    });

    it('keeps a screenshot in the file, or writes it to a file of its own', () => {
        const image = (built, id) => built.manuscripts.Shots.snippets.find(x => x.id === id).image;
        expect(image(build(), 's1')).toBe('data:image/png;base64,AAAA');
        expect(build().files).toEqual([]);
        const built = build({ images: 'files' });
        expect(image(built, 's1')).toBe('images/Shots/s1.png');
        expect(built.files).toEqual([
            { path: 'images/Shots/s1.png', dataUrl: 'data:image/png;base64,AAAA' },
            { path: 'images/Shots/line-l1.png', dataUrl: 'data:image/png;base64,BBBB' }
        ]);
        expect(image(built, 's2')).toBe('');
    });
});

describe('the index', () => {
    it('lists the manuscripts with their metadata, counts and file', () => {
        const { index } = build();
        expect(index.manuscripts[0]).toMatchObject({ id: 'Ms01', name: 'First', file: 'data/Ms01.json', patterns: 1, snippets: 3, meta: { origin: 'Köln', dating: 's. XI' } });
        expect(index.manuscripts[2].meta).toEqual({ origin: 'Köln' });
    });

    it('says which columns can be filtered, and how', () => {
        const { index } = build();
        expect(index.columns).toEqual([
            { key: 'origin', label: 'Origin', type: 'location', filter: 'values' },
            { key: 'dating', label: 'Dating', type: 'century', filter: 'years' }
        ]);
        const said = build({ columns: [{ key: 'origin', label: 'Origin', type: 'location', said: { on: false } }] });
        expect(said.index.columns[0].filter).toBe('');
    });

    it('gives manuscripts that share a name ids and files of their own', () => {
        const { index } = build({ collections: [{ ...collections[0], source: 'Ms01' }] });
        expect(index.manuscripts.map(m => m.id)).toEqual(['Ms01', 'Ms01-2', 'Ms02']);
        expect(new Set(index.manuscripts.map(m => m.file)).size).toBe(3);
    });

    it('writes the index and one file for each manuscript', () => {
        const files = documentationFiles(build());
        expect(files.map(f => f.path)).toEqual(['neume-docs.json', 'data/Ms01.json', 'data/Ms02.json', 'data/Shots.json']);
        expect(JSON.parse(files[1].text).file).toBeUndefined();
    });

    it('is empty, not broken, when nothing is published', () => {
        const { index, manuscripts } = build({ tables: [], collections: [] });
        expect(index.manuscripts).toEqual([]);
        expect(manuscripts).toEqual({});
    });
});

describe('file names', () => {
    it('keeps only what is safe in a path', () => {
        expect(fileSlug('Ms 01/α')).toBe('Ms_01');
        expect(fileSlug('../..')).toBe('.._..');
        expect(fileSlug('..')).toBe('item');
        expect(fileSlug('')).toBe('item');
    });
});

describe('lines with their snippets drawn on them', () => {
    it('makes the line of a manuscript on IIIF pages one picture, with polygons relative to it', () => {
        const ms = build().manuscripts.Ms01;
        const line = ms.lines.find(l => l.id === 'r1');
        expect(line).toMatchObject({ folio: '12r', name: '4' });
        expect(line.image).toBe('https://iiif.example/Ms01/12r/pct:9.000,9.000,12.000,12.000/1200,/0/default.jpg');
        expect(line.items.map(i => i.id)).toEqual(['a1', 'a2']); // the item without a polygon is no snippet
        expect(line.items[0].points).toBe('8.33,8.33 91.67,8.33 91.67,91.67 8.33,91.67');
        expect(ms.snippets.find(s => s.id === 'a1').lineId).toBe('r1');
    });

    it('keeps the lines in the order of the folios', () => {
        expect(build().manuscripts.Ms01.lines.map(l => l.folio)).toEqual(['2v', '12r']);
    });

    it('makes the lines of screenshots from their pictures and the boxes of their signs', () => {
        const shots = build().manuscripts.Shots;
        expect(shots.lines).toEqual([{ id: 'l1', folio: '3v', name: '5', image: 'data:image/png;base64,BBBB', items: [{ id: 's1', box: { x: 10, y: 20, w: 30, h: 40 } }] }]);
        expect(shots.snippets.find(s => s.id === 's1').lineId).toBe('l1');
        const built = build({ images: 'files' });
        expect(built.manuscripts.Shots.lines[0].image).toBe('images/Shots/line-l1.png');
        expect(built.files.map(f => f.path)).toContain('images/Shots/line-l1.png');
    });

    it('is a documentation the viewer accepts, lines and all', () => {
        for (const file of documentationFiles(build())) {
            if (file.path === 'neume-docs.json') continue;
            const { manuscript } = cleanManuscript(JSON.parse(file.text));
            for (const line of manuscript.lines) expect(line.items.length).toBeGreaterThan(0);
        }
    });

    it('names the signs for the viewer', () => {
        expect(build().index.signs.V).toMatchObject({ label: 'Virga', abbrev: 'v', d: 'M0 0 L1 1' });
    });
});

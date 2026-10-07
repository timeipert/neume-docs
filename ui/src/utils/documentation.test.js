import { describe, expect, it } from 'vitest';
import {
    baseUrl, combineId, combinedParts, isCombineId, cleanEndpointList, cleanImageRef, cleanIndex, cleanManuscript, endpointFromId, fileUrl,
    holdingOf, idFromRepoInput, repoWebUrl, resolveEndpoint, safeHttpUrl, safeRelativePath
} from './documentation';

describe('addresses and paths', () => {
    it('lets only http(s) addresses through', () => {
        expect(safeHttpUrl('https://example.org/a?b=1')).toBe('https://example.org/a?b=1');
        expect(safeHttpUrl('javascript:alert(1)')).toBe('');
        expect(safeHttpUrl('not a url')).toBe('');
    });

    it('keeps a path inside the documentation', () => {
        expect(safeRelativePath('data/Ms01.json')).toBe('data/Ms01.json');
        for (const bad of ['../x.json', 'a/../b', '/etc/passwd', 'https://x/y', 'a\\b', 'data//x', '', 'javascript:x']) expect(safeRelativePath(bad)).toBe('');
    });

    it('accepts a picture as a file, an https address or a small inline image — nothing else', () => {
        expect(cleanImageRef('images/a b.jpg')).toBe('images/a b.jpg');
        expect(cleanImageRef('https://iiif.example/x/pct:1,2,3,4/300,/0/default.jpg')).toContain('https://iiif.example/');
        expect(cleanImageRef('data:image/png;base64,iVBORw0KGgo=')).toMatch(/^data:image\/png/);
        expect(cleanImageRef('data:image/svg+xml;base64,PHN2Zz4=')).toBe('');
        expect(cleanImageRef('javascript:alert(1)')).toBe('');
        expect(cleanImageRef('../../secret.png')).toBe('');
    });
});

describe('endpoints', () => {
    it('reads a GitHub repository from its id', () => {
        expect(endpointFromId('gh:timeipert/neume-docs-data')).toMatchObject({ kind: 'github', owner: 'timeipert', repo: 'neume-docs-data', branch: 'main', path: '' });
        expect(endpointFromId('gh:a/b@dev:folder/sub')).toMatchObject({ branch: 'dev', path: 'folder/sub' });
        expect(endpointFromId('gh:a/b@dev:../x')).toBeNull();
        expect(endpointFromId('whatever')).toBeNull();
    });

    it('reads a plain address from its id, but only http(s) or a path', () => {
        expect(endpointFromId('url:https://example.org/docs/')).toMatchObject({ kind: 'url', url: 'https://example.org/docs/' });
        expect(endpointFromId('url:./docs-demo/')).toMatchObject({ kind: 'url' });
        expect(endpointFromId('url:javascript:alert(1)')).toBeNull();
    });

    it('makes an id from what a person types or pastes', () => {
        expect(idFromRepoInput('owner/repo')).toBe('gh:owner/repo');
        expect(idFromRepoInput('https://github.com/owner/repo')).toBe('gh:owner/repo');
        expect(idFromRepoInput('https://github.com/owner/repo.git')).toBe('gh:owner/repo');
        expect(idFromRepoInput('https://github.com/owner/repo/tree/dev/docs/neume')).toBe('gh:owner/repo@dev:docs/neume');
        expect(idFromRepoInput('gh:owner/repo@dev')).toBe('gh:owner/repo@dev');
        expect(idFromRepoInput('nonsense')).toBe('');
        expect(idFromRepoInput('')).toBe('');
    });

    it('cleans the hosting\'s list: names, unique ids, no entry without a place', () => {
        const list = cleanEndpointList({ endpoints: [
            { name: 'Our documentation', repo: 'timeipert/neume-docs-data', description: 'The main one' },
            { name: 'Our documentation', repo: 'someone/else', branch: 'dev', path: 'out' },
            { name: 'On a server', url: 'https://example.org/docs' },
            { name: 'Nothing' },
            { name: 'Bad path', repo: 'a/b', path: '../x' },
            { name: 'Script', url: 'javascript:alert(1)' },
            7
        ] });
        expect(list.map(e => e.name)).toEqual(['Our documentation', 'Our documentation', 'On a server']);
        expect(new Set(list.map(e => e.id)).size).toBe(3);
        expect(list[1]).toMatchObject({ branch: 'dev', path: 'out' });
        expect(list.every(e => !e.custom)).toBe(true);
        expect(cleanEndpointList([{ name: 'A', repo: 'a/b' }])).toHaveLength(1);
        expect(cleanEndpointList('x')).toEqual([]);
    });

    it('never gives an entry the id of the local documentation', () => {
        const list = cleanEndpointList([{ id: 'local', name: 'x', repo: 'a/b' }]);
        expect(list[0].id).not.toBe('local');
    });

    it('prefers the hosting\'s list to what an id says', () => {
        const list = cleanEndpointList([{ id: 'main', name: 'Main', repo: 'a/b' }]);
        expect(resolveEndpoint('main', list)).toMatchObject({ owner: 'a' });
        expect(resolveEndpoint('gh:x/y', list)).toMatchObject({ owner: 'x', custom: true });
        expect(resolveEndpoint('nothing', list)).toBeNull();
    });

    it('finds the files of an endpoint', () => {
        const gh = endpointFromId('gh:a/b@dev:out/docs');
        expect(baseUrl(gh)).toBe('https://raw.githubusercontent.com/a/b/dev/out/docs/');
        expect(baseUrl({ kind: 'github', owner: 'a', repo: 'b', branch: 'feature/x', path: '' })).toBe('https://raw.githubusercontent.com/a/b/feature/x/');
        expect(baseUrl({ kind: 'url', url: './docs-demo' }, 'https://site.example/app/')).toBe('https://site.example/app/docs-demo/');
        expect(baseUrl({ kind: 'url', url: 'https://example.org/d/' })).toBe('https://example.org/d/');
    });

    it('addresses a file only inside the base', () => {
        const base = 'https://raw.githubusercontent.com/a/b/main/';
        expect(fileUrl(base, 'data/Ms 01.json')).toBe(`${base}data/Ms%2001.json`);
        expect(fileUrl(base, '../other/x.json')).toBe('');
        expect(fileUrl(base, 'https://iiif.example/img.jpg')).toBe('https://iiif.example/img.jpg');
        expect(fileUrl(base, 'javascript:alert(1)')).toBe('');
    });

    it('links to the repository', () => {
        expect(repoWebUrl(endpointFromId('gh:a/b'))).toBe('https://github.com/a/b');
        expect(repoWebUrl(endpointFromId('gh:a/b@dev:out'))).toBe('https://github.com/a/b/tree/dev/out');
        expect(repoWebUrl(endpointFromId('url:https://x.org/'))).toBe('');
    });
});

const INDEX = {
    format: 'neume-docs', version: 1, generated: '2026-10-07T10:00:00Z',
    info: { title: 'Rhineland neumes', authors: ['A. Author', ' ', 'B. Author'], year: 2026, license: 'CC BY 4.0', url: 'javascript:x', preferredCitation: 'Cite me like this.' },
    columns: [
        { key: 'origin', label: 'Origin', type: 'location', filter: 'values' },
        { key: 'origin', label: 'again', type: 'text' },
        { key: 'dating', label: 'Dating', type: 'century', filter: 'years' },
        { key: 'x', label: 'X', type: 'weird', filter: 'nonsense' }
    ],
    manuscripts: [
        { id: 'Ms01', file: 'data/Ms01.json', name: 'Psalter', meta: { origin: 'Köln', dating: 's. XI', other: 'dropped' }, patterns: 3.7, snippets: 12 },
        { id: 'Ms01', file: 'data/again.json' },
        { id: 'Ms02', file: '../outside.json' },
        { id: 'Ms03', file: 'data/Ms03.txt' },
        { id: 'Ms04', file: 'data/Ms04.json', kind: 'collection' }
    ],
    signs: { V: { viewBox: '0 0 10 10', d: 'M0 0 L10 10 Z' }, W: { viewBox: '0 0 10 10', d: 'M0 0" onload="alert(1)' }, x: { viewBox: '0 0 1 1', d: 'M0 0' } }
};

describe('the index', () => {
    it('refuses what is not a documentation, or one from the future', () => {
        expect(cleanIndex({}).error).toMatch(/not a neume-docs/);
        expect(cleanIndex(null).error).toBeTruthy();
        expect(cleanIndex({ format: 'neume-docs' }).error).toMatch(/version/);
        expect(cleanIndex({ format: 'neume-docs', version: 99 }).error).toMatch(/newer/);
    });

    it('cleans the information and drops what could do harm', () => {
        const { index } = cleanIndex(INDEX);
        expect(index.info).toMatchObject({ title: 'Rhineland neumes', authors: ['A. Author', 'B. Author'], year: '2026', license: 'CC BY 4.0', url: '', preferredCitation: 'Cite me like this.' });
        expect(index.generated).toBe('2026-10-07');
    });

    it('keeps columns once, with known types and filter kinds only', () => {
        const { index } = cleanIndex(INDEX);
        expect(index.columns.map(c => c.key)).toEqual(['origin', 'dating', 'x']);
        expect(index.columns[2]).toMatchObject({ type: 'text', filter: '' });
    });

    it('keeps manuscripts whose file is a json file inside the documentation, once each', () => {
        const { index } = cleanIndex(INDEX);
        expect(index.manuscripts.map(m => m.id)).toEqual(['Ms01', 'Ms04']);
        expect(index.manuscripts[0]).toMatchObject({ source: 'Ms01', name: 'Psalter', kind: 'iiif', patterns: 3, snippets: 12, meta: { origin: 'Köln', dating: 's. XI' } });
        expect(index.manuscripts[1].kind).toBe('collection');
    });

    it('draws signs only from glyphs that are just a path', () => {
        const { index } = cleanIndex(INDEX);
        expect(Object.keys(index.signs)).toEqual(['V']);
    });

    it('does not mind a minimal index', () => {
        const { index } = cleanIndex({ format: 'neume-docs', version: 1 });
        expect(index.info.title).toBe('Untitled documentation');
        expect(index.manuscripts).toEqual([]);
        expect(index.discriminateSigns).toBe(true);
    });
});

describe('a manuscript file', () => {
    it('cleans rows and snippets and keeps each once', () => {
        const { manuscript } = cleanManuscript({
            id: 'Ms01', source: 'Ms01', name: 'Psalter', kind: 'collection',
            rows: [{ pattern: '*ud', refId: '3', tier: 'standard' }, { pattern: '*ud' }, { refId: 'x' }, { pattern: '*uu', tier: 'weird' }],
            snippets: [
                { id: 's1', pattern: '*ud', refId: '3', folio: '12r', line: '4', image: 'images/s1.jpg', zoom: 'javascript:x' },
                { id: 's1', pattern: '*ud' },
                { pattern: '*ud' },
                { id: 's2', pattern: '*uu', image: '../x.jpg' }
            ]
        }, 'fallback');
        expect(manuscript.rows.map(r => r.pattern)).toEqual(['*ud', '*uu']);
        expect(manuscript.rows[1].tier).toBe('');
        expect(manuscript.snippets.map(s => s.id)).toEqual(['s1', 's2']);
        expect(manuscript.snippets[0]).toMatchObject({ image: 'images/s1.jpg', zoom: '', folio: '12r', line: '4' });
        expect(manuscript.snippets[1]).toMatchObject({ image: '', refId: '-' });
        expect(manuscript.kind).toBe('collection');
    });

    it('takes its name from the index when the file lacks one, and refuses what is not an object', () => {
        expect(cleanManuscript({}, 'Ms09').manuscript).toMatchObject({ id: 'Ms09', source: 'Ms09', rows: [], snippets: [] });
        expect(cleanManuscript([]).error).toBeTruthy();
    });
});

describe('where a manuscript is kept', () => {
    const columns = [{ key: 'cat:bibliothek', label: 'Library' }, { key: 'origin', label: 'Origin' }, { key: 'sig', label: 'Shelfmark' }];

    it('is city, library and shelfmark from the catalogue columns', () => {
        expect(holdingOf({ 'cat:bibliotheksort': 'Köln', 'cat:bibliothek': 'Dombibliothek', 'cat:bibliothekssignatur': 'Cod. 123', origin: 'Trier' }, columns)).toBe('Köln, Dombibliothek, Cod. 123');
        expect(holdingOf({ 'cat:bibliothek': 'Dombibliothek' }, columns)).toBe('Dombibliothek');
    });

    it('falls back on columns whose label says so, and is empty when nothing does', () => {
        expect(holdingOf({ sig: 'Cod. 9', origin: 'Trier' }, columns)).toBe('Cod. 9');
        expect(holdingOf({ origin: 'Trier' }, columns)).toBe('');
        expect(holdingOf({}, [])).toBe('');
    });
});

describe('the lines of a manuscript', () => {
    const raw = {
        id: 'Ms01',
        snippets: [{ id: 's1', pattern: '*u', lineId: 'l1' }, { id: 's2', pattern: '*d' }],
        lines: [
            { id: 'l1', folio: '12r', name: '4', image: 'https://iiif.example/x.jpg', items: [
                { id: 's1', box: { x: 10, y: 20, w: 30, h: 40 } },
                { id: 's2', points: '1,2 3,4 5.5,6' },
                { id: 'unknown', box: { x: 1, y: 1, w: 1, h: 1 } },
                { id: 's1', points: '<script>' },
                { id: 's2' }
            ] },
            { id: 'l1', items: [] },
            { items: [] }
        ]
    };

    it('keeps the snippets drawn on a line, by box or by polygon, and drops what is not one', () => {
        const { manuscript } = cleanManuscript(raw);
        expect(manuscript.lines).toHaveLength(1);
        expect(manuscript.lines[0]).toMatchObject({ id: 'l1', folio: '12r', name: '4', image: 'https://iiif.example/x.jpg' });
        expect(manuscript.lines[0].items).toEqual([
            { id: 's1', box: { x: 10, y: 20, w: 30, h: 40 }, points: '' },
            { id: 's2', box: null, points: '1,2 3,4 5.5,6' }
        ]);
        expect(manuscript.snippets[0].lineId).toBe('l1');
    });

    it('keeps a box inside the picture', () => {
        const { manuscript } = cleanManuscript({ snippets: [{ id: 's', pattern: '*u' }], lines: [{ id: 'l', items: [{ id: 's', box: { x: -5, y: 0, w: 200, h: 10 } }] }] });
        expect(manuscript.lines[0].items[0].box).toEqual({ x: 0, y: 0, w: 100, h: 10 });
    });

    it('keeps the label of a sign and refuses its glyph if it is more than a path', () => {
        const { index } = cleanIndex({ format: 'neume-docs', version: 1, signs: { V: { viewBox: '0 0 1 1', d: 'M0 0', label: 'Virga', abbrev: 'v' } } });
        expect(index.signs.V).toEqual({ viewBox: '0 0 1 1', d: 'M0 0', label: 'Virga', abbrev: 'v' });
    });
});

describe('documentations together', () => {
    it('makes an id from several, and reads them back, whatever characters they hold', () => {
        const id = combineId(['example', 'gh:owner/repo@dev:docs', 'local']);
        expect(isCombineId(id)).toBe(true);
        expect(combinedParts(id)).toEqual(['example', 'gh:owner/repo@dev:docs', 'local']);
        expect(endpointFromId(id)).toMatchObject({ kind: 'combine', parts: ['example', 'gh:owner/repo@dev:docs', 'local'] });
    });

    it('names each part once, and not a combination in a combination', () => {
        expect(combinedParts(combineId(['a', 'a', 'b']))).toEqual(['a', 'b']);
        expect(combinedParts(combineId(['a', combineId(['b', 'c'])]))).toEqual(['a']);
        expect(endpointFromId('combine:')).toBeNull();
        expect(combinedParts('gh:a/b')).toEqual([]);
    });
});

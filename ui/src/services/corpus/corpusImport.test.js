import { describe, it, expect } from 'vitest';
import { collectFromFileList, collectFromDrop } from './corpusImport';

const fakeFile = (name, rel = '') => ({ name, webkitRelativePath: rel });

describe('collectFromFileList', () => {
    it('keeps only files that can hold transcriptions', () => {
        const list = [
            fakeFile('a.monodijson'),
            fakeFile('data.json', 'Proj/Aa 1/u1/data.json'),
            fakeFile('meta.json', 'Proj/Aa 1/meta.json'),
            fakeFile('bundle.ZIP'),
            fakeFile('scan.jpg', 'Proj/Aa 1/scan.jpg'),
            fakeFile('notes.pdf')
        ];
        expect(collectFromFileList(list).map(i => i.path)).toEqual([
            'a.monodijson', 'Proj/Aa 1/u1/data.json', 'Proj/Aa 1/meta.json', 'bundle.ZIP'
        ]);
    });

    it('skips hidden files and macOS archive litter', () => {
        const list = [
            fakeFile('.hidden.json'),
            fakeFile('data.json', 'Proj/.git/data.json'),
            fakeFile('x.json', '__MACOSX/Proj/x.json'),
            fakeFile('ok.json', 'Proj/ok.json')
        ];
        expect(collectFromFileList(list).map(i => i.path)).toEqual(['Proj/ok.json']);
    });

    it('accepts nothing', () => {
        expect(collectFromFileList(null)).toEqual([]);
        expect(collectFromFileList([])).toEqual([]);
    });
});

/** Minimal stand-ins for the FileSystemEntry API a drop provides. */
const fileEntry = (fullPath) => ({
    isFile: true, isDirectory: false, fullPath,
    file: (ok) => ok({ name: fullPath.split('/').pop() })
});
const dirEntry = (fullPath, children, batch = 100) => ({
    isFile: false, isDirectory: true, fullPath,
    createReader: () => {
        let i = 0;
        return {
            readEntries: (ok) => {
                const next = children.slice(i, i + batch);
                i += batch;
                ok(next);
            }
        };
    }
});
const dropOf = (entries, files = []) => ({
    items: entries.map(e => ({ webkitGetAsEntry: () => e })),
    files
});

describe('collectFromDrop', () => {
    it('walks dropped folders', async () => {
        const tree = dirEntry('/Proj', [
            dirEntry('/Proj/Aa 1', [fileEntry('/Proj/Aa 1/meta.json'), dirEntry('/Proj/Aa 1/u1', [fileEntry('/Proj/Aa 1/u1/data.json')])]),
            fileEntry('/Proj/readme.txt')
        ]);
        const items = await collectFromDrop(dropOf([tree]));
        expect(items.map(i => i.path)).toEqual(['Proj/Aa 1/meta.json', 'Proj/Aa 1/u1/data.json']);
    });

    it('reads folders that need several readEntries calls', async () => {
        const many = Array.from({ length: 250 }, (_, i) => fileEntry(`/P/f${i}.json`));
        const items = await collectFromDrop(dropOf([dirEntry('/P', many)]));
        expect(items).toHaveLength(250);
    });

    it('takes dropped files', async () => {
        const items = await collectFromDrop(dropOf([fileEntry('/backup.monodijson'), fileEntry('/photo.png')]));
        expect(items.map(i => i.path)).toEqual(['backup.monodijson']);
    });

    it('falls back to the plain file list when entries are unavailable', async () => {
        const dt = { items: [{}], files: [fakeFile('x.json')] };
        expect((await collectFromDrop(dt)).map(i => i.path)).toEqual(['x.json']);
    });
});

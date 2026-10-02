import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { readCorpus, toCorpusFile, compareDocuments } from './corpusReader';

const note = (base, octave) => ({ uuid: `${base}${octave}`, base, octave, noteType: 'Normal', liquescent: false, focus: false });
const group = (...notes) => ({ grouped: notes });
const syllable = (text, ...groups) => ({
    kind: 'Syllable', uuid: text, text, syllableType: 'Normal', notes: { spaced: [{ nonSpaced: groups }] }
});
/** A document with a rising pair and a single note. */
const doc = () => ({
    kind: 'RootContainer', uuid: 'r',
    children: [{ kind: 'ZeileContainer', uuid: 'z', children: [
        syllable('Pa-', group(note('G', 4)), group(note('A', 4))),
        syllable('ter', group(note('G', 4)))
    ] }]
});

const file = (path, content) => ({
    path,
    text: async () => (typeof content === 'string' ? content : JSON.stringify(content))
});

/** Collect every source a read reports. */
async function read(inputs, options = {}) {
    const sources = [];
    const events = [];
    const summary = await readCorpus(inputs, {
        onSource: (s) => { sources.push(s); },
        onProgress: (e) => events.push(e),
        ...options
    });
    return { sources, summary, events };
}

const projectFiles = () => [
    file('Proj/Aa 1/meta.json', { id: 'Aa 1', quellensigle: 'Aa 1', herkunftsort: 'Aachen', datierung: '12. Jh', manifest: 'https://example.org/m.json', beschreibung: 'long text' }),
    file('Proj/Aa 1/u2/meta.json', { id: 'u2', quelle_id: 'Aa 1', dokumenten_id: 'Aa 1-20r-2', foliostart: '20r', zeilenstart: '2', textinitium: 'Second' }),
    file('Proj/Aa 1/u2/data.json', doc()),
    file('Proj/Aa 1/u1/meta.json', { id: 'u1', quelle_id: 'Aa 1', dokumenten_id: 'Aa 1-3v-1', foliostart: '3v', zeilenstart: '1', textinitium: 'First' }),
    file('Proj/Aa 1/u1/data.json', doc()),
    file('Proj/Aa 1/u3/meta.json', { id: 'u3', quelle_id: 'Aa 1', dokumenten_id: 'Aa 1-4r-1TR', foliostart: '4r', zeilenstart: '1' }),
    file('Proj/Aa 1/u3/data.json', doc()),
    file('Proj/Bb 2/meta.json', { id: 'Bb 2', quellensigle: 'Bb 2' }),
    file('Proj/Bb 2/b1/meta.json', { id: 'b1', quelle_id: 'Bb 2', dokumenten_id: 'Bb 2-1r-1', foliostart: '1r', zeilenstart: '1' }),
    file('Proj/Bb 2/b1/data.json', doc()),
    file('Proj/Aa 1/scan.jpg', 'not json'),
    file('Proj/.DS_Store', 'junk')
];

describe('a Corpus Monodicum project (folder layout)', () => {
    it('reports one result per source, in order', async () => {
        const { sources, summary } = await read(projectFiles());
        expect(sources.map(s => s.name)).toEqual(['Aa 1', 'Bb 2']);
        expect(summary).toMatchObject({ sources: 2, documents: 3, skipped: 1, warnings: [] });
    });

    it('takes the catalogue data from the source meta, without the long description', () => {
        return read(projectFiles()).then(({ sources }) => {
            expect(sources[0].meta).toMatchObject({ quellensigle: 'Aa 1', herkunftsort: 'Aachen', datierung: '12. Jh', manifest: 'https://example.org/m.json' });
            expect(sources[0].meta.beschreibung).toBeUndefined();
        });
    });

    it('counts the patterns of every document', async () => {
        const { sources } = await read(projectFiles());
        // two documents of "Aa 1" count; the TR one is left out. Each: one `*u`, one `*`.
        expect(sources[0].counts).toEqual({ '*u': 2, '*': 2 });
        expect(sources[1].counts).toEqual({ '*u': 1, '*': 1 });
    });

    it('leaves out working copies unless asked', async () => {
        const kept = await read(projectFiles(), { skipSuffixes: [] });
        expect(kept.sources[0].documents).toHaveLength(3);
        expect(kept.summary.skipped).toBe(0);
    });

    it('analyses documents in reading order, not file order', async () => {
        const { sources } = await read(projectFiles());
        expect(sources[0].documents.map(d => d.dokumenten_id)).toEqual(['Aa 1-3v-1', 'Aa 1-20r-2']);
        // positions of the first pattern: the folio-3v document comes first
        expect(sources[0].patterns['*'][0][1]).toBe('3v');
    });

    it('collects the folios of a source', async () => {
        const { sources } = await read(projectFiles());
        expect(sources[0].folios).toEqual(['3v', '20r']);
    });

    it('keeps document metadata for the overview', async () => {
        const { sources } = await read(projectFiles());
        expect(sources[0].documents[0]).toMatchObject({ textinitium: 'First', foliostart: '3v', patternCount: 2 });
    });

    it('ignores files that are not data, and hidden files', async () => {
        const { summary } = await read(projectFiles());
        expect(summary.warnings).toEqual([]);
    });

    it('reports progress', async () => {
        const { events } = await read(projectFiles());
        expect(events[0]).toEqual({ phase: 'scan' });
        const last = events[events.length - 1];
        expect(last).toMatchObject({ phase: 'read', doneSources: 2, totalSources: 2, totalDocs: 4 });
    });

    it('reads a single source folder', async () => {
        const only = projectFiles().filter(f => f.path.startsWith('Proj/Bb 2/')).map(f => ({ ...f, path: f.path.replace('Proj/', '') }));
        const { sources } = await read(only);
        expect(sources.map(s => s.name)).toEqual(['Bb 2']);
    });

    it('reads a single document folder, naming the source from its folder when nothing else is known', async () => {
        const { sources } = await read([file('u9/data.json', doc())]);
        expect(sources).toHaveLength(1);
        expect(sources[0].counts['*u']).toBe(1);
    });

    it('merges a source that is split over several folders', async () => {
        const a = [
            file('A/Aa 1/meta.json', { id: 'Aa 1', quellensigle: 'Aa 1' }),
            file('A/Aa 1/x/meta.json', { dokumenten_id: 'Aa 1-1r-1', foliostart: '1r' }),
            file('A/Aa 1/x/data.json', doc())
        ];
        const b = [
            file('B/Aa 1/meta.json', { id: 'Aa 1', quellensigle: 'Aa 1' }),
            file('B/Aa 1/y/meta.json', { dokumenten_id: 'Aa 1-2r-1', foliostart: '2r' }),
            file('B/Aa 1/y/data.json', doc())
        ];
        const { sources } = await read([...a, ...b]);
        expect(sources).toHaveLength(1);
        expect(sources[0].documents).toHaveLength(2);
    });

    it('warns about a document that is not a transcription, and carries on', async () => {
        const files = [...projectFiles(), file('Proj/Bb 2/bad/data.json', { hello: 'world' }), file('Proj/Bb 2/broken/data.json', '{ not json')];
        const { sources, summary } = await read(files);
        expect(sources[1].documents).toHaveLength(1);
        expect(summary.warnings).toHaveLength(2);
        expect(summary.warnings.join('\n')).toMatch(/not a transcription/);
    });

    it('stops when asked to', async () => {
        const signal = { aborted: false };
        const seen = [];
        await readCorpus(projectFiles(), { signal, onSource: (s) => { seen.push(s.name); signal.aborted = true; } });
        expect(seen).toEqual(['Aa 1']);
    });

    it('leaves out a source that holds only working copies', async () => {
        const files = [
            file('P/Cc 3/meta.json', { quellensigle: 'Cc 3' }),
            file('P/Cc 3/x/meta.json', { dokumenten_id: 'Cc 3-1r-1GS' }),
            file('P/Cc 3/x/data.json', doc())
        ];
        const { sources, summary } = await read(files);
        expect(sources).toHaveLength(0);
        expect(summary.emptySources).toEqual(['Cc 3']);
        expect(summary.warnings[0]).toMatch(/working copy/);
    });
});

describe('layouts and keys as Monodi-Zero reads them', () => {
    it('decides by structure which meta.json is the source\'s', async () => {
        const files = [
            file('P/uuid-1/meta.json', { id: 'uuid-1', herkunftsort: 'Köln' }), // no quellensigle at all
            file('P/uuid-1/d/meta.json', { dokumenten_id: 'x-1r-1', foliostart: '1r' }),
            file('P/uuid-1/d/data.json', doc())
        ];
        const { sources } = await read(files);
        expect(sources.map(s => s.name)).toEqual(['uuid-1']);
        expect(sources[0].meta.herkunftsort).toBe('Köln');
    });

    it('accepts the English-ish keys of older exports', async () => {
        const files = [
            file('P/Old 1/meta.json', { quellensigle: 'Old 1' }),
            file('P/Old 1/d/meta.json', { id: 'd', genre: 'Antiphon', festum: 'Nativitas', dies: 'Dom', rowstart: '7', foliostart: '4v' }),
            file('P/Old 1/d/data.json', doc())
        ];
        const { sources } = await read(files);
        expect(sources[0].documents[0]).toMatchObject({ gattung1: 'Antiphon', festtag: 'Nativitas', feier: 'Dom', zeilenstart: '7' });
        expect(sources[0].patterns['*'][0].slice(1, 3)).toEqual(['4v', '7']); // the row start is honoured
    });

    it('falls back to the folder name for a document without metadata', async () => {
        const { sources } = await read([file('P/S 1/meta.json', { quellensigle: 'S 1' }), file('P/S 1/chant-42/data.json', doc())]);
        expect(sources[0].documents[0].dokumenten_id).toBe('chant-42');
        expect(sources[0].patterns['*'][0][0]).toBe('chant-42');
    });

    it('reads the manifest address under either name', async () => {
        const a = await read([file('P/A/meta.json', { quellensigle: 'A', manifest: 'https://a/m' }), file('P/A/d/data.json', doc())]);
        const b = await read([file('P/B/meta.json', { quellensigle: 'B', iiifManifestUrl: 'https://b/m' }), file('P/B/d/data.json', doc())]);
        expect(a.sources[0].meta.manifest).toBe('https://a/m');
        expect(b.sources[0].meta.manifest).toBe('https://b/m');
    });

    it('takes the source of a workspace document from source_id too', async () => {
        const ws = { sources: [{ id: 's1', quellensigle: 'WS 1' }, { id: 's2', quellensigle: 'WS 2' }], documents: [{ id: 'd', source_id: 's2', dokumenten_id: 'WS 2-1r-1', foliostart: '1r' }], notes: { d: doc() } };
        const { sources } = await read([file('w.monodijson', ws)]);
        expect(sources.map(s => s.name)).toEqual(['WS 2']);
    });
});

describe('everything in the metadata that can be used', () => {
    const W = 'https://iiif-ls6.informatik.uni-wuerzburg.de/iiif/3/Geesebook2%2Ffolio_';

    it('keeps every plain field of a source, including ones only some exports have', async () => {
        const files = [
            file('P/A/meta.json', { quellensigle: 'A', cantus_siglum: 'A-Xx', foliooffset: '2', beschreibung: 'long', nested: { a: 1 }, empty: '' }),
            file('P/A/d/data.json', doc())
        ];
        const { sources } = await read(files);
        expect(sources[0].meta).toMatchObject({ quellensigle: 'A', cantus_siglum: 'A-Xx', foliooffset: '2' });
        expect(sources[0].meta.beschreibung).toBeUndefined();
        expect(sources[0].meta.nested).toBeUndefined();
        expect(sources[0].meta.empty).toBeUndefined();
    });

    it('flattens the custom fields Monodi-Zero keeps', async () => {
        const ws = { sources: [{ id: 's', quellensigle: 'W 1', custom: { jahrhundert: '12.', foliooffset: '1' } }], documents: [{ id: 'd', quelle_id: 's', dokumenten_id: 'W 1-1r-1', foliostart: '1r' }], notes: { d: doc() } };
        const { sources } = await read([file('w.monodijson', ws)]);
        expect(sources[0].meta).toMatchObject({ jahrhundert: '12.', foliooffset: '1' });
        expect(sources[0].meta.custom).toBeUndefined();
    });

    it('collects the page images the documents name, working copies included', async () => {
        const files = [
            file('P/N/meta.json', { quellensigle: 'N' }),
            file('P/N/a/meta.json', { dokumenten_id: 'N-1', foliostart: '0019', additionalData: { iiifs: `["${W}0019.jpg"]` } }),
            file('P/N/a/data.json', doc()),
            // a working copy: skipped for the neumes, but its images count
            file('P/N/b/meta.json', { dokumenten_id: 'N-2TR', foliostart: '0054v', additionalData: { iiifs: `["${W}0054v.jpg","${W}0055.jpg"]` } }),
            file('P/N/b/data.json', doc())
        ];
        const { sources } = await read(files);
        expect(sources[0].documents).toHaveLength(1);
        expect(sources[0].images).toEqual([['19r', `${W}0019.jpg`], ['54v', `${W}0054v.jpg`], ['55r', `${W}0055.jpg`]]);
    });

    it('reads the images of a workspace document', async () => {
        const ws = { sources: [{ id: 's', quellensigle: 'W 2' }], documents: [{ id: 'd', quelle_id: 's', dokumenten_id: 'W 2-1', foliostart: '3v', custom: { iiifs: '[\\"https://x.org/iiif/p3v/full/full/0/default.jpg\\"]' } }], notes: { d: doc() } };
        const { sources } = await read([file('w.monodijson', ws)]);
        expect(sources[0].images).toEqual([['3v', 'https://x.org/iiif/p3v']]);
    });

    it('keeps the first image when two documents name the same folio', async () => {
        const files = [
            file('P/D/meta.json', { quellensigle: 'D' }),
            file('P/D/a/meta.json', { dokumenten_id: 'D-1', foliostart: '5r', additionalData: { iiifs: '["https://x/one"]' } }),
            file('P/D/a/data.json', doc()),
            file('P/D/b/meta.json', { dokumenten_id: 'D-2', foliostart: '5r', additionalData: { iiifs: '["https://x/two"]' } }),
            file('P/D/b/data.json', doc())
        ];
        const { sources } = await read(files);
        expect(sources[0].images).toHaveLength(1);
    });
});

describe('a Monodi-Zero workspace (.monodijson)', () => {
    const workspace = () => ({
        schemaVersion: 1,
        sources: [
            { id: 'uuid-a', quellensigle: 'Xx 1', herkunftsort: 'Köln', datierung: '13' },
            { id: 'uuid-b', quellensigle: 'Yy 2' }
        ],
        documents: [
            { id: 'd2', quelle_id: 'uuid-a', dokumenten_id: 'Xx 1-5r-1', foliostart: '5r', zeilenstart: '1' },
            { id: 'd1', quelle_id: 'uuid-a', dokumenten_id: 'Xx 1-2r-1', foliostart: '2r', zeilenstart: '1' },
            { id: 'd3', quelle_id: 'uuid-b', dokumenten_id: 'Yy 2-1r-1GS', foliostart: '1r' },
            { id: 'd4', quelle_id: 'unknown', dokumenten_id: 'Zz-1r-1', foliostart: '1r' }
        ],
        notes: { d1: doc(), d2: doc(), d3: doc(), d4: doc() }
    });

    it('names sources by their siglum, not their uuid', async () => {
        const { sources } = await read([file('backup.monodijson', workspace())]);
        expect(sources.map(s => s.name).sort()).toEqual(['Xx 1', 'unknown']);
    });

    it('reads the documents of each source in reading order', async () => {
        const { sources } = await read([file('backup.monodijson', workspace())]);
        const xx = sources.find(s => s.name === 'Xx 1');
        expect(xx.documents.map(d => d.dokumenten_id)).toEqual(['Xx 1-2r-1', 'Xx 1-5r-1']);
        expect(xx.meta).toMatchObject({ herkunftsort: 'Köln' });
        expect(xx.counts).toEqual({ '*u': 2, '*': 2 });
    });

    it('leaves out a source whose only documents are working copies, and says so', async () => {
        const { sources, summary } = await read([file('backup.monodijson', workspace())]);
        expect(sources.find(s => s.name === 'Yy 2')).toBeUndefined();
        expect(summary.emptySources).toEqual(['Yy 2']);
        expect(summary.skipped).toBe(1);
    });

    it('files documents of an unknown source under that name', async () => {
        const { sources } = await read([file('backup.monodijson', workspace())]);
        expect(sources.find(s => s.name === 'unknown').documents).toHaveLength(1);
    });

    it('reads a bundle of a single source', async () => {
        const bundle = { source: { id: 's', quellensigle: 'Solo 1' }, documents: [{ id: 'd', quelle_id: 's', dokumenten_id: 'Solo 1-1r-1', foliostart: '1r' }], notes: { d: doc() } };
        const { sources } = await read([file('solo.json', bundle)]);
        expect(sources.map(s => s.name)).toEqual(['Solo 1']);
    });

    it('rejects JSON that is neither', async () => {
        const { sources, summary } = await read([file('other.json', { a: 1 })]);
        expect(sources).toHaveLength(0);
        expect(summary.warnings[0]).toMatch(/not a Monodi workspace/);
    });

    it('reads a lone transcription, named after its file', async () => {
        const { sources } = await read([file('Chant 7.json', doc())]);
        expect(sources.map(s => s.name)).toEqual(['Chant 7']);
    });

    it('explains when there is nothing to read', async () => {
        const { summary } = await read([file('photo.png', 'x')]);
        expect(summary.warnings[0]).toMatch(/No transcriptions found/);
    });
});

describe('ZIP archives', () => {
    async function zipOf(files) {
        const zip = new JSZip();
        for (const f of files) zip.file(f.path, await f.text());
        const bytes = await zip.generateAsync({ type: 'uint8array' });
        return { path: 'project.zip', text: async () => '', bytes: async () => bytes };
    }

    it('reads a project from a ZIP', async () => {
        const { sources, summary } = await read([await zipOf(projectFiles())]);
        expect(sources.map(s => s.name)).toEqual(['Aa 1', 'Bb 2']);
        expect(summary.documents).toBe(3);
    });

    it('reads a workspace inside a ZIP', async () => {
        const inner = file('x/backup.monodijson', { sources: [{ id: 's', quellensigle: 'Zipped 1' }], documents: [{ id: 'd', quelle_id: 's', dokumenten_id: 'Z-1r-1', foliostart: '1r' }], notes: { d: doc() } });
        const { sources } = await read([await zipOf([inner])]);
        expect(sources.map(s => s.name)).toEqual(['Zipped 1']);
    });

    it('reads a ZIP inside a ZIP', async () => {
        const inner = await zipOf(projectFiles());
        const outer = new JSZip();
        outer.file('inner.zip', await inner.bytes());
        const bytes = await outer.generateAsync({ type: 'uint8array' });
        const { sources } = await read([{ path: 'outer.zip', text: async () => '', bytes: async () => bytes }]);
        expect(sources).toHaveLength(2);
    });
});

describe('toCorpusFile', () => {
    it('prefers the given path, then the relative path, then the name', () => {
        const f = { name: 'data.json', webkitRelativePath: 'Proj/Aa 1/u/data.json', size: 3, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
        expect(toCorpusFile(f).path).toBe('Proj/Aa 1/u/data.json');
        expect(toCorpusFile(f, 'x\\y.json').path).toBe('x/y.json');
        expect(toCorpusFile({ name: 'a.json' }).path).toBe('a.json');
    });
});

describe('compareDocuments', () => {
    it('orders by folio, then line, then id', () => {
        const docs = [
            { dokumenten_id: 'c', foliostart: '10r', zeilenstart: '1' },
            { dokumenten_id: 'b', foliostart: '2v', zeilenstart: '9' },
            { dokumenten_id: 'a', foliostart: '2v', zeilenstart: '3' },
            { dokumenten_id: 'd', foliostart: '2r', zeilenstart: '12' }
        ];
        expect([...docs].sort(compareDocuments).map(d => d.dokumenten_id)).toEqual(['d', 'a', 'b', 'c']);
    });
});

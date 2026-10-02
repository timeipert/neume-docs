#!/usr/bin/env node
/**
 * Splits a full Corpus Monodicum export (one ZIP, `source/meta.json`,
 * `source/document/{meta,data}.json`) into smaller example sets that load
 * quickly into the editor, one per region of origin, plus a tiny starter set.
 *
 *   node --max-old-space-size=8192 scripts/split-corpus.mjs --zip ../export.zip --out ../examples
 *
 * Options
 *   --zip <file>          the full export (required)
 *   --out <dir>           where the example sets go (default ../examples)
 *   --starter-max-mb <n>  largest source (uncompressed data) the starter set may use (default 3)
 *
 * A source goes where its own `herkunftsregion` says. Sources that record no
 * region stay together in `region-not-recorded` — nothing is guessed from a
 * place name or a shelfmark.
 *
 * Every set is written as a ZIP in the project layout the editor reads. The
 * starter set is also written as a Monodi-Zero workspace (`.monodijson`), so
 * both ways of loading can be tried. Afterwards each file is read back through
 * the editor's own reader, and what it contains is written to `README.md`.
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { readCorpus } from '../src/services/corpus/corpusReader.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? fallback : args[i + 1];
};

const zipPath = opt('zip');
if (!zipPath) {
    console.error('Usage: node scripts/split-corpus.mjs --zip <export.zip> [--out <dir>] [--starter-max-mb <n>]');
    process.exit(2);
}
const outDir = resolve(opt('out', join(here, '..', '..', 'examples')));
const starterMaxBytes = Number(opt('starter-max-mb', '3')) * 1e6;

/**
 * The sets. `regions` are the values of `herkunftsregion` in the CM metadata;
 * the CM writes some regions in German and some in English, and spells a few
 * of them more than one way, so a set may take several.
 */
const SETS = [
    { id: 'german-origin', title: 'German origin', regions: ['Quellen deutscher Herkunft', 'Germany - southwest - Swabia?'] },
    { id: 'french-origin', title: 'French origin', regions: ['Quellen französischer Herkunft'] },
    { id: 'italian-origin', title: 'Italian origin', regions: ['Quellen italienischer Herkunft'] },
    { id: 'aquitanian-origin', title: 'Aquitanian origin', regions: ['Quellen aquitanischer Herkunft'] },
    { id: 'english-origin', title: 'English origin', regions: ['Quellen englischer Herkunft', 'England', 'England - south'] },
    { id: 'norman-origin', title: 'Norman and Norman-Sicilian origin', regions: ['Quellen normannischer Herkunft', 'Quellen normanno-sizilischer Herkunft'] },
    { id: 'spanish-origin', title: 'Spanish origin', regions: ['Quellen spanischer Herkunft', 'Spain'] },
    { id: 'bohemia-moravia', title: 'Bohemia and Moravia', regions: ['Bohemia - Moravia'] },
    { id: 'religious-orders', title: 'Religious orders', regions: ['Quellen aus Ordenstraditionen'] },
    { id: 'other-regions', title: 'Other regions (Austria, Switzerland, Netherlands, Italy or south France)', regions: ['Austria', 'Switzerland', 'Netherlands', 'Italy or France - south'] },
    { id: 'region-not-recorded', title: 'No region recorded in the CM metadata', regions: [''] }
];

/** The starter set takes the smallest qualifying sources of these sets. */
const STARTER_FROM = ['german-origin', 'french-origin', 'italian-origin', 'english-origin', 'norman-origin'];
const STARTER_PER_SET = 2;
const STARTER_MIN_DOCS = 8;
const STARTER_MIN_BYTES = 200_000;

const fmtMB = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;

console.log(`Reading ${zipPath} …`);
const zip = await JSZip.loadAsync(readFileSync(zipPath));

// ---- index the sources ------------------------------------------------------
const sources = new Map(); // dir -> { dir, meta, files: [path], dataBytes, docs, workingCopies }
const entries = [];
zip.forEach((path, entry) => {
    if (entry.dir || path.startsWith('__MACOSX/') || path.split('/').some(s => s.startsWith('.'))) return;
    entries.push([path, entry]);
});

for (const [path, entry] of entries) {
    const parts = path.split('/');
    if (parts.length === 2 && parts[1] === 'meta.json') {
        sources.set(parts[0], { dir: parts[0], meta: JSON.parse(await entry.async('string')), files: [], dataBytes: 0, docs: 0, workingCopies: 0 });
    }
}
for (const [path, entry] of entries) {
    const dir = path.split('/')[0];
    const src = sources.get(dir);
    if (!src) continue;
    src.files.push(path);
    const parts = path.split('/');
    if (parts.length === 3 && parts[2] === 'data.json') {
        src.docs++;
        src.dataBytes += entry._data.uncompressedSize || 0;
    } else if (parts.length === 3 && parts[2] === 'meta.json') {
        const id = JSON.parse(await entry.async('string')).dokumenten_id || '';
        if (id.endsWith('TR') || id.endsWith('GS')) src.workingCopies++;
    }
}
console.log(`${sources.size} sources, ${entries.length} files`);

// ---- assign every source to exactly one set ---------------------------------
const setOf = new Map();
for (const set of SETS) for (const r of set.regions) setOf.set(r, set);
const members = new Map(SETS.map(s => [s.id, []]));
const unassigned = [];
for (const src of sources.values()) {
    const region = src.meta.herkunftsregion || '';
    const set = setOf.get(region);
    if (set) members.get(set.id).push(src);
    else unassigned.push([src.dir, region]);
}
if (unassigned.length) {
    console.error('Sources whose region no set covers — add it to SETS:');
    for (const [dir, region] of unassigned) console.error(`  ${dir}: ${JSON.stringify(region)}`);
    process.exit(1);
}

// ---- writing ------------------------------------------------------------------
mkdirSync(outDir, { recursive: true });

async function writeZip(file, list) {
    const out = new JSZip();
    for (const src of list) {
        for (const path of src.files) {
            out.file(path, await zip.file(path).async('uint8array'));
        }
        out.file(`${src.dir}/meta.json`, JSON.stringify(src.meta, null, 2));
    }
    const buffer = await out.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    writeFileSync(join(outDir, file), buffer);
    return buffer.length;
}

const written = [];

for (const set of SETS) {
    const list = members.get(set.id).sort((a, b) => a.dir.localeCompare(b.dir, undefined, { numeric: true }));
    if (list.length === 0) continue;
    const file = `${set.id}.zip`;
    const bytes = await writeZip(file, list);
    written.push({ id: set.id, title: set.title, file, bytes, sources: list.map(s => s.dir), regions: set.regions, kind: 'region' });
    console.log(`${file.padEnd(28)} ${String(list.length).padStart(3)} sources  ${fmtMB(bytes)}`);
}

// ---- the starter set -------------------------------------------------------------
const starter = [];
for (const id of STARTER_FROM) {
    const picks = members.get(id)
        .filter(s => s.docs - s.workingCopies >= STARTER_MIN_DOCS && s.dataBytes >= STARTER_MIN_BYTES && s.dataBytes <= starterMaxBytes)
        .sort((a, b) => a.dataBytes - b.dataBytes)
        .slice(0, STARTER_PER_SET);
    starter.push(...picks);
}
starter.sort((a, b) => a.dir.localeCompare(b.dir, undefined, { numeric: true }));

const starterBytes = await writeZip('starter-sample.zip', starter);
written.unshift({
    id: 'starter-sample', title: 'Starter sample: a few small sources from different regions',
    file: 'starter-sample.zip', bytes: starterBytes, sources: starter.map(s => s.dir), regions: [], kind: 'starter'
});
console.log(`${'starter-sample.zip'.padEnd(28)} ${String(starter.length).padStart(3)} sources  ${fmtMB(starterBytes)}`);

// The same sources as a Monodi-Zero workspace
const workspace = { schemaVersion: 1, sources: [], documents: [], notes: {} };
for (const src of starter) {
    workspace.sources.push({
        id: src.dir,
        quellensigle: src.meta.quellensigle || src.dir,
        herkunftsregion: src.meta.herkunftsregion || '',
        herkunftsort: src.meta.herkunftsort || '',
        herkunftsinstitution: src.meta.herkunftsinstitution || '',
        ordenstradition: src.meta.ordenstradition || '',
        quellentyp: src.meta.quellentyp || '',
        bibliotheksort: src.meta.bibliotheksort || '',
        bibliothek: src.meta.bibliothek || '',
        bibliothekssignatur: src.meta.bibliothekssignatur || '',
        kommentar: src.meta.kommentar || '',
        datierung: src.meta.datierung || '',
        ...(src.meta.manifest ? { iiifManifestUrl: src.meta.manifest } : {})
    });
    for (const path of src.files) {
        const parts = path.split('/');
        if (parts.length !== 3 || parts[2] !== 'meta.json') continue;
        const docDir = `${parts[0]}/${parts[1]}`;
        const meta = JSON.parse(await zip.file(path).async('string'));
        const dataFile = zip.file(`${docDir}/data.json`);
        if (!dataFile) continue;
        const { additionalData, ...rest } = meta;
        workspace.documents.push({ ...rest, quelle_id: src.dir, custom: additionalData || {} });
        workspace.notes[meta.id || parts[1]] = JSON.parse(await dataFile.async('string'));
    }
}
writeFileSync(join(outDir, 'starter-sample.monodijson'), JSON.stringify(workspace));
const workspaceBytes = statSync(join(outDir, 'starter-sample.monodijson')).size;
written.splice(1, 0, {
    id: 'starter-sample-workspace', title: 'The same starter sample as a Monodi-Zero workspace',
    file: 'starter-sample.monodijson', bytes: workspaceBytes, sources: starter.map(s => s.dir), regions: [], kind: 'workspace'
});
console.log(`${'starter-sample.monodijson'.padEnd(28)} ${String(starter.length).padStart(3)} sources  ${fmtMB(workspaceBytes)}`);

// ---- read every file back through the editor's own reader ---------------------
console.log('\nChecking each file with the editor\'s reader …');
for (const item of written) {
    const buffer = readFileSync(join(outDir, item.file));
    const file = item.file.endsWith('.zip')
        ? { path: item.file, text: async () => '', bytes: async () => buffer }
        : { path: item.file, text: async () => buffer.toString('utf8') };
    let neumes = 0;
    let documents = 0;
    let loaded = 0;
    const summary = await readCorpus([file], {
        onSource: async (r) => {
            loaded++;
            documents += r.documents.length;
            neumes += Object.values(r.counts).reduce((a, b) => a + b, 0);
        }
    });
    Object.assign(item, { loadedSources: loaded, documents, neumes, skippedWorkingCopies: summary.skipped, emptySources: summary.emptySources, warnings: summary.warnings.length });
    console.log(`${item.file.padEnd(28)} loads ${String(loaded).padStart(3)} sources, ${String(documents).padStart(5)} documents, ${String(neumes).padStart(8)} neumes${summary.warnings.length ? `  (${summary.warnings.length} warnings)` : ''}`);
}

// ---- manifest and README ----------------------------------------------------------
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(written, null, 2));

const rows = written.map(w => {
    const kind = { starter: '**start here**', workspace: '', region: '' }[w.kind];
    return `| \`${w.file}\` | ${w.title}${kind ? ` — ${kind}` : ''} | ${w.loadedSources} | ${w.documents.toLocaleString('en-US')} | ${w.neumes.toLocaleString('en-US')} | ${fmtMB(w.bytes)} |`;
});
const onlyWorkingCopies = written.filter(w => w.kind === 'region').flatMap(w => w.emptySources || []).length;
const withoutDocuments = [...sources.values()].filter(s => s.docs === 0).length;
const notLoaded = onlyWorkingCopies + withoutDocuments;

writeFileSync(join(outDir, 'README.md'), `# Example sets

Smaller pieces of the Corpus Monodicum, to try the editor on. Load any of them on the **Corpus** page
(*Choose files…* or drag and drop). The ZIP files are in the project layout
(\`source/meta.json\`, \`source/document/meta.json\`, \`source/document/data.json\`); the \`.monodijson\` file is a
Monodi-Zero workspace, to try that way of loading too.

| File | Contents | Sources | Documents | Neumes | Size |
| --- | --- | ---: | ---: | ---: | ---: |
${rows.join('\n')}

"Sources" and "Documents" are what the editor loads: documents whose ID ends in \`TR\` or \`GS\` are working
copies and are left out unless you untick that option on the Corpus page.${notLoaded ? ` ${notLoaded} of the ${sources.size} sources are not loaded at all: ${withoutDocuments} have no transcriptions in this export and ${onlyWorkingCopies} hold nothing but working copies.` : ''}

## How the sets were made

Each source goes where its own \`herkunftsregion\` in the CM metadata says. The CM writes some regions in German and
some in English, and spells a few of them in more than one way, so some sets combine several values:

${written.filter(w => w.kind === 'region').map(w => `- **${w.title}** — ${w.regions.map(r => r === '' ? '*(empty)*' : `“${r}”`).join(', ')}`).join('\n')}

Nothing is guessed from a place name or a shelfmark: the ${written.find(w => w.id === 'region-not-recorded')?.sources.length ?? 0} sources
without a recorded region stay together in \`region-not-recorded.zip\`.

The starter sample takes the two smallest suitable sources (at least ${STARTER_MIN_DOCS} documents, between
${STARTER_MIN_BYTES / 1000} kB and ${starterMaxBytes / 1e6} MB of transcription) from each of the German, French, Italian, English and
Norman sets.

Regenerate them from a full export with

\`\`\`bash
cd ui
node --max-old-space-size=8192 scripts/split-corpus.mjs --zip ../export.zip --out ../examples
\`\`\`

The ZIP and \`.monodijson\` files are not tracked by git.
`);
console.log(`\nWrote ${written.length} files and README.md to ${outDir}`);

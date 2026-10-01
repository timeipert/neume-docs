#!/usr/bin/env node
/**
 * Regenerates src/data/cmReference.json: how often every pattern code occurs in
 * the Corpus Monodicum.
 *
 * The neume table orders its columns "by tones, then by frequency in the CM".
 * That frequency has to mean the CM as a whole — not whatever happens to be
 * loaded — so the app carries this snapshot. It holds counts only, no
 * transcriptions.
 *
 *   node scripts/build-cm-reference.mjs <path to a Corpus Monodicum project folder>
 *
 * Re-run it when the corpus has grown noticeably.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCorpus } from '../src/services/corpus/corpusReader.js';

const root = process.argv[2];
if (!root) {
    console.error('Usage: node scripts/build-cm-reference.mjs <Corpus Monodicum project folder>');
    process.exit(1);
}

function collect(dir, rel, out) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const abs = join(dir, entry.name);
        const path = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) collect(abs, path, out);
        else if (entry.name.endsWith('.json')) out.push({ path, text: async () => readFileSync(abs, 'utf8') });
    }
    return out;
}

const files = collect(root, '', []);
const patterns = {};
let neumes = 0;

const summary = await readCorpus(files, {
    onSource: async (result) => {
        for (const [code, n] of Object.entries(result.counts)) {
            patterns[code] = (patterns[code] || 0) + n;
            neumes += n;
        }
    }
});

// Most frequent first, so the file reads sensibly and diffs stay small.
const sorted = Object.fromEntries(Object.entries(patterns).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));

const uiDir = dirname(dirname(fileURLToPath(import.meta.url)));
const out = {
    generatedAt: new Date().toISOString().slice(0, 10),
    sources: summary.sources,
    documents: summary.documents,
    neumes,
    patterns: sorted
};
writeFileSync(join(uiDir, 'src', 'data', 'cmReference.json'), JSON.stringify(out) + '\n');
console.log(`${summary.sources} sources, ${summary.documents} documents, ${neumes} neumes, ${Object.keys(sorted).length} distinct patterns`);
if (summary.warnings.length) console.warn(`${summary.warnings.length} warnings, first: ${summary.warnings[0]}`);

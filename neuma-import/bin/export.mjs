#!/usr/bin/env node
/**
 * Writes the documentation neume-docs can read: the snippets that were looked at, by pattern.
 *
 *   node bin/export.mjs                    # ./data/documentation/ — only what was accepted or corrected
 *   node bin/export.mjs --include proposed # also what is only proposed (to see how it will look)
 *   node bin/export.mjs --out ../my-docs-repo
 *
 * The result is a folder to commit to a GitHub repository, or to open in the viewer
 * (`#/docs/` + the address of the folder).
 */
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { writeDocumentation } from '../src/export.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i === -1 ? fallback : args[i + 1]; };

const dir = resolve(opt('data', join(HERE, '..', 'data')));
const out = resolve(opt('out', join(dir, 'documentation')));
const include = opt('include', 'reviewed');
if (!['reviewed', 'proposed'].includes(include)) { console.error('--include is "reviewed" or "proposed"'); process.exit(2); }

// The virga is drawn as a note; its glyph is the app's, if this folder sits in the app's repository.
const glyphs = join(HERE, '..', '..', 'ui', 'src', 'data', 'glyphs.js');
const result = await writeDocumentation({ dir, out, include, glyphsFile: existsSync(glyphs) ? pathToFileURL(glyphs).href : '', log: console.log });
const c = result.counts;
console.log(`${c.reviewed} reviewed, ${c.proposed} proposed, ${c.left} not yet looked at, ${c.discarded} discarded`);
if (c.stale) console.log(`${c.stale} decisions were made about snippets that have moved since (the catalogue was split again) and were not used`);

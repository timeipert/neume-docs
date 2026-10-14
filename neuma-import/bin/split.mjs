#!/usr/bin/env node
/**
 * Takes the pictures of the overview apart: every snippet becomes a picture of its own.
 *
 *   node bin/split.mjs              # reads ./data/raw (made by bin/crawl.mjs), writes ./data/snippets…
 *   node bin/split.mjs --out ./data
 *
 * Writes catalogue.json, snippets.json, problems.json and snippets/<source>/<cell>-<n>.png.
 * Cutting is lossless: the pixels of a snippet are those of the catalogue's picture.
 */
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalogue } from '../src/catalogue.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const i = args.indexOf('--out');
const dir = resolve(i === -1 ? join(HERE, '..', 'data') : args[i + 1]);
buildCatalogue({ dir });

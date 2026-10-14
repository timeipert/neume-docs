#!/usr/bin/env node
/**
 * Collects the Hungarian Neume Catalogue overview (https://neuma.zti.hu/en_attekinto.asp).
 *
 *   node bin/crawl.mjs                 # the page, the text of every source, every picture (≈ 3,200 files)
 *   node bin/crawl.mjs --limit 5       # try it with five sources
 *   node bin/crawl.mjs --refresh       # fetch the overview page again (new sources)
 *   node bin/crawl.mjs --out ./data    # where to keep it (default: ./data, which git ignores)
 *
 * It only asks for what is missing, so run it again after an interruption.
 */
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crawl } from '../src/crawl.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i === -1 ? fallback : args[i + 1]; };

const dir = resolve(opt('out', join(HERE, '..', 'data')));
const result = await crawl({ dir, refresh: args.includes('--refresh'), limit: Number(opt('limit', 0)) });
console.log(`done: ${result.fetched} fetched, ${result.failed.length} failed`);
if (result.failed.length) process.exitCode = 1;

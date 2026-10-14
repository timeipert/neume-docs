#!/usr/bin/env node
/**
 * Makes the folder for the website: the data of the review tool, so that it works online.
 *
 *   node bin/publish.mjs                  # ./data → ../ui/public/hung/  (served at …/hung/)
 *   node bin/publish.mjs --out ./site
 *
 * Then commit `ui/public/hung/`: the site's workflow publishes it with the rest.
 */
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishSite } from '../src/publish.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i === -1 ? fallback : args[i + 1]; };

publishSite({
    dir: resolve(opt('data', join(HERE, '..', 'data'))),
    out: resolve(opt('out', join(HERE, '..', '..', 'ui', 'public', 'hung'))),
    log: console.log
});

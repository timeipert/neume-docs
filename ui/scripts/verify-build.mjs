#!/usr/bin/env node
/**
 * Post-build check for the site in ../dist: the bundle must be there, and
 * everything shipped from ui/public/ must have made it across.
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const uiDir = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(uiDir, 'public');
const outDir = join(uiDir, '..', 'dist');

const problems = [];

/** Every file under `dir`, as paths relative to it. */
function filesUnder(dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...filesUnder(full).map(p => join(entry.name, p)));
        else out.push(entry.name);
    }
    return out;
}

if (!existsSync(outDir)) {
    problems.push(`Build output ${outDir} does not exist.`);
} else {
    const indexHtml = join(outDir, 'index.html');
    if (!existsSync(indexHtml)) {
        problems.push('dist/index.html is missing.');
    } else if (!/src="[^"]*assets\/[^"]+\.js"/.test(readFileSync(indexHtml, 'utf8'))) {
        problems.push('dist/index.html does not reference a built assets/ bundle.');
    }

    if (existsSync(publicDir)) {
        const missing = filesUnder(publicDir).filter(rel => !existsSync(join(outDir, rel)));
        if (missing.length) {
            const shown = missing.slice(0, 10).map(m => `      ${m}`).join('\n');
            problems.push(
                `${missing.length} file(s) from ui/public/ are missing in dist/:\n${shown}` +
                (missing.length > 10 ? `\n      … and ${missing.length - 10} more` : '')
            );
        }
    }
}

if (problems.length) {
    console.error('\n✗ Build verification failed:\n');
    for (const p of problems) console.error(`  • ${p}`);
    console.error('');
    process.exit(1);
}

const count = existsSync(publicDir) ? filesUnder(publicDir).length : 0;
console.log(`✓ Build verified: dist/ has index.html, an assets bundle, and all ${count} file(s) from ui/public/.`);

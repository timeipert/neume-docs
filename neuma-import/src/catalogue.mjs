/**
 * Makes the catalogue's data out of what the crawl collected: the sources with their text, and every
 * snippet of every cell cut out as a picture of its own, with a first proposal of what it is.
 *
 *   data/catalogue.json   where it comes from, the columns, the sources (text and cells)
 *   data/snippets.json    one entry per snippet: its picture, its place, its proposal
 *   data/snippets/<source>/<cell>-<n>.png   the pictures
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { COLUMNS, COLUMN_BY_KEY, proposeFromColumn } from './columns.mjs';
import { readSources } from './crawl.mjs';
import { ORIGIN } from './origin.mjs';
import { decodePng, encodePng, findSnippets, cutOut, describeSnippet, hasInk, isJunk } from './split.mjs';

export const FORMAT = 'neuma-import';
export const VERSION = 1;

/** What the flags of a cut (see `cutFlags`) say, for people. */
export const FLAG_TEXT = {
    tiny: 'very small: a fragment of a snippet, or dust',
    thin: 'much longer than wide: a fragment, or two snippets cut as one',
    parts: 'a white band runs through it: two snippets cut as one?'
};

/** An ink that is much taller than wide is a stroke; wide, it is a body. */
const TALL_STROKE = 1.7;

/**
 * The first proposal for one snippet: what its column says, and for the punctum column — which does not
 * tell a punctum from a virga — what its shape says.
 */
export function proposeSnippet(column, look) {
    const proposal = proposeFromColumn(column);
    if (column && column.key === 'a' && look && look.ink) {
        const ratio = look.ink.h / Math.max(1, look.ink.w);
        if (ratio >= TALL_STROKE) {
            return { ...proposal, code: '*V', alternatives: ['*'], confidence: 'low', reason: 'a tall stroke in the punctum column: probably a virga' };
        }
    }
    return proposal;
}

/**
 * Cuts out every snippet and writes the catalogue.
 *
 * @param {object} options
 * @param {string} options.dir
 * @param {string} [options.generated] YYYY-MM-DD
 * @param {(msg: string) => void} [options.log]
 */
export function buildCatalogue({ dir, generated = new Date().toISOString().slice(0, 10), log = console.log }) {
    const sources = readSources(dir);
    const out = join(dir, 'snippets');
    rmSync(out, { recursive: true, force: true });

    const catalogue = [];
    const snippets = [];
    const problems = [];

    for (const s of sources) {
        const cells = {};
        for (const column of COLUMNS) {
            const path = s.images[column.key];
            if (!path) continue;
            const file = join(dir, 'raw', 'composite', path.split('/').pop());
            if (!existsSync(file)) { problems.push({ source: s.id, column: column.key, problem: 'picture was not fetched' }); continue; }

            const image = decodePng(readFileSync(file));
            // lines and strips of the picture (staff lines, rulings) and pale smudges with no ink are not snippets
            const boxes = [];
            for (const box of findSnippets(image)) {
                if (isJunk(box)) problems.push({ source: s.id, column: column.key, problem: `left out: a ${box.w}×${box.h} px strip at ${box.x},${box.y} is no snippet` });
                else if (!hasInk(cutOut(image, box))) problems.push({ source: s.id, column: column.key, problem: `left out: the ${box.w}×${box.h} px piece at ${box.x},${box.y} has no ink in it` });
                else boxes.push(box);
            }
            cells[column.key] = { image: `raw/composite/${path.split('/').pop()}`, width: image.width, height: image.height, snippets: boxes.length };

            boxes.forEach((box, n) => {
                const cut = cutOut(image, box);
                const look = describeSnippet(cut);
                const id = `${s.id}${column.key}-${n + 1}`;
                const rel = `snippets/${s.id}/${column.key}-${n + 1}.png`;
                mkdirSync(join(dir, 'snippets', s.id), { recursive: true });
                writeFileSync(join(dir, rel), encodePng(cut));
                if (look.flags.length) problems.push({ source: s.id, column: column.key, snippet: id, problem: look.flags.map(f => FLAG_TEXT[f]).join('; ') });
                snippets.push({
                    id, source: s.id, column: column.key, index: n + 1, count: boxes.length,
                    file: rel, width: cut.width, height: cut.height,
                    box: { x: box.x, y: box.y, w: box.w, h: box.h },
                    sig: `${box.x},${box.y},${box.w},${box.h}`,
                    fill: Math.round(look.fill * 1000) / 1000,
                    flags: look.flags,
                    ink: look.ink ? { ...look.ink, share: Math.round(look.ink.share * 1000) / 1000 } : null,
                    suggestion: proposeSnippet(column, look)
                });
            });
        }
        const f = s.detail.fields;
        catalogue.push({
            id: s.id, siglum: s.siglum, type: f.type || s.type, description: s.description || s.detail.description,
            collection: f.collection || '', date: f.date || '', rism: f.rism || '', provenance: f.provenance || '',
            notation: f.notation || '', numerus: f.numerus || '', presentation: f.presentation || '', link: f.link || '',
            cells
        });
    }

    writeFileSync(join(dir, 'catalogue.json'), JSON.stringify({
        format: FORMAT, version: VERSION, generated, origin: ORIGIN,
        columns: COLUMNS.map(c => ({ key: c.key, name: c.name, kind: c.kind, codes: c.codes, about: c.about || '' })),
        sources: catalogue
    }, null, 1));
    writeFileSync(join(dir, 'snippets.json'), JSON.stringify(snippets));
    writeFileSync(join(dir, 'problems.json'), JSON.stringify(problems, null, 1));
    log(`${catalogue.length} sources, ${snippets.length} snippets, ${problems.length} to look at (problems.json)`);
    return { sources: catalogue.length, snippets: snippets.length, problems };
}

export { COLUMN_BY_KEY, ORIGIN };

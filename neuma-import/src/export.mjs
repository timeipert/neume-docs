/**
 * Writes a neume-docs documentation to a folder (see `documentation.mjs` for what it is and how it is
 * made): the index, one file for each manuscript, and the snippets' pictures copied from the
 * catalogue's folder.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDocumentation, virgaSign } from './documentation.mjs';

export { buildDocumentation, readableDate, fileSlug, defaultInfo, virgaSign, META_COLUMNS, FORMAT, VERSION } from './documentation.mjs';

/** The glyph of the virga (it is drawn as a note and told apart by its letter), read from the app if it is there. */
export async function readSigns(glyphsFile) {
    try {
        const { GLYPHS } = await import(glyphsFile);
        return virgaSign(GLYPHS && GLYPHS.note);
    } catch {
        return {};
    }
}

/**
 * Writes a documentation folder: the index, one file for each manuscript, and the snippets' pictures
 * copied from the catalogue's folder. The target is made empty first, so nothing of an earlier run stays.
 *
 * @param {object} options
 * @param {string} options.dir   the catalogue's data folder
 * @param {string} options.out   where the documentation goes
 */
export async function writeDocumentation({ dir, out, include = 'reviewed', glyphsFile = '', log = () => {} }) {
    const catalogue = JSON.parse(readFileSync(join(dir, 'catalogue.json'), 'utf8'));
    const snippets = JSON.parse(readFileSync(join(dir, 'snippets.json'), 'utf8'));
    const decisionsFile = join(dir, 'decisions.json');
    const decisions = existsSync(decisionsFile) ? (JSON.parse(readFileSync(decisionsFile, 'utf8')).decisions || {}) : {};
    const infoFile = join(dir, 'info.json');
    const info = existsSync(infoFile) ? JSON.parse(readFileSync(infoFile, 'utf8')) : {};
    const signs = glyphsFile ? await readSigns(glyphsFile) : {};

    const doc = buildDocumentation({ catalogue, snippets, decisions, include, info, signs });
    rmSync(out, { recursive: true, force: true });
    mkdirSync(join(out, 'data'), { recursive: true });
    writeFileSync(join(out, 'neume-docs.json'), JSON.stringify(doc.index, null, 2));
    for (const entry of doc.index.manuscripts) writeFileSync(join(out, entry.file), JSON.stringify(doc.manuscripts[entry.id], null, 2));
    for (const image of doc.images) {
        const to = join(out, image.to);
        mkdirSync(join(to, '..'), { recursive: true });
        copyFileSync(join(dir, image.from), to);
    }
    log(`${doc.index.manuscripts.length} manuscripts, ${doc.images.length} snippets → ${out}`);
    return { manuscripts: doc.index.manuscripts.length, snippets: doc.images.length, counts: doc.counts };
}

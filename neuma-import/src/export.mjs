/**
 * Makes a neume-docs documentation out of the catalogue and the decisions made about its snippets.
 *
 * A documentation is plain files that can sit in a GitHub repository (see `ui/src/utils/documentation.js`
 * in the app, which reads them and is the format's authority):
 *
 *   neume-docs.json          who made it, the metadata columns, the list of manuscripts
 *   data/<source>.json       one manuscript: its pattern table and its snippets
 *   images/<source>/<id>.png the snippets' pictures
 *
 * Every source of the catalogue is one manuscript, documented from images (a "collection"). Only
 * snippets that were looked at are in it: a snippet counts when somebody accepted or corrected what it
 * is (see decisions.json). `include: 'proposed'` also takes what is merely proposed, for looking at the
 * result before the work is done.
 *
 * Plain functions over plain data; `writeDocumentation` is the only part that touches files.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { COLUMN_BY_KEY } from './columns.mjs';

export const FORMAT = 'neume-docs';
export const VERSION = 1;

/** The catalogue's text fields as the documentation's metadata columns. */
export const META_COLUMNS = [
    { key: 'type', label: 'Type of source', type: 'text', filter: 'values' },
    { key: 'collection', label: 'Collection', type: 'text', filter: 'values' },
    { key: 'date', label: 'Date', type: 'century', filter: 'years' },
    { key: 'rism', label: 'RISM', type: 'text', filter: '' },
    { key: 'provenance', label: 'Provenance', type: 'text', filter: 'values' },
    { key: 'notation', label: 'Notation', type: 'text', filter: 'values' },
    { key: 'numerus', label: 'Numerus', type: 'text', filter: '' },
    { key: 'presentation', label: 'Presentation', type: 'text', filter: 'values' }
];

const ORDINAL = ['th', 'st', 'nd', 'rd'];
const century = (n) => `${n}${ORDINAL[(n % 100 - 20) % 10] || ORDINAL[n % 100] || ORDINAL[0]} c.`;

/**
 * A dating of the catalogue in a form the app reads as a range of years (`utils/sourceMeta.js`).
 *
 * The catalogue writes a century (`14`), a part of it (`15/in` beginning, `15/m` middle, `15/ex` end,
 * `14/1` and `14/2` the halves), two centuries (`15/16`), years (`1192–1195`, `cc. 1487`) and now and
 * then Hungarian (`1450 után`: after 1450). What this does not know it leaves as it is.
 */
export function readableDate(raw) {
    const s = String(raw ?? '').trim().replace(/[\u2010-\u2015]/g, '–');
    if (!s) return '';
    let m;
    if ((m = /^(\d{1,2})$/.exec(s))) return century(+m[1]);
    if ((m = /^(\d{1,2})\/(in|m|ex)$/i.exec(s))) return `${century(+m[1])}, ${{ in: 'beginning', m: 'middle', ex: 'end' }[m[2].toLowerCase()]}`;
    if ((m = /^(\d{1,2})\/([12])$/.exec(s))) return `${century(+m[1])}, ${m[2] === '1' ? '1st' : '2nd'} half`;
    if ((m = /^(\d{1,2})\/(\d{1,2})$/.exec(s)) && +m[2] === +m[1] + 1) return `${century(+m[1])}–${century(+m[2])}`;
    if ((m = /^c{1,2}\.\s*(\d{3,4})$/i.exec(s))) return `c. ${m[1]}`;
    if ((m = /^(\d{3,4})\s+után$/i.exec(s))) return `after ${m[1]}`;
    return s;
}

/** A piece of a name that is safe in a file name. */
export const fileSlug = (s) => {
    const slug = String(s ?? '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
    return !slug || /^\.+$/.test(slug) ? 'item' : slug;
};

/** What the documentation says about itself unless `info.json` says otherwise. */
export function defaultInfo(origin, generated) {
    return {
        title: 'Hungarian Neume Catalogue, classified',
        description: `The snippets of the ${origin.name} (${origin.url}), each assigned to a pattern of the neume-docs library. `
            + `The snippets, the sources and everything said about them are the catalogue's: ${origin.authors.join('; ')}. ${origin.note}`,
        authors: [],
        publisher: '',
        license: 'Quoted from the Hungarian Neume Catalogue (Act LXXVI of 1999, §34): cite the catalogue',
        doi: '',
        preferredCitation: `${origin.authors[0].replace(/ \(.*\)$/, '')} et al.: ${origin.name}. ${origin.publisher}. ${origin.url} (accessed ${generated}).`,
        url: origin.url,
        year: generated.slice(0, 4)
    };
}

/**
 * @param {object} input
 * @param {object} input.catalogue   catalogue.json
 * @param {Array<object>} input.snippets   snippets.json
 * @param {Object<string, { code?: string, status?: string }>} input.decisions   decisions.json's `decisions`
 * @param {'reviewed'|'proposed'} [input.include='reviewed']
 * @param {object} [input.info]      overrides of the documentation's own information
 * @param {{ V?: { viewBox: string, d: string } }} [input.signs]  glyphs of the signs the codes use (the virga's)
 * @param {string} [input.generated] YYYY-MM-DD
 * @returns {{ index: object, manuscripts: Object<string, object>, images: Array<{ from: string, to: string }>, counts: object }}
 */
export function buildDocumentation({ catalogue, snippets, decisions = {}, include = 'reviewed', info = {}, signs = {}, generated = new Date().toISOString().slice(0, 10) }) {
    const bySource = new Map();
    for (const s of snippets) {
        if (!bySource.has(s.source)) bySource.set(s.source, []);
        bySource.get(s.source).push(s);
    }

    const counts = { snippets: 0, reviewed: 0, proposed: 0, left: 0, discarded: 0, stale: 0 };
    const manuscripts = {};
    const images = [];
    const list = [];
    const usedSigns = new Set();

    for (const source of catalogue.sources) {
        const rows = new Map();
        const out = [];
        for (const s of bySource.get(source.id) || []) {
            let d = decisions[s.id];
            counts.snippets++;
            // a decision made about another snippet (the split has changed since) is no decision
            if (d && d.sig && s.sig && d.sig !== s.sig) { counts.stale++; d = undefined; }
            if (d && d.status === 'discarded') { counts.discarded++; continue; }
            let code = '';
            if (d && d.code && d.status !== 'later') { code = d.code; counts.reviewed++; }
            else if (include === 'proposed' && s.suggestion && s.suggestion.code) { code = s.suggestion.code; counts.proposed++; }
            else { counts.left++; continue; }

            for (const ch of code) if (/[A-Z]/.test(ch) && !'LOQS'.includes(ch)) usedSigns.add(ch);
            if (!rows.has(code)) rows.set(code, { pattern: code, refId: '', notes: '', tier: '' });
            const column = COLUMN_BY_KEY[s.column];
            const to = `images/${fileSlug(source.id)}/${fileSlug(s.id)}.png`;
            images.push({ from: s.file, to });
            out.push({
                id: s.id, pattern: code, variant: '', refId: s.id, folio: '', line: '', syllable: '',
                caption: `${column ? column.name : s.column}${s.count > 1 ? ` (${s.index} of ${s.count} in the catalogue's cell)` : ''}`,
                image: to, zoom: '', lineId: ''
            });
        }
        if (!out.length) continue;

        manuscripts[source.id] = {
            id: source.id, source: source.siglum, name: source.description || source.type, kind: 'collection',
            notes: `Hungarian Neume Catalogue, source ${source.id}${source.link ? ` — ${source.link}` : ''}.`,
            rows: [...rows.values()], snippets: out, lines: []
        };
        list.push(source);
    }

    list.sort((a, b) => a.siglum.localeCompare(b.siglum, undefined, { numeric: true }));
    const index = {
        format: FORMAT,
        version: VERSION,
        generated,
        info: { ...defaultInfo(catalogue.origin, generated), ...info },
        columns: META_COLUMNS,
        signs: Object.fromEntries([...usedSigns].filter(k => signs[k]).map(k => [k, signs[k]])),
        discriminateSigns: true,
        manuscripts: list.map(source => {
            const meta = {};
            for (const col of META_COLUMNS) {
                const v = col.key === 'date' ? readableDate(source.date) : String(source[col.key] ?? '').trim();
                if (v) meta[col.key] = v;
            }
            const data = manuscripts[source.id];
            return {
                id: source.id, source: source.siglum, name: data.name, kind: 'collection', meta,
                file: `data/${fileSlug(source.id)}.json`, patterns: data.rows.length, snippets: data.snippets.length
            };
        })
    };
    return { index, manuscripts, images, counts };
}

/** The glyph of the virga (it is drawn as a note and told apart by its letter), read from the app if it is there. */
export async function readSigns(glyphsFile) {
    try {
        const { GLYPHS } = await import(glyphsFile);
        if (!GLYPHS || !GLYPHS.note) return {};
        return { V: { viewBox: GLYPHS.note.viewBox, d: GLYPHS.note.d, label: 'Virga', abbrev: 'v' } };
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

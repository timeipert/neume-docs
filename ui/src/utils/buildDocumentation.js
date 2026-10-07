/**
 * Makes a documentation (see utils/documentation) out of what the editor holds: the published
 * manuscripts with their pattern tables and snippets, the published collections of screenshots,
 * and the metadata columns that are to be shown.
 *
 * A plain function over plain data. What needs the app — the address of a crop on a IIIF server,
 * the metadata of a manuscript — is handed in, so the same function serves the preview in the
 * editor and the files that are downloaded.
 */
import { FORMAT, VERSION } from './documentation';
import { describeColumnFilter } from './manuscriptFilter';
import { compareFolios } from './sorting';
import { defaultTier, tierOf } from './neumeTable';
import { signMarker, stripSignKeys } from './signs';
import { linesOf } from './lineSigns';

/** A piece of a name that is safe in a file name. */
export function fileSlug(s) {
    const slug = String(s ?? '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
    // nothing but dots would be a folder up
    return !slug || /^\.+$/.test(slug) ? 'item' : slug;
}

const extensionOf = (dataUrl) => {
    const m = /^data:image\/(png|jpe?g|webp|gif);base64,/i.exec(String(dataUrl));
    return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
};

/** The part of a polygon's points ("x,y x,y …", in percent) that holds it, with a little room around. */
function boundingBox(points, padding = 0.02) {
    const pts = String(points || '').split(' ').filter(Boolean)
        .map(p => p.split(',').map(parseFloat)).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    if (!pts.length) return null;
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const padX = Math.max((maxX - minX) * padding, 1);
    const padY = Math.max((maxY - minY) * padding, 1);
    const x = Math.max(0, minX - padX);
    const y = Math.max(0, minY - padY);
    return { x, y, w: Math.min(100 - x, maxX - minX + padX * 2), h: Math.min(100 - y, maxY - minY + padY * 2) };
}

const pct = (b) => `pct:${b.x.toFixed(3)},${b.y.toFixed(3)},${b.w.toFixed(3)},${b.h.toFixed(3)}`;
const round2 = (n) => Math.round(n * 100) / 100;

/** The points of a polygon on a page, as percent of a part of that page (`box`). */
function relativePoints(points, box) {
    return String(points || '').split(' ').filter(Boolean).map(p => p.split(',').map(parseFloat))
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
        .map(([x, y]) => `${round2(((x - box.x) / box.w) * 100)},${round2(((y - box.y) / box.h) * 100)}`).join(' ');
}

function uniqueId(base, taken) {
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    taken.add(id);
    return id;
}

/**
 * @param {object} input
 * @param {object} input.publication      what is said about it (utils/publication)
 * @param {string} input.generated        the day, YYYY-MM-DD
 * @param {Array<{ key: string, label: string, type?: string, numeric?: boolean, said?: object }>} input.columns
 *        the metadata columns to show: `type` is text | century | location | number
 * @param {(source: string, key: string) => string} input.metaOf
 * @param {Array<object>} input.tables         the personal tables ({ source, name, notes, rows, isPublished })
 * @param {Object<string, Array>} input.regions        annotation regions by "Source_Folio"
 * @param {Object<string, Array>} input.regionItems    annotation items by region id
 * @param {Array<object>} input.collections    collections of screenshots ({ source, name, patterns, snippets, lines, isPublished })
 * @param {Array<{ key: string, abbrev?: string }>} [input.customSigns]
 * @param {Object<string, {viewBox: string, d: string}>} [input.signGlyphs]
 * @param {boolean} [input.discriminateSigns]
 * @param {(code: string) => string} [input.globalId]
 * @param {(source: string, folio: string, region: string, width: number) => (string|null)} [input.regionUrl]
 * @param {'inline'|'files'} [input.images]  a screenshot stays in the file as data, or is written to a file of its own
 * @returns {{ index: object, manuscripts: Object<string, object>, files: Array<{ path: string, dataUrl: string }> }}
 */
export function buildDocumentation({
    publication, generated, columns = [], metaOf = () => '', tables = [], regions = {}, regionItems = {}, collections = [],
    customSigns = [], signGlyphs = {}, discriminateSigns = true, globalId = () => '', regionUrl = () => null, images = 'inline'
}) {
    const signKeys = customSigns.map(s => s.key);
    const takenIds = new Set();
    const takenFiles = new Set();
    const manuscripts = {};
    const files = [];
    const list = [];

    const dataFile = (id) => {
        const base = `data/${fileSlug(id)}`;
        let path = `${base}.json`;
        for (let n = 2; takenFiles.has(path.toLowerCase()); n++) path = `${base}-${n}.json`;
        takenFiles.add(path.toLowerCase());
        return path;
    };

    // ---- manuscripts documented on IIIF pages ----
    for (const table of tables) {
        if (!table.isPublished) continue;
        const source = table.source;
        const prefix = `${source}_`;
        const pageKeys = Object.keys(regions).filter(k => k.startsWith(prefix) && (regions[k] || []).length > 0);
        if (!pageKeys.length) continue;

        const rows = (table.rows || []).map(r => ({
            pattern: r.pattern,
            refId: r.customId || globalId(r.pattern) || '',
            notes: r.notes || '',
            tier: tierOf(r)
        }));

        const snippets = [];
        const lines = [];
        for (const key of pageKeys) {
            const folio = key.slice(prefix.length);
            for (const region of regions[key]) {
                const lineItems = [];
                const lineBox = boundingBox(region.points, 0.05);
                for (const item of regionItems[region.id] || []) {
                    if (!item || !item.pattern || !item.points) continue;
                    const pat = String(item.pattern).trim();
                    const base = pat.split(' ')[0];
                    const noSigns = stripSignKeys(base, signKeys);
                    // A code variant has no row of its own: it is called by the row of the code without its signs.
                    const row = rows.find(r => r.pattern === base || r.pattern === pat || r.pattern === noSigns);
                    let refId = (row && row.refId) || globalId(base) || globalId(noSigns) || '-';
                    let variant = item.variant || '';
                    if (!variant && pat.includes(' ')) variant = pat.split(' ')[1];
                    const marker = discriminateSigns ? signMarker(base, customSigns) : '';
                    const display = `${refId}${marker ? `·${marker}` : ''}${variant}`;
                    const box = boundingBox(item.points);
                    snippets.push({
                        id: String(item.id),
                        pattern: base,
                        variant,
                        refId: display,
                        folio,
                        line: region.name || '',
                        image: box ? (regionUrl(source, folio, pct(box), 300) || '') : '',
                        zoom: box ? (regionUrl(source, folio, pct(box), 1200) || '') : '',
                        lineId: lineBox ? String(region.id) : ''
                    });
                    if (lineBox) lineItems.push({ id: String(item.id), points: relativePoints(item.points, lineBox) });
                }
                // The line as one picture, with the polygons of its snippets drawn on it.
                if (lineBox && lineItems.length) {
                    lines.push({ id: String(region.id), folio, name: region.name || '', image: regionUrl(source, folio, pct(lineBox), 1200) || '', items: lineItems });
                }
            }
        }
        snippets.sort((a, b) => compareFolios(a.folio, b.folio) || String(a.line).localeCompare(String(b.line), undefined, { numeric: true }));

        const id = uniqueId(source, takenIds);
        lines.sort((a, b) => compareFolios(a.folio, b.folio) || String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
        manuscripts[id] = { id, source, name: table.name || '', notes: table.notes || '', kind: 'iiif', rows, snippets, lines };
        list.push({ id, source, kind: 'iiif' });
    }

    // ---- manuscripts documented from screenshots ----
    for (const c of collections) {
        if (!c.isPublished) continue;
        const source = c.source;
        const id = uniqueId(source, takenIds);
        const folder = `images/${fileSlug(id)}`;
        const lines = new Map(linesOf(c).map(l => [l.id, l]));

        const rows = (c.patterns || []).map(p => ({
            pattern: p.code, refId: '', notes: p.notes || p.label || '', tier: defaultTier(p.code)
        }));
        const known = new Set(rows.map(r => r.pattern));
        for (const s of c.snippets || []) {
            if (s.pattern && !known.has(s.pattern)) { known.add(s.pattern); rows.push({ pattern: s.pattern, refId: '', notes: '', tier: defaultTier(s.pattern) }); }
        }

        const snippets = [];
        const lineItems = new Map(); // line id -> items on it
        for (const s of c.snippets || []) {
            if (!s.pattern) continue;
            const line = s.lineId ? lines.get(s.lineId) : null;
            const attrs = s.attrs || {};
            const lineAttrs = (line && line.attrs) || {};
            let image = '';
            if (s.image) {
                if (images === 'files') {
                    const path = `${folder}/${fileSlug(s.id)}.${extensionOf(s.image)}`;
                    files.push({ path, dataUrl: s.image });
                    image = path;
                } else image = s.image;
            }
            snippets.push({
                id: String(s.id),
                pattern: s.pattern,
                variant: s.variant || '',
                refId: s.refId || '-',
                folio: lineAttrs.folio || '',
                line: lineAttrs.line || '',
                syllable: attrs.syllable || '',
                caption: s.caption || '',
                image,
                lineId: line ? String(line.id) : ''
            });
            if (line && s.box) {
                if (!lineItems.has(line.id)) lineItems.set(line.id, []);
                lineItems.get(line.id).push({ id: String(s.id), box: s.box });
            }
        }
        const linePictures = [];
        for (const [lineId, items] of lineItems) {
            const l = lines.get(lineId);
            let image = '';
            if (l.image) {
                if (images === 'files') {
                    const path = `${folder}/line-${fileSlug(l.id)}.${extensionOf(l.image)}`;
                    files.push({ path, dataUrl: l.image });
                    image = path;
                } else image = l.image;
            }
            linePictures.push({ id: String(l.id), folio: (l.attrs || {}).folio || '', name: (l.attrs || {}).line || '', image, items });
        }
        linePictures.sort((a, b) => compareFolios(a.folio, b.folio) || String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
        snippets.sort((a, b) => compareFolios(a.folio, b.folio) || String(a.line).localeCompare(String(b.line), undefined, { numeric: true }));

        manuscripts[id] = { id, source, name: c.name || '', notes: c.notes || '', kind: 'collection', rows, snippets, lines: linePictures };
        list.push({ id, source, kind: 'collection' });
    }

    // ---- the index ----
    list.sort((a, b) => a.source.localeCompare(b.source, undefined, { numeric: true }));

    const indexColumns = columns.map(col => {
        const values = list.map(m => metaOf(m.source, col.key));
        const f = describeColumnFilter(values, { declared: col.type === 'century' ? 'century' : '', numeric: col.type === 'number' || !!col.numeric, said: col.said });
        return { key: col.key, label: col.label, type: col.type || 'text', filter: f.offered ? f.kind : '' };
    });

    const index = {
        format: FORMAT,
        version: VERSION,
        generated,
        info: {
            title: publication.title, description: publication.description, authors: publication.authors,
            publisher: publication.publisher, license: publication.license, doi: publication.doi,
            preferredCitation: publication.preferredCitation || '', url: publication.url, year: publication.year
        },
        columns: indexColumns,
        signs: Object.fromEntries(Object.entries(signGlyphs).map(([key, glyph]) => {
            const sign = customSigns.find(x => x.key === key) || {};
            return [key, { ...glyph, label: sign.label || '', abbrev: sign.abbrev || '' }];
        })),
        discriminateSigns,
        manuscripts: list.map(m => {
            const data = manuscripts[m.id];
            const meta = {};
            for (const col of columns) {
                const v = String(metaOf(m.source, col.key) ?? '').trim();
                if (v) meta[col.key] = v;
            }
            const file = dataFile(m.id);
            data.file = file;
            return {
                id: m.id, source: m.source, name: data.name, kind: data.kind, meta, file,
                patterns: data.rows.length, snippets: data.snippets.length
            };
        })
    };

    // The file name is the index's business, not part of the manuscript's own file.
    for (const m of Object.values(manuscripts)) delete m.file;
    return { index, manuscripts, files };
}

/** The files of a documentation, ready to be written: path and text. */
export function documentationFiles({ index, manuscripts }) {
    const out = [{ path: 'neume-docs.json', text: JSON.stringify(index, null, 2) }];
    for (const entry of index.manuscripts) out.push({ path: entry.file, text: JSON.stringify(manuscripts[entry.id], null, 2) });
    return out;
}

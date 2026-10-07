/**
 * Makes the example documentation that ships with the app (public/docs-demo): made-up manuscripts
 * with made-up metadata, so a fresh install has something to read and the viewer can be tried.
 * It goes through the same builder the editor uses, so the files cannot drift from the format.
 *
 *   node scripts/make-demo-docs.mjs
 */
import { createServer } from 'vite';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'docs-demo');

const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
    const { buildDocumentation, documentationFiles } = await vite.ssrLoadModule('/src/utils/buildDocumentation.js');
    const { defaultPublication } = await vite.ssrLoadModule('/src/utils/publication.js');
    const { renderSvg } = await vite.ssrLoadModule('/src/utils/svgRenderer.js');
    const { GLYPHS } = await vite.ssrLoadModule('/src/data/glyphs.js');
    const { fileSlug } = await vite.ssrLoadModule('/src/utils/buildDocumentation.js');

    const META = {
        'Example A': { origin: 'Köln', dating: 's. XI', order: 'OSB', leaves: '212', 'cat:bibliotheksort': 'Köln', 'cat:bibliothek': 'Erzbischöfliche Diözesan- und Dombibliothek', 'cat:bibliothekssignatur': 'Cod. 1001 (made up)' },
        'Example B': { origin: 'Trier', dating: 'c. 1100', order: 'OSB', leaves: '148', 'cat:bibliotheksort': 'Trier', 'cat:bibliothek': 'Stadtbibliothek', 'cat:bibliothekssignatur': 'Hs. 1002 (made up)' },
        'Example C': { origin: 'Cambrai', dating: 's. XII in.', order: 'OCist', leaves: '96', 'cat:bibliotheksort': 'Cambrai', 'cat:bibliothek': 'Médiathèque', 'cat:bibliothekssignatur': 'Ms. 1003 (made up)' },
        'Example D': { origin: 'St. Gallen', dating: 's. XIII', order: 'OSB', leaves: '301', 'cat:bibliotheksort': 'St. Gallen', 'cat:bibliothek': 'Stiftsbibliothek', 'cat:bibliothekssignatur': 'Cod. Sang. 1004 (made up)' }
    };
    const codes = ['*u', '*d', '*e', '*ud', '*du', '*uu', '*dd', '*udd'];
    const regions = {};
    const regionItems = {};
    const tables = [];
    let counter = 0;
    Object.keys(META).forEach((source, m) => {
        tables.push({ source, name: `${source} (made-up)`, notes: 'A made-up manuscript, to try the viewer with.', isPublished: true,
            rows: codes.slice(0, 5 + m).map((c, i) => ({ pattern: c, customId: String(i + 1) })) });
        regions[`${source}_${3 + m}r`] = [{ id: `r${m}`, name: '2', points: '8,8 46,8 46,22 8,22' }];
        regionItems[`r${m}`] = codes.slice(0, 4 + m).map((c, i) => ({ id: `${source.replace(/\W/g, '')}-${c.replace(/\W/g, '')}-${counter++}`, pattern: c, points: `${10 + i * 5},10 ${14 + i * 5},10 ${14 + i * 5},20 ${10 + i * 5},20` }));
    });

    const built = buildDocumentation({
        publication: {
            ...defaultPublication(),
            title: 'Example documentation (made-up data)',
            description: 'Four invented manuscripts, so you can try the viewer: browse them, filter by place or date, compare them in the neume table, and see how a link and a citation look. None of it is research.',
            authors: ['neume-docs'], license: 'CC0 1.0', year: '2026'
        },
        generated: new Date().toISOString().slice(0, 10),
        columns: [
            { key: 'origin', label: 'Place of origin', type: 'location' },
            { key: 'dating', label: 'Dating', type: 'century' },
            { key: 'order', label: 'Order', type: 'text' },
            { key: 'leaves', label: 'Leaves', type: 'number' },
            { key: 'cat:bibliotheksort', label: 'Library city', type: 'location', said: { on: false } },
            { key: 'cat:bibliothek', label: 'Library', type: 'text', said: { on: false } },
            { key: 'cat:bibliothekssignatur', label: 'Shelfmark', type: 'text', said: { on: false } }
        ],
        metaOf: (source, key) => (META[source] || {})[key] || '',
        tables, regions, regionItems, collections: []
    });

    // Pictures: the glyph of each pattern on parchment — a snippet each, and a picture of each line with its snippets in place.
    const PARCHMENT = '#f3e9d2';
    const glyph = (code, x, y, w, h) => {
        const r = renderSvg(code, GLYPHS, false, {});
        return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${r.viewBox}" preserveAspectRatio="xMidYMid meet">${r.content}</svg>`;
    };
    const frame = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${PARCHMENT}"/>${body}</svg>\n`;
    const svgs = [];
    for (const m of Object.values(built.manuscripts)) {
        const folder = `images/${fileSlug(m.id)}`;
        for (const s of m.snippets) {
            const path = `${folder}/${fileSlug(s.id)}.svg`;
            svgs.push({ path, text: frame(240, 180, `<line x1="0" x2="240" y1="60" y2="60" stroke="#b5483a" stroke-width="1.2"/><line x1="0" x2="240" y1="120" y2="120" stroke="#b5483a" stroke-width="1.2"/>${glyph(s.pattern, 20, 24, 200, 132)}`) });
            s.image = path;
            s.zoom = path;
        }
        for (const l of m.lines) {
            const path = `${folder}/line-${fileSlug(l.id)}.svg`;
            const staff = [40, 80, 120, 160].map(y => `<line x1="0" x2="1200" y1="${y}" y2="${y}" stroke="#b5483a" stroke-width="1.2"/>`).join('');
            const marks = l.items.map(it => {
                const pts = it.points.split(' ').map(p => p.split(',').map(Number));
                const xs = pts.map(p => p[0]); const ys = pts.map(p => p[1]);
                const sn = m.snippets.find(s => s.id === it.id);
                const x = (Math.min(...xs) / 100) * 1200; const w = ((Math.max(...xs) - Math.min(...xs)) / 100) * 1200;
                return glyph(sn.pattern, x, 30, Math.max(w, 70), 120);
            }).join('');
            svgs.push({ path, text: frame(1200, 200, staff + marks) });
            l.image = path;
        }
    }

    await rm(out, { recursive: true, force: true });
    for (const f of svgs) {
        const path = join(out, f.path);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, f.text);
    }
    for (const f of documentationFiles(built)) {
        const path = join(out, f.path);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, `${f.text}\n`);
    }
    console.log(`Wrote ${built.index.manuscripts.length} manuscripts to ${out}`);
} finally {
    await vite.close();
}

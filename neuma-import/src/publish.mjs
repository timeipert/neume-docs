/**
 * Makes the folder that goes on the website (`ui/public/hung/`): the catalogue and its snippets for the
 * review tool, so that it works without a development server. The tool reads `catalogue.json`,
 * `snippets.json` and `snippets/…`, as it does from the development server; a page `index.html` leads
 * from `hung/` to the tool.
 *
 * The catalogue's own pictures of whole cells (`raw/`) are not published: they are twice as much again,
 * and the tool does without them (it then shows the snippet alone).
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ORIGIN } from './origin.mjs';

/** The catalogue as the website has it: no pointer to a picture it does not carry, and the credit as it is now. */
export function publishedCatalogue(catalogue) {
    return {
        ...catalogue,
        origin: ORIGIN,
        sources: catalogue.sources.map(source => ({
            ...source,
            cells: Object.fromEntries(Object.entries(source.cells || {}).map(([key, cell]) => [key, { ...cell, image: '' }]))
        }))
    };
}

/** The page at `hung/`: a way on to the tool, and the credit for anybody who does not get there. */
export function landingPage(toolAddress = '../#/tools/neuma') {
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0; url=${esc(toolAddress)}">
<title>Hungarian Neume Catalogue — neume-docs</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;color:#1e293b}a{color:#2563eb}small{color:#64748b}</style>
</head>
<body>
<h1>Hungarian Neume Catalogue</h1>
<p>Going to the <a href="${esc(toolAddress)}">review of the catalogue's snippets</a>, where each is assigned to a pattern and the result can be downloaded as a documentation.</p>
<p><small>${esc(ORIGIN.name)} — ${esc(ORIGIN.authors.join('; '))}. <a href="${esc(ORIGIN.url)}">${esc(ORIGIN.url)}</a>. ${esc(ORIGIN.note)}</small></p>
<script>location.replace(${JSON.stringify(toolAddress)});</script>
</body>
</html>
`;
}

/**
 * Writes the folder. What was there from an earlier run is removed first (only what this writes: the
 * catalogue, the snippets, the landing page), so a snippet that is gone is gone from the site.
 *
 * @param {{ dir: string, out: string, log?: (msg: string) => void }} options  `dir` is the data folder
 */
export function publishSite({ dir, out, log = () => {} }) {
    const catalogue = JSON.parse(readFileSync(join(dir, 'catalogue.json'), 'utf8'));
    const snippets = JSON.parse(readFileSync(join(dir, 'snippets.json'), 'utf8'));

    for (const name of ['catalogue.json', 'snippets.json', 'snippets', 'index.html']) rmSync(join(out, name), { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'catalogue.json'), JSON.stringify(publishedCatalogue(catalogue)));
    writeFileSync(join(out, 'snippets.json'), JSON.stringify(snippets));
    writeFileSync(join(out, 'index.html'), landingPage());
    for (const s of snippets) {
        const to = join(out, s.file);
        mkdirSync(dirname(to), { recursive: true });
        copyFileSync(join(dir, s.file), to);
    }
    log(`${catalogue.sources.length} sources, ${snippets.length} snippets → ${out}`);
    return { sources: catalogue.sources.length, snippets: snippets.length };
}

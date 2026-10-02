/**
 * IIIF images named in a document's metadata.
 *
 * Besides (rarely) a manifest on the source, the CM records on many documents
 * the address of the page image(s) the transcription was made from, in the
 * document's `iiifs` field. Those are IIIF Image API addresses. Read in
 * order, they tell the editor which image shows which folio — enough to show a
 * manuscript's pages without a manifest.
 *
 * The field is a JSON list, sometimes with its quotes escaped (`[\"https://…\"]`),
 * and a few entries are complete image requests (`…/full/full/0/default.jpg`)
 * rather than the image's base address.
 */

import { normalizeFolio } from './folio.js';

/**
 * Every URL in an `iiifs` value.
 * @param {unknown} raw a JSON string, a JSON string with escaped quotes, a bare URL, or an array
 * @returns {string[]}
 */
export function parseIiifUrls(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.flatMap(parseIiifUrls);
    const text = String(raw).trim();
    if (!text) return [];

    for (const candidate of [text, text.replace(/\\"/g, '"')]) {
        try {
            const parsed = JSON.parse(candidate);
            if (Array.isArray(parsed)) return parsed.filter(u => typeof u === 'string' && u.trim()).map(u => u.trim());
            if (typeof parsed === 'string' && parsed.trim()) return [parsed.trim()];
        } catch {
            // not JSON in this form; try the next one
        }
    }
    return text.match(/https?:\/\/[^\s"'\\,[\]]+/g) || [];
}

/** `…/<image>/full/full/0/default.jpg` and `…/<image>/info.json` both name the image `…/<image>`. */
export function imageBase(url) {
    let u = String(url).trim().replace(/\/info\.json$/i, '');
    const request = /\/(?:full|square|pct:[\d.,]+|\d+,\d+,\d+,\d+)\/(?:full|max|\^?!?[\d,]+|pct:[\d.]+)\/!?\d+\/(?:default|color|gray|bitonal|native)[./][a-z0-9]+$/i;
    u = u.replace(request, '');
    return u.replace(/\/+$/, '');
}

/** The folio after this one in recto/verso order: 54v -> 55r, 54r -> 54v. */
export function nextFolio(folio) {
    const m = /^(\d+)([rv])$/.exec(folio || '');
    if (!m) return '';
    return m[2] === 'r' ? `${m[1]}v` : `${Number(m[1]) + 1}r`;
}

/** The folio an image file name speaks of: "folio_0055.jpg" -> "55r", "…-0221_111v.tif" -> "111v". */
function fileFolio(url) {
    let name = decodeURIComponent(String(url).split('?')[0]).split('/').pop() || '';
    name = name.replace(/\.[a-z0-9]{2,4}$/i, '');
    const m = /(\d+)([rv])?$/i.exec(name);
    return m ? normalizeFolio(`${Number(m[1])}${m[2] || ''}`) : '';
}

/**
 * Which folio each of a document's images shows.
 *
 * The first image is the document's start folio. A further image is taken for
 * the next folio in order only if its file name says so too, because for many
 * sources the file number is just an image index and would mislabel the page.
 *
 * @param {string} foliostart the document's start folio, as recorded
 * @param {string[]} urls image base addresses, in order
 * @returns {Array<[string, string]>} [normalised folio, image base address]
 */
export function folioImagesOf(foliostart, urls) {
    const start = normalizeFolio(foliostart);
    if (!start || !urls.length) return [];

    const out = [[start, urls[0]]];
    let folio = start;
    for (let i = 1; i < urls.length; i++) {
        folio = nextFolio(folio);
        if (!folio) break;
        if (fileFolio(urls[i]) === folio) out.push([folio, urls[i]]);
    }
    return out;
}

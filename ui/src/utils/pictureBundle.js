/**
 * Snippet pictures as files of a documentation.
 *
 * A snippet's `image` is the address of its cut-out on a library's IIIF server. A documentation can
 * also carry the cut-out as a file (`images/<manuscript>/<snippet>.jpg`), named by the snippet's `local`:
 * the viewer then shows the file, which loads at once and does not depend on the library, and `image`
 * stays as the reference to where the picture comes from.
 *
 * Plain functions over plain data, so what is planned and written can be tested.
 */
import { fileSlug } from './buildDocumentation';

/** The file a snippet's picture is kept in. IIIF servers send JPEG. */
export function pictureFilePath(manuscriptId, snippetId) {
    return `images/${fileSlug(manuscriptId)}/${fileSlug(snippetId)}.jpg`;
}

const isServerAddress = (v) => /^https?:\/\//i.test(String(v || ''));

/**
 * The pictures to keep: the snippets whose picture comes from a server and is not a file yet.
 * Two snippets that were cut out of the same place on the same page share one address, and so one picture.
 *
 * @param {Array<{ id: string, data: { snippets: Array<{ id: string, image?: string, local?: string }> } }>} items manuscripts, by id
 * @returns {Array<{ item: number, snippet: string, url: string, path: string }>}
 */
export function planPictures(items) {
    const plan = [];
    items.forEach((item, index) => {
        for (const s of item.data.snippets || []) {
            if (s.local || !isServerAddress(s.image)) continue;
            plan.push({ item: index, snippet: s.id, url: s.image, path: pictureFilePath(item.id, s.id) });
        }
    });
    return plan;
}

/**
 * The manuscripts with `local` set for every snippet whose picture was written to a file. Nothing is changed in place.
 * @param {Array<{ id: string, data: object }>} items
 * @param {Array<{ item: number, snippet: string, path: string }>} written
 */
export function withLocalPaths(items, written) {
    const byItem = new Map();
    for (const w of written) {
        if (!byItem.has(w.item)) byItem.set(w.item, new Map());
        byItem.get(w.item).set(w.snippet, w.path);
    }
    return items.map((item, index) => {
        const paths = byItem.get(index);
        if (!paths) return item;
        return { ...item, data: { ...item.data, snippets: item.data.snippets.map(s => (paths.has(s.id) ? { ...s, local: paths.get(s.id) } : s)) } };
    });
}

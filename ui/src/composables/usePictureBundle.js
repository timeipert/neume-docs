import { planPictures, withLocalPaths } from '../utils/pictureBundle';
import { savePictures, savedBlob } from '../utils/pictureCache';

/**
 * Put the snippets' pictures into a ZIP as files and say, in the manuscripts, which file is whose:
 * what is not kept in this browser yet is fetched from the libraries first (a few at a time, see utils/pictureCache).
 *
 * @param {import('jszip')} zip  gets the pictures as `images/<manuscript>/<snippet>.jpg`
 * @param {Array<{ id: string, data: object }>} items  the manuscripts (their `data` as the viewer reads it)
 * @param {{ onProgress?: Function, signal?: AbortSignal }} [options]
 * @returns {Promise<{ items: Array<{ id: string, data: object }>, written: number, failures: Array<{ url: string, reason: string }>, stopped: boolean }>}
 *   `items` are the manuscripts with `local` set where a file was written
 */
export async function bundlePictures(zip, items, { onProgress, signal } = {}) {
    const plan = planPictures(items);
    const result = await savePictures(plan.map(p => p.url), { onProgress, signal });
    const written = [];
    const done = new Set();
    for (const p of plan) {
        const blob = await savedBlob(p.url);
        if (!blob) continue;
        zip.file(p.path, blob);
        written.push(p);
        done.add(p.url);
    }
    return { items: withLocalPaths(items, written), written: written.length, failures: result.failures, stopped: result.stopped };
}

import { getCachedItem, setCachedItem } from './idb';

/**
 * The first of several addresses of one picture that a server answers, as a blob — and kept, so the
 * next time nothing is asked. An address that is refused (400, 403) or not there goes on to the next.
 *
 * A picture whose server does not allow it to be read (CORS) or does not answer cannot be had as a blob at all, but
 * an `<img>` can still show it: then nothing is returned but the first address to show directly.
 *
 * @param {string[]} urls best first (see utils/iiifUrls)
 * @returns {Promise<{ blob: Blob|null, url: string }>} `url`: the address the blob is of, or the one to show directly
 */
export async function fetchFirstBlob(urls) {
    const list = (urls || []).filter(Boolean);
    for (const url of list) {
        try {
            let blob = await getCachedItem('images', url);
            if (blob instanceof Blob) return { blob, url };
            const res = await fetch(url);
            if (!res.ok) continue;
            blob = await res.blob();
            setCachedItem('images', url, blob).catch(() => {});
            return { blob, url };
        } catch {
            return { blob: null, url: list[0] };
        }
    }
    return { blob: null, url: list[0] || '' };
}

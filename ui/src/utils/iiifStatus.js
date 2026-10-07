/**
 * Whether the page images of a manuscript can be used right now, and if not, why not —
 * so every place that needs them can say what to do instead of offering what cannot work.
 *
 *   none      no manifest is linked and no page image is known
 *   loading   a manifest is linked and its pages are being read
 *   error     the manifest could not be read
 *   ready     the pages are known
 *
 * @param {{ links: object, parsedData: object, folioImageSources?: object, manifestStatus?: object }} iiif the IIIF store, or its refs unwrapped
 * @param {string} source
 * @returns {{ state: 'none'|'loading'|'error'|'ready', link: string, error: string }}
 */
export function iiifStatus(iiif, source) {
    const link = (source && iiif.links && iiif.links[source]) || '';
    const pages = source && iiif.parsedData && iiif.parsedData[source];
    if (pages && pages.length) return { state: 'ready', link, error: '' };
    if (source && iiif.folioImageSources && iiif.folioImageSources[source]) return { state: 'ready', link, error: '' };
    if (!link) return { state: 'none', link: '', error: '' };
    const status = iiif.manifestStatus && iiif.manifestStatus[source];
    if (status && status.status === 'error') return { state: 'error', link, error: status.error || 'The manifest could not be read.' };
    return { state: 'loading', link, error: '' };
}

/** A web address, as a manifest is given. */
export const isWebAddress = (text) => /^https?:\/\/\S+$/i.test(String(text ?? '').trim());

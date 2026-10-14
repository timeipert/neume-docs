/**
 * The addresses to ask a IIIF Image API service for, and in which order.
 *
 * Servers differ in what they accept, and a request that one takes can be refused by another:
 *
 *   - a width larger than the part of the page has (upscaling) is refused by most servers,
 *     and a small snippet is exactly that — a neume is a few hundred pixels wide
 *   - a width above the server's limit is refused (a `maxWidth` of 1000, say), which is what
 *     a large picture asks for
 *   - the keyword for "as large as it goes" is `full` in Image API 2 and `max` in Image API 3,
 *     and a server of one version may not know the other's
 *
 * So there is never one address, but a list: what is asked for first, then what always works.
 * The component that shows the picture goes down the list when a request fails
 * (see `useImageFallback`). Pure string work.
 */

const trim = (url) => String(url || '').replace(/\/+$/, '');
const unique = (list) => [...new Set(list.filter(Boolean))];

/**
 * The width a part can have at the page's own size, if that can be told: the part's share of the page
 * in percent, of the page's width (the manifest's canvas — usually, not always, the image's pixels).
 * Null when it cannot.
 */
export function nativeWidth(region, pageWidth) {
    const m = /^pct:([\d.]+),([\d.]+),([\d.]+),([\d.]+)$/.exec(String(region || ''));
    if (!m || !(pageWidth > 0)) return null;
    const w = Math.floor((pageWidth * parseFloat(m[3])) / 100);
    return w > 0 ? w : null;
}

/**
 * A part of a page, best first: the width that was asked for; that width held to the part's own size, when
 * that is smaller and can be told (the canvas of a manifest is not always the image, so this is the second
 * choice, not the first); what the server calls its maximum (`max`: as large as it allows, never more); then
 * the part at its own size (`full`).
 *
 * @param {string} serviceUrl the Image API service of the page
 * @param {string} region `pct:x,y,w,h` or `x,y,w,h`
 * @param {number|string} width
 * @param {{ pageWidth?: number }} [options] the width of the page's canvas, if known
 */
export function regionUrls(serviceUrl, region, width, { pageWidth = 0 } = {}) {
    const service = trim(serviceUrl);
    if (!service || !region) return [];
    const w = String(width ?? '').replace(/,$/, '');
    const asked = /^\d+$/.test(w) ? `${w},` : /^(full|max)$/.test(w) ? w : '';
    const own = /^\d+$/.test(w) ? nativeWidth(region, pageWidth) : null;
    const held = own !== null && own >= 64 && own < Number(w) ? `${own},` : '';
    return unique([
        asked && `${service}/${region}/${asked}/0/default.jpg`,
        held && `${service}/${region}/${held}/0/default.jpg`,
        `${service}/${region}/max/0/default.jpg`,
        `${service}/${region}/full/0/default.jpg`
    ]);
}

/**
 * A whole page. With a `width`, a picture of about that width (for a cut-out, which only needs
 * the page to cut from); without, the page at its best: the address the manifest gave, then the
 * other keyword for the full size, then smaller and smaller ones for a server that will not send a page that large.
 *
 * @param {string} serviceUrl
 * @param {string} imgUrl what the manifest named for the page
 * @param {{ width?: number }} [options]
 */
export function pageUrls(serviceUrl, imgUrl, { width = 0 } = {}) {
    const service = trim(serviceUrl);
    if (!service) return unique([imgUrl]);
    const at = (size) => `${service}/full/${size}/0/default.jpg`;
    if (width > 0) return unique([at(`${Math.round(width)},`), at('max'), at('full'), imgUrl]);
    return unique([imgUrl, at('max'), at('full'), at('2400,'), at('1600,'), at('1000,')]);
}

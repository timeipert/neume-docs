/**
 * Turn an IIIF Presentation manifest (v2 or v3) into the list of pages the app
 * works with.
 *
 * The two versions describe the same thing — a sequence of canvases, each with a
 * label and one painted image — in different shapes. Each version has a small
 * function that reads its canvases into one neutral form; everything after that
 * (label rules, label clean-up, the result shape) is shared, so the two cannot
 * drift apart. Pure: the IIIF store fetches, this only reads.
 */

/**
 * @typedef {Object} ManifestPage
 * @property {string} folio          the page label after the source's label rule and clean-up
 * @property {string} imgUrl         a URL for the whole image
 * @property {string|null} serviceUrl the IIIF Image API service, if the canvas has one
 * @property {number} w              canvas width (0 if unknown)
 * @property {number} h              canvas height (0 if unknown)
 * @property {string} originalFolio  the canvas label exactly as the manifest has it
 * @property {string} [canvasId]     the canvas's id in the manifest
 * @property {number} canvasIndex    the canvas's position in the manifest
 */

const asArray = v => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const first = v => asArray(v)[0];

/** A v2 label: a string, a list, or a `{ "@value": … }` language value. */
function labelV2(label) {
    const l = first(label);
    if (l && typeof l === 'object') return l['@value'] !== undefined ? String(l['@value']) : 'Unknown';
    return l === undefined || l === '' ? 'Unknown' : String(l);
}

/** A v3 label: a string, or a language map `{ en: ["…"] }`. */
function labelV3(label) {
    if (typeof label === 'string') return label;
    if (label && typeof label === 'object') {
        const v = first(Object.values(label)[0]);
        if (v !== undefined && v !== null) return String(v);
    }
    return 'Unknown';
}

/** The manifest's Presentation API version, from its @context (a string or a list). */
export function manifestVersion(data) {
    const contexts = asArray(data && data['@context']).map(String);
    if (contexts.some(c => c.includes('presentation/2/') || c.includes('2/context.json'))) return 2;
    if (contexts.some(c => c.includes('presentation/3/') || c.includes('3/context.json'))) return 3;
    return null;
}

/** v2: sequences[0].canvases[].images[0].resource, whose service names the image API. */
function canvasesV2(data) {
    const canvases = (data.sequences && data.sequences[0] && data.sequences[0].canvases) || [];
    return canvases.map(canvas => {
        const resource = canvas.images && canvas.images[0] && canvas.images[0].resource;
        let serviceUrl = null;
        let imgUrl = null;
        if (resource) {
            const service = first(resource.service);
            if (service && service['@id']) {
                serviceUrl = service['@id'];
                imgUrl = `${serviceUrl}/full/full/0/default.jpg`;
            } else {
                imgUrl = resource['@id'] || null;
            }
        }
        return { label: labelV2(canvas.label), imgUrl, serviceUrl, w: canvas.width || 0, h: canvas.height || 0, canvasId: canvas['@id'] || undefined };
    });
}

/** v3: items[] (canvases) -> items[0] (annotation page) -> items[0] (annotation) -> body. */
function canvasesV3(data) {
    return asArray(data.items).map(item => {
        const body = item.items && item.items[0] && item.items[0].items && item.items[0].items[0] && item.items[0].items[0].body;
        let serviceUrl = null;
        let imgUrl = null;
        if (body) {
            const service = first(body.service);
            const id = service && (service.id || service['@id']);
            if (id) {
                serviceUrl = id;
                imgUrl = `${serviceUrl}/full/max/0/default.jpg`;
            } else {
                imgUrl = body.id || null;
            }
        }
        return { label: labelV3(item.label), imgUrl, serviceUrl, w: item.width || 0, h: item.height || 0, canvasId: item.id || item['@id'] || undefined };
    });
}

/**
 * A source's label rule maps the library's label for a canvas to the label(s) it
 * should have in the edition (see config/iiifRules.js): a string, a list (one
 * image showing several folios), or nothing (keep the label).
 */
function applyLabelRule(rule, label) {
    if (!rule) return [label];
    const mapped = rule(label);
    if (Array.isArray(mapped)) return mapped;
    if (mapped !== null && mapped !== undefined) return [mapped];
    return [label];
}

/**
 * "p. 12" and "p12" both mean page 12; the app addresses pages by the bare label.
 * Only a "p" before a number is a page marker — "page de garde", "plat supérieur"
 * keep their first letter (an older clean-up stripped it).
 */
export const cleanLabel = label => String(label).replace(/^p\.?\s*(?=\d)/i, '').trim();

/**
 * @param {Object} data the parsed manifest JSON
 * @param {{ labelRule?: Function|null }} [options]
 * @returns {ManifestPage[]} one entry per canvas label (a canvas a rule maps to
 *   several folios yields several entries); canvases without an image are skipped
 */
export function parseManifest(data, { labelRule = null } = {}) {
    const version = manifestVersion(data);
    let canvases;
    if (version === 2) canvases = canvasesV2(data);
    else if (version === 3) canvases = canvasesV3(data);
    else {
        console.warn('Unknown IIIF manifest version', data && data['@context']);
        return [];
    }

    const pages = [];
    canvases.forEach((canvas, canvasIndex) => {
        if (!canvas.imgUrl) return;
        for (const mapped of applyLabelRule(labelRule, canvas.label)) {
            pages.push({
                folio: cleanLabel(mapped),
                imgUrl: canvas.imgUrl,
                serviceUrl: canvas.serviceUrl,
                w: canvas.w,
                h: canvas.h,
                originalFolio: canvas.label,
                canvasId: canvas.canvasId,
                canvasIndex
            });
        }
    });
    return pages;
}

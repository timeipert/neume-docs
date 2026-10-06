/**
 * Exchanging annotations with Monodi-Zero.
 *
 * The editor is where line regions, snippets and neume tables are made; Monodi-Zero
 * is where the transcription lives. They meet in one small file per round trip:
 *
 *   { format: 'cm-annotation-exchange', version: 1, generator, exportedAt,
 *     sources: [{ id, quellensigle, iiifManifestUrl?, equivalents[],
 *                 annotationRegions[], annotationItems[] }] }
 *
 * The record shapes are Monodi's own (`Source.equivalents / annotationRegions /
 * annotationItems`), so the same fields travel through a shared repository later.
 * See INTEGRATION-PLAN.md in the monodi-light repository.
 *
 * Pure functions on plain data: no stores, no DOM. Callers hand in what they hold
 * and apply the plan they get back.
 *
 * A region says where it is in several ways, because Monodi and the editor mean
 * different things by "page":
 *
 *   canvasId    IIIF canvas id (manifest pages)
 *   imageId     IIIF Image API base of the page image (manifest pages and pages
 *               taken from the corpus's own image addresses)
 *   folioLabel  the transcription's folio, "113r" — this editor's own key
 *   folio       legacy: Monodi's canvas index, when the manifest is known
 */

import { getBaseCode } from '../../utils/patternCode';
import { normalizeFolio } from '../corpus/folio';

export const EXCHANGE_FORMAT = 'cm-annotation-exchange';
export const EXCHANGE_VERSION = 1;

const text = (v) => (v === undefined || v === null ? '' : String(v));
const trimSlash = (url) => text(url).replace(/\/+$/, '');

/**
 * "Source_Folio" -> { source, folio }. A source's name may contain an underscore
 * ("WiSch 4_5"); a folio never does, so the key is split from the right.
 */
export function parsePageKey(key) {
    const s = text(key);
    const i = s.lastIndexOf('_');
    return i > 0 ? { source: s.slice(0, i), folio: s.slice(i + 1) } : null;
}

/** The pages of one source, as lookups. `pages` are `{ folio, serviceUrl?, canvasId?, canvasIndex? }`. */
function pageLookups(pages) {
    const byFolio = new Map();
    const byCanvasId = new Map();
    const byImage = new Map();
    const byCanvasIndex = new Map();
    for (const p of pages || []) {
        if (p.folio && !byFolio.has(p.folio)) byFolio.set(p.folio, p);
        if (p.canvasId && !byCanvasId.has(p.canvasId)) byCanvasId.set(p.canvasId, p);
        if (p.serviceUrl && !byImage.has(trimSlash(p.serviceUrl))) byImage.set(trimSlash(p.serviceUrl), p);
        if (Number.isInteger(p.canvasIndex) && !byCanvasIndex.has(p.canvasIndex)) byCanvasIndex.set(p.canvasIndex, p);
    }
    return { byFolio, byCanvasId, byImage, byCanvasIndex };
}

/**
 * Finds the first note's uuid of the occurrence a snippet is linked to.
 *
 * A snippet links to an occurrence by `linkData.sysId`, the occurrence's fields
 * joined by "|". The uuids are kept beside the occurrences, in the same order.
 *
 * @param {Object<string, string[][]>|null} occurrences pattern -> occurrences
 * @param {Object<string, string[]>|null} noteUuids pattern -> uuids, same order
 * @returns {(pattern: string, sysId: string) => string} '' when it cannot be told
 */
export function makeUuidLookup(occurrences, noteUuids) {
    const cache = new Map();
    return (pattern, sysId) => {
        if (!occurrences || !noteUuids || !sysId) return '';
        const base = getBaseCode(pattern);
        let index = cache.get(base);
        if (!index) {
            index = new Map();
            const list = occurrences[base] || [];
            const uuids = noteUuids[base] || [];
            list.forEach((o, i) => {
                const key = o.join('|');
                if (uuids[i] && !index.has(key)) index.set(key, uuids[i]);
            });
            cache.set(base, index);
        }
        return index.get(sysId) || '';
    };
}

/** [documentId, folio, line, syllable, notes] out of a sysId, or null if it is another shape. */
function sysIdParts(sysId) {
    const parts = text(sysId).split('|');
    return parts.length === 5 ? { folio: parts[1], line: parts[2] } : null;
}

/** The legacy " b" variant some old patterns carry after the code. */
function splitPattern(pattern, variant) {
    const s = text(pattern);
    const space = s.indexOf(' ');
    return {
        pattern: getBaseCode(s),
        variant: text(variant) || (space === -1 ? '' : s.slice(space + 1).trim())
    };
}

/**
 * Everything one source contributes to the exchange file.
 *
 * @param {object} source
 * @param {string} source.name   the source's name in the editor (its siglum)
 * @param {string} [source.id]   Monodi's stable id for it (`meta.id`); falls back to the name
 * @param {Object<string, Object<string, string>>} [source.lineUuids] folio -> line -> LineChange uuid
 * @param {Array} [source.pages] the source's page images (see pageLookups)
 * @param {Object|null} [source.occurrences]
 * @param {Object|null} [source.noteUuids]
 * @param {string} [source.manifestUrl]
 * @param {{ regions, regionItems, personalTables }} workspace
 */
export function buildSourceExchange(source, workspace) {
    const { name } = source;
    const lineUuids = source.lineUuids || {};
    const pages = pageLookups(source.pages);
    const uuidFor = makeUuidLookup(source.occurrences, source.noteUuids);

    const annotationRegions = [];
    const annotationItems = [];
    const unlinked = { items: 0 };

    for (const [key, list] of Object.entries(workspace.regions || {})) {
        const where = parsePageKey(key);
        if (!where || where.source !== name) continue;
        const page = pages.byFolio.get(where.folio);

        for (const region of list || []) {
            if (region.unassigned) continue; // a holding pen, not a line of the manuscript

            const items = (workspace.regionItems && workspace.regionItems[region.id]) || [];
            const exportedItems = items.map((item) => {
                const { pattern, variant } = splitPattern(item.pattern, item.variant);
                const uuid = text(item.uuid) || uuidFor(pattern, item.linkData && item.linkData.sysId);
                if (!uuid) unlinked.items++;
                const out = { id: text(item.id), regionId: text(region.id), pattern, variant, points: text(item.points) };
                if (uuid) out.uuid = uuid;
                return out;
            });

            // A region is a line if every snippet linked into it lies on one and the same
            // transcription line; the LineChange ending that line is then its lineUUID.
            let lineUUID = text(region.lineUUID);
            if (!lineUUID) {
                const lines = new Set();
                for (const item of items) {
                    const p = sysIdParts(item.linkData && item.linkData.sysId);
                    if (p) lines.add(`${p.folio}|${p.line}`);
                }
                if (lines.size === 1) {
                    const [folio, line] = [...lines][0].split('|');
                    lineUUID = (lineUuids[folio] && lineUuids[folio][line]) || '';
                }
            }

            const out = {
                id: text(region.id),
                name: text(region.name),
                points: text(region.points),
                folio: page && Number.isInteger(page.canvasIndex) ? String(page.canvasIndex) : where.folio,
                folioLabel: where.folio
            };
            if (page && page.canvasId) out.canvasId = page.canvasId;
            if (page && page.serviceUrl) out.imageId = trimSlash(page.serviceUrl);
            if (lineUUID) out.lineUUID = lineUUID;
            annotationRegions.push(out);
            annotationItems.push(...exportedItems);
        }
    }

    // One list of equivalents however many tables the source has; a row with only the
    // pattern as its id has not been given an id yet.
    const equivalents = [];
    const seen = new Set();
    for (const table of workspace.personalTables || []) {
        if (table.source !== name) continue;
        for (const row of table.rows || []) {
            if (!row.pattern) continue;
            const refId = row.customId && row.customId !== row.pattern ? text(row.customId) : '';
            const key = `${row.pattern}\u0000${refId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            equivalents.push({ pattern: row.pattern, refId, notes: text(row.notes) });
        }
    }

    const out = { id: text(source.id) || name, quellensigle: name, equivalents, annotationRegions, annotationItems };
    if (source.manifestUrl) out.iiifManifestUrl = source.manifestUrl;
    return { record: out, unlinkedItems: unlinked.items };
}

/**
 * The exchange file for several sources. Sources with nothing to send are left out.
 *
 * @param {object[]} sources see buildSourceExchange
 * @param {object} workspace
 * @param {{ now?: Date }} [options]
 * @returns {{ file: object, counts: { sources: number, regions: number, items: number, linked: number, equivalents: number } }}
 */
export function buildExchange(sources, workspace, { now = new Date() } = {}) {
    const records = [];
    const counts = { sources: 0, regions: 0, items: 0, linked: 0, equivalents: 0 };
    for (const source of sources) {
        const { record } = buildSourceExchange(source, workspace);
        const hasWork = record.annotationRegions.length || record.annotationItems.length
            || record.equivalents.length || record.iiifManifestUrl;
        if (!hasWork) continue;
        records.push(record);
        counts.sources++;
        counts.regions += record.annotationRegions.length;
        counts.items += record.annotationItems.length;
        counts.linked += record.annotationItems.filter(i => i.uuid).length;
        counts.equivalents += record.equivalents.length;
    }
    return {
        file: { format: EXCHANGE_FORMAT, version: EXCHANGE_VERSION, generator: 'neumen-editor', exportedAt: now.toISOString(), sources: records },
        counts
    };
}

// ---------------------------------------------------------------------------
// Reading annotations that came from Monodi-Zero
// ---------------------------------------------------------------------------

const isNumeric = (s) => /^\d+$/.test(text(s).trim());

/**
 * Which of this editor's folios (page keys) does a region from Monodi belong on?
 *
 * Tried in order: canvas id, image id, the folio label, a folio that is a label,
 * and last a folio that is Monodi's canvas index (which needs the manifest's pages).
 *
 * @returns {{ folio: string } | { folio: null, reason: string }}
 */
export function placeRegion(region, pages) {
    const lookups = pages.byFolio ? pages : pageLookups(pages);
    const fromPage = (p) => ({ folio: p.folio });

    if (region.canvasId && lookups.byCanvasId.has(region.canvasId)) return fromPage(lookups.byCanvasId.get(region.canvasId));
    if (region.imageId && lookups.byImage.has(trimSlash(region.imageId))) return fromPage(lookups.byImage.get(trimSlash(region.imageId)));
    if (text(region.folioLabel).trim()) return { folio: normalizeFolio(region.folioLabel) };

    const folio = text(region.folio).trim();
    if (folio && !isNumeric(folio)) return { folio: normalizeFolio(folio) };
    if (folio) {
        const page = lookups.byCanvasIndex.get(Number(folio));
        if (page) return fromPage(page);
        return { folio: null, reason: 'Monodi numbered this page by its position in the manifest. Link that manifest under Metadata → IIIF sources, then review again' };
    }
    return { folio: null, reason: 'the region names no page' };
}

/**
 * What importing one source's annotations from Monodi would add. Nothing is
 * changed: the caller shows the plan and applies it. What the editor already has
 * wins — it is where annotations are made — so only ids it does not know are added.
 *
 * @param {object} incoming a source record of the exchange file (or of a Monodi source)
 * @param {{ name: string, pages?: Array }} source
 * @param {{ regions, regionItems, personalTables, iiifLinks }} workspace
 */
export function planImport(incoming, source, workspace) {
    const pages = pageLookups(source.pages);
    const name = source.name;

    const knownRegions = new Set();
    for (const [key, list] of Object.entries(workspace.regions || {})) {
        if (parsePageKey(key)?.source === name) for (const r of list || []) knownRegions.add(text(r.id));
    }

    const plan = {
        source: name,
        regions: [], // { folio, region }
        items: [],   // { regionId, item }
        equivalents: [],
        iiifManifestUrl: '',
        counts: { regions: 0, items: 0, equivalents: 0, alreadyHere: 0, unplaced: [] }
    };

    const placedRegions = new Map(); // id -> folio, for the items
    for (const r of incoming.annotationRegions || []) {
        const id = text(r.id);
        if (!id) continue;
        if (knownRegions.has(id)) { plan.counts.alreadyHere++; placedRegions.set(id, null); continue; }
        const where = placeRegion(r, pages);
        if (where.folio === null) {
            plan.counts.unplaced.push({ id, name: text(r.name), reason: where.reason });
            continue;
        }
        const region = { id, name: text(r.name), points: text(r.points) };
        if (r.lineUUID) region.lineUUID = r.lineUUID;
        plan.regions.push({ folio: where.folio, region });
        placedRegions.set(id, where.folio);
        plan.counts.regions++;
    }

    const knownItems = new Set();
    for (const rid of knownRegions) for (const i of (workspace.regionItems && workspace.regionItems[rid]) || []) knownItems.add(text(i.id));

    for (const i of incoming.annotationItems || []) {
        const id = text(i.id);
        if (!id || knownItems.has(id)) continue;
        // only into regions that exist here, or that this plan brings
        if (!placedRegions.has(text(i.regionId)) && !knownRegions.has(text(i.regionId))) continue;
        const item = { id, pattern: text(i.pattern), points: text(i.points) };
        if (i.variant) item.variant = text(i.variant);
        if (i.uuid) item.uuid = text(i.uuid);
        plan.items.push({ regionId: text(i.regionId), item });
        plan.counts.items++;
    }

    const haveRows = new Set();
    for (const t of workspace.personalTables || []) {
        if (t.source === name) for (const row of t.rows || []) haveRows.add(row.pattern);
    }
    for (const e of incoming.equivalents || []) {
        if (!e.pattern || haveRows.has(e.pattern)) continue;
        haveRows.add(e.pattern);
        plan.equivalents.push({ pattern: e.pattern, customId: text(e.refId) || e.pattern, notes: text(e.notes) });
        plan.counts.equivalents++;
    }

    const linked = workspace.iiifLinks && workspace.iiifLinks[name];
    if (!linked && incoming.iiifManifestUrl) plan.iiifManifestUrl = incoming.iiifManifestUrl;
    return plan;
}

/** Whether an exchange plan changes anything. */
export function planIsEmpty(plan) {
    const c = plan.counts;
    return !c.regions && !c.items && !c.equivalents && !plan.iiifManifestUrl;
}

/** Read an exchange file; throws a message a person can act on. */
export function parseExchange(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || data.format !== EXCHANGE_FORMAT) throw new Error('This is not an annotation exchange file.');
    if (typeof data.version !== 'number' || data.version > EXCHANGE_VERSION) {
        throw new Error('This file was written by a newer version of the editor. Update the editor to read it.');
    }
    return { ...data, sources: Array.isArray(data.sources) ? data.sources : [] };
}

// ---------------------------------------------------------------------------
// Folio drift after a source is updated
// ---------------------------------------------------------------------------

/**
 * Annotations on a folio that the updated transcription no longer has.
 *
 * Annotations are keyed by the transcription's folio. If a transcriber corrects a
 * folio in Monodi, the key an annotation sits under stops existing. Only a folio
 * that WAS in the transcription and no longer is counts: pages the transcription
 * never covered (a manuscript has many) are not drift.
 *
 * @param {{ name: string, oldFolios: string[], newFolios: string[],
 *           oldImages?: Array<[string,string]>, newImages?: Array<[string,string]> }} update
 *   `…Images` are the corpus's [folio, IIIF image base] pairs before and after
 * @param {{ regions, regionItems }} workspace
 * @returns {Array<{ folio: string, regions: number, items: number, suggestion: string }>}
 *   `suggestion` is the new folio that shows the image the old folio showed, or ''
 */
export function findDrift(update, workspace) {
    const now = new Set(update.newFolios);
    const gone = new Set(update.oldFolios.filter(f => !now.has(f)));
    if (!gone.size) return [];

    const newFolioOfImage = new Map((update.newImages || []).map(([folio, base]) => [trimSlash(base), folio]));
    const oldImageOfFolio = new Map((update.oldImages || []).map(([folio, base]) => [folio, trimSlash(base)]));
    const out = [];
    for (const [key, list] of Object.entries(workspace.regions || {})) {
        const where = parsePageKey(key);
        if (!where || where.source !== update.name || !gone.has(where.folio) || !(list || []).length) continue;
        let items = 0;
        for (const r of list) items += ((workspace.regionItems && workspace.regionItems[r.id]) || []).length;
        const image = oldImageOfFolio.get(where.folio);
        const suggestion = image ? (newFolioOfImage.get(image) || '') : '';
        out.push({ folio: where.folio, regions: list.length, items, suggestion: suggestion && !gone.has(suggestion) ? suggestion : '' });
    }
    return out.sort((a, b) => a.folio.localeCompare(b.folio, undefined, { numeric: true }));
}

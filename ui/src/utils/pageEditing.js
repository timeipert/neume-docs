/**
 * What the page workbench needs that is not a component: boxes as the store keeps them, where to
 * put the image on the stage, what to call a line, and which neumes of the transcription are still
 * free to link to. Plain functions on plain data.
 *
 * Boxes are in percent of the page image: `{ x, y, w, h }`, kept in the store as the four corners
 * "x1,y1 x2,y1 x2,y2 x1,y2".
 */

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** A box as the store keeps it. */
export function rectToPoints(rect) {
    const x1 = clamp(rect.x, 0, 100).toFixed(2);
    const y1 = clamp(rect.y, 0, 100).toFixed(2);
    const x2 = clamp(rect.x + rect.w, 0, 100).toFixed(2);
    const y2 = clamp(rect.y + rect.h, 0, 100).toFixed(2);
    return `${x1},${y1} ${x2},${y1} ${x2},${y2} ${x1},${y2}`;
}

/** The box around a polygon ("x,y x,y …"); null if there is none. */
export function pointsToRect(points) {
    const pairs = String(points || '').trim().split(/\s+/).map(p => p.split(',').map(Number)).filter(p => p.length === 2 && p.every(Number.isFinite));
    if (!pairs.length) return null;
    const xs = pairs.map(p => p[0]);
    const ys = pairs.map(p => p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** A box from two corners, in any order, kept on the page. */
export function rectFromCorners(a, b) {
    const x1 = clamp(Math.min(a.x, b.x), 0, 100);
    const y1 = clamp(Math.min(a.y, b.y), 0, 100);
    const x2 = clamp(Math.max(a.x, b.x), 0, 100);
    const y2 = clamp(Math.max(a.y, b.y), 0, 100);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// ---- the stage -------------------------------------------------------------------

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 40;

/**
 * The size the page has on the stage when it is shown whole: as large as fits, in its own proportions.
 * @param {{ w: number, h: number }} stage in pixels
 * @param {number} aspect width over height of the image
 */
export function pageSize(stage, aspect) {
    if (!stage.w || !stage.h || !aspect) return { w: 0, h: 0 };
    const h = Math.min(stage.h, stage.w / aspect);
    return { w: h * aspect, h };
}

/**
 * Zoom and offset that show a part of the page as large as the stage allows, with a margin; the
 * whole page when no part is given. The page is `base` pixels at zoom 1; the offset places its
 * top left corner on the stage.
 * @returns {{ s: number, tx: number, ty: number }}
 */
export function fitView(stage, base, rect = null, margin = 0.04) {
    if (!base.w || !stage.w) return { s: 1, tx: 0, ty: 0 };
    const part = rect && rect.w > 0 && rect.h > 0 ? rect : { x: 0, y: 0, w: 100, h: 100 };
    const w = (part.w / 100) * base.w;
    const h = (part.h / 100) * base.h;
    const s = clamp(Math.min(stage.w * (1 - margin) / w, stage.h * (1 - margin) / h), MIN_ZOOM, MAX_ZOOM);
    const cx = (part.x + part.w / 2) / 100 * base.w * s;
    const cy = (part.y + part.h / 2) / 100 * base.h * s;
    return { s, tx: stage.w / 2 - cx, ty: stage.h / 2 - cy };
}

/** The view after zooming by `factor` around a point of the stage (the point stays where it is). */
export function zoomAt(view, point, factor) {
    const s = clamp(view.s * factor, MIN_ZOOM, MAX_ZOOM);
    const k = s / view.s;
    return { s, tx: point.x - (point.x - view.tx) * k, ty: point.y - (point.y - view.ty) * k };
}

/** Where a box is on the stage, in pixels. */
export function rectOnStage(view, base, rect) {
    return {
        left: view.tx + (rect.x / 100) * base.w * view.s,
        top: view.ty + (rect.y / 100) * base.h * view.s,
        width: (rect.w / 100) * base.w * view.s,
        height: (rect.h / 100) * base.h * view.s
    };
}

/** A point of the stage, as percent of the page. */
export function stageToPage(view, base, point) {
    return {
        x: ((point.x - view.tx) / (base.w * view.s)) * 100,
        y: ((point.y - view.ty) / (base.h * view.s)) * 100
    };
}

// ---- lines ---------------------------------------------------------------------

/** The number in a line's name: "Line 3" → 3. */
export function lineNumber(name) {
    const m = String(name || '').match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

/**
 * What a new line could be called: the lines the transcription has on the page and nobody has
 * drawn yet, in order, and the next number after the last one. The first is the one to propose.
 * @param {string[]} drawn the names of the lines already drawn
 * @param {number[]} inTranscription the lines the transcription has on this page
 */
export function lineNameSuggestions(drawn, inTranscription = [], limit = 8) {
    const have = new Set(drawn.map(lineNumber).filter(n => n !== null));
    const open = [...new Set(inTranscription)].filter(n => !have.has(n)).sort((a, b) => a - b);
    const next = Math.max(0, ...have) + 1;
    const out = open.slice();
    if (!out.includes(next) && !have.has(next)) out.push(next);
    return out.slice(0, limit).map(n => `Line ${n}`);
}

/** Lines in reading order: by number where they have one, else from the top of the page down. */
export function sortLines(regions) {
    return [...regions].sort((a, b) => {
        const na = lineNumber(a.name);
        const nb = lineNumber(b.name);
        if (na !== null && nb !== null && na !== nb) return na - nb;
        if (na !== null && nb === null) return -1;
        if (na === null && nb !== null) return 1;
        const ra = pointsToRect(a.points) || { y: 0, x: 0 };
        const rb = pointsToRect(b.points) || { y: 0, x: 0 };
        return ra.y - rb.y || ra.x - rb.x;
    });
}

// ---- the transcription as a help ---------------------------------------------------------

/** The syllable and the notes of a neume, from its `sysId` ("document|folio|line|syllable|notes"). */
export function describeSysId(sysId) {
    const parts = String(sysId || '').split('|');
    return { document: parts[0] || '', folio: parts[1] || '', line: parts[2] || '', syllable: parts[3] || '', notes: parts[4] || '' };
}

/**
 * The neumes of a line that no snippet is linked to yet, in reading order.
 * @param {Array<{ sysId: string }>} neumes of the line
 * @param {Array<{ linkData?: { sysId?: string } }>} items the snippets drawn on it
 */
export function freeNeumes(neumes, items) {
    const taken = new Set(items.map(i => i.linkData && i.linkData.sysId).filter(Boolean));
    return neumes.filter(n => !taken.has(n.sysId));
}

/** The neume that comes after `current` among those still free (the first, if none is current). */
export function nextFree(neumes, items, current = '') {
    const free = freeNeumes(neumes, items).filter(n => n.sysId !== current);
    if (!free.length) return null;
    const at = neumes.findIndex(n => n.sysId === current);
    return free.find(n => neumes.findIndex(m => m.sysId === n.sysId) > at) || free[0];
}

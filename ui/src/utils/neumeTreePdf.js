/**
 * The neume tree as a PDF: one page as big as the tree, lines and labels as vector, shapes
 * and snippet pictures as images — meant to be placed as a figure.
 *
 * The page is built from the same layout the screen uses (see `layoutNeumeTree`), so what is
 * seen is what is saved. jsPDF is loaded when it is first needed.
 */

import { LABEL, TREE_INK } from './neumeTree.js';
import { splitCodeBySigns } from './signs.js';

/** One layout unit (a px on screen) in millimetres. */
const MM = 25.4 / 96;
const MARGIN = 10;

/** Text the standard PDF fonts can set. */
const latin1 = (text) => String(text ?? '').replace(/[^ -ÿ]/g, '?');

function loadImage(src, crossOrigin) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        if (crossOrigin) img.crossOrigin = crossOrigin;
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('The image could not be loaded.'));
        img.src = src;
    });
}

/** A drawn shape as a PNG, four times as sharp as on screen. */
export async function shapeToPng(picture, scale = 4) {
    try {
        const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(picture.svg)}`);
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(picture.width * scale);
        canvas.height = Math.ceil(picture.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
    } catch {
        return null;
    }
}

/** The part of a page a snippet is cut from, in percent: its box and a little around it (as the cut-outs on screen). */
export function cutoutRegion(points, padding = 0.08) {
    const pts = String(points || '').split(' ')
        .filter(Boolean)
        .map(p => p.split(',').map(parseFloat))
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    if (!pts.length) return null;
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxX - minX;
    const h = maxY - minY;
    const padX = Math.max(w * padding, 1);
    const padY = Math.max(h * padding, 1);
    const x = Math.max(0, minX - padX);
    const y = Math.max(0, minY - padY);
    return { x, y, w: Math.min(100 - x, w + padX * 2), h: Math.min(100 - y, h + padY * 2) };
}

/**
 * A snippet as a picture a PDF can hold: the pasted image, or the cut-out of the page image
 * (from the IIIF server, which has to allow it). Every address the server may take is tried in
 * turn (see utils/iiifUrls). Null when it cannot be had.
 *
 * @param {object} snippet an entry of `collectSnippets` / `collectionSnippets`
 * @param {{ getIiifRegionUrls: Function, getImageUrl: Function }} manifest from `useImageManifest`
 * @returns {Promise<{ dataUrl: string, width: number, height: number }|null>}
 */
export async function snippetPhoto(snippet, manifest) {
    let sources = [];
    let crop = null;
    let crossOrigin = '';
    if (snippet.kind === 'image') {
        sources = [snippet.image];
    } else {
        const region = cutoutRegion(snippet.points);
        if (!region) return null;
        const spec = `pct:${region.x.toFixed(2)},${region.y.toFixed(2)},${region.w.toFixed(2)},${region.h.toFixed(2)}`;
        sources = manifest.getIiifRegionUrls(snippet.source, snippet.folio, spec, '480');
        if (!sources.length) {
            // no IIIF service: cut it out of the whole page
            sources = [manifest.getImageUrl(snippet.source, snippet.folio)];
            crop = region;
        }
        crossOrigin = 'anonymous';
    }

    for (const src of sources.filter(Boolean)) {
        try {
            const img = await loadImage(src, crossOrigin);
            const sx = crop ? (crop.x / 100) * img.naturalWidth : 0;
            const sy = crop ? (crop.y / 100) * img.naturalHeight : 0;
            const sw = crop ? (crop.w / 100) * img.naturalWidth : img.naturalWidth;
            const sh = crop ? (crop.h / 100) * img.naturalHeight : img.naturalHeight;
            const scale = Math.min(1, 640 / sw);
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(sw * scale));
            canvas.height = Math.max(1, Math.round(sh * scale));
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), width: canvas.width, height: canvas.height };
        } catch {
            // refused, not there, or an image server that does not allow its pictures to be read: the next address
        }
    }
    return null;
}

/** An image of `w` x `h` laid into a box, as large as fits, in the middle. */
function contain(box, w, h) {
    const scale = Math.min(box.w / w, box.h / h);
    return { w: w * scale, h: h * scale, x: box.x + (box.w - w * scale) / 2, y: box.y + (box.h - h * scale) / 2 };
}

/**
 * Make the PDF and hand it to the browser as a download.
 *
 * @param {object} options
 * @param {ReturnType<import('./neumeTree.js').buildNeumeTree>} options.tree
 * @param {ReturnType<import('./neumeTree.js').layoutNeumeTree>} options.layout
 * @param {Map<object, { kind: 'shape'|'photo'|'missing', picture: object, snippet?: object, content: {w:number,h:number}, fit: number }>} options.entries
 *   what each node shows (`photo`: a snippet; `missing`: no snippet, the shape in a frame, drawn `fit` times its size)
 * @param {(snippet: object) => Promise<{ dataUrl: string, width: number, height: number }|null>} options.photo
 * @param {string} [options.caption] set under the tree, in italics
 * @param {string[]} [options.signKeys] the signs of the project: their letters are set in bold in the codes
 * @param {string} [options.filename]
 * @returns {Promise<{ width: number, height: number, photosMissing: number }>} page size in mm
 */
export async function exportNeumeTreePdf({ tree, layout, entries, photo, caption = '', signKeys = [], filename = 'neume-tree.pdf' }) {
    const { jsPDF } = await import('jspdf');

    // Pictures first: they are what takes time.
    const shapes = new Map();
    const photos = new Map();
    let photosMissing = 0;
    await Promise.all(tree.nodes.map(async (node) => {
        const entry = entries.get(node);
        if (!entry) return;
        shapes.set(node, await shapeToPng(entry.picture));
        if (entry.kind === 'photo') {
            const got = await photo(entry.snippet);
            if (got) photos.set(node, got);
            else photosMissing++;
        }
    }));

    const treeW = layout.width * MM;
    const treeH = layout.height * MM;
    const captionH = caption ? 12 : 0;

    const probe = new jsPDF({ unit: 'mm', format: [100, 100] });
    probe.setFont('times', 'italic');
    probe.setFontSize(12);
    const captionW = caption ? probe.getTextWidth(latin1(caption)) : 0;

    const pageW = Math.max(treeW + MARGIN * 2, captionW + MARGIN * 2, 60);
    const pageH = treeH + MARGIN * 2 + captionH;
    const doc = new jsPDF({ unit: 'mm', format: [pageW, pageH], orientation: pageW >= pageH ? 'landscape' : 'portrait', compress: true });
    doc.setProperties({ title: latin1(caption || 'Neume tree'), creator: 'neume-docs' });

    const ox = (pageW - treeW) / 2;
    const oy = MARGIN;
    const X = (x) => ox + x * MM;
    const Y = (y) => oy + y * MM;

    // The lines, under everything.
    doc.setDrawColor(TREE_INK);
    doc.setLineWidth(0.18);
    doc.setLineDashPattern([], 0);
    for (const e of layout.edges) {
        const x1 = X(e.x1), y1 = Y(e.y1), x2 = X(e.x2), y2 = Y(e.y2);
        if (e.y1 === e.y2) {
            doc.line(x1, y1, x2, y2);
        } else {
            const mid = (x1 + x2) / 2;
            // jsPDF takes a curve as three points relative to where it starts
            doc.lines([[mid - x1, 0, mid - x1, y2 - y1, x2 - x1, y2 - y1]], x1, y1, [1, 1], 'S', false);
        }
    }

    // The nodes.
    doc.setFont('courier', 'normal');
    doc.setFontSize(LABEL.size * 0.75);
    doc.setTextColor('#222222');
    for (const node of tree.nodes) {
        const entry = entries.get(node);
        const box = layout.boxes.get(node);
        if (!entry || !box) continue;

        const content = {
            x: X(box.x + (box.w - entry.content.w) / 2),
            y: Y(box.y),
            w: entry.content.w * MM,
            h: entry.content.h * MM
        };
        const png = shapes.get(node);
        const pic = entry.picture;

        if (entry.kind === 'photo' && photos.has(node)) {
            const got = photos.get(node);
            doc.setDrawColor('#9aa0a6');
            doc.setLineWidth(0.2);
            doc.setLineDashPattern([], 0);
            doc.rect(content.x, content.y, content.w, content.h, 'S');
            const fit = contain({ x: content.x + 0.4, y: content.y + 0.4, w: content.w - 0.8, h: content.h - 0.8 }, got.width, got.height);
            doc.addImage(got.dataUrl, 'JPEG', fit.x, fit.y, fit.w, fit.h);
        } else if (png) {
            const framed = entry.kind !== 'shape';
            // the shape as it is drawn (its size on screen, in mm) ...
            let w = pic.width * MM;
            let h = pic.height * MM;
            let x = content.x + (content.w - w) / 2;
            let y = content.y;
            if (framed) {
                // ... or, with no snippet (or none that could be read), in a dashed frame the size of a picture
                doc.setDrawColor('#9aa0a6');
                doc.setLineWidth(0.2);
                doc.setLineDashPattern([0.8, 0.8], 0);
                doc.rect(content.x, content.y, content.w, content.h, 'S');
                doc.setLineDashPattern([], 0);
                w *= entry.fit;
                h *= entry.fit;
                x = content.x + (content.w - w) / 2;
                y = content.y + (content.h - h) / 2;
            }
            doc.addImage(png, 'PNG', x, y, w, h);
        }

        // the code under it, the letters of signs (the virga) in bold
        const parts = splitCodeBySigns(latin1(node.code), signKeys);
        const widths = parts.map((part) => doc.getTextWidth(part.text));
        let at = X(box.x + box.w / 2) - widths.reduce((a, b) => a + b, 0) / 2;
        parts.forEach((part, i) => {
            doc.setFont('courier', part.isSign ? 'bold' : 'normal');
            doc.text(part.text, at, Y(box.y + entry.content.h + LABEL.gap + LABEL.height - 3));
            at += widths[i];
        });
        doc.setFont('courier', 'normal');
    }

    if (caption) {
        doc.setFont('times', 'italic');
        doc.setFontSize(12);
        doc.setTextColor('#222222');
        doc.text(latin1(caption), pageW / 2, oy + treeH + 8, { align: 'center' });
    }

    doc.save(filename);
    return { width: pageW, height: pageH, photosMissing };
}


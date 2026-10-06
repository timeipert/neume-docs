/**
 * Lines and the signs on them, for a collection of screenshots.
 *
 * A **line** is a picture of one text line with where it comes from (its
 * attributes: folio and line, and whatever else the settings ask for). A **sign**
 * is a snippet of a neume: it belongs to a line by `lineId`, says where on the
 * line it is by `box` (left, top, width, height — percent of the line image), and
 * keeps its own cut-out picture so every view that shows snippets shows it like
 * any other. A sign that is not on a line is a plain snippet.
 *
 *   collection.lines    [{ id, image, width, height, attrs, createdAt }]
 *   collection.snippets [{ id, pattern, image, lineId?, box?, attrs?, link?, variant?, … }]
 *
 * Plain functions on plain data: each returns what to put back.
 */

import { compareFolios } from './sorting.js';

const MIN_SIZE = 1.5; // percent: a box smaller than this is a stray click

let counter = 0;
export const newId = (prefix) => `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const linesOf = (collection) => (collection && Array.isArray(collection.lines) ? collection.lines : []);
export const snippetsOf = (collection) => (collection && Array.isArray(collection.snippets) ? collection.snippets : []);

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const round = (n) => Math.round(n * 100) / 100;

/**
 * A box from two corners (in any order), kept inside the image.
 * @returns {{x:number,y:number,w:number,h:number}|null} null for a stray click
 */
export function boxFromCorners(a, b) {
    const x1 = clamp(Math.min(a.x, b.x), 0, 100);
    const y1 = clamp(Math.min(a.y, b.y), 0, 100);
    const x2 = clamp(Math.max(a.x, b.x), 0, 100);
    const y2 = clamp(Math.max(a.y, b.y), 0, 100);
    if (x2 - x1 < MIN_SIZE || y2 - y1 < MIN_SIZE) return null;
    return { x: round(x1), y: round(y1), w: round(x2 - x1), h: round(y2 - y1) };
}

/** A box moved by (dx, dy), kept inside the image. */
export function moveBox(box, dx, dy) {
    return {
        x: round(clamp(box.x + dx, 0, 100 - box.w)),
        y: round(clamp(box.y + dy, 0, 100 - box.h)),
        w: box.w,
        h: box.h
    };
}

/**
 * A box with one corner dragged to `point`; the opposite corner stays.
 * @param {'nw'|'ne'|'sw'|'se'} corner
 */
export function resizeBox(box, corner, point) {
    const fixed = {
        x: corner.includes('w') ? box.x + box.w : box.x,
        y: corner.includes('n') ? box.y + box.h : box.y
    };
    return boxFromCorners(fixed, point) || box;
}

const centre = (box) => box.x + box.w / 2;

/** The signs on a line, left to right. */
export function signsOfLine(collection, lineId) {
    return snippetsOf(collection)
        .filter(s => s.lineId === lineId && s.box)
        .sort((a, b) => centre(a.box) - centre(b.box));
}

/** The place of a line: "f. 12r · l. 3" (as far as it is known). */
export function lineLabel(line) {
    const a = (line && line.attrs) || {};
    return [a.folio && `f. ${a.folio}`, a.line && `l. ${a.line}`].filter(Boolean).join(' · ') || 'Line without a place';
}

/** The lines in reading order: by folio, then line number; those without a place last. */
export function sortedLines(collection) {
    return [...linesOf(collection)].sort((a, b) => {
        const fa = (a.attrs && a.attrs.folio) || '';
        const fb = (b.attrs && b.attrs.folio) || '';
        if (!fa !== !fb) return fa ? -1 : 1;
        return compareFolios(fa, fb) || Number((a.attrs && a.attrs.line) || 0) - Number((b.attrs && b.attrs.line) || 0);
    });
}

/** The line of a folio and line number, if the collection has it. */
export function findLine(collection, folio, line) {
    return linesOf(collection).find(l => l.attrs && l.attrs.folio === folio && String(l.attrs.line) === String(line)) || null;
}

/** A line, added. @returns {{ lines: object[], line: object }} */
export function withLine(collection, { image, width = 0, height = 0, attrs = {} }) {
    const line = { id: newId('dl'), image, width, height, attrs: { ...attrs }, createdAt: new Date().toISOString() };
    return { lines: [...linesOf(collection), line], line };
}

/** A line changed. @returns {object[]} the lines */
export function withLinePatched(collection, lineId, patch) {
    return linesOf(collection).map(l => (l.id === lineId ? { ...l, ...patch, attrs: patch.attrs ? { ...patch.attrs } : l.attrs } : l));
}

/** A line taken out with its signs. @returns {{ lines: object[], snippets: object[], removed: { line: object, signs: object[] }|null }} */
export function withoutLine(collection, lineId) {
    const line = linesOf(collection).find(l => l.id === lineId);
    if (!line) return { lines: linesOf(collection), snippets: snippetsOf(collection), removed: null };
    const signs = snippetsOf(collection).filter(s => s.lineId === lineId);
    return {
        lines: linesOf(collection).filter(l => l.id !== lineId),
        snippets: snippetsOf(collection).filter(s => s.lineId !== lineId),
        removed: { line, signs }
    };
}

/** A line put back with its signs, as it was. @returns {{ lines: object[], snippets: object[] }} */
export function withLineRestored(collection, { line, signs }) {
    if (linesOf(collection).some(l => l.id === line.id)) return { lines: linesOf(collection), snippets: snippetsOf(collection) };
    const have = new Set(snippetsOf(collection).map(s => s.id));
    return {
        lines: [...linesOf(collection), line],
        snippets: [...snippetsOf(collection), ...signs.filter(s => !have.has(s.id))]
    };
}

/**
 * What the transcription says about the next sign of a line.
 *
 * Signs are read left to right and the neumes of the line in reading order, so the
 * sign that stands k-th from the left is the k-th neume. A new box is placed among
 * the signs already there, and gets the neume at its place.
 *
 * @param {Array<{ pattern: string, sysId: string }>} neumes the transcription's neumes of this line, in reading order
 * @param {Array<{ box: object }>} signs the signs already on the line
 * @param {{x:number,w:number}} box the new box
 * @returns {{ pattern: string, sysId: string, syllable: string }|null}
 */
export function neumeForBox(neumes, signs, box) {
    if (!neumes || !neumes.length) return null;
    const at = signs.filter(s => s.box && centre(s.box) < centre(box)).length;
    const neume = neumes[at];
    if (!neume) return null;
    return { pattern: neume.pattern, sysId: neume.sysId, syllable: syllableOf(neume.sysId) };
}

/** The syllable of an occurrence, from its `sysId` (document|folio|line|syllable|notes). */
export function syllableOf(sysId) {
    const parts = String(sysId || '').split('|');
    return parts.length > 3 ? parts[3] : '';
}

/**
 * The place a snippet comes from, for captions and filters: the line it is on,
 * or what it says itself.
 *
 * @returns {{ folio: string, line: string, position: number, label: string }}
 */
export function placeOfSnippet(collection, snippet) {
    if (snippet.lineId) {
        const line = linesOf(collection).find(l => l.id === snippet.lineId);
        const folio = (line && line.attrs && line.attrs.folio) || '';
        const lineNo = (line && line.attrs && line.attrs.line) || '';
        const position = signsOfLine(collection, snippet.lineId).findIndex(s => s.id === snippet.id) + 1;
        return { folio, line: lineNo, position, label: `${lineLabel(line)}${position ? ` · sign ${position}` : ''}` };
    }
    const a = snippet.attrs || {};
    const label = [a.folio && `f. ${a.folio}`, a.line && `l. ${a.line}`].filter(Boolean).join(' · ') || snippet.caption || '';
    return { folio: a.folio || '', line: a.line || '', position: 0, label };
}

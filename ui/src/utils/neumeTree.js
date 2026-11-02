/**
 * The neume tree of the Neumen-Editor: the patterns of a table arranged from left to right by how many notes they
 * have, each one grown out of a shorter one that it contains (the "Zeichenbaum" of the Corpus Monodicum volumes).
 *
 * The logic (reading a code, growing the tree, going on, hiding, placing the boxes) is shared with Monodi-Zero and
 * lives in `packages/core` of the monorepo, imported here as `@monodi/core` (`vendor/cm-core`, see
 * `packages/core/README.md`). This file re-exports it, so the app keeps importing from one place, and adds what only
 * this app needs: how a code is drawn as a picture, and the size of what is drawn.
 */

export {
    buildNeumeTree,
    continuations,
    hasSpecialSign,
    layoutNeumeTree,
    parseTreeCode,
    treeCode,
    treeNotation
} from '@monodi/core';

import { getBaseCode } from './patternCode.js';

/** Colour of the brackets and of the lines of the tree; fixed, so a PDF looks like the screen. */
export const TREE_INK = '#555555';

// ---------------------------------------------------------------------------
// Drawing a code
// ---------------------------------------------------------------------------

/**
 * The picture of a code, cut to what is in it: the room above the notes that brackets need is only
 * kept when the code has brackets. Colours are fixed, so the same picture serves the screen and a PDF.
 *
 * @param {{ width: number, height: number, content: string }} rendered what `renderSvg` made
 * @param {string} code
 * @returns {{ width: number, height: number, anchorY: number, viewBox: string, inner: string, svg: string }}
 *   `anchorY`: where the middle of the notes is, from the top
 */
export function treePicture(rendered, code) {
    const cutTop = /[[{]/.test(getBaseCode(code)) ? 0 : 12;
    const height = Math.max(8, rendered.height - cutTop);
    const inner = (rendered.content || '')
        .replace(/^<svg[^>]*>/, '')
        .replace(/<\/svg>\s*$/, '')
        .replace(/var\(--color-text-muted\)/g, TREE_INK);
    const viewBox = `0 ${cutTop} ${rendered.width} ${height}`;
    return {
        width: rendered.width,
        height,
        // The first note sits 24 high; each step of pitch is 8 further.
        anchorY: Math.max(4, 24 + (rendered.height - 32) / 2 - cutTop),
        viewBox,
        inner,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${rendered.width}" height="${height}" viewBox="${viewBox}">${inner}</svg>`
    };
}

// ---------------------------------------------------------------------------
// The size of what is drawn (screen and PDF share these, in px)
// ---------------------------------------------------------------------------

/** The code under each node: monospace, so its width is known without measuring. */
export const LABEL = { height: 14, gap: 4, size: 11, charWidth: 6.6 };
/** The picture of a snippet, and the frame a drawn shape stands in when a node has no snippet. */
export const THUMB = { w: 96, h: 68 };

/**
 * The box of a node: what it shows, and its code beneath.
 *
 * @param {{ w: number, h: number, anchorY?: number }} content
 * @param {string} code
 */
export function nodeSize(content, code) {
    return {
        w: Math.max(content.w, (code || '').length * LABEL.charWidth),
        h: content.h + LABEL.gap + LABEL.height,
        anchorY: content.anchorY === undefined ? content.h / 2 : content.anchorY
    };
}

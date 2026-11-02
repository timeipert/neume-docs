// The logic of the neume tree (reading a code, who grows out of whom, the layout, going on, hiding) is tested in
// packages/core/src/neume-tree.test.ts. What is tested here is what only this app adds: the picture of a code, and
// that the shared logic fits this app's signs.
import { describe, it, expect } from 'vitest';
import { VIRGA } from '@monodi/core';
import * as shared from '@monodi/core';
import * as tree from './neumeTree';
import { treePicture } from './neumeTree';
import { renderSvg } from './svgRenderer';
import { DEFAULT_SIGNS } from './signs';
import { GLYPHS } from '../data/glyphs';

describe('the shared neume tree', () => {
    it('tells the virga by the one sign every workspace has', () => {
        expect(VIRGA).toBe(DEFAULT_SIGNS[0].key);
    });

    it('is what the app imports from here', () => {
        for (const name of ['buildNeumeTree', 'continuations', 'hasSpecialSign', 'layoutNeumeTree', 'parseTreeCode', 'treeCode', 'treeNotation']) {
            expect(tree[name]).toBe(shared[name]);
        }
    });
});

describe('the picture of a code', () => {
    const picture = (code) => treePicture(renderSvg(code, GLYPHS, false, {}), code);

    it('keeps the room above the notes only when there are brackets', () => {
        expect(picture('*u').viewBox.split(' ')[1]).toBe('12');
        expect(picture('[*u]').viewBox.split(' ')[1]).toBe('0');
        expect(picture('[*u]').height - picture('*u').height).toBe(12);
    });

    it('is a standalone SVG with fixed colours', () => {
        const p = picture('[*ud]');
        expect(p.svg.startsWith('<svg xmlns=')).toBe(true);
        expect(p.svg).not.toContain('var(');
        expect(p.svg).toContain('<path');
    });

    it('has the lines meet the middle of the notes', () => {
        // one note: 12 above it after the cut
        expect(picture('*').anchorY).toBe(12);
        // two notes a step apart: the middle is half a step lower
        expect(picture('*u').anchorY).toBe(16);
    });
});

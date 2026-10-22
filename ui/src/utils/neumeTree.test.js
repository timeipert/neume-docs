import { describe, it, expect } from 'vitest';
import { buildNeumeTree, continuations, layoutNeumeTree, parseTreeCode, treeCode, treeNotation, treePicture } from './neumeTree';
import { renderSvg } from './svgRenderer';
import { GLYPHS } from '../data/glyphs';

const parentOf = (tree, text) => {
    const node = tree.nodes.find(n => n.text === text);
    return node ? node.parent.text : undefined;
};
const tree = (codes, options) => buildNeumeTree(codes, options);
const texts = (t) => t.nodes.map(n => n.text);

describe('the notation of the tree', () => {
    it('turns a bracket into a hyphen between the notes it joins', () => {
        expect(treeNotation('[*u]')).toBe('*-u');
        expect(treeNotation('*u')).toBe('*u');
        expect(treeNotation('*ud[ud]')).toBe('*udu-d');
        expect(treeNotation('[*ud]')).toBe('*-u-d');
        expect(treeNotation('*[ud]')).toBe('*u-d');
        expect(treeNotation('[*u]d')).toBe('*-ud');
    });

    it('does not join two groups that stand next to each other', () => {
        expect(treeNotation('[*u][ud]')).toBe('*-uu-d');
        expect(treeNotation('{*u}{ud}')).toBe('*-uu-d');
    });

    it('keeps the signs on their notes', () => {
        expect(treeNotation('*uVd')).toBe('*uVd');
        expect(treeNotation('[*V]u')).toBe('*Vu');
        expect(treeNotation('*uLA')).toBe('*uLA');
        expect(parseTreeCode('*uVd').notes).toEqual(['*', 'uV', 'd']);
    });

    it('has no hyphen for a group of one note', () => {
        expect(treeNotation('[*]')).toBe('*');
    });

    it('reads a code with a legacy variant as its code, and nothing that is not a shape', () => {
        expect(treeNotation('*u b')).toBe('*u');
        expect(treeNotation('(Clef)')).toBe('');
        expect(treeNotation('(Custos)')).toBe('');
        expect(treeNotation('')).toBe('');
        expect(treeNotation('udu')).toBe('');
    });
});

describe('who grows out of whom', () => {
    it('lets *u branch into *ud and *u-d', () => {
        const t = tree(['*', '*u', '*ud', '*[ud]']);
        expect(parentOf(t, '*u')).toBe('*');
        expect(parentOf(t, '*ud')).toBe('*u');
        expect(parentOf(t, '*u-d')).toBe('*u');
    });

    it('has the root grow the single notes: the punctum and the virga', () => {
        const t = tree(['*', '*V', '*u', '*Vd']);
        expect(t.root.children.map(n => n.text)).toEqual(['*', '*V']);
        expect(parentOf(t, '*u')).toBe('*');
        expect(parentOf(t, '*Vd')).toBe('*V');
    });

    it('tells a virga from a plain note everywhere', () => {
        const t = tree(['*', '*d', '*dV']);
        // *dV is not *d with something added: it is its own shape, as many notes as *d
        expect(parentOf(t, '*d')).toBe('*');
        expect(parentOf(t, '*dV')).toBe('*');
    });

    it('does not put a connected pattern under its unconnected twin: same notes, same column', () => {
        const t = tree(['*', '*u', '[*u]']);
        expect(parentOf(t, '*u')).toBe('*');
        expect(parentOf(t, '*-u')).toBe('*');
    });

    it('takes a hyphenless pattern as a subsequence of a hyphenated one, but not the other way round', () => {
        // *u is in *-ud (drop the hyphen); *-u is not in *u-d (that has no hyphen there)
        expect(parentOf(tree(['*', '*u', '[*u]d']), '*-ud')).toBe('*u');
        expect(parentOf(tree(['*', '[*u]', '*[ud]']), '*u-d')).toBe('*');
        expect(parentOf(tree(['*', '[*u]', '[*u]d']), '*-ud')).toBe('*-u');
    });

    it('prefers the pattern with the same hyphens', () => {
        const t = tree(['*', '*u', '[*u]', '[*u]d']);
        expect(parentOf(t, '*-ud')).toBe('*-u');
    });

    it('skips what is not there: the nearest relative it has, else the root', () => {
        expect(parentOf(tree(['*', '*udu']), '*udu')).toBe('*');
        expect(parentOf(tree(['*', '*u', '*udu']), '*udu')).toBe('*u');
        expect(parentOf(tree(['*udu']), '*udu')).toBe('');
    });

    it('needs the same notes from the start: *du does not grow out of *u', () => {
        const t = tree(['*', '*u', '*d', '*du']);
        expect(parentOf(t, '*du')).toBe('*d');
    });

    it('puts a hyphen in the shorter pattern that the longer lacks nowhere', () => {
        const t = tree(['*', '[*u]', '[*ud]', '[*u]d', '*[ud]']);
        expect(parentOf(t, '*-u-d')).toBe('*-u');
        expect(parentOf(t, '*-ud')).toBe('*-u');
        expect(parentOf(t, '*u-d')).toBe('*');
    });

    it('lets every node, however deep, lead back to the root', () => {
        const t = tree(['*', '*u', '*uu', '*uud', '*uudu', '*dd', '[*d]d', '*eV', '*uudu[ud]']);
        for (const node of t.nodes) {
            let at = node;
            let steps = 0;
            while (at.parent && steps++ < 20) at = at.parent;
            expect(at).toBe(t.root);
        }
    });
});

describe('the nodes', () => {
    it('are one for every pattern, even if it is written two ways', () => {
        const t = tree(['*', '[*]', '*u']);
        expect(t.nodes).toHaveLength(2);
        const one = t.nodes.find(n => n.text === '*');
        expect(one.codes).toEqual(['*', '[*]']);
        expect(one.code).toBe('*');
    });

    it('leave out what is not a shape, and say which', () => {
        const t = tree(['*', '(Clef)', '(Custos)', '(Clef)']);
        expect(t.skipped).toEqual(['(Clef)', '(Custos)']);
        expect(t.nodes).toHaveLength(1);
    });

    it('stand in columns by number of notes, and only those that occur', () => {
        const t = tree(['*', '*u', '*uud']);
        expect(t.columns.map(c => c.count)).toEqual([1, 2, 4]);
        expect(t.columns[2].nodes.map(n => n.text)).toEqual(['*uud']);
    });

    it('have the branches of a node top to bottom: without a virga above the virga, then up, level, down, connected last', () => {
        const t = tree(['*', '*d', '*e', '*u', '[*d]', '*dV', '*uV', '[*u]', '*dL']);
        expect(t.root.children[0].children.map(n => n.text)).toEqual(['*u', '*-u', '*e', '*d', '*-d', '*dL', '*uV', '*dV']);
    });

    it('has the plain note at the top of the first column and the virga at the bottom', () => {
        expect(tree(['*V', '*']).root.children.map(n => n.text)).toEqual(['*', '*V']);
        expect(tree(['*V', '*L', '*O', '*']).root.children.map(n => n.text)).toEqual(['*', '*L', '*O', '*V']);
    });

    it('has up above and down below under the virga as well', () => {
        const t = tree(['*V', '*Vd', '*Ve', '*Vu']);
        expect(t.root.children[0].children.map(n => n.text)).toEqual(['*Vu', '*Ve', '*Vd']);
    });

    it('come back in reading order', () => {
        const t = tree(['*', '*u', '*d', '*ud', '*du']);
        expect(t.nodes.map(n => n.text)).toEqual(['*', '*u', '*ud', '*d', '*du']);
    });

    it('are an empty tree for no codes', () => {
        const t = tree([]);
        expect(t.nodes).toEqual([]);
        expect(t.columns).toEqual([]);
        expect(layoutNeumeTree(t, () => ({ w: 10, h: 10 })).edges).toEqual([]);
    });
});

describe('the layout', () => {
    const SIZE = () => ({ w: 40, h: 30, anchorY: 15 });
    const codes = ['*', '*V', '*u', '*d', '*e', '*uu', '*ud', '*u-d', '*uud', '*dd', '*dV', '*Vd', '*uudu'];
    const t = tree(codes.map(c => c === '*u-d' ? '*[ud]' : c));
    const l = layoutNeumeTree(t, SIZE);

    it('has a box for every node, and a line for every node that has a node above it', () => {
        expect(l.boxes.size).toBe(t.nodes.length + 1);
        expect(l.edges).toHaveLength(t.nodes.length - t.root.children.length);
    });

    it('does not draw the root: the single notes are where it begins, each apart, with no line into them', () => {
        expect(t.root.children.map(n => n.text)).toEqual(['*', '*V']);
        expect(l.columns.map(c => c.count)).toEqual(t.columns.map(c => c.count));
        expect(l.columns[0].count).toBe(1);
        expect(l.columns[0].x).toBe(0);
        expect(l.edges.some(e => e.from === t.root)).toBe(false);
        for (const node of t.root.children) expect(l.boxes.get(node).x).toBe(0);
    });

    it('goes from left to right with the number of notes', () => {
        for (const node of t.nodes) {
            const parent = l.boxes.get(node.parent);
            const box = l.boxes.get(node);
            expect(box.x).toBeGreaterThan(parent.x + parent.w - 0.001);
        }
        const xs = t.columns.map(c => l.boxes.get(c.nodes[0]).x);
        expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    });

    it('never lets two boxes of one column overlap', () => {
        for (const col of t.columns) {
            const boxes = col.nodes.map(n => l.boxes.get(n)).sort((a, b) => a.y - b.y);
            for (let i = 1; i < boxes.length; i++) {
                expect(boxes[i].y).toBeGreaterThanOrEqual(boxes[i - 1].y + boxes[i - 1].h - 0.001);
            }
        }
    });

    it('keeps everything inside the picture', () => {
        for (const box of l.boxes.values()) {
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.y).toBeGreaterThanOrEqual(0);
            expect(box.x + box.w).toBeLessThanOrEqual(l.width + 0.001);
            expect(box.y + box.h).toBeLessThanOrEqual(l.height + 0.001);
        }
    });

    it('puts a node level with the middle of its branches', () => {
        const node = t.nodes.find(n => n.text === '*u');
        const mine = l.boxes.get(node);
        const first = l.boxes.get(node.children[0]);
        const last = l.boxes.get(node.children[node.children.length - 1]);
        expect(mine.y + mine.anchorY).toBeCloseTo((first.y + first.anchorY + last.y + last.anchorY) / 2, 5);
    });

    it('draws a straight line when the ends are level, a curve when they are not', () => {
        const straight = l.edges.find(e => e.y1 === e.y2);
        const curved = l.edges.find(e => e.y1 !== e.y2);
        expect(straight.d).toMatch(/^M [\d.]+ [\d.]+ L /);
        expect(curved.d).toMatch(/^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+ C /);
    });

    it('never lets a line cut across a box, even when a pattern skips a column', () => {
        const wide = tree(['*', '*V', '*u', '*ud', '*[ud]', '*udu', '*[udu]', '*uudd', '*[uu]dd', '*uV', '*uVd', '*d', '*dd', '*ddd', '*dddd', '*dddddd', '*ud', '*udL', '*eO', '*eOdd']);
        const sizes = (n) => ({ w: 30 + (n.text.length * 7) % 40, h: 20 + (n.text.length * 11) % 50, anchorY: 10 });
        const big = layoutNeumeTree(wide, sizes);
        const inside = (x, y, b) => x > b.x + 0.5 && x < b.x + b.w - 0.5 && y > b.y + 0.5 && y < b.y + b.h - 0.5;
        const bezier = (p0, p1, p2, p3, u) => (1 - u) ** 3 * p0 + 3 * (1 - u) ** 2 * u * p1 + 3 * (1 - u) * u * u * p2 + u ** 3 * p3;
        let skipped = 0;
        for (const e of big.edges) {
            const points = [];
            for (let i = 0; i <= 40; i++) {
                const u = i / 40;
                if (e.y1 === e.y2) { points.push([e.x1 + (e.x2 - e.x1) * u, e.y1]); continue; }
                points.push([e.x1 + (e.xa - e.x1) * u, e.y1]);
                const mid = (e.xa + e.xb) / 2;
                points.push([bezier(e.xa, mid, mid, e.xb, u), bezier(e.y1, e.y1, e.y2, e.y2, u)]);
                points.push([e.xb + (e.x2 - e.xb) * u, e.y2]);
            }
            for (const [x, y] of points) {
                for (const [node, box] of big.boxes) {
                    if (node === wide.root) continue;
                    expect(inside(x, y, box), `${e.from.text} -> ${e.to.text} cuts ${node.text}`).toBe(false);
                }
            }
            if (e.to.count - e.from.count > 1) skipped++;
        }
        expect(skipped).toBeGreaterThan(0);
    });

    it('bends in the gap after the column of the box the line leaves', () => {
        for (const e of l.edges.filter(e => e.y1 !== e.y2)) {
            const col = l.columns.find(c => c.count === e.from.count);
            expect(e.xa).toBeGreaterThanOrEqual(col.x + col.w);
            const next = l.columns[l.columns.indexOf(col) + 1];
            expect(e.xb).toBeLessThanOrEqual(next.x);
            expect(e.xa).toBeLessThanOrEqual(e.xb);
        }
    });

    it('has the lines end where the boxes begin', () => {
        for (const e of l.edges) {
            const a = l.boxes.get(e.from);
            const b = l.boxes.get(e.to);
            expect(e.x1).toBeGreaterThan(a.x + a.w - 0.001);
            expect(e.x2).toBeLessThan(b.x + 0.001);
            expect(e.y1).toBeCloseTo(a.y + a.anchorY, 5);
            expect(e.y2).toBeCloseTo(b.y + b.anchorY, 5);
        }
    });

    it('gives a taller box room', () => {
        const tall = layoutNeumeTree(t, n => ({ w: 40, h: n.count * 20, anchorY: 10 }));
        for (const col of t.columns) {
            const boxes = col.nodes.map(n => tall.boxes.get(n)).sort((a, b) => a.y - b.y);
            for (let i = 1; i < boxes.length; i++) {
                expect(boxes[i].y).toBeGreaterThanOrEqual(boxes[i - 1].y + boxes[i - 1].h - 0.001);
            }
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

describe('going on', () => {
    it('writes notes and hyphens as a code again', () => {
        expect(treeCode(['*', 'u'], [false])).toBe('*u');
        expect(treeCode(['*', 'u'], [true])).toBe('[*u]');
        expect(treeCode(['*', 'u', 'd'], [false, true])).toBe('*[ud]');
        expect(treeCode(['*', 'u', 'd'], [true, true])).toBe('[*ud]');
        expect(treeCode(['*', 'u', 'd'], [true, false])).toBe('[*u]d');
        expect(treeCode(['*', 'u', 'd', 'u', 'd'], [false, false, false, true])).toBe('*ud[ud]');
        expect(treeCode(['*', 'u', 'd', 'u'], [true, false, true])).toBe('[*u][du]');
    });

    it('gives back the text of the notes it was made from, whatever the links', () => {
        for (const links of [[false, false, false], [true, false, true], [true, true, true], [false, true, false], [true, false, false]]) {
            const notes = ['*', 'u', 'dV', 'e'];
            const text = notes.map((n, i) => n + (links[i] ? '-' : '')).join('');
            expect(treeNotation(treeCode(notes, links))).toBe(text);
        }
    });

    it('makes six boxes from a box: up, level, down, each apart or joined', () => {
        const node = tree(['*u']).nodes[0];
        expect(continuations(node).map(treeNotation)).toEqual(['*uu', '*u-u', '*ue', '*u-e', '*ud', '*u-d']);
    });

    it('adds the boxes to the tree, under the box it was gone on from', () => {
        const t = tree(['*', '*u'], { grown: ['*u'] });
        expect(texts(t)).toEqual(['*', '*u', '*uu', '*u-u', '*ue', '*u-e', '*ud', '*u-d']);
        expect(t.nodes.find(n => n.text === '*uu').parent.text).toBe('*u');
        expect(t.nodes.find(n => n.text === '*u').grown).toBe(true);
        expect(t.nodes.find(n => n.text === '*uu').chosen).toBe(false);
        expect(t.nodes.find(n => n.text === '*').chosen).toBe(true);
    });

    it('can go on and on: more columns than the patterns that were chosen', () => {
        const t = tree(['*'], { grown: ['*', '*u', '*uu', '*uuu'] });
        expect(t.columns.map(c => c.count)).toEqual([1, 2, 3, 4, 5]);
        expect(t.nodes.find(n => n.text === '*uuuu').parent.text).toBe('*uuu');
    });

    it('does not go on from what is not there', () => {
        expect(texts(tree(['*'], { grown: ['*uu'] }))).toEqual(['*']);
    });

    it('does not make a box twice that was chosen: it stays a chosen box', () => {
        const t = tree(['*', '*u', '*ud'], { grown: ['*u'] });
        expect(t.nodes.filter(n => n.text === '*ud')).toHaveLength(1);
        expect(t.nodes.find(n => n.text === '*ud').chosen).toBe(true);
        expect(t.nodes.find(n => n.text === '*ud').codes).toEqual(['*ud']);
    });

    it('lets a chosen pattern move under a box that was made for it', () => {
        const before = tree(['*', '*udu']);
        expect(parentOf(before, '*udu')).toBe('*');
        const after = tree(['*', '*udu'], { grown: ['*', '*u', '*ud'] });
        expect(parentOf(after, '*udu')).toBe('*ud');
    });
});

describe('going on, where it is allowed', () => {
    const upTo3 = (code) => treeNotation(code).replace(/-/g, '').length <= 3;

    it('makes only the boxes that are allowed', () => {
        const t = tree(['*', '*u'], { grown: ['*u'], allow: (code) => !treeNotation(code).includes('e') });
        expect(texts(t)).toEqual(['*', '*u', '*uu', '*u-u', '*ud', '*u-d']);
    });

    it('knows which boxes can be gone on from', () => {
        const t = tree(['*', '*uu'], { allow: upTo3 });
        expect(t.nodes.find(n => n.text === '*').canGrow).toBe(true);
        expect(t.nodes.find(n => n.text === '*uu').canGrow).toBe(false);
        // with nothing forbidden every box can
        expect(tree(['*uu']).nodes[0].canGrow).toBe(true);
    });

    it('is not "gone on from" where nothing was made', () => {
        const t = tree(['*', '*uu'], { grown: ['*uu'], allow: upTo3 });
        expect(t.nodes.find(n => n.text === '*uu').grown).toBe(false);
        expect(t.nodes).toHaveLength(2);
    });

    it('never makes a box further on from one it did not make', () => {
        // *u is not gone on from, so *uu stays out even if it is listed
        const t = tree(['*'], { grown: ['*u'], allow: () => true });
        expect(texts(t)).toEqual(['*']);
    });
});

describe('hiding', () => {
    it('takes a box out, and everything that grows out of it', () => {
        const t = tree(['*', '*u', '*ud', '*uu', '*d', '*du'], { hidden: ['*u'] });
        expect(texts(t)).toEqual(['*', '*d', '*du']);
        expect(t.hiddenCount).toBe(3);
        expect(t.hidden.map(n => n.text)).toEqual(['*u']);
    });

    it('leaves the others where they were', () => {
        const t = tree(['*', '*u', '*d', '*du'], { hidden: ['*u'] });
        expect(parentOf(t, '*du')).toBe('*d');
    });

    it('leaves columns out that are empty then', () => {
        const t = tree(['*', '*u', '*uud'], { hidden: ['*u'] });
        expect(t.columns.map(c => c.count)).toEqual([1]);
    });

    it('also hides what was made by going on, and its boxes with it', () => {
        const t = tree(['*', '*u'], { grown: ['*u'], hidden: ['*uu'] });
        expect(texts(t)).toEqual(['*', '*u', '*u-u', '*ue', '*u-e', '*ud', '*u-d']);
    });

    it('hides everything if the first box is hidden, and says nothing about what is not there', () => {
        const t = tree(['*', '*u'], { hidden: ['*', '*zz'] });
        expect(t.nodes).toEqual([]);
        expect(t.hidden.map(n => n.text)).toEqual(['*']);
        expect(t.root.children).toEqual([]);
    });
});

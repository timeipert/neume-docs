import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSnippets, cutOut, describeSnippet, cutFlags, hasInk, isJunk, readingOrder, encodePng, decodePng, otsu } from '../src/split.mjs';

/** A white picture, with filled rectangles of a colour; each `[x, y, w, h, [r, g, b]]`. */
function canvas(width, height, rects = []) {
    const data = new Uint8Array(width * height * 4).fill(255);
    for (const [x, y, w, h, [r, g, b]] of rects) {
        for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
            const p = (j * width + i) * 4;
            data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
        }
    }
    return { width, height, data };
}
const parchment = [230, 222, 170];

test('each rectangle on the white is a snippet, found in reading order', () => {
    const image = canvas(200, 160, [[110, 10, 50, 40, parchment], [10, 20, 60, 30, parchment], [20, 90, 40, 50, parchment]]);
    const boxes = findSnippets(image);
    assert.deepEqual(boxes.map(({ x, y, w, h }) => [x, y, w, h]), [[10, 20, 60, 30], [110, 10, 50, 40], [20, 90, 40, 50]]);
});

test('a picture that is all white has no snippets', () => {
    assert.deepEqual(findSnippets(canvas(80, 60)), []);
});

test('dust is not a snippet', () => {
    const image = canvas(80, 60, [[5, 5, 2, 2, [0, 0, 0]], [20, 20, 30, 30, parchment]]);
    assert.equal(findSnippets(image).length, 1);
});

test('two photographs with only a few white pixels between them are two snippets', () => {
    const image = canvas(120, 80, [[10, 10, 40, 50, parchment], [53, 10, 40, 50, parchment]]);
    const boxes = findSnippets(image);
    assert.deepEqual(boxes.map(b => [b.x, b.w]), [[10, 40], [53, 40]]);
});

test('loose ink on white paper that lies close together is one snippet', () => {
    // three small dark marks 4 px apart, none of them a block
    const ink = [20, 20, 20];
    const image = canvas(100, 100, [[20, 20, 8, 8, ink], [32, 22, 8, 8, ink], [44, 24, 8, 8, ink]]);
    const boxes = findSnippets(image);
    assert.equal(boxes.length, 1);
    assert.deepEqual([boxes[0].x, boxes[0].w], [20, 32]);
});

test('loose ink farther apart than that is two snippets', () => {
    const ink = [20, 20, 20];
    const image = canvas(100, 100, [[20, 20, 8, 8, ink], [44, 22, 8, 8, ink]]);
    assert.equal(findSnippets(image).length, 2);
});

test('snippets with the catalogue\'s usual gap between them stay apart', () => {
    const image = canvas(120, 80, [[10, 10, 40, 50, parchment], [57, 10, 40, 50, parchment]]);
    assert.equal(findSnippets(image).length, 2);
});

test('a faint halo around two snippets does not join them', () => {
    // near-white noise (values 236–250) fills a frame around both, bridging the gap between them
    const image = canvas(120, 90, [[8, 8, 104, 64, [243, 243, 243]], [14, 14, 40, 50, parchment], [64, 14, 40, 50, parchment]]);
    const boxes = findSnippets(image);
    assert.equal(boxes.length, 2);
    // each takes the halo up to about half-way: nothing of its snippet is lost
    assert.ok(boxes[0].x <= 14 && boxes[0].x + boxes[0].w >= 54);
    assert.ok(boxes[1].x <= 64 && boxes[1].x + boxes[1].w >= 104);
    // the halo may overlap a little, but neither box reaches into the other's snippet
    assert.ok(boxes[0].x + boxes[0].w <= 64 && boxes[1].x >= 54);
});

test('pale snippets with dark ink are found by their ink and keep the pale paper near it', () => {
    const image = canvas(100, 80, [[10, 10, 50, 50, [246, 246, 240]], [30, 25, 8, 20, [30, 30, 30]]]);
    const [box] = findSnippets(image);
    assert.ok(box.w >= 16 && box.h >= 28);
});

test('a large pale snippet with no dark ink in it is still a snippet', () => {
    const image = canvas(100, 80, [[10, 10, 60, 50, [246, 246, 244]]]);
    const boxes = findSnippets(image);
    assert.equal(boxes.length, 1);
    assert.deepEqual([boxes[0].w, boxes[0].h], [60, 50]);
});

test('rows are told by overlap in height, not by the top edge', () => {
    const boxes = [
        { x: 100, y: 12, w: 30, h: 40 }, { x: 10, y: 20, w: 30, h: 30 },
        { x: 50, y: 100, w: 30, h: 30 }, { x: 5, y: 104, w: 30, h: 30 }
    ];
    assert.deepEqual(readingOrder(boxes).map(b => b.x), [10, 100, 5, 50]);
});

test('cutting out copies the pixels exactly', () => {
    const image = canvas(60, 40, [[10, 5, 20, 20, [12, 34, 56]]]);
    image.data[((8) * 60 + 15) * 4] = 99; // one different pixel
    const [box] = findSnippets(image);
    const cut = cutOut(image, box);
    assert.equal(cut.width, 20);
    assert.equal(cut.height, 20);
    assert.equal(cut.data[((3) * 20 + 5) * 4], 99);
    assert.equal(cut.data[0], 12);
    assert.ok([...cut.data].filter((_, i) => i % 4 === 3).every(a => a === 255));
});

test('a rectangle fills its box; a tall dark stroke has a tall ink', () => {
    const image = canvas(80, 100, [[10, 10, 50, 80, parchment], [30, 20, 5, 60, [20, 20, 20]]]);
    const [box] = findSnippets(image);
    const look = describeSnippet(cutOut(image, box));
    assert.equal(look.fill, 1);
    assert.deepEqual(look.flags, []);
    assert.ok(look.ink.h > 5 * look.ink.w);
});

test('pure white inside a snippet is kept as it is', () => {
    const image = canvas(60, 60, [[10, 10, 40, 40, parchment]]);
    for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) image.data.fill(255, (y * 60 + x) * 4, (y * 60 + x) * 4 + 4);
    const [box] = findSnippets(image);
    const cut = cutOut(image, box);
    assert.equal(cut.data[0], 255);
    assert.ok([...cut.data].filter((_, i) => i % 4 === 3).every(a => a === 255));
});

test('a cut is flagged when it is tiny, thin or has a white band through it', () => {
    assert.deepEqual(cutFlags(cutOut(canvas(60, 60, [[10, 10, 12, 12, parchment]]), { x: 10, y: 10, w: 12, h: 12 })), ['tiny']);
    assert.deepEqual(cutFlags(cutOut(canvas(200, 60, [[10, 10, 160, 40, parchment]]), { x: 10, y: 10, w: 160, h: 40 })), []);
    assert.ok(cutFlags(cutOut(canvas(200, 60, [[10, 20, 150, 15, parchment]]), { x: 10, y: 20, w: 150, h: 15 })).includes('thin'));
    // two pieces with a white band between them, in one box
    const image = canvas(120, 80, [[10, 10, 40, 50, parchment], [60, 10, 40, 50, parchment]]);
    assert.ok(cutFlags(cutOut(image, { x: 10, y: 10, w: 90, h: 50 })).includes('parts'));
    // a white margin at the border is no band
    assert.ok(!cutFlags(cutOut(image, { x: 0, y: 0, w: 55, h: 70 })).includes('parts'));
});

test('a picture survives writing and reading', () => {
    const image = canvas(8, 6, [[1, 1, 4, 3, [1, 2, 3]]]);
    const back = decodePng(encodePng(image));
    assert.deepEqual([...back.data], [...image.data]);
});

test('otsu finds the gap between dark and light', () => {
    const t = otsu([...Array(50).fill(30), ...Array(50).fill(220)]);
    assert.ok(t >= 30 && t < 220);
});

test('a line or a strip is no snippet; a small mark or a narrow snippet is', () => {
    assert.equal(isJunk({ w: 90, h: 3 }), true);
    assert.equal(isJunk({ w: 2, h: 80 }), true);
    assert.equal(isJunk({ w: 110, h: 12 }), true);
    assert.equal(isJunk({ w: 22, h: 24 }), false);
    assert.equal(isJunk({ w: 30, h: 130 }), false);
});

test('a pale smudge has no ink; a dark mark has', () => {
    const pale = canvas(60, 40, [[5, 5, 50, 30, [236, 236, 232]]]);
    assert.equal(hasInk(cutOut(pale, { x: 5, y: 5, w: 50, h: 30 })), false);
    const marked = canvas(60, 40, [[5, 5, 50, 30, [236, 236, 232]], [20, 15, 6, 6, [40, 30, 30]]]);
    assert.equal(hasInk(cutOut(marked, { x: 5, y: 5, w: 50, h: 30 })), true);
});

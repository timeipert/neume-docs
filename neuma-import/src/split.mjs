/**
 * Takes the pictures of the overview apart.
 *
 * A cell of the catalogue's table is one picture with several snippets pasted onto a white
 * background. A snippet is a piece of the picture that is not white; it is cut out *without any change
 * to its pixels*: no scaling, no re-compression, no transparency — what the catalogue shows is what is
 * kept. The catalogue's pictures are small (a snippet is typically 80–150 px) and exist in no larger
 * size, so this is as good as the data allows.
 *
 * Finding the pieces is the hard part, because the background is not always clean white:
 *
 *  - some pictures have a faint halo of near-white noise (values of 235–252) around the snippets,
 *    which joins neighbours that are in fact apart. So a snippet is *seeded* where the picture is
 *    clearly not white (below 240), and the fainter pixels around it (below 253) are given to the
 *    nearest seed — the halo between two snippets is shared out, not bridged;
 *  - a snippet is either a *block* (a photograph: nearly every pixel of its box is not white) or loose
 *    ink on white paper, which is as white as the background and falls into pieces. Blocks are never
 *    joined to anything, for the catalogue sometimes leaves only 3 px between two of them; loose pieces
 *    that lie within 5 px of each other are one snippet;
 *  - pure white is not made transparent, for it may be in the photograph (an overexposed page).
 *
 * Everything works on `{ width, height, data }` — RGBA bytes as `pngjs` decodes them — and is pure.
 */
import { PNG } from 'pngjs';

export const decodePng = (buffer) => PNG.sync.read(buffer);

/** Writes an image; without any transparent pixel it is stored as RGB. */
export function encodePng({ width, height, data }) {
    let transparent = false;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) { transparent = true; break; }
    const png = new PNG({ width, height });
    png.data = Buffer.from(data);
    return PNG.sync.write(png, { colorType: transparent ? 6 : 2, deflateLevel: 9 });
}

/** The smallest channel of the pixel at index `i` (into RGBA bytes); a pixel that is not there counts as white. */
const darkest = (data, i) => (data[i + 3] === 0 ? 255 : Math.min(data[i], data[i + 1], data[i + 2]));

/** How far a point is from a box (0 inside it). */
const distanceTo = (x, y, b) => Math.max(b.x0 - x, x - (b.x1 - 1), 0, b.y0 - y, y - (b.y1 - 1));

/**
 * The bounding boxes of the snippets in a picture.
 *
 * @param {{ width: number, height: number, data: Uint8Array }} image
 * @param {object} [options]
 * @param {number} [options.seed=240]     below this a pixel is certainly not background
 * @param {number} [options.white=253]    below this a pixel belongs to a snippet if a seed is near enough
 * @param {number} [options.gap=6]        loose pieces closer than this many pixels (counting the pixels between) are one snippet
 * @param {number} [options.reach=8]      a faint pixel farther from every seed than this is noise
 * @param {number} [options.minArea=24]   a seed of fewer pixels is dust
 * @returns {Array<{ x: number, y: number, w: number, h: number, area: number }>}  in reading order
 */
export function findSnippets(image, { seed = 240, white = 253, gap = 6, reach = 8, minArea = 24 } = {}) {
    const { width, height, data } = image;

    // 1. seeds: the clearly non-white pieces, joined when they lie close together
    const label = new Int32Array(width * height);
    let seeds = [];
    const stack = [];
    for (let start = 0; start < width * height; start++) {
        if (label[start] || darkest(data, start * 4) >= seed) continue;
        const id = seeds.length + 1;
        let x0 = width, y0 = height, x1 = -1, y1 = -1, area = 0;
        label[start] = id;
        stack.push(start);
        while (stack.length) {
            const p = stack.pop();
            const x = p % width;
            const y = (p - x) / width;
            area++;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
            for (let dy = -1; dy <= 1; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= height) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    if (nx < 0 || nx >= width) continue;
                    const q = ny * width + nx;
                    if (!label[q] && darkest(data, q * 4) < seed) { label[q] = id; stack.push(q); }
                }
            }
        }
        seeds.push({ x0, y0, x1: x1 + 1, y1: y1 + 1, area });
    }
    seeds = joinPieces(seeds, gap, (b) => isBlock(image, b, white)).filter(b => b.area >= minArea);

    // 2. every faint-but-not-white pixel goes to the nearest seed, if one is near
    const owned = seeds.map(b => ({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, area: 0 }));
    const orphan = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (darkest(data, (y * width + x) * 4) >= white) continue;
            let best = -1, bestDistance = reach + 1;
            for (let k = 0; k < seeds.length; k++) {
                const d = distanceTo(x, y, seeds[k]);
                if (d < bestDistance) { bestDistance = d; best = k; }
            }
            if (best < 0) { orphan[y * width + x] = 1; continue; }
            const o = owned[best];
            o.area++;
            if (x < o.x0) o.x0 = x;
            if (x >= o.x1) o.x1 = x + 1;
            if (y < o.y0) o.y0 = y;
            if (y >= o.y1) o.y1 = y + 1;
        }
    }

    // 3. a large solid piece with no seed near it (a pale snippet with no dark ink in it) is a snippet too
    const found = [...owned];
    for (let start = 0; start < width * height; start++) {
        if (!orphan[start]) continue;
        let x0 = width, y0 = height, x1 = -1, y1 = -1, area = 0;
        orphan[start] = 0;
        stack.push(start);
        while (stack.length) {
            const p = stack.pop();
            const x = p % width;
            const y = (p - x) / width;
            area++;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                const q = ny * width + nx;
                if (orphan[q]) { orphan[q] = 0; stack.push(q); }
            }
        }
        const w = x1 + 1 - x0, h = y1 + 1 - y0;
        if (area >= 900 && Math.min(w, h) >= 24 && area >= 0.7 * w * h) found.push({ x0, y0, x1: x1 + 1, y1: y1 + 1, area });
    }

    const boxes = found.filter(b => b.area >= minArea).map(b => ({ x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0, area: b.area }));
    return readingOrder(boxes);
}

/** Whether a box is a block: a photograph, nearly every pixel of which is not white. */
function isBlock(image, b, white) {
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    if (Math.min(w, h) < 20) return false;
    let n = 0;
    for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) if (darkest(image.data, (y * image.width + x) * 4) < white) n++;
    return n >= 0.85 * w * h;
}

/**
 * Pieces that belong together become one: boxes that overlap, and loose pieces (not blocks) that lie
 * closer than `gap` pixels from each other. A block next to anything else stays apart.
 */
function joinPieces(list, gap, block) {
    const boxes = list.map(b => ({ ...b, block: block(b) }));
    for (let again = true; again;) {
        again = false;
        for (let i = 0; i < boxes.length && !again; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i], b = boxes[j];
                const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
                const near = !a.block && !b.block && a.x0 - gap < b.x1 && b.x0 - gap < a.x1 && a.y0 - gap < b.y1 && b.y0 - gap < a.y1;
                if (overlap || near) {
                    const merged = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), area: a.area + b.area };
                    boxes[i] = { ...merged, block: block(merged) };
                    boxes.splice(j, 1);
                    again = true;
                    break;
                }
            }
        }
    }
    return boxes;
}

/** Boxes in reading order: rows from the top, each from the left. Boxes share a row if they overlap in height by half. */
export function readingOrder(boxes) {
    const sorted = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
    const rows = [];
    for (const box of sorted) {
        const row = rows.find(r => {
            const overlap = Math.min(r.y1, box.y + box.h) - Math.max(r.y0, box.y);
            return overlap > 0.5 * Math.min(r.y1 - r.y0, box.h);
        });
        if (row) {
            row.boxes.push(box);
            row.y0 = Math.min(row.y0, box.y);
            row.y1 = Math.max(row.y1, box.y + box.h);
        } else rows.push({ y0: box.y, y1: box.y + box.h, boxes: [box] });
    }
    rows.sort((a, b) => a.y0 - b.y0);
    return rows.flatMap(r => r.boxes.sort((a, b) => a.x - b.x));
}

/** The pixels of a box, copied exactly. */
export function cutOut(image, box) {
    const { width, data } = image;
    const out = new Uint8Array(box.w * box.h * 4);
    for (let y = 0; y < box.h; y++) {
        const from = ((box.y + y) * width + box.x) * 4;
        out.set(data.subarray(from, from + box.w * 4), y * box.w * 4);
    }
    return { width: box.w, height: box.h, data: out };
}

/**
 * Whether a piece is no snippet at all: a line (a remnant of a staff line, a ruling) or a thin strip.
 * @param {{ w: number, h: number }} box
 */
export function isJunk({ w, h }) {
    const thin = Math.min(w, h);
    return thin <= 6 || (Math.max(w, h) > 5 * thin && thin < 14);
}

/**
 * Whether a cut has any ink in it: a pixel darker than `limit` (of 255). A pale smudge, the remnant of
 * a halo, has none; in the whole catalogue a real snippet's darkest pixel is nearly always below 150.
 */
export function hasInk(cut, limit = 200) {
    const { data } = cut;
    for (let i = 0; i < data.length; i += 4) {
        if (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < limit) return true;
    }
    return false;
}

/**
 * Why a cut deserves a second look — the review shows these first:
 *  - `tiny`   a side under 24 px, or very little in it: a fragment, or dust that was big enough to count
 *  - `thin`   five times longer than wide (or the other way round)
 *  - `parts`  a white band right through it, with picture on both sides: two snippets that were cut as one
 */
export function cutFlags(cut) {
    const { width, height, data } = cut;
    const flags = [];
    if (Math.min(width, height) < 24 || width * height < 900) flags.push('tiny');
    if (Math.max(width, height) > 5 * Math.min(width, height)) flags.push('thin');

    const band = (length, across, at) => {
        // white share of each line (a column, or a row), then a run of lines that are all white
        const white = new Array(length).fill(0);
        for (let i = 0; i < length; i++) {
            let n = 0;
            for (let j = 0; j < across; j++) if (darkest(data, at(i, j) * 4) >= 245) n++;
            white[i] = n / across;
        }
        const content = white.map(w => w < 0.97);
        for (let i = 0; i < length;) {
            if (content[i]) { i++; continue; }
            let j = i;
            while (j < length && !content[j]) j++;
            const before = content.slice(0, i).filter(Boolean).length;
            const after = content.slice(j).filter(Boolean).length;
            if (j - i >= 4 && before >= 12 && after >= 12) return true;
            i = j;
        }
        return false;
    };
    if (band(width, height, (i, j) => j * width + i) || band(height, width, (i, j) => i * width + j)) flags.push('parts');
    return flags;
}

/**
 * What the snippet looks like, for proposing and for judging a cut: how much of its box is not white,
 * the flags of `cutFlags`, and the extent of the dark ink in it (a tall thin stroke is likely a virga).
 *
 * @returns {{ fill: number, flags: string[], ink: { x: number, y: number, w: number, h: number, share: number } | null }}
 */
export function describeSnippet(cut) {
    const { width, height, data } = cut;
    const grey = new Float32Array(width * height);
    const values = [];
    let picture = 0;
    for (let p = 0; p < width * height; p++) {
        grey[p] = 0.299 * data[p * 4] + 0.587 * data[p * 4 + 1] + 0.114 * data[p * 4 + 2];
        values.push(grey[p]);
        if (darkest(data, p * 4) < 253) picture++;
    }
    const fill = picture / (width * height);
    const flags = cutFlags(cut);
    if (picture < 16) return { fill, flags, ink: null };

    const threshold = otsu(values);
    let x0 = width, y0 = height, x1 = -1, y1 = -1, count = 0;
    for (let p = 0; p < width * height; p++) {
        if (grey[p] > threshold) continue;
        const x = p % width, y = (p - x) / width;
        count++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
    }
    if (count < 8) return { fill, flags, ink: null };
    return { fill, flags, ink: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, share: count / (width * height) } };
}

/** Otsu's threshold for a list of grey values (0–255). */
export function otsu(values) {
    const hist = new Array(256).fill(0);
    for (const v of values) hist[Math.max(0, Math.min(255, Math.round(v)))]++;
    const total = values.length;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sumB = 0, wB = 0, best = 0, threshold = 127;
    for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (!wB) continue;
        const wF = total - wB;
        if (!wF) break;
        sumB += t * hist[t];
        const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
        if (between > best) { best = between; threshold = t; }
    }
    return threshold;
}

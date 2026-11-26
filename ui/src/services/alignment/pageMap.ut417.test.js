/**
 * Regression: manuscript Ut 417 (paginated data, foliated manifest, base offset -6).
 * Data page 94 must open canvas 44v (94 - 6 = 88 -> leaf 44, verso). A stored rule
 * without `iiifType`, or with the wrong one, used to miss the canvas and fall back
 * to the plain count (47v).
 */
import { describe, it, expect } from 'vitest';
import { buildPageMap } from './pageMap';

const labels = [];
for (let n = 1; n <= 60; n++) labels.push(`${n}r`, `${n}v`);
const pages = labels.map(l => ({ folio: l, originalFolio: l }));
const dataFolios = Array.from({ length: 21 }, (_, i) => String(80 + i));

const cases = {
    'iiifType stated': { dataType: 'paginated', iiifType: 'foliated', offset: -6, adjustments: [] },
    'iiifType missing': { dataType: 'paginated', offset: -6 },
    'iiifType stated wrongly': { dataType: 'paginated', iiifType: 'paginated', offset: -6 },
};

describe('Ut 417 base offset', () => {
    for (const [name, alignment] of Object.entries(cases)) {
        it(`maps data page 94 to 44v (${name})`, () => {
            const map = buildPageMap({ pages, dataFolios, alignment });
            const hit = map.canvasFor('94');
            expect(hit.page.folio).toBe('44v');
            expect(hit.via).toBe('offset');
            expect(map.folioOf(hit.index)).toBe('94');
        });
    }
});

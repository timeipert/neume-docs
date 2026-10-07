import { describe, expect, it } from 'vitest';
import {
    describeSysId, fitView, freeNeumes, lineNameSuggestions, lineNumber, nextFree, pageSize, pointsToRect,
    rectFromCorners, rectOnStage, rectToPoints, sortLines, stageToPage, zoomAt
} from './pageEditing';

describe('boxes', () => {
    it('are kept as four corners and read back', () => {
        const points = rectToPoints({ x: 10, y: 20, w: 30, h: 5 });
        expect(points).toBe('10.00,20.00 40.00,20.00 40.00,25.00 10.00,25.00');
        expect(pointsToRect(points)).toEqual({ x: 10, y: 20, w: 30, h: 5 });
    });

    it('stay on the page', () => {
        expect(rectToPoints({ x: -5, y: 90, w: 200, h: 30 })).toBe('0.00,90.00 100.00,90.00 100.00,100.00 0.00,100.00');
    });

    it('are drawn from either corner', () => {
        expect(rectFromCorners({ x: 40, y: 50 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, w: 30, h: 30 });
        expect(rectFromCorners({ x: -3, y: 50 }, { x: 10, y: 120 })).toEqual({ x: 0, y: 50, w: 10, h: 50 });
    });

    it('are nothing where there is no polygon', () => {
        expect(pointsToRect('')).toBeNull();
        expect(pointsToRect('a,b c,d')).toBeNull();
    });
});

describe('the page on the stage', () => {
    const stage = { w: 1000, h: 600 };

    it('is shown whole, as large as it fits, in its own proportions', () => {
        expect(pageSize(stage, 0.5)).toEqual({ w: 300, h: 600 });
        expect(pageSize(stage, 4)).toEqual({ w: 1000, h: 250 });
        expect(pageSize({ w: 0, h: 0 }, 1)).toEqual({ w: 0, h: 0 });
    });

    it('is centred when shown whole', () => {
        const base = pageSize(stage, 0.5);
        const view = fitView(stage, base);
        expect(view.s).toBeCloseTo(0.96, 2);
        expect(view.tx + (base.w * view.s) / 2).toBeCloseTo(500, 5);
    });

    it('zooms to a line, which then fills the width', () => {
        const base = pageSize(stage, 0.5); // 300 x 600
        const view = fitView(stage, base, { x: 10, y: 40, w: 80, h: 5 });
        const onStage = rectOnStage(view, base, { x: 10, y: 40, w: 80, h: 5 });
        expect(onStage.width).toBeCloseTo(960, 3);
        expect(onStage.left).toBeCloseTo(20, 3);
        expect(onStage.top + onStage.height / 2).toBeCloseTo(300, 3);
    });

    it('zooms around the point under the cursor', () => {
        const view = { s: 1, tx: 100, ty: 50 };
        const next = zoomAt(view, { x: 300, y: 200 }, 2);
        expect(next.s).toBe(2);
        // what was under the cursor still is
        expect(300 - next.tx).toBeCloseTo((300 - view.tx) * 2, 5);
        expect(200 - next.ty).toBeCloseTo((200 - view.ty) * 2, 5);
    });

    it('does not zoom without end', () => {
        expect(zoomAt({ s: 39, tx: 0, ty: 0 }, { x: 0, y: 0 }, 5).s).toBe(40);
        expect(zoomAt({ s: 0.25, tx: 0, ty: 0 }, { x: 0, y: 0 }, 0.1).s).toBe(0.2);
    });

    it('turns a point of the stage into a point of the page and back', () => {
        const base = { w: 300, h: 600 };
        const view = { s: 2, tx: 40, ty: -100 };
        const page = stageToPage(view, base, { x: 340, y: 500 });
        expect(page).toEqual({ x: 50, y: 50 });
        const box = rectOnStage(view, base, { x: page.x, y: page.y, w: 0, h: 0 });
        expect(box.left).toBeCloseTo(340, 5);
        expect(box.top).toBeCloseTo(500, 5);
    });
});

describe('lines', () => {
    it('are numbered by their names', () => {
        expect(lineNumber('Line 12')).toBe(12);
        expect(lineNumber('Zeile')).toBeNull();
    });

    it('are proposed from what the transcription has and nobody has drawn, then the next number', () => {
        expect(lineNameSuggestions(['Line 1', 'Line 2'], [1, 2, 3, 4])).toEqual(['Line 3', 'Line 4']);
        expect(lineNameSuggestions([], [])).toEqual(['Line 1']);
        expect(lineNameSuggestions(['Line 1', 'Line 4'], [])).toEqual(['Line 5']);
        expect(lineNameSuggestions(['Line 1'], [1, 2, 7])).toEqual(['Line 2', 'Line 7']);
    });

    it('are in reading order: by number, then from the top', () => {
        const regions = [
            { id: 'c', name: 'Line 10', points: '0,50 1,50 1,60 0,60' },
            { id: 'a', name: 'Line 2', points: '0,30 1,30 1,40 0,40' },
            { id: 'z', name: 'Top', points: '0,5 1,5 1,10 0,10' },
            { id: 'y', name: 'Bottom', points: '0,80 1,80 1,90 0,90' }
        ];
        expect(sortLines(regions).map(r => r.id)).toEqual(['a', 'c', 'z', 'y']);
    });
});

describe('the transcription as a help', () => {
    const neumes = [
        { sysId: 'D|1r|2|Sal-|G4' }, { sysId: 'D|1r|2|ue|F4' }, { sysId: 'D|1r|2|re|E4' }
    ];

    it('says what a neume is', () => {
        expect(describeSysId(neumes[0].sysId)).toEqual({ document: 'D', folio: '1r', line: '2', syllable: 'Sal-', notes: 'G4' });
        expect(describeSysId('').syllable).toBe('');
    });

    it('offers the neumes no snippet is linked to', () => {
        const items = [{ linkData: { sysId: neumes[1].sysId } }, { linkData: {} }, {}];
        expect(freeNeumes(neumes, items).map(n => n.sysId)).toEqual([neumes[0].sysId, neumes[2].sysId]);
    });

    it('goes on with the next free neume, and starts again at the first', () => {
        const items = [{ linkData: { sysId: neumes[0].sysId } }];
        expect(nextFree(neumes, items, neumes[0].sysId).sysId).toBe(neumes[1].sysId);
        expect(nextFree(neumes, items, neumes[2].sysId).sysId).toBe(neumes[1].sysId);
        expect(nextFree(neumes, neumes.map(n => ({ linkData: { sysId: n.sysId } })))).toBeNull();
    });
});

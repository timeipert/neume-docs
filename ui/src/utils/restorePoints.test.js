import { describe, it, expect, beforeEach } from 'vitest';
import {
    useBackend, memoryBackend, saveRestorePoint, listRestorePoints, loadRestorePoint,
    deleteRestorePoint, clearRestorePoints, MAX_POINTS
} from './restorePoints';

const snap = (n) => ({ personalTables: [], annotations: { n } });

describe('restore points', () => {
    beforeEach(() => { useBackend(memoryBackend()); });

    it('keeps a copy of the workspace that can be read back', async () => {
        const point = await saveRestorePoint(snap(1), { label: 'Before deleting', auto: true, summary: '3 snippets' });
        expect(point.label).toBe('Before deleting');
        expect(point.auto).toBe(true);
        expect(point.bytes).toBeGreaterThan(0);
        expect(await loadRestorePoint(point.id)).toEqual(snap(1));
    });

    it('lists the newest first', async () => {
        const a = await saveRestorePoint(snap(1), { label: 'A' });
        await new Promise(r => setTimeout(r, 5));
        const b = await saveRestorePoint(snap(2), { label: 'B' });
        expect((await listRestorePoints()).map(p => p.id)).toEqual([b.id, a.id]);
    });

    it('deletes one, or all', async () => {
        const a = await saveRestorePoint(snap(1), { label: 'A' });
        await saveRestorePoint(snap(2), { label: 'B' });
        await deleteRestorePoint(a.id);
        expect(await listRestorePoints()).toHaveLength(1);
        expect(await loadRestorePoint(a.id)).toBeUndefined();
        await clearRestorePoints();
        expect(await listRestorePoints()).toHaveLength(0);
    });

    it('keeps only so many, dropping automatic ones before the ones made by hand', async () => {
        const manual = await saveRestorePoint(snap(0), { label: 'By hand', auto: false });
        for (let i = 1; i <= MAX_POINTS + 2; i++) {
            await new Promise(r => setTimeout(r, 2));
            await saveRestorePoint(snap(i), { label: `Auto ${i}`, auto: true });
        }
        const points = await listRestorePoints();
        expect(points).toHaveLength(MAX_POINTS);
        expect(points.some(p => p.id === manual.id)).toBe(true);
        // the oldest automatic ones are gone, the newest is kept
        expect(points.some(p => p.label === 'Auto 1')).toBe(false);
        expect(points.some(p => p.label === `Auto ${MAX_POINTS + 2}`)).toBe(true);
    });
});

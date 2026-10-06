import { describe, it, expect } from 'vitest';
import { AREAS, WORK_AREAS, measureAreas, clearAreas } from './workspaceAreas';
import { captureWorkspace, isEmptyWorkspace } from './workspaceSnapshot';
import { freshStores, fillStores } from './workspaceTestKit';

const byKey = (areas, key) => areas.find(a => a.key === key);

describe('the parts of the workspace', () => {
    it('reports nothing for a fresh app', async () => {
        const stores = await freshStores();
        const areas = measureAreas(stores);
        expect(areas.map(a => a.key)).toEqual(AREAS.map(a => a.key));
        expect(areas.every(a => a.count === 0 && a.text === '')).toBe(true);
    });

    it('counts what each part holds, in words', async () => {
        const stores = await freshStores();
        fillStores(stores);
        const areas = measureAreas(stores);
        expect(byKey(areas, 'projects').text).toBe('1 project');
        expect(byKey(areas, 'annotations').text).toBe('3 snippets · 1 line region · 2 manual lines');
        expect(byKey(areas, 'tables').text).toBe('1 table · 2 pattern rows');
        expect(byKey(areas, 'metadata').text).toBe('1 edited cell · 1 own column · 1 own value');
        expect(byKey(areas, 'library').text).toBe('1 described pattern · 1 custom sign · 1 code variant · 1 preferred ID');
        expect(byKey(areas, 'images').text).toBe('1 manifest link · 1 IIIF table row · 1 folio alignment');
        expect(byKey(areas, 'custom').text).toBe('1 collection · 1 snippet');
        expect(byKey(areas, 'preferences').text).toBe('1 setting changed from the default');
    });

    it('treats preferences as settings, not as work', () => {
        expect(WORK_AREAS.map(a => a.key)).not.toContain('preferences');
        expect(WORK_AREAS).toHaveLength(AREAS.length - 1);
    });

    it('empties one part and leaves the others', async () => {
        const stores = await freshStores();
        fillStores(stores);
        clearAreas(stores, ['library']);
        const areas = measureAreas(stores);
        expect(byKey(areas, 'library').count).toBe(0);
        expect(stores.settings.customSigns).toEqual([]);
        expect(stores.settings.globalDisplayIds).toEqual({});
        expect(byKey(areas, 'tables').count).toBe(1);
        expect(byKey(areas, 'metadata').count).toBeGreaterThan(0);
        expect(stores.settings.displayMode).toBe('text');
    });

    it('metadata: drops edits and own columns together', async () => {
        const stores = await freshStores();
        fillStores(stores);
        clearAreas(stores, ['metadata']);
        expect(stores.meta.editedCount()).toBe(0);
        expect(stores.settings.sourceMetaFields).toEqual([]);
        expect(stores.settings.sourceMeta).toEqual({});
    });

    it('images: forgets manifest links and hand-made alignments', async () => {
        const stores = await freshStores();
        fillStores(stores);
        clearAreas(stores, ['images']);
        expect(stores.iiif.links).toEqual({});
        expect(stores.registry.entries).toEqual([]);
        expect(stores.settings.sourceAlignments).toEqual({});
    });

    it('preferences: back to the defaults, work untouched', async () => {
        const stores = await freshStores();
        fillStores(stores);
        clearAreas(stores, ['preferences']);
        expect(stores.settings.displayMode).toBe('svg');
        expect(stores.tables.tables).toHaveLength(1);
        expect(stores.settings.customSigns).toHaveLength(1);
    });

    it('every area together leaves an empty workspace', async () => {
        const stores = await freshStores();
        fillStores(stores);
        clearAreas(stores);
        expect(isEmptyWorkspace(captureWorkspace(stores))).toBe(true);
        expect(measureAreas(stores).every(a => a.count === 0)).toBe(true);
    });

    it('deleting all work leaves the preferences', async () => {
        const stores = await freshStores();
        fillStores(stores);
        clearAreas(stores, WORK_AREAS.map(a => a.key));
        expect(stores.settings.displayMode).toBe('text');
        expect(measureAreas(stores).filter(a => a.isWork).every(a => a.count === 0)).toBe(true);
    });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { installStorage } from '../utils/workspaceTestKit';

async function fresh() {
    installStorage();
    setActivePinia(createPinia());
    const { useAnnotationsStore } = await import('./annotations');
    return useAnnotationsStore();
}

describe('changeAnnotationPattern', () => {
    let store;
    beforeEach(async () => { store = await fresh(); });

    it('moves a snippet drawn on the page to the bucket of its new pattern', () => {
        store.addAnnotation('Aa 13', '8r', '*', '1,1 2,1 2,2 1,2', { id: 'a1' });
        expect(store.changeAnnotationPattern('Aa 13', '8r', '*', 'a1', '*V')).toBe(true);
        expect(store.getAnnotations('Aa 13', '8r', '*')).toHaveLength(0);
        expect(store.getAnnotations('Aa 13', '8r', '*V').map(a => a.id)).toEqual(['a1']);
    });

    it('changes the pattern of a sign on a line in place', () => {
        const regionId = store.addRegion('Aa 13', '8r', 'Line 6', '0,0 9,0 9,9 0,9');
        store.addItemToRegion(regionId, '*', '1,1 2,1 2,2 1,2', {});
        const id = store.getRegionItems(regionId)[0].id;

        expect(store.changeAnnotationPattern('Aa 13', '8r', '*', id, '*V')).toBe(true);
        expect(store.getRegionItems(regionId)).toHaveLength(1);
        expect(store.getAnnotations('Aa 13', '8r', '*')).toHaveLength(0);
        expect(store.getAnnotations('Aa 13', '8r', '*V')).toHaveLength(1);
    });

    it('keeps everything else the snippet says', () => {
        store.addAnnotation('Aa 13', '8r', '*', '1,1 2,1 2,2 1,2', { id: 'a1', variant: 'b', paleo: ['r'] });
        store.changeAnnotationPattern('Aa 13', '8r', '*', 'a1', '*V');
        expect(store.getAnnotations('Aa 13', '8r', '*V')[0]).toMatchObject({ id: 'a1', variant: 'b', paleo: ['r'] });
    });

    it('does nothing for the same pattern, an empty one, or a snippet that is not there', () => {
        store.addAnnotation('Aa 13', '8r', '*', '1,1 2,1 2,2 1,2', { id: 'a1' });
        expect(store.changeAnnotationPattern('Aa 13', '8r', '*', 'a1', '*')).toBe(false);
        expect(store.changeAnnotationPattern('Aa 13', '8r', '*', 'a1', '')).toBe(false);
        expect(store.changeAnnotationPattern('Aa 13', '8r', '*', 'nope', '*V')).toBe(false);
        expect(store.getAnnotations('Aa 13', '8r', '*')).toHaveLength(1);
    });
});

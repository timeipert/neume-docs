import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { freshStores, installStorage } from '../utils/workspaceTestKit';

// The store looks at the clock every half minute; the tests do not wait for it.
beforeEach(() => { vi.useFakeTimers(); });

async function reminder() {
    const stores = await freshStores();
    const { useSaveReminderStore } = await import('./saveReminder');
    const store = useSaveReminderStore();
    await nextTick();
    return { stores, store };
}

describe('the count of unsaved changes', () => {
    it('starts at nothing', async () => {
        const { store } = await reminder();
        expect(store.changeCount).toBe(0);
        expect(store.hasUnsavedWork).toBe(false);
    });

    it('counts a snippet', async () => {
        const { stores, store } = await reminder();
        stores.annotations.addAnnotation('Aa 13', '1r', '*u', '0,0 1,0 1,1 0,1');
        await nextTick();
        expect(store.changeCount).toBeGreaterThan(0);
    });

    it('counts a project and its columns, which are work even before the first snippet', async () => {
        const { stores, store } = await reminder();
        const project = stores.projects.create({ source: 'Aa 13' });
        await nextTick();
        const afterCreate = store.changeCount;
        expect(afterCreate).toBeGreaterThan(0);
        stores.projects.setColumns(project.id, ['*ud']);
        await nextTick();
        expect(store.changeCount).toBeGreaterThan(afterCreate);
    });

    it('counts the arrangement of the manuscripts table, and a column of your own with its values', async () => {
        const { stores, store } = await reminder();
        stores.settings.setMetadataSchema({ categories: [{ key: 'n', label: 'Notation' }] });
        await nextTick();
        expect(store.changeCount).toBeGreaterThan(0);
        const before = store.changeCount;
        stores.settings.addSourceMetaField('Ink');
        await nextTick();
        expect(store.changeCount).toBeGreaterThan(before);
    });

    it('counts a manifest address and a pattern of the library', async () => {
        const { stores, store } = await reminder();
        stores.iiif.links = { 'Aa 13': 'https://example.org/m.json' };
        await nextTick();
        const afterLink = store.changeCount;
        expect(afterLink).toBeGreaterThan(0);
        stores.library.updateEntry('*ud', { label: 'Pes' });
        await nextTick();
        expect(store.changeCount).toBeGreaterThan(afterLink);
    });

    it('does not count a change of how things are shown', async () => {
        const { stores, store } = await reminder();
        stores.settings.displayMode = 'text';
        stores.settings.snippetSize = 90;
        await nextTick();
        expect(store.changeCount).toBe(0);
    });

    it('starts again after an export', async () => {
        const { stores, store } = await reminder();
        stores.projects.create({ source: 'Aa 13' });
        await nextTick();
        store.markExported();
        expect(store.changeCount).toBe(0);
        expect(store.neverExported).toBe(false);
    });
});

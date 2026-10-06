import { describe, it, expect } from 'vitest';
import { captureWorkspace, applyWorkspace, isEmptyWorkspace } from './workspaceSnapshot';
import { freshStores, fillStores, fakeDirectStore } from './workspaceTestKit';

describe('capturing the workspace', () => {
    it('is empty for a fresh app', async () => {
        const stores = await freshStores();
        expect(isEmptyWorkspace(captureWorkspace(stores))).toBe(true);
    });

    it('holds everything the user has made', async () => {
        const stores = await freshStores();
        fillStores(stores);
        const data = captureWorkspace(stores);
        expect(data.personalTables).toHaveLength(1);
        expect(data.starredItems).toEqual(['Aa 13|1r|*u|a1']);
        expect(Object.keys(data.annotations)).toEqual(['Aa 13_1r_*u']);
        expect(data.iiifLinks['Aa 13']).toBe('https://example.org/m.json');
        expect(data.iiifRegistry.entries).toHaveLength(1);
        expect(data.patternLibrary.patterns['*ud'].label).toBe('Pes');
        expect(data.manuscriptMeta.overrides['Aa 13'].herkunftsort).toBe('Aix');
        expect(data.settings.customSigns[0].key).toBe('V');
        expect(data.settings.displayMode).toBe('text');
        expect(data.directSnippets).toHaveLength(1);
        expect(data.projects.projects).toHaveLength(1);
        expect(data.projects.projects[0]).toMatchObject({ source: 'Aa 13', from: '1r', to: '9v', columns: ['*ud'], extended: ['*uud'] });
        expect(isEmptyWorkspace(data)).toBe(false);
    });

    it('is not empty when projects are all there is', async () => {
        const stores = await freshStores();
        stores.projects.create({ source: 'Aa 13' });
        expect(isEmptyWorkspace(captureWorkspace(stores))).toBe(false);
    });

    it('is a copy: later edits do not reach into it', async () => {
        const stores = await freshStores();
        fillStores(stores);
        const data = captureWorkspace(stores);
        stores.annotations.annotations['Aa 13_1r_*u'].push({ id: 'a3' });
        stores.tables.tables[0].rows.pop();
        expect(data.annotations['Aa 13_1r_*u']).toHaveLength(2);
        expect(data.personalTables[0].rows).toHaveLength(2);
    });

    it('leaves the custom manuscripts out while they have not loaded', async () => {
        const direct = fakeDirectStore();
        direct.loaded = false;
        const stores = await freshStores({ direct });
        expect('directSnippets' in captureWorkspace(stores)).toBe(false);
    });
});

describe('restoring a workspace', () => {
    it('brings back exactly what was captured, and empties what came after', async () => {
        const stores = await freshStores();
        fillStores(stores);
        const before = captureWorkspace(stores);

        // work after the capture
        stores.annotations.annotations = {};
        stores.tables.clearAll();
        stores.library.clear();
        stores.settings.reset();
        stores.tables.getOrCreateTableForSource('Another');
        stores.meta.set('Another', 'datierung', '12th c.', '');
        stores.projects.create({ source: 'Another' });

        applyWorkspace(stores, before, { replace: true });
        expect(captureWorkspace(stores)).toEqual(before);
        expect(stores.tables.tables.map(t => t.source)).toEqual(['Aa 13']);
        expect(stores.meta.overrides.Another).toBeUndefined();
        expect(stores.projects.projects.map(p => p.source)).toEqual(['Aa 13']);
    });

    it('empties the workspace when restoring an empty capture', async () => {
        const stores = await freshStores();
        const empty = captureWorkspace(stores);
        fillStores(stores);
        applyWorkspace(stores, empty, { replace: true });
        expect(isEmptyWorkspace(captureWorkspace(stores))).toBe(true);
        expect(stores.settings.displayMode).toBe('svg');
    });

    it('without replace, only touches what the data mentions', async () => {
        const stores = await freshStores();
        fillStores(stores);
        applyWorkspace(stores, { iiifLinks: { Other: 'https://example.org/o.json' } });
        expect(stores.iiif.links).toEqual({ Other: 'https://example.org/o.json' });
        expect(stores.tables.tables).toHaveLength(1);
        expect(stores.settings.displayMode).toBe('text');
    });

    it('does not wipe custom manuscripts that the capture did not carry', async () => {
        const stores = await freshStores();
        fillStores(stores);
        applyWorkspace(stores, { personalTables: [] }, { replace: true });
        expect(stores.direct.collections).toHaveLength(1);
    });

    it('ignores settings of the wrong kind instead of breaking', async () => {
        const stores = await freshStores();
        applyWorkspace(stores, { settings: { displayMode: 'hologram', snippetSize: 'big', customSigns: 'V', autoFillIds: false } });
        expect(stores.settings.displayMode).toBe('svg');
        expect(stores.settings.snippetSize).toBe(60);
        expect(stores.settings.customSigns).toEqual([]);
        expect(stores.settings.autoFillIds).toBe(false);
    });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// The stores keep themselves in localStorage; the tests run without a browser.
function installStorage() {
    const data = new Map();
    globalThis.localStorage = {
        getItem: (k) => (data.has(k) ? data.get(k) : null),
        setItem: (k, v) => { data.set(k, String(v)); },
        removeItem: (k) => { data.delete(k); },
        clear: () => data.clear()
    };
}

async function fresh() {
    vi.resetModules();
    setActivePinia(createPinia());
    const { useSettingsStore } = await import('../stores/settings');
    const { useManuscriptTable } = await import('./useManuscriptTable');
    return { settings: useSettingsStore(), table: useManuscriptTable() };
}

const keys = (list) => list.map(c => c.key);

describe('the columns of the manuscripts table', () => {
    beforeEach(installStorage);

    it('stand in the categories they come with, until they are placed elsewhere', async () => {
        const { settings, table } = await fresh();
        table.addProjectColumn('Ink');
        const own = table.columns.value.find(c => c.key === 'proj:ink');
        expect(own.band).toBe('project');
        expect(table.columns.value[0].key).toBe('source');
        expect(table.bandLabels.value.project).toBe('Your fields');
        expect(settings.metadataSchema.categories).toEqual([]);
    });

    it('a column of your own can be made under a category, and the category comes with its columns', async () => {
        const { settings, table } = await fresh();
        const { addCategory } = await import('../utils/metadataSchema');
        settings.setMetadataSchema(addCategory(settings.metadataSchema, 'Notation').schema);
        table.addProjectColumn('Ink', 'text', 'notation');
        table.addProjectColumn('Clef', 'text', 'notation');
        const notation = table.layout.value.find(c => c.key === 'notation');
        expect(keys(notation.columns)).toEqual(['proj:ink', 'proj:clef']);
        expect(table.layout.value.find(c => c.key === 'project').columns).toEqual([]);
        // the band is the last, with its label, and its columns are the last columns
        expect(table.columns.value.slice(-2).every(c => c.band === 'notation')).toBe(true);
        expect(table.bandLabels.value.notation).toBe('Notation');
    });

    it('a list offers its values, and marks what is not in it with the reason', async () => {
        const { settings, table } = await fresh();
        const { setCheck } = await import('../utils/metadataSchema');
        table.addProjectColumn('Ink');
        settings.setMetadataSchema(setCheck(settings.metadataSchema, 'proj:ink', { kind: 'list', values: ['Iron gall', 'Carbon'] }));
        const col = table.columnByKey.value.get('proj:ink');
        expect(col.choices).toEqual(['Iron gall', 'Carbon']);
        expect(table.suggestions(col)).toEqual(['Iron gall', 'Carbon']);
        expect(table.invalid(col, 'Carbon')).toBe('');
        expect(table.invalid(col, 'Quill')).toBe('Expected one of: Iron gall, Carbon');
        expect(table.invalid(col, '')).toBe('');
    });

    it('a pattern marks what does not match, and a column without a check marks nothing', async () => {
        const { settings, table } = await fresh();
        const { setCheck } = await import('../utils/metadataSchema');
        table.addProjectColumn('Clef');
        table.addProjectColumn('Comment');
        settings.setMetadataSchema(setCheck(settings.metadataSchema, 'proj:clef', { kind: 'regex', pattern: '[CFG]', message: 'A clef is C, F or G' }));
        expect(table.invalid(table.columnByKey.value.get('proj:clef'), 'C')).toBe('');
        expect(table.invalid(table.columnByKey.value.get('proj:clef'), 'CF')).toBe('A clef is C, F or G');
        expect(table.invalid(table.columnByKey.value.get('proj:comment'), 'anything')).toBe('');
    });

    it('keeps the rules of the columns that have their own, and adds the check to them', async () => {
        const { settings, table } = await fresh();
        const { setCheck } = await import('../utils/metadataSchema');
        const manifest = table.columnByKey.value.get('iiif:manifest');
        expect(table.invalid(manifest, 'not an address')).toBe('Not a web address');
        expect(table.invalid(manifest, 'https://example.org/manifest.json')).toBe('');
        settings.setMetadataSchema(setCheck(settings.metadataSchema, 'iiif:manifest', { kind: 'regex', pattern: 'https://.*' }));
        expect(table.invalid(table.columnByKey.value.get('iiif:manifest'), 'http://example.org/m')).not.toBe('');
    });

    it('a column that is deleted takes its place and its check with it', async () => {
        const { settings, table } = await fresh();
        const { setCheck, placeColumn } = await import('../utils/metadataSchema');
        table.addProjectColumn('Ink');
        settings.setMetadataSchema(setCheck(placeColumn(settings.metadataSchema, 'proj:ink', 'iiif', 'project'), 'proj:ink', { kind: 'list', values: ['x'] }));
        settings.removeSourceMetaField('ink');
        expect(settings.metadataSchema.placement).toEqual({});
        expect(settings.metadataSchema.checks).toEqual({});
    });

    it('a list is never an editing aid for a column that cannot be edited', async () => {
        const { settings, table } = await fresh();
        const { setCheck } = await import('../utils/metadataSchema');
        settings.setMetadataSchema(setCheck(settings.metadataSchema, 'stat:neumes', { kind: 'list', values: ['1'] }));
        expect(table.columnByKey.value.get('stat:neumes').choices).toBeUndefined();
    });
});

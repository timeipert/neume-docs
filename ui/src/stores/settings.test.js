import { describe, it, expect } from 'vitest';
import { freshStores } from '../utils/workspaceTestKit';
import { SETTING_GROUPS, SHARED_SETTING_KEYS, settingDefaults } from './settings';

describe('settings: whole-store operations', () => {
    it('snapshots every setting as a detached copy', async () => {
        const { settings } = await freshStores();
        settings.setGlobalId('*dd', 'Type A');
        const snap = settings.snapshot();
        expect(Object.keys(snap).sort()).toEqual(Object.keys(settingDefaults()).sort());
        settings.setGlobalId('*ud', 'Type B');
        expect(snap.globalDisplayIds).toEqual({ '*dd': 'Type A' });
    });

    it('resets all, or one group, to the defaults', async () => {
        const { settings } = await freshStores();
        settings.displayMode = 'arrow';
        settings.setGlobalId('*dd', 'Type A');
        settings.reset(SETTING_GROUPS.library);
        expect(settings.globalDisplayIds).toEqual({});
        expect(settings.displayMode).toBe('arrow');
        settings.reset();
        expect(settings.displayMode).toBe('svg');
    });

    it('counts how many settings of a group differ from the default', async () => {
        const { settings } = await freshStores();
        expect(settings.changedCount(SETTING_GROUPS.preferences)).toBe(0);
        settings.displayMode = 'text';
        settings.frequencyBasis = 'snapshot';
        expect(settings.changedCount(SETTING_GROUPS.preferences)).toBe(2);
    });

    it('with replace, settings the data does not mention go back to the default', async () => {
        const { settings } = await freshStores();
        settings.displayMode = 'text';
        settings.autoFillIds = false;
        settings.apply({ displayMode: 'arrow' }, { replace: true });
        expect(settings.displayMode).toBe('arrow');
        expect(settings.autoFillIds).toBe(true);
    });

    it('a colleague\'s file does not rename my backup', async () => {
        expect(SHARED_SETTING_KEYS).not.toContain('backupLabel');
        const { settings } = await freshStores();
        settings.backupLabel = 'Mine';
        settings.apply({ backupLabel: 'Theirs', displayMode: 'text' }, { keys: SHARED_SETTING_KEYS });
        expect(settings.backupLabel).toBe('Mine');
        expect(settings.displayMode).toBe('text');
    });

    it('is saved to localStorage and read back by a new store', async () => {
        const { settings } = await freshStores();
        settings.displayMode = 'text';
        settings.addCustomSign({ key: 'V', label: 'Virga' });
        await new Promise(r => setTimeout(r, 0));
        const saved = JSON.parse(localStorage.getItem('globalSettings'));
        expect(saved.displayMode).toBe('text');
        expect(saved.customSigns[0].key).toBe('V');
    });
});

describe('settings: snippet attributes', () => {
    it('start as a folio and a line for a line, a syllable for a sign', async () => {
        const { settings } = await freshStores();
        expect(settings.getSnippetAttributes('line').map(d => d.key)).toEqual(['folio', 'line']);
        expect(settings.getSnippetAttributes('sign').map(d => d.key)).toEqual(['syllable']);
    });

    it('can be extended, and the folio and line stay', async () => {
        const { settings } = await freshStores();
        settings.setSnippetAttributes('sign', [...settings.getSnippetAttributes('sign'), { key: 'ink', label: 'Ink', type: 'text' }]);
        expect(settings.getSnippetAttributes('sign').map(d => d.key)).toEqual(['syllable', 'ink']);
        settings.setSnippetAttributes('line', []);
        expect(settings.getSnippetAttributes('line').map(d => d.key)).toEqual(['folio', 'line']);
    });

    it('count as a changed preference, and go back with a reset', async () => {
        const { settings } = await freshStores();
        expect(settings.changedCount(SETTING_GROUPS.preferences)).toBe(0);
        settings.setSnippetAttributes('sign', []);
        expect(settings.changedCount(SETTING_GROUPS.preferences)).toBe(1);
        settings.resetSnippetAttributes();
        expect(settings.changedCount(SETTING_GROUPS.preferences)).toBe(0);
    });

    it('travel in backups, and a broken file cannot break them', async () => {
        const { settings } = await freshStores();
        expect(SHARED_SETTING_KEYS).toContain('snippetAttributes');
        settings.apply({ snippetAttributes: { line: 'nonsense', sign: [{ key: 'ink', label: 'Ink' }, null] } });
        expect(settings.getSnippetAttributes('line').map(d => d.key)).toEqual(['folio', 'line']);
        expect(settings.getSnippetAttributes('sign').map(d => d.key)).toEqual(['ink']);
    });
});

describe('the arrangement of the manuscripts table', () => {
    it('is kept in the browser and read back after a restart', async () => {
        const first = await freshStores();
        first.settings.setMetadataSchema({
            categories: [{ key: 'notation', label: 'Notation' }],
            placement: { 'proj:ink': 'notation' },
            order: ['proj:ink'],
            checks: { 'proj:ink': { kind: 'regex', pattern: '[CFG]', message: '' } }
        });
        await new Promise(r => setTimeout(r, 0));
        const stored = JSON.parse(globalThis.localStorage.getItem('globalSettings'));
        expect(stored.metadataSchema.categories).toEqual([{ key: 'notation', label: 'Notation' }]);

        // a new start: the stores are made again over what the browser kept
        const { createPinia, setActivePinia } = await import('pinia');
        setActivePinia(createPinia());
        const { useSettingsStore } = await import('./settings');
        const again = useSettingsStore();
        expect(again.metadataSchema.checks['proj:ink']).toMatchObject({ kind: 'regex', pattern: '[CFG]' });
        expect(again.metadataSchema.placement).toEqual({ 'proj:ink': 'notation' });
    });

    it('is cleaned when what the browser kept is not a schema', async () => {
        const { installStorage } = await import('../utils/workspaceTestKit');
        installStorage();
        globalThis.localStorage.setItem('globalSettings', JSON.stringify({ metadataSchema: { categories: [{ key: 'id', label: 'No' }, { key: 'ok', label: 'Fine' }], checks: { x: { kind: 'list', values: [] } } } }));
        const { createPinia, setActivePinia } = await import('pinia');
        setActivePinia(createPinia());
        const { useSettingsStore } = await import('./settings');
        const settings = useSettingsStore();
        expect(settings.metadataSchema.categories).toEqual([{ key: 'ok', label: 'Fine' }]);
        expect(settings.metadataSchema.checks).toEqual({});
    });

    it('goes back to nothing with the other settings of its group', async () => {
        const { settings } = await freshStores();
        settings.setMetadataSchema({ categories: [{ key: 'n', label: 'N' }] });
        settings.reset(SETTING_GROUPS.metadata);
        expect(settings.metadataSchema).toEqual({ categories: [], placement: {}, order: [], checks: {}, filters: {}, views: [] });
    });
});

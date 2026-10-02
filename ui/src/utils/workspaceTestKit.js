/**
 * Test helpers: the real stores on a throwaway localStorage, with a stand-in for
 * the custom-manuscript store (which lives in IndexedDB, absent from node).
 */
import { createPinia, setActivePinia } from 'pinia';

export function installStorage() {
    const data = new Map();
    globalThis.localStorage = {
        getItem: (k) => (data.has(k) ? data.get(k) : null),
        setItem: (k, v) => { data.set(k, String(v)); },
        removeItem: (k) => { data.delete(k); },
        clear: () => data.clear()
    };
    return data;
}

export function fakeDirectStore(initial = []) {
    return {
        loaded: true,
        collections: initial,
        replaceAll(next) { this.collections = Array.isArray(next) ? next : []; },
        clearAll() { this.collections = []; }
    };
}

export async function freshStores({ direct = fakeDirectStore() } = {}) {
    installStorage();
    setActivePinia(createPinia());
    const [{ useSettingsStore }, { useAnnotationsStore }, { usePersonalTablesStore },
        { useIiifStore }, { useIiifRegistryStore }, { usePatternLibraryStore }, { useManuscriptMetaStore }] = await Promise.all([
        import('../stores/settings'), import('../stores/annotations'), import('../stores/personalTables'),
        import('../stores/iiif'), import('../stores/iiifRegistry'), import('../stores/patternLibrary'), import('../stores/manuscriptMeta')
    ]);
    return {
        settings: useSettingsStore(),
        annotations: useAnnotationsStore(),
        tables: usePersonalTablesStore(),
        iiif: useIiifStore(),
        registry: useIiifRegistryStore(),
        library: usePatternLibraryStore(),
        meta: useManuscriptMetaStore(),
        direct
    };
}

/** Put a bit of everything into the stores. */
export function fillStores(stores) {
    const { settings, annotations, tables, iiif, registry, library, meta, direct } = stores;
    annotations.annotations = { 'Aa 13_1r_*u': [{ id: 'a1' }, { id: 'a2' }] };
    annotations.regions = { 'Aa 13_1r': [{ id: 'r1', name: 'Line 1', points: '0,0' }] };
    annotations.regionItems = { r1: [{ id: 'i1', pattern: '*u' }] };
    annotations.manualLines = { 'Aa 13_1r': [1, 2] };
    const id = tables.getOrCreateTableForSource('Aa 13');
    tables.addRow('Aa 13', '*ud', { tier: 'standard' });
    tables.addRow('Aa 13', '*uud', { tier: 'expanded' });
    tables.toggleStarred('Aa 13|1r|*u|a1');
    iiif.links = { 'Aa 13': 'https://example.org/m.json' };
    registry.add({ siglum: 'Aa 13', url: 'https://example.org/m.json', label: 'Library manifest' });
    library.updateEntry('*ud', { label: 'Pes' });
    meta.set('Aa 13', 'herkunftsort', 'Aix', 'Aachen');
    settings.addSourceMetaField('Notation', '', 'text');
    settings.setSourceMetaValue('Aa 13', 'notation', 'Adiastematic');
    settings.addCustomSign({ key: 'V', label: 'Virga', abbrev: 'v', description: '', glyph: 'note', glyphSvg: '' });
    settings.addCodeVariant('*uudd', { id: 'v1', code: '*uuVdd', label: 'with virga', description: '' });
    settings.setGlobalId('*dd', 'Type A');
    settings.setSourceAlignment('Aa 13', { dataType: 'paginated', offset: 2 });
    settings.displayMode = 'text';
    direct.collections = [{ id: 'dc1', source: 'Mine', name: '', patterns: [], snippets: [{ id: 's1' }] }];
    return id;
}

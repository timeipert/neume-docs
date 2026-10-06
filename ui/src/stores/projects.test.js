import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { installStorage } from '../utils/workspaceTestKit';

async function fresh() {
    const data = installStorage();
    setActivePinia(createPinia());
    const { useProjectsStore } = await import('./projects');
    return { store: useProjectsStore(), data };
}

describe('the projects store', () => {
    let store;
    beforeEach(async () => { ({ store } = await fresh()); });

    it('creates a project with defaults for what is left out', () => {
        const p = store.create({ source: 'Aa 13' });
        expect(p).toMatchObject({
            name: 'Aa 13', source: 'Aa 13', from: '', to: '',
            focus: 'transcription', images: 'iiif', snippets: 'lines',
            columns: [], extended: [], columnsChosen: false
        });
        expect(p.id).toMatch(/^p_/);
        expect(store.get(p.id)).toEqual(p);
    });

    it('gives every project its own id', () => {
        const ids = new Set(Array.from({ length: 20 }, () => store.create({ source: 'A' }).id));
        expect(ids.size).toBe(20);
    });

    it('ignores values it does not know', () => {
        const p = store.create({ source: 'A', focus: 'both', images: 'carrier pigeon', snippets: 'neither' });
        expect([p.focus, p.images, p.snippets]).toEqual(['transcription', 'iiif', 'lines']);
    });

    it('keeps codes without variants and without repeats, and extended apart from the standard columns', () => {
        const p = store.create({ source: 'A', columns: ['*ud', '*ud b', '*ud'], extended: ['*ud', '*ddd'] });
        expect(p.columns).toEqual(['*ud']);
        expect(p.extended).toEqual(['*ddd']);
    });

    it('updates a project and remembers when', () => {
        const p = store.create({ source: 'A' });
        const q = store.update(p.id, { name: 'First hand', from: '1r', to: '9v' });
        expect(q).toMatchObject({ id: p.id, name: 'First hand', from: '1r', to: '9v', createdAt: p.createdAt });
        expect(q.updatedAt >= p.updatedAt).toBe(true);
    });

    it('marks the columns as chosen when they are set', () => {
        const p = store.create({ source: 'A' });
        expect(store.setColumns(p.id, ['*u']).columnsChosen).toBe(true);
    });

    it('removes a project and puts it back', () => {
        const p = store.create({ source: 'A', legacyKey: 'table:A' });
        const gone = store.remove(p.id);
        expect(store.get(p.id)).toBeNull();
        expect(store.dismissed).toEqual(['table:A']);
        store.restore(gone);
        expect(store.get(p.id)).toMatchObject({ source: 'A' });
        expect(store.dismissed).toEqual([]);
    });

    it('remembers the project that was opened last, and forgets it when it goes', () => {
        const p = store.create({ source: 'A' });
        store.markOpened(p.id);
        expect(store.lastOpenedId).toBe(p.id);
        store.remove(p.id);
        expect(store.lastOpenedId).toBe('');
    });

    describe('adopting old work', () => {
        const tables = [{ source: 'Aa 13', rows: [{ pattern: '*ud', tier: 'standard' }] }];
        const collections = [{ id: 'dc1', source: 'Mine', patterns: [], snippets: [] }];

        it('makes a project of each, once', () => {
            expect(store.adoptLegacy({ tables, collections })).toBe(2);
            expect(store.adoptLegacy({ tables, collections })).toBe(0);
            expect(store.projects.map(p => p.source)).toEqual(['Aa 13', 'Mine']);
        });

        it('does not bring back a project that was deleted', () => {
            store.adoptLegacy({ tables, collections });
            store.remove(store.projects[0].id);
            expect(store.adoptLegacy({ tables, collections })).toBe(0);
            expect(store.projects.map(p => p.source)).toEqual(['Mine']);
        });
    });

    it('round-trips through serialize and hydrate', async () => {
        store.create({ source: 'A', columns: ['*u'], columnsChosen: true });
        const saved = JSON.parse(JSON.stringify(store.serialize()));
        const other = (await fresh()).store;
        other.hydrate(saved);
        expect(other.projects).toEqual(store.projects);
    });

    describe('taking projects from a file', () => {
        const file = { projects: [
            { id: 'p_a', name: 'Kept', source: 'Aa 13', columns: ['*u'] },
            { id: 'p_b', name: 'Left out', source: 'Bb 2' }
        ] };

        it('adds new ones and replaces those with the same id', () => {
            store.mergeIn({ projects: [{ id: 'p_a', name: 'Old', source: 'Aa 13' }] });
            expect(store.mergeIn(file)).toBe(2);
            expect(store.projects.map(p => p.name)).toEqual(['Kept', 'Left out']);
        });

        it('leaves out the manuscripts that were not chosen', () => {
            expect(store.mergeIn(file, { skipSources: ['Bb 2'] })).toBe(1);
            expect(store.projects.map(p => p.id)).toEqual(['p_a']);
        });

        it('ignores a file without projects', () => {
            expect(store.mergeIn(null)).toBe(0);
            expect(store.mergeIn({})).toBe(0);
        });
    });

    it('survives a reload', async () => {
        const { store: first, data } = await fresh();
        first.create({ source: 'A', name: 'Kept' });
        // watchers run on the next tick
        await Promise.resolve();
        await new Promise(r => setTimeout(r, 0));
        expect(JSON.parse(data.get('projects_v1')).projects[0].name).toBe('Kept');

        setActivePinia(createPinia());
        const { useProjectsStore } = await import('./projects');
        expect(useProjectsStore().projects[0].name).toBe('Kept');
    });

    it('clears everything', () => {
        store.create({ source: 'A' });
        store.clear();
        expect(store.projects).toEqual([]);
        expect(store.dismissed).toEqual([]);
    });
});

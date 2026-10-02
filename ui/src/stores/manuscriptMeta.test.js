import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// The store keeps itself in localStorage; the tests run without a browser.
function installStorage() {
    const data = new Map();
    globalThis.localStorage = {
        getItem: (k) => (data.has(k) ? data.get(k) : null),
        setItem: (k, v) => { data.set(k, String(v)); },
        removeItem: (k) => { data.delete(k); },
        clear: () => data.clear()
    };
    return data;
}

async function freshStore() {
    setActivePinia(createPinia());
    const { useManuscriptMetaStore } = await import('./manuscriptMeta');
    return useManuscriptMetaStore();
}

describe('manuscript metadata overrides', () => {
    beforeEach(() => { installStorage(); });

    it('keeps an edit as an override of one field of one manuscript', async () => {
        const meta = await freshStore();
        meta.set('Aa 13', 'herkunftsort', 'Aix', 'Aachen');
        expect(meta.get('Aa 13', 'herkunftsort')).toBe('Aix');
        expect(meta.has('Aa 13', 'herkunftsort')).toBe(true);
        expect(meta.get('Aa 13', 'datierung')).toBeUndefined();
    });

    it('drops the override when the corpus\'s own value is put back', async () => {
        const meta = await freshStore();
        meta.set('Aa 13', 'herkunftsort', 'Aix', 'Aachen');
        meta.set('Aa 13', 'herkunftsort', 'Aachen', 'Aachen');
        expect(meta.has('Aa 13', 'herkunftsort')).toBe(false);
        expect(meta.overrides['Aa 13']).toBeUndefined();
    });

    it('treats an empty value as an override that blanks the field', async () => {
        const meta = await freshStore();
        meta.set('Aa 13', 'herkunftsort', '', 'Aachen');
        expect(meta.has('Aa 13', 'herkunftsort')).toBe(true);
        expect(meta.get('Aa 13', 'herkunftsort')).toBe('');
        // and nothing is stored for a field that is empty in the corpus too
        meta.set('Bb 2', 'kommentar', '', '');
        expect(meta.has('Bb 2', 'kommentar')).toBe(false);
    });

    it('reports the override that was there', async () => {
        const meta = await freshStore();
        meta.set('Aa 13', 'datierung', '12. Jh', '');
        expect(meta.set('Aa 13', 'datierung', '13. Jh', '')).toBe('12. Jh');
    });

    it('reverts one field, or a whole column', async () => {
        const meta = await freshStore();
        meta.set('A', 'datierung', '1', ''); meta.set('A', 'kommentar', 'x', ''); meta.set('B', 'datierung', '2', '');
        meta.revert('A', 'kommentar');
        expect(meta.has('A', 'kommentar')).toBe(false);
        expect(meta.has('A', 'datierung')).toBe(true);
        meta.revertColumn('datierung');
        expect(meta.editedCount()).toBe(0);
        expect(meta.overrides).toEqual({});
    });

    it('counts the edited values', async () => {
        const meta = await freshStore();
        meta.set('A', 'datierung', '1', ''); meta.set('A', 'kommentar', 'x', ''); meta.set('B', 'datierung', '2', '');
        expect(meta.editedCount()).toBe(3);
    });

    it('round-trips through serialize and hydrate', async () => {
        const meta = await freshStore();
        meta.set('A', 'datierung', '1', '');
        meta.setHidden(['cat:status']);
        meta.setWidth('cat:kommentar', 321.4);
        const saved = JSON.parse(JSON.stringify(meta.serialize()));

        const other = await freshStore();
        other.hydrate(saved);
        expect(other.get('A', 'datierung')).toBe('1');
        expect(other.hiddenColumns).toEqual(['cat:status']);
        expect(other.widths['cat:kommentar']).toBe(321);
    });

    it('merges someone else\'s overrides into its own', async () => {
        const meta = await freshStore();
        meta.set('A', 'datierung', 'mine', '');
        meta.set('A', 'kommentar', 'mine', '');
        meta.mergeIn({ overrides: { A: { kommentar: 'theirs' }, B: { datierung: 'new' } } });
        expect(meta.get('A', 'datierung')).toBe('mine');
        expect(meta.get('A', 'kommentar')).toBe('theirs');
        expect(meta.get('B', 'datierung')).toBe('new');
    });

    it('ignores an empty or malformed payload', async () => {
        const meta = await freshStore();
        meta.hydrate(null);
        meta.hydrate({ overrides: 'nonsense' });
        meta.mergeIn({});
        expect(meta.overrides).toEqual({});
    });

    it('starts from what localStorage holds', async () => {
        const data = installStorage();
        data.set('manuscriptMeta_v1', JSON.stringify({ overrides: { Z: { datierung: 'saved' } }, hiddenColumns: null, widths: {} }));
        const meta = await freshStore();
        expect(meta.get('Z', 'datierung')).toBe('saved');
    });
});

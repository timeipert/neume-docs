import { describe, it, expect } from 'vitest';
import { freshStores } from '../utils/workspaceTestKit';

describe('the IIIF table', () => {
    it('adds a row, once per manuscript and address', async () => {
        const { registry } = await freshStores();
        const a = registry.add({ siglum: ' D-Eu 84 ', url: 'https://example.org/m.json', label: 'Library' });
        const b = registry.add({ siglum: 'D-Eu 84', url: 'https://example.org/m.json' });
        expect(registry.entries).toHaveLength(1);
        expect(b.id).toBe(a.id);
        expect(a.siglum).toBe('D-Eu 84');
        expect(a.kind).toBe('manifest');
    });

    it('refuses a row without a manuscript or an address', async () => {
        const { registry } = await freshStores();
        expect(registry.add({ siglum: '', url: 'https://example.org/m.json' })).toBeNull();
        expect(registry.add({ siglum: 'X', url: '  ' })).toBeNull();
        expect(registry.entries).toEqual([]);
    });

    it('keeps several addresses for one manuscript, and finds them', async () => {
        const { registry } = await freshStores();
        registry.add({ siglum: 'A', url: 'https://example.org/1' });
        registry.add({ siglum: 'A', url: 'https://example.org/2', kind: 'images' });
        registry.add({ siglum: 'B', url: 'https://example.org/3' });
        expect(registry.forSiglum('A')).toHaveLength(2);
        expect(registry.forSiglum('A')[1].kind).toBe('images');
    });

    it('edits and removes rows', async () => {
        const { registry } = await freshStores();
        const e = registry.add({ siglum: 'A', url: 'https://example.org/1' });
        registry.update(e.id, { label: 'Renamed' });
        expect(registry.entries[0].label).toBe('Renamed');
        registry.remove(e.id);
        expect(registry.entries).toEqual([]);
    });

    it('remembers suggestions that were turned down, and can take that back', async () => {
        const { registry } = await freshStores();
        registry.dismiss('A', 17);
        registry.dismiss('A', 17);
        expect(registry.isDismissed('A', 17)).toBe(true);
        expect(registry.isDismissed('A', 18)).toBe(false);
        expect(registry.dismissed.A).toEqual([17]);
        registry.undismiss('A', 17);
        expect(registry.isDismissed('A', 17)).toBe(false);
        expect(registry.dismissed).toEqual({});
    });

    it('merges a colleague\'s rows without duplicating', async () => {
        const { registry } = await freshStores();
        registry.add({ siglum: 'A', url: 'https://example.org/1' });
        registry.mergeIn({ entries: [{ siglum: 'A', url: 'https://example.org/1' }, { siglum: 'B', url: 'https://example.org/2' }] });
        expect(registry.entries.map(e => e.siglum)).toEqual(['A', 'B']);
    });

    it('serialises and hydrates, rows and dismissals together', async () => {
        const { registry } = await freshStores();
        registry.add({ siglum: 'A', url: 'https://example.org/1' });
        registry.dismiss('B', 3);
        const saved = JSON.parse(JSON.stringify(registry.serialize()));
        registry.clear();
        expect(registry.entries).toEqual([]);
        registry.hydrate(saved);
        expect(registry.entries).toHaveLength(1);
        expect(registry.isDismissed('B', 3)).toBe(true);
    });
});

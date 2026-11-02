import { describe, expect, it } from 'vitest';
import { groupByRegion, regionOf } from './regions';

describe('regions of origin', () => {
    it('says a catalogue region in English and puts it in the order of the plan', () => {
        expect(regionOf('Quellen aquitanischer Herkunft')).toEqual({ label: 'Manuscripts of Aquitanian Origin', rank: 1 });
        expect(regionOf('Quellen deutscher Herkunft').rank).toBeGreaterThan(regionOf('Quellen französischer Herkunft').rank);
    });
    it('keeps a region it does not know, after the known ones', () => {
        const r = regionOf('Quellen aus Atlantis');
        expect(r.label).toBe('Quellen aus Atlantis');
        expect(r.rank).toBeGreaterThan(regionOf('Quellen aus Ordenstraditionen').rank);
    });
    it('groups manuscripts by region and gives each its date', () => {
        const columns = [{ key: 'herkunftsregion', label: 'Region of origin' }, { key: 'datierung', label: 'Date' }];
        const groups = groupByRegion([
            { id: 'Pa 903', source: 'Pa 903', meta: { herkunftsregion: 'Quellen aquitanischer Herkunft', datierung: '11. Jh' } },
            { id: 'Aa 13', source: 'Aa 13', meta: { herkunftsregion: 'Quellen deutscher Herkunft', datierung: '12. Jh 2. Hälfte' } },
            { id: 'Pa 1119', source: 'Pa 1119', meta: { herkunftsregion: 'Quellen aquitanischer Herkunft' } }
        ], columns);
        expect(groups.map(g => g.label)).toEqual(['Manuscripts of Aquitanian Origin', 'Manuscripts of German Origin']);
        expect(groups[0].entries.map(e => e.source)).toEqual(['Pa 903', 'Pa 1119']);
        expect(groups[1].entries[0].date).toBe('12. Jh 2. Hälfte');
    });
    it('puts everything in one group when no region is known', () => {
        expect(groupByRegion([{ id: 'x', source: 'x', meta: {} }], [])).toHaveLength(1);
    });
});

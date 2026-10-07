import { describe, expect, it } from 'vitest';
import { extractManuscripts, getManuscriptStats } from './workspaceSharing';

const state = {
    personalTables: [],
    annotations: { 'Aa 13_1r_*u': [{ id: 1 }] },
    regions: {},
    regionItems: {},
    manualLines: {},
    // Aa 13 has work; New 1 has a manifest and nothing else yet
    iiifLinks: { 'Aa 13': 'https://example.org/a.json', 'New 1': 'https://example.org/n.json', 'Other 2': 'https://example.org/o.json' }
};

describe('a backup of manuscripts', () => {
    it('keeps the work of the manuscripts that have some', () => {
        const out = extractManuscripts(state, ['Aa 13', 'New 1'], { onlyWithData: true });
        expect(Object.keys(out.annotations)).toEqual(['Aa 13_1r_*u']);
    });

    it('keeps the manifest of a manuscript that has no work yet, as a project just started has none', () => {
        expect(getManuscriptStats(state, 'New 1').hasData).toBe(false);
        const out = extractManuscripts(state, ['Aa 13', 'New 1'], { onlyWithData: true });
        expect(out.iiifLinks).toEqual({ 'Aa 13': 'https://example.org/a.json', 'New 1': 'https://example.org/n.json' });
    });

    it('does not take the manifest of a manuscript that was not asked for', () => {
        const out = extractManuscripts(state, ['Aa 13'], { onlyWithData: true });
        expect(Object.keys(out.iiifLinks)).toEqual(['Aa 13']);
    });
});

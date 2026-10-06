import { describe, it, expect } from 'vitest';
import {
    EXCHANGE_FORMAT, parsePageKey, makeUuidLookup, buildSourceExchange, buildExchange,
    placeRegion, planImport, planIsEmpty, parseExchange, findDrift
} from './annotationExchange';

const PAGES = [
    { folio: '1r', serviceUrl: 'https://img/a/', canvasId: 'https://m/c/0', canvasIndex: 0 },
    { folio: '1v', serviceUrl: 'https://img/b', canvasId: 'https://m/c/1', canvasIndex: 1 },
    { folio: '2r', serviceUrl: 'https://img/c', canvasId: 'https://m/c/2', canvasIndex: 2 }
];

// occurrence = [documentId, folio, line, syllable, notes]; its first note's uuid sits beside it
const OCC = { '*u': [['D1', '1r', '1', 'Pa-', 'G4-A4'], ['D1', '1v', '2', 'ter', 'F4-G4']], '*': [['D1', '1r', '1', 'no', 'G4']] };
const UUIDS = { '*u': ['n-1', 'n-2'], '*': ['n-3'] };
const LINES = { '1r': { '1': 'lc-1r-1' }, '1v': { '2': 'lc-1v-2' } };

const workspace = (extra = {}) => ({
    regions: { 'Aa 1_1r': [{ id: 'r_1', name: 'Line 1', points: '0,0 10,0 10,5 0,5' }] },
    regionItems: {
        r_1: [
            { id: 111, pattern: '*u', points: '1,1 2,1 2,2 1,2', linkData: { sysId: 'D1|1r|1|Pa-|G4-A4' } },
            { id: 112, pattern: '*', variant: 'b', points: '3,1 4,1 4,2 3,2', linkData: { sysId: 'D1|1r|1|no|G4' } },
            { id: 113, pattern: '*u b', points: '5,1 6,1 6,2 5,2' }
        ]
    },
    personalTables: [{ source: 'Aa 1', rows: [{ pattern: '*u', customId: '12', notes: 'rising' }, { pattern: '*', customId: '*' }] }],
    iiifLinks: {},
    ...extra
});
const source = (extra = {}) => ({ name: 'Aa 1', id: 'src-1', lineUuids: LINES, pages: PAGES, occurrences: OCC, noteUuids: UUIDS, ...extra });

describe('parsePageKey', () => {
    it('splits from the right, so a name may hold an underscore', () => {
        expect(parsePageKey('WiSch 4_5_12r')).toEqual({ source: 'WiSch 4_5', folio: '12r' });
        expect(parsePageKey('nokey')).toBeNull();
    });
});

describe('makeUuidLookup', () => {
    const find = makeUuidLookup(OCC, UUIDS);
    it('finds the uuid of the occurrence a snippet links to', () => {
        expect(find('*u', 'D1|1v|2|ter|F4-G4')).toBe('n-2');
        expect(find('*u b', 'D1|1r|1|Pa-|G4-A4')).toBe('n-1'); // legacy variant on the pattern
    });
    it('says nothing when it cannot tell', () => {
        expect(find('*u', 'D1|9r|1|x|y')).toBe('');
        expect(find('*u', '')).toBe('');
        expect(makeUuidLookup(null, null)('*u', 'D1|1r|1|Pa-|G4-A4')).toBe('');
    });
});

describe('buildSourceExchange', () => {
    const { record } = buildSourceExchange(source({ manifestUrl: 'https://m/manifest.json' }), workspace());

    it('names the source by Monodi\'s id and its siglum', () => {
        expect(record).toMatchObject({ id: 'src-1', quellensigle: 'Aa 1', iiifManifestUrl: 'https://m/manifest.json' });
    });

    it('tells a region\'s page every way it can', () => {
        expect(record.annotationRegions).toEqual([{
            id: 'r_1', name: 'Line 1', points: '0,0 10,0 10,5 0,5',
            folio: '0', folioLabel: '1r', canvasId: 'https://m/c/0', imageId: 'https://img/a',
            lineUUID: 'lc-1r-1' // both linked snippets lie on line 1 of 1r
        }]);
    });

    it('sends snippets with their uuid when they are linked, ids as strings', () => {
        expect(record.annotationItems).toEqual([
            { id: '111', regionId: 'r_1', pattern: '*u', variant: '', points: '1,1 2,1 2,2 1,2', uuid: 'n-1' },
            { id: '112', regionId: 'r_1', pattern: '*', variant: 'b', points: '3,1 4,1 4,2 3,2', uuid: 'n-3' },
            { id: '113', regionId: 'r_1', pattern: '*u', variant: 'b', points: '5,1 6,1 6,2 5,2' }
        ]);
    });

    it('does not guess a line when the linked snippets lie on different lines', () => {
        const ws = workspace();
        ws.regionItems.r_1[1].linkData.sysId = 'D1|1v|2|ter|F4-G4';
        ws.regionItems.r_1[1].pattern = '*u';
        const out = buildSourceExchange(source(), ws).record;
        expect(out.annotationRegions[0].lineUUID).toBeUndefined();
    });

    it('leaves the line alone when nothing is linked, and keeps a lineUUID that was set', () => {
        const ws = workspace();
        for (const i of ws.regionItems.r_1) delete i.linkData;
        expect(buildSourceExchange(source(), ws).record.annotationRegions[0].lineUUID).toBeUndefined();
        ws.regions['Aa 1_1r'][0].lineUUID = 'chosen';
        expect(buildSourceExchange(source(), ws).record.annotationRegions[0].lineUUID).toBe('chosen');
    });

    it('sends equivalents, and no id for a row that only repeats its pattern', () => {
        expect(record.equivalents).toEqual([
            { pattern: '*u', refId: '12', notes: 'rising' },
            { pattern: '*', refId: '', notes: '' }
        ]);
    });

    it('falls back to the label for the legacy folio when the manifest index is unknown', () => {
        const out = buildSourceExchange(source({ pages: [{ folio: '1r' }] }), workspace()).record;
        expect(out.annotationRegions[0]).toMatchObject({ folio: '1r', folioLabel: '1r' });
        expect(out.annotationRegions[0].canvasId).toBeUndefined();
    });

    it('leaves out the holding pen of unassigned snippets and other sources', () => {
        const ws = workspace();
        ws.regions['Aa 1_2r'] = [{ id: 'r_u', name: 'x', points: '', unassigned: true }];
        ws.regions['Aa 10_1r'] = [{ id: 'r_other', name: 'Line 1', points: '' }];
        expect(buildSourceExchange(source(), ws).record.annotationRegions.map(r => r.id)).toEqual(['r_1']);
    });
});

describe('buildExchange', () => {
    it('writes the format header and counts what it sends', () => {
        const { file, counts } = buildExchange([source(), source({ name: 'Empty 1', id: 'e' })], workspace(), { now: new Date('2026-10-04T10:00:00Z') });
        expect(file).toMatchObject({ format: EXCHANGE_FORMAT, version: 1, generator: 'neumen-editor', exportedAt: '2026-10-04T10:00:00.000Z' });
        expect(file.sources.map(s => s.quellensigle)).toEqual(['Aa 1']);
        expect(counts).toEqual({ sources: 1, regions: 1, items: 3, linked: 2, equivalents: 2 });
    });
});

describe('placeRegion', () => {
    it('prefers canvas id, then image id, then the label', () => {
        expect(placeRegion({ canvasId: 'https://m/c/2', imageId: 'https://img/a', folioLabel: '1r' }, PAGES)).toEqual({ folio: '2r' });
        expect(placeRegion({ imageId: 'https://img/b/', folioLabel: '1r' }, PAGES)).toEqual({ folio: '1v' });
        expect(placeRegion({ folioLabel: '113 v' }, PAGES)).toEqual({ folio: '113v' });
    });

    it('reads a folio that is a label, but a number as Monodi\'s canvas index', () => {
        expect(placeRegion({ folio: '113r' }, PAGES)).toEqual({ folio: '113r' });
        expect(placeRegion({ folio: '2' }, PAGES)).toEqual({ folio: '2r' });
    });

    it('does not guess when the manifest is not known', () => {
        expect(placeRegion({ folio: '2' }, [])).toMatchObject({ folio: null });
        expect(placeRegion({}, PAGES)).toMatchObject({ folio: null });
    });
});

describe('planImport', () => {
    const incoming = {
        iiifManifestUrl: 'https://m/manifest.json',
        equivalents: [{ pattern: '*u', refId: '99' }, { pattern: '*d', refId: '7', notes: 'falling' }],
        annotationRegions: [
            { id: 'r_1', name: 'Line 1', points: 'a', folio: '0' },                                   // already here
            { id: 'r_m', name: 'Line 3', points: 'b', folio: '2', lineUUID: 'lc-x' },                  // Monodi's index 2 -> 2r
            { id: 'r_v', name: 'Line 1', points: 'c', folio: '113r', folioLabel: '113r' },
            { id: 'r_lost', name: 'Line 9', points: 'd', folio: '40' }                                  // no such canvas
        ],
        annotationItems: [
            { id: '111', regionId: 'r_1', pattern: '*u', points: 'p' },                               // already here
            { id: 'i_new', regionId: 'r_1', pattern: '*', points: 'q', uuid: 'n-3' },                  // new, into a region we have
            { id: 'i_m', regionId: 'r_m', pattern: '*u', variant: 'a', points: 'r', uuid: 'n-1' },     // into a region this plan brings
            { id: 'i_orphan', regionId: 'r_lost', pattern: '*', points: 's' }                          // its region could not be placed
        ]
    };
    const plan = planImport(incoming, { name: 'Aa 1', pages: PAGES }, workspace());

    it('adds only what the editor does not have', () => {
        expect(plan.regions.map(r => [r.folio, r.region.id])).toEqual([['2r', 'r_m'], ['113r', 'r_v']]);
        expect(plan.items.map(i => [i.regionId, i.item.id])).toEqual([['r_1', 'i_new'], ['r_m', 'i_m']]);
        expect(plan.counts).toMatchObject({ regions: 2, items: 2, equivalents: 1, alreadyHere: 1 });
    });

    it('keeps the line link and the uuid, and reports what it could not place', () => {
        expect(plan.regions[0].region.lineUUID).toBe('lc-x');
        expect(plan.items[1].item).toMatchObject({ uuid: 'n-1', variant: 'a' });
        expect(plan.counts.unplaced).toHaveLength(1);
        expect(plan.counts.unplaced[0]).toMatchObject({ id: 'r_lost' });
    });

    it('takes equivalents for patterns the table lacks, and the manifest if there is none', () => {
        expect(plan.equivalents).toEqual([{ pattern: '*d', customId: '7', notes: 'falling' }]);
        expect(plan.iiifManifestUrl).toBe('https://m/manifest.json');
        expect(planImport(incoming, { name: 'Aa 1', pages: PAGES }, workspace({ iiifLinks: { 'Aa 1': 'https://mine' } })).iiifManifestUrl).toBe('');
    });

    it('is empty when there is nothing new', () => {
        const same = planImport({ annotationRegions: [{ id: 'r_1', folio: '0' }], annotationItems: [], equivalents: [{ pattern: '*u', refId: '1' }] }, { name: 'Aa 1', pages: PAGES }, workspace());
        expect(planIsEmpty(same)).toBe(true);
        expect(planIsEmpty(plan)).toBe(false);
    });

    it('does not change the workspace it was given', () => {
        const ws = workspace();
        const before = JSON.stringify(ws);
        planImport(incoming, { name: 'Aa 1', pages: PAGES }, ws);
        expect(JSON.stringify(ws)).toBe(before);
    });
});

describe('parseExchange', () => {
    it('reads its own file', () => {
        const { file } = buildExchange([source()], workspace());
        expect(parseExchange(JSON.stringify(file)).sources).toHaveLength(1);
    });
    it('refuses another file, and a newer one', () => {
        expect(() => parseExchange({ sources: [] })).toThrow(/not an annotation exchange file/);
        expect(() => parseExchange({ format: EXCHANGE_FORMAT, version: 99, sources: [] })).toThrow(/newer version/);
    });
});

describe('findDrift', () => {
    const ws = {
        regions: { 'Aa 1_5r': [{ id: 'a' }, { id: 'b' }], 'Aa 1_9r': [{ id: 'c' }], 'Aa 1_7r': [{ id: 'd' }], 'Bb 1_5r': [{ id: 'e' }] },
        regionItems: { a: [{ id: 1 }, { id: 2 }], b: [{ id: 3 }], c: [], d: [{ id: 4 }] }
    };

    it('reports annotated folios that were in the transcription and are not any more', () => {
        const drift = findDrift({ name: 'Aa 1', oldFolios: ['5r', '6r', '7r'], newFolios: ['6r', '7r'] }, ws);
        expect(drift).toEqual([{ folio: '5r', regions: 2, items: 3, suggestion: '' }]);
    });

    it('does not call a page the transcription never covered drift', () => {
        expect(findDrift({ name: 'Aa 1', oldFolios: ['5r'], newFolios: ['5r'] }, ws)).toEqual([]);
    });

    it('suggests the folio that now shows the same image', () => {
        const drift = findDrift({
            name: 'Aa 1', oldFolios: ['5r', '6r'], newFolios: ['6r', '6v'],
            oldImages: [['5r', 'https://img/x/'], ['6r', 'https://img/y']], newImages: [['6r', 'https://img/y'], ['6v', 'https://img/x']]
        }, ws);
        expect(drift).toEqual([{ folio: '5r', regions: 2, items: 3, suggestion: '6v' }]);
    });
});

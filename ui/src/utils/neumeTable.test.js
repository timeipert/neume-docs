import { describe, it, expect } from 'vitest';
import {
    STANDARD_DIRECTIONS,
    classify,
    signatureOf,
    directionOf,
    toneCount,
    firstSpecialSign,
    buildFrequency,
    withFallback,
    compareDirections,
    compareSignatures,
    compareCodes,
    sortCodes,
    defaultTier,
    tierOf,
    selectedSignatures,
    canSelectForStandard,
    columnFor,
    buildColumns,
    rowsForMode,
    libraryForColumn,
    searchLibrary,
    tableProgress,
    groupColumns
} from './neumeTable';

/**
 * Counts of the Corpus Monodicum, as measured on the full corpus, for the codes
 * the brief orders. Written per direction; brackets and signs are added to some
 * to prove they are counted into their direction.
 */
const CM = {
    '*': 689699,
    '[*d]': 59000, '*d': 488, '*dL': 12223, '[*dO]': 54,
    '*u': 58913, '[*uL]': 6465, '*uO': 340,
    '*e': 3794, '*eO': 5863,
    '*dd': 17263, '[*d]d': 700, '[*dL]d': 188,
    '*ud': 14809, '[*u]d': 1500, '[*ud]': 478,
    '*uu': 7814, '*uuL': 889, '*uuQ': 2249,
    '*ed': 3532, '*edL': 1150, '*eOd': 2511,
    '*du': 6319, '*duL': 219,
    '*udd': 6226, '[*u]dd': 517,
    '*ddd': 4400,
    '*uud': 2433, '*uudL': 906,
    '*ddu': 2785, '*dduL': 85
};
// CM direction totals: *d 71765  *u 65719  *e 9657  *dd 18151  *ud 16787  *uu 10952
// *ed 7530  *du 6538  *udd 6743  *ddd 4500  *uud 3339  *ddu 2870

const freq = buildFrequency(CM);

describe('reading a code', () => {
    it('drops brackets for the signature and signs for the direction', () => {
        expect(signatureOf('[*u]dL')).toBe('*udL');
        expect(signatureOf('*[uO]d')).toBe('*uOd');
        expect(directionOf('[*uL]d')).toBe('*ud');
        expect(directionOf('*uQueOd')).toBe('*uued');
    });

    it('counts notes as tones', () => {
        expect(toneCount('*')).toBe(1);
        expect(toneCount('*d')).toBe(2);
        expect(toneCount('[*u]dd')).toBe(4);
        expect(toneCount('*uQueOd')).toBe(5);
        expect(toneCount('(Start)')).toBe(0);
    });

    it('assigns a pattern to the column of its FIRST special sign', () => {
        expect(firstSpecialSign('*dL')).toBe('L');
        expect(firstSpecialSign('*uOdL')).toBe('O');
        expect(firstSpecialSign('*eOdL')).toBe('O');
        expect(firstSpecialSign('*uQueOd')).toBe('Q');
        expect(firstSpecialSign('*SeS')).toBe('S');
        expect(firstSpecialSign('*LA')).toBe('L');
        expect(firstSpecialSign('*ud')).toBe('');
    });

    it('classifies codes by kind', () => {
        expect(classify('*ud')).toMatchObject({ kind: 'direction', direction: '*ud', tones: 3 });
        expect(classify('[*u]d')).toMatchObject({ kind: 'direction', signature: '*ud' });
        expect(classify('*udL')).toMatchObject({ kind: 'special', column: 'L', signature: '*udL', direction: '*ud' });
        expect(classify('*uVd')).toMatchObject({ kind: 'custom', column: 'custom' });
        expect(classify('*uVL')).toMatchObject({ kind: 'special', column: 'L' });
        expect(classify('(Clef)').kind).toBe('clef');
        expect(classify('(Custos)').kind).toBe('custos');
        expect(classify('(Start)').kind).toBe('other');
    });
});

describe('frequency', () => {
    it('counts a direction over every bracket and sign variant', () => {
        expect(freq.direction('*d')).toBe(488 + 59000 + 12223 + 54);
        expect(freq.direction('*ud')).toBe(14809 + 1500 + 478);
    });

    it('counts a signature over its bracket variants only', () => {
        expect(freq.signature('*ud')).toBe(14809 + 1500 + 478);
        expect(freq.signature('*dL')).toBe(12223);
    });

    it('counts a code on its own', () => {
        expect(freq.code('[*u]d')).toBe(1500);
        expect(freq.code('*udL')).toBe(0);
    });

    it('accepts the { count } shape of the corpus statistics', () => {
        const f = buildFrequency({ '*u': { count: 5, length: 2 }, '[*u]': { count: 3, length: 4 } });
        expect(f.direction('*u')).toBe(8);
    });

    it('falls back to a second source where the first knows nothing', () => {
        const f = withFallback(buildFrequency({ '*d': 5 }), buildFrequency({ '*d': 9, '*u': 7 }));
        expect(f.direction('*d')).toBe(5);
        expect(f.direction('*u')).toBe(7);
    });
});

describe('ordering: tones, then frequency', () => {
    it('puts fewer tones first, then the more frequent', () => {
        const dirs = ['*udd', '*ud', '*', '*e', '*u', '*d', '*dd'];
        const sorted = [...dirs].sort((a, b) => compareDirections(a, b, freq));
        expect(sorted).toEqual(['*', '*d', '*u', '*e', '*dd', '*ud', '*udd']);
    });

    it('orders signatures of one column the same way', () => {
        const sigs = ['*udL', '*uL', '*dL', '*L'];
        const f = buildFrequency({ '*dL': 12223, '*uL': 6465, '*udL': 1874, '*L': 1762 });
        expect(sigs.sort((a, b) => compareSignatures(a, b, f))).toEqual(['*L', '*dL', '*uL', '*udL']);
    });

    it('orders a flat list of codes by tones, then own frequency', () => {
        const codes = ['[*u]d', '*ud', '*d', '[*d]', '*'];
        expect(sortCodes(codes, freq)).toEqual(['*', '[*d]', '*d', '*ud', '[*u]d']);
    });

    it('is stable when nothing is known', () => {
        const none = buildFrequency({});
        expect(compareCodes('*u', '*d', none)).toBeGreaterThan(0); // alphabetical: *d < *u
        expect(compareDirections('*d', '*u', none)).toBeLessThan(0); // standard order: *d before *u
    });
});

describe('the standard table', () => {
    const headers = (cols) => cols.map(c => c.header);

    it('has the columns of the brief, in the brief\'s order, from the CM frequencies', () => {
        const cols = buildColumns('standard', [], freq);
        expect(headers(cols)).toEqual([
            '*', '*d', '*u', '*e', '*dd', '*ud', '*uu', '*du', '*udd', '*uud', '*ddu',
            'L', 'O', 'Q', ',', 'Clef', 'Custos'
        ]);
    });

    it('keeps the brief\'s order when no frequencies are known', () => {
        const cols = buildColumns('standard', [], buildFrequency({}));
        expect(headers(cols).slice(0, 11)).toEqual(STANDARD_DIRECTIONS);
    });

    it('leaves out cases the ordering would otherwise include (*ed, *ddd)', () => {
        const cols = buildColumns('standard', ['*ed', '*ddd'], freq);
        expect(headers(cols)).not.toContain('*ed');
        expect(headers(cols)).not.toContain('*ddd');
    });

    it('marks the special columns as slots', () => {
        const cols = buildColumns('standard', [], freq);
        expect(cols.filter(c => c.slot).map(c => c.group)).toEqual(['L', 'O', 'Q', 'S']);
    });
});

describe('the expanded table', () => {
    it('inserts an added pattern at its place in the ordering', () => {
        const cols = buildColumns('expanded', ['*ed', '*ddd'], freq);
        const headers = cols.map(c => c.header);
        // *ed (3 tones, 7530) sits between *uu (10952) and *du (6538)
        expect(headers.indexOf('*ed')).toBe(headers.indexOf('*uu') + 1);
        expect(headers.indexOf('*du')).toBe(headers.indexOf('*ed') + 1);
        // *ddd (4 tones, 4500) comes after *udd (6743) and before *uud (3339)
        expect(headers.indexOf('*ddd')).toBe(headers.indexOf('*udd') + 1);
        expect(headers.indexOf('*uud')).toBe(headers.indexOf('*ddd') + 1);
    });

    it('gives each special signature its own column, grouped by sign and ordered', () => {
        const cols = buildColumns('expanded', ['*udL', '*dL', '*uOd', '*uL'], freq);
        const special = cols.filter(c => ['L', 'O', 'Q', 'S'].includes(c.group));
        expect(special.map(c => `${c.group}:${c.header}`)).toEqual(['L:*dL', 'L:*uL', 'L:*udL', 'O:*uOd']);
        expect(special.every(c => !c.slot)).toBe(true);
    });

    it('collects project-defined signs into their own group', () => {
        const cols = buildColumns('expanded', ['*uVd'], freq);
        expect(cols.find(c => c.header === '*uVd').group).toBe('custom');
    });

    it('still ends with Clef and Custos', () => {
        const cols = buildColumns('expanded', ['*ed'], freq);
        expect(cols.slice(-2).map(c => c.header)).toEqual(['Clef', 'Custos']);
    });
});

describe('placing a pattern in a column', () => {
    it('puts every special pattern of a letter into one column in the standard table', () => {
        expect(columnFor('*dL', 'standard').key).toBe('special:L');
        expect(columnFor('[*uL]', 'standard').key).toBe('special:L');
        expect(columnFor('*uOdL', 'standard').key).toBe('special:O');
        expect(columnFor('*SeS', 'standard').key).toBe('special:S');
    });

    it('gives every signature its own column when expanded', () => {
        expect(columnFor('[*u]dL', 'expanded').key).toBe('sig:*udL');
        expect(columnFor('*dL', 'all').key).toBe('sig:*dL');
    });

    it('places plain patterns by direction, ignoring brackets', () => {
        expect(columnFor('[*u]d', 'standard').key).toBe('dir:*ud');
        expect(columnFor('*[ud]', 'expanded').key).toBe('dir:*ud');
    });

    it('has no place for markers', () => {
        expect(columnFor('(Start)', 'expanded')).toBeNull();
    });
});

describe('tiers', () => {
    it('makes plain patterns of standard directions standard by default', () => {
        expect(defaultTier('*ud')).toBe('standard');
        expect(defaultTier('[*u]d')).toBe('standard');
        expect(defaultTier('(Clef)')).toBe('standard');
    });

    it('makes everything else an expanded addition by default', () => {
        expect(defaultTier('*ed')).toBe('expanded');
        expect(defaultTier('*dL')).toBe('expanded');
        expect(defaultTier('*uVd')).toBe('expanded');
    });

    it('lets an explicit tier win', () => {
        expect(tierOf({ pattern: '*dL', tier: 'standard' })).toBe('standard');
        expect(tierOf({ pattern: '*dL' })).toBe('expanded');
    });

    it('shows only the standard selection in the standard table', () => {
        const rows = [
            { pattern: '*ud' },
            { pattern: '*ed' },
            { pattern: '*dL', tier: 'standard' },
            { pattern: '*uL' }
        ];
        expect(rowsForMode(rows, 'standard').map(r => r.pattern)).toEqual(['*ud', '*dL']);
        expect(rowsForMode(rows, 'expanded')).toHaveLength(4);
    });
});

describe('at most three constellations per special column', () => {
    const rows = [
        { pattern: '*dL', tier: 'standard' },
        { pattern: '[*uL]', tier: 'standard' },
        { pattern: '*udL', tier: 'standard' },
        { pattern: '*eOd', tier: 'standard' },
        { pattern: '*edL' } // expanded: does not count
    ];

    it('lists the selected signatures of a column', () => {
        expect(selectedSignatures(rows, 'L')).toEqual(['*dL', '*uL', '*udL']);
        expect(selectedSignatures(rows, 'O')).toEqual(['*eOd']);
        expect(selectedSignatures(rows, 'Q')).toEqual([]);
    });

    it('refuses a fourth signature', () => {
        const verdict = canSelectForStandard(rows, '*uuL');
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toMatch(/At most 3/);
    });

    it('accepts another variant of a signature that is already chosen', () => {
        expect(canSelectForStandard(rows, '[*dL]').ok).toBe(true);
    });

    it('does not count the other columns', () => {
        expect(canSelectForStandard(rows, '*uQu').ok).toBe(true);
        expect(canSelectForStandard(rows, '*eOu').ok).toBe(true);
    });

    it('never limits directional columns', () => {
        expect(canSelectForStandard(rows, '[*u]d').ok).toBe(true);
    });

    it('honours a different limit', () => {
        expect(canSelectForStandard(rows, '*uuL', 4).ok).toBe(true);
    });
});

describe('the pattern library', () => {
    const library = Object.keys(CM);
    const col = (mode, key) => buildColumns(mode, [], freq).find(c => c.key === key);

    it('offers the plain variants of a direction, most frequent first', () => {
        const groups = libraryForColumn(library, col('standard', 'dir:*ud'), freq);
        expect(groups).toHaveLength(1);
        expect(groups[0].signature).toBe('*ud');
        expect(groups[0].variants).toEqual(['*ud', '[*u]d', '[*ud]']);
    });

    it('offers no sign letters in a directional column', () => {
        const groups = libraryForColumn(library, col('standard', 'dir:*d'), freq);
        const all = groups.flatMap(g => g.variants);
        expect(all.every(c => !/[A-Z]/.test(c))).toBe(true);
        expect(all).toContain('[*d]');
    });

    it('offers every pattern of a special sign, grouped by signature in table order', () => {
        const groups = libraryForColumn(library, col('standard', 'special:L'), freq);
        const sigs = groups.map(g => g.signature);
        // 2 tones before 3 tones, more frequent first
        expect(sigs.slice(0, 2)).toEqual(['*dL', '*uL']);
        expect(sigs).toContain('*edL');
        expect(sigs).toContain('*uuL');
        expect(sigs.indexOf('*dL')).toBeLessThan(sigs.indexOf('*edL'));
    });

    it('files a pattern with several signs under its first', () => {
        const oriscus = libraryForColumn(library, col('standard', 'special:O'), freq).map(g => g.signature);
        expect(oriscus).toContain('*eOd');
        const liquescent = libraryForColumn(library, col('standard', 'special:L'), freq).map(g => g.signature);
        expect(liquescent).not.toContain('*eOd');
    });

    it('leaves a different column\'s patterns out', () => {
        const q = libraryForColumn(library, col('standard', 'special:Q'), freq).map(g => g.signature);
        expect(q).toEqual(['*uuQ']);
    });
});

describe('searching the library by code', () => {
    const library = ['*udL', '[*u]dL', '[*ud]L', '*uL', '*ud', '*udd', '*dL', '(Clef)', '(Start)'];
    const f = buildFrequency({ '*udL': 5, '[*u]dL': 50, '[*ud]L': 20, '*uL': 100, '*ud': 70, '*udd': 9, '*dL': 300 });

    it('matches the signature when the query has no brackets', () => {
        expect(searchLibrary(library, '*udL', f)).toEqual(['[*u]dL', '[*ud]L', '*udL']);
    });

    it('matches the code as written when the query has brackets', () => {
        expect(searchLibrary(library, '[*u]', f)).toEqual(['[*u]dL']);
    });

    it('finds partial codes', () => {
        const hits = searchLibrary(library, 'dL', f);
        expect(hits).toContain('*dL');
        expect(hits).toContain('*udL');
    });

    it('returns results in table order: tones, then frequency', () => {
        const hits = searchLibrary(library, '*u', f);
        const tones = hits.map(toneCount);
        expect([...tones].sort((a, b) => a - b)).toEqual(tones);
    });

    it('skips what is already in the table, and markers', () => {
        const hits = searchLibrary(library, 'L', f, { exclude: new Set(['*dL']) });
        expect(hits).not.toContain('*dL');
        expect(searchLibrary(library, 'Clef', f)).toEqual([]);
        expect(searchLibrary(library, '', f)).toEqual([]);
    });
});

describe('table progress', () => {
    it('counts filled directions, chosen constellations and the pseudo columns', () => {
        const rows = [
            { pattern: '*' },
            { pattern: '[*u]d' },
            { pattern: '*ud' }, // same direction: counts once
            { pattern: '*ed' }, // not a standard direction
            { pattern: '*dL', tier: 'standard' },
            { pattern: '*uL', tier: 'standard' },
            { pattern: '*uQu', tier: 'expanded' },
            { pattern: '(Clef)' }
        ];
        expect(tableProgress(rows)).toEqual({
            directions: 2,
            specials: { L: 2, O: 0, Q: 0, S: 0 },
            clef: true,
            custos: false,
            expanded: 2 // *ed and *uQu
        });
    });

    it('is empty for an empty table', () => {
        expect(tableProgress([])).toMatchObject({ directions: 0, clef: false, custos: false, expanded: 0 });
        expect(tableProgress(undefined).directions).toBe(0);
    });
});

describe('grouping columns under headings', () => {
    it('has shapes, one special group, and clef/custos in the standard table', () => {
        const groups = groupColumns(buildColumns('standard', [], freq));
        expect(groups.map(g => g.label)).toEqual(['Neume shapes', 'Special signs', 'Clef and custos']);
        expect(groups.map(g => g.columns.length)).toEqual([11, 4, 2]);
    });

    it('gives each special sign its own group when expanded', () => {
        const groups = groupColumns(buildColumns('expanded', ['*dL', '*uL', '*eOd'], freq));
        expect(groups.map(g => g.label)).toEqual([
            'Neume shapes', 'L — Liqueszenz', 'O — Oriscus', 'Clef and custos'
        ]);
        expect(groups[1].columns.map(c => c.header)).toEqual(['*dL', '*uL']);
    });

    it('keeps project-defined signs apart', () => {
        const groups = groupColumns(buildColumns('expanded', ['*uVd'], freq));
        expect(groups.map(g => g.label)).toContain('Project-defined signs');
    });
});

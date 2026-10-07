import { describe, expect, it } from 'vitest';
import { CITE_STYLES, citation, citationList, describeTarget, initials, referenceUrl, splitName } from './citation';

const info = { title: 'Rhineland neumes', authors: ['Anna Maria Author', 'Beispiel, Ben', 'Jan van der Berg'], year: '2026', publisher: 'Monodi', license: 'CC BY 4.0', doi: '10.1234/abc', preferredCitation: 'Author, A. M. et al. 2026. Rhineland neumes.' };
const one = { title: 'Rhineland neumes', authors: ['Anna Author'], year: '2026' };
const URL = 'https://neumedocs.monodi.app/#/docs/main/m/Ms01?pattern=*ud';
const snippet = { kind: 'snippet', source: 'Ms01', holding: 'Köln, Dombibliothek, Cod. 123', folio: '12r', line: '4', pattern: '*ud', refId: '3a' };
const args = { info, target: snippet, url: URL, accessed: '2026-10-07', version: 'abc1234' };

describe('names', () => {
    it('splits a name either way round, keeping particles with the family name', () => {
        expect(splitName('Anna Author')).toEqual({ family: 'Author', given: 'Anna' });
        expect(splitName('Author, Anna Maria')).toEqual({ family: 'Author', given: 'Anna Maria' });
        expect(splitName('Jan van der Berg')).toEqual({ family: 'van der Berg', given: 'Jan' });
        expect(splitName('Madonna')).toEqual({ family: 'Madonna', given: '' });
        expect(splitName('')).toEqual({ family: '', given: '' });
    });

    it('makes initials', () => {
        expect(initials('Anna Maria')).toBe('A. M.');
        expect(initials('Jean-Luc')).toBe('J.-L.');
        expect(initials('')).toBe('');
    });
});

describe('saying what is cited', () => {
    it('names each kind of thing, and where the manuscript is kept', () => {
        expect(describeTarget({ kind: 'manuscript', source: 'Ms01' })).toBe('Ms01');
        expect(describeTarget({ kind: 'manuscript', source: 'Ms01', holding: 'Köln, Dombibliothek' })).toBe('Ms01 [Köln, Dombibliothek]');
        expect(describeTarget({ kind: 'pattern', source: 'Ms01', pattern: '*ud', refId: '3' })).toBe('Ms01, pattern *ud (Ref ID 3)');
        expect(describeTarget({ kind: 'pattern', source: 'Ms01', pattern: '*ud', refId: '-' })).toBe('Ms01, pattern *ud');
        expect(describeTarget(snippet)).toBe('Ms01 [Köln, Dombibliothek, Cod. 123], f. 12r, line 4, pattern *ud (3a)');
        expect(describeTarget({ kind: 'snippet', source: 'Ms01', pattern: '*ud', refId: '-' })).toBe('Ms01, pattern *ud');
        expect(describeTarget({ kind: 'selection', count: 1, summary: 'Origin: Köln' })).toBe('Selection of 1 manuscript (Origin: Köln)');
        expect(describeTarget({ kind: 'documentation' })).toBe('');
        expect(describeTarget(null)).toBe('');
    });
});

describe('the styles', () => {
    it('offers short, APA, Chicago, MLA, BibTeX and RIS', () => {
        expect(CITE_STYLES.map(s => s.value)).toEqual(['short', 'apa', 'chicago', 'mla', 'bibtex', 'ris']);
    });

    it('short: what, where, which version', () => {
        expect(citation('short', args)).toBe(`Ms01 [Köln, Dombibliothek, Cod. 123], f. 12r, line 4, pattern *ud (3a) — Rhineland neumes (2026), version abc1234, ${URL}`);
        expect(citation('short', { info: one, url: URL })).toBe(`Rhineland neumes (2026), ${URL}`);
    });

    it('APA: initials, ampersand, the work named, the version and the address of the thing', () => {
        const text = citation('apa', args);
        expect(text).toBe(`Author, A. M., Beispiel, B., & van der Berg, J. (2026). Ms01 [Köln, Dombibliothek, Cod. 123], f. 12r, line 4, pattern *ud (3a). In Rhineland neumes [Documentation of neume notation, version abc1234]. Monodi. ${URL}`);
        expect(citation('apa', { info: one, url: 'https://x' })).toBe('Author, A. (2026). Rhineland neumes [Documentation of neume notation]. https://x');
    });

    it('cites the documentation as a whole by its DOI', () => {
        expect(citation('apa', { info, target: { kind: 'documentation' }, url: URL })).toContain('https://doi.org/10.1234/abc');
        expect(citation('apa', { info, target: { kind: 'documentation' }, url: URL })).not.toContain(URL);
    });

    it('APA without authors puts the title first', () => {
        expect(citation('apa', { info: { title: 'T', authors: [] }, generated: '2025-01-01', url: 'https://x' })).toBe('T [Documentation of neume notation]. (2025). https://x');
        expect(citation('apa', { info: { title: 'T', authors: [] }, url: 'https://x' })).toContain('(n.d.)');
    });

    it('Chicago: first author inverted, the others as they are named, the day it was looked at', () => {
        const text = citation('chicago', args);
        expect(text).toBe(`Author, Anna Maria, Ben Beispiel, and Jan van der Berg. 2026. “Ms01 [Köln, Dombibliothek, Cod. 123], f. 12r, line 4, pattern *ud (3a).” In Rhineland neumes. Version abc1234. Monodi. ${URL} Accessed October 7, 2026.`);
    });

    it('MLA: et al. for more than two, the day in its own form', () => {
        const text = citation('mla', args);
        expect(text).toBe(`Author, Anna Maria, et al. “Ms01 [Köln, Dombibliothek, Cod. 123], f. 12r, line 4, pattern *ud (3a).” Rhineland neumes, Version abc1234, Monodi, 2026, ${URL}. Accessed 7 Oct. 2026.`);
        expect(citation('mla', { info: { ...one, authors: ['Anna Author', 'Ben Beispiel'] }, url: 'https://x', accessed: '2026-03-02' })).toBe('Author, Anna, and Ben Beispiel. Rhineland neumes, 2026, https://x. Accessed 2 Mar. 2026.');
    });

    it('BibTeX: an online source with its date of access and version', () => {
        const bib = citation('bibtex', args);
        expect(bib).toMatch(/^@online\{author-2026-ms01,/);
        expect(bib).toContain('author = {Author, Anna Maria and Beispiel, Ben and van der Berg, Jan}');
        expect(bib).toContain('title = {Ms01 [Köln, Dombibliothek, Cod. 123], f. 12r, line 4, pattern *ud (3a). In: Rhineland neumes}');
        expect(bib).toContain('version = {abc1234}');
        expect(bib).toContain('doi = {10.1234/abc}');
        expect(bib).toContain(`url = {${URL}}`);
        expect(bib).toContain('urldate = {2026-10-07}');
        expect(bib.trim().endsWith('}')).toBe(true);
    });

    it('BibTeX keeps braces out of values, copes with no authors, strips the address from a DOI', () => {
        const bib = citation('bibtex', { info: { title: 'A {strange} title', authors: [], doi: 'https://doi.org/10.1/x' }, url: '' });
        expect(bib).toContain('title = {A strange title}');
        expect(bib).toContain('doi = {10.1/x}');
        expect(bib).toMatch(/^@online\{neumedocs,/);
        expect(bib).not.toContain('author');
    });

    it('RIS: tagged lines a reference manager reads', () => {
        const ris = citation('ris', args);
        expect(ris.startsWith('TY  - ELEC\r\n')).toBe(true);
        expect(ris).toContain('AU  - Author, Anna Maria\r\n');
        expect(ris).toContain('Y2  - 2026/10/07\r\n');
        expect(ris.endsWith('ER  - \r\n')).toBe(true);
    });

    it('the authors\' own wording, with what is cited and where', () => {
        expect(citation('preferred', args)).toBe(`Author, A. M. et al. 2026. Rhineland neumes. Ms01 [Köln, Dombibliothek, Cod. 123], f. 12r, line 4, pattern *ud (3a). ${URL} (accessed 2026-10-07)`);
    });

    it('is empty for a style that does not exist', () => {
        expect(citation('nonsense', args)).toBe('');
    });
});

describe('several at once', () => {
    const items = [{ target: snippet, url: 'https://x/1' }, { target: { ...snippet, folio: '13r' }, url: 'https://x/2' }];

    it('numbers text entries', () => {
        const text = citationList('short', { info: one, items });
        expect(text.split('\n')).toHaveLength(2);
        expect(text.startsWith('1. Ms01')).toBe(true);
    });

    it('gives BibTeX entries keys that differ', () => {
        const bib = citationList('bibtex', { info: one, items });
        const keys = [...bib.matchAll(/@online\{([^,]+),/g)].map(m => m[1]);
        expect(keys).toEqual(['author-2026-ms01', 'author-2026-ms01-2']);
    });
});

describe('references', () => {
    it('sets and clears what is highlighted', () => {
        expect(referenceUrl('https://x/#/docs/a/m/Ms01', { pattern: '*ud' })).toBe('https://x/#/docs/a/m/Ms01?pattern=*ud');
        expect(referenceUrl('https://x/#/docs/a/table?ms=Ms01&pattern=*ud', { pattern: '', snippet: 's1' })).toBe('https://x/#/docs/a/table?ms=Ms01&snippet=s1');
        expect(referenceUrl('https://x/#/docs/a', {})).toBe('https://x/#/docs/a');
    });
});

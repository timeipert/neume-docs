import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseListing, parseDetail } from './crawl-mmmo.mjs';

const fixture = (name) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');

describe('reading the MMMO listing', () => {
    const { total, rows } = parseListing(fixture('mmmo-listing.html'));

    it('reads the total the page announces', () => {
        expect(total).toBe(8839);
    });

    it('reads one row per source, skipping the header', () => {
        expect(rows).toHaveLength(3);
        expect(rows[0]).toEqual({
            id: 241269,
            siglum: 'A-A : Cod. 511',
            country: 'Austria',
            city: 'Admont',
            origin: 'Autriche, Salzburg, Saint-Pierre de Salzbourg',
            centuries: ['XI'],
            types: ['Evangeliarium'],
            links: ['https://manuscripta.at/hs_detail.php?ID=26339']
        });
    });

    it('reads several centuries and types, and rows without links', () => {
        expect(rows[1].centuries).toEqual(['XIII', 'XIV']);
        expect(rows[1].types).toEqual(['Graduale', 'Prosarium']);
        expect(rows[1].links).toEqual([]);
    });

    it('finds nothing in a page without a table', () => {
        expect(parseListing('<html>nothing</html>')).toEqual({ total: 0, rows: [] });
    });
});

describe('reading a source page', () => {
    const detail = parseDetail(fixture('mmmo-source.html'));

    it('reads the shelfmark, library, years and notation', () => {
        expect(detail.rism).toBe('A-A');
        expect(detail.archive).toBe('Benediktinerstift');
        expect(detail.shelfmark).toBe('Cod. 511');
        expect(detail.years).toBe('1070-1080');
        expect(detail.notation).toEqual(['Neumatique franque', 'Neumatique germanique']);
    });

    it('reads the IIIF manifest and the links to digital copies', () => {
        expect(detail.manifest).toBe('https://iiif.diamm.net/manifests/A-A_511/manifest.json');
        expect(detail.links).toEqual(['https://manuscripta.at/hs_detail.php?ID=26339']);
    });

    it('gives an empty manifest when the page names none', () => {
        const without = fixture('mmmo-source.html').replace(/<div class="field field-name-field-manifest-iiif.*$/s, '</div>');
        expect(parseDetail(without).manifest).toBe('');
    });
});

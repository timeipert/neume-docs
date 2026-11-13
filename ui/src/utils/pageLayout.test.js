import { describe, it, expect } from 'vitest';
import { EXAMPLE_AA_13 } from '@monodi/core/page-layout';
import { pageLayoutExport, pageLayoutFileName, pageLayoutMarkdown, pageLayoutsExport, readPageLayoutFile } from './pageLayout';

const project = { name: 'Aa 13', source: 'Aa 13', from: '1', to: '172v', scribe: 'Hand A', layout: EXAMPLE_AA_13 };

describe('the export of a page layout', () => {
    it('names the manuscript, the folios and the hand, and carries the text in both languages', () => {
        const file = pageLayoutExport(project, '2026-11-12');
        expect(file).toMatchObject({
            format: 'neume-docs/page-layout', version: 1, generated: '2026-11-12',
            source: 'Aa 13', folios: { from: '1', to: '172v' }, hand: 'Hand A'
        });
        expect(file.layout).toEqual(EXAMPLE_AA_13);
        expect(file.text.de).toMatch(/^37 x 24,5 cm, 15 Notensysteme\./);
        expect(file.text.en).toMatch(/^37 x 24.5 cm, 15 staves\./);
    });

    it('reads back what it wrote, and refuses what is no layout', () => {
        const text = JSON.stringify(pageLayoutExport(project, '2026-11-12'));
        expect(readPageLayoutFile(text)).toEqual(EXAMPLE_AA_13);
        expect(readPageLayoutFile(JSON.stringify(EXAMPLE_AA_13))).toEqual(EXAMPLE_AA_13);
        expect(readPageLayoutFile('{"projects": []}')).toBeNull();
        expect(readPageLayoutFile('not json')).toBeNull();
    });

    it('leaves out the projects without a layout when several are exported', () => {
        const all = pageLayoutsExport([project, { ...project, source: 'B', layout: null }], '2026-11-12');
        expect(all.layouts.map(l => l.source)).toEqual(['Aa 13']);
    });

    it('makes a file name of the manuscript and a Markdown text with both headings', () => {
        expect(pageLayoutFileName(project)).toBe('page-layout_Aa_13.json');
        const md = pageLayoutMarkdown(project);
        expect(md).toContain('## Textzeilen und Notensysteme');
        expect(md).toContain('## Text lines and staves');
    });
});

/**
 * The page layout of a project as a file, for other tools: CM-hub's print volumes can read it to print the paragraph
 * "Textzeilen und Notensysteme" of a notation documentation and its diagram (design and format:
 * docs/page-layout.md, section "Export").
 *
 * Plain functions over plain data; the data model itself lives in `@monodi/core/page-layout`.
 */
import { describePageLayout, normalisePageLayout, PAGE_LAYOUT_VERSION } from '@monodi/core/page-layout';
import { fileSlug } from './buildDocumentation';

export const PAGE_LAYOUT_FORMAT = 'neume-docs/page-layout';

/**
 * The export of one project's layout.
 * @param {object} project   a project of the projects store
 * @param {string} generated the day, YYYY-MM-DD
 */
export function pageLayoutExport(project, generated) {
    const layout = normalisePageLayout(project.layout);
    return {
        format: PAGE_LAYOUT_FORMAT,
        version: PAGE_LAYOUT_VERSION,
        generated,
        source: project.source,
        folios: { from: project.from, to: project.to },
        hand: project.scribe,
        project: project.name,
        layout,
        text: { de: describePageLayout(layout, 'de'), en: describePageLayout(layout, 'en') }
    };
}

/** The layouts of several projects in one file (the projects without a recorded layout are left out). */
export function pageLayoutsExport(projects, generated) {
    return {
        format: `${PAGE_LAYOUT_FORMAT}s`,
        version: PAGE_LAYOUT_VERSION,
        generated,
        layouts: projects.filter(p => p.layout).map(p => pageLayoutExport(p, generated))
    };
}

/** "page-layout_Aa_13.json". */
export function pageLayoutFileName(project) {
    return `page-layout_${fileSlug(project.source || project.name)}.json`;
}

/**
 * The text of the layout as Markdown, German and English, with a heading of the manuscript: what can be pasted into
 * the `notationsdokumentation` field of the source.
 */
export function pageLayoutMarkdown(project) {
    const layout = normalisePageLayout(project.layout);
    const de = describePageLayout(layout, 'de');
    const en = describePageLayout(layout, 'en');
    return [
        `## Textzeilen und Notensysteme`, '', de || '–', '',
        `## Text lines and staves`, '', en || '–', ''
    ].join('\n');
}

/**
 * Read the layout from a file made by `pageLayoutExport` (or from a bare layout object).
 * @returns {object|null} the normalised layout, or null when the text is no layout
 */
export function readPageLayoutFile(text) {
    let data;
    try { data = JSON.parse(text); } catch { return null; }
    if (!data || typeof data !== 'object') return null;
    const raw = data.format === PAGE_LAYOUT_FORMAT ? data.layout : data;
    if (!raw || !Array.isArray(raw.sections)) return null;
    return normalisePageLayout(raw);
}

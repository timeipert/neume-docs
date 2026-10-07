import { useManuscriptTable } from './useManuscriptTable';
import { useImageManifest } from './useImageManifest';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useAnnotationsStore } from '../stores/annotations';
import { useDirectSnippetsStore } from '../stores/directSnippets';
import { useIiifStore } from '../stores/iiif';
import { useSettingsStore } from '../stores/settings';
import { GLYPHS } from '../data/glyphs';
import { buildDocumentation, documentationFiles } from '../utils/buildDocumentation';
import { declaredType } from '../utils/manuscriptFilter';
import { publishedColumns } from '../utils/publication';
import { resolveSignGlyphs } from '../utils/signs';

/**
 * The documentation of this browser's own work: what is published in the editor, in the shape
 * it has when it is put on a server. It is what the preview shows and what is downloaded, so the
 * two cannot differ.
 *
 * @param {{ images?: 'inline'|'files', table?: object, includeUnpublished?: boolean }} [options]
 *   `images`: 'inline' keeps screenshots in the files, 'files' writes each to a file of its own;
 *   `includeUnpublished`: for looking at all of one's own work, not only what is switched on for readers
 * @returns {Promise<{ index: object, manuscripts: object, files: Array<{path: string, dataUrl: string}>, columns: object[] }>}
 */
export async function buildLocalDocumentation({ images = 'inline', table = useManuscriptTable(), includeUnpublished = false } = {}) {
    const tables = usePersonalTablesStore();
    const annotations = useAnnotationsStore();
    const direct = useDirectSnippetsStore();
    const iiif = useIiifStore();
    const settings = useSettingsStore();
    const { getIiifRegionUrl } = useImageManifest();

    await direct.load();
    // A crop's address needs the manifest of its manuscript.
    const published = tables.tables.filter(t => includeUnpublished || t.isPublished);
    await Promise.all(published.map(t => iiif.ensureLoaded(t.source).catch(() => {})));

    const shown = publishedColumns(table.columns.value, settings.publication);
    const columns = shown.map(col => ({
        key: col.key,
        label: col.label,
        type: declaredType(col),
        said: settings.metadataSchema.filters[col.key]
    }));
    const byKey = table.columnByKey.value;

    const built = buildDocumentation({
        publication: settings.publication,
        generated: new Date().toISOString().slice(0, 10),
        columns,
        metaOf: (source, key) => (byKey.get(key) ? table.value(source, byKey.get(key)) : ''),
        tables: includeUnpublished ? tables.tables.map(t => ({ ...t, isPublished: true })) : tables.tables,
        regions: annotations.regions,
        regionItems: annotations.regionItems,
        collections: includeUnpublished ? direct.collections.map(c => ({ ...c, isPublished: true })) : direct.collections,
        customSigns: settings.customSigns,
        signGlyphs: resolveSignGlyphs(settings.customSigns, GLYPHS),
        discriminateSigns: settings.discriminateSigns,
        globalId: (code) => (settings.autoFillIds ? settings.getGlobalId(code) : ''),
        regionUrl: (source, folio, region, width) => getIiifRegionUrl(source, folio, region, width),
        images
    });
    return { ...built, columns: shown };
}

export { documentationFiles };

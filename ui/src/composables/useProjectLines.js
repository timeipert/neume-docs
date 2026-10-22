import { computed } from 'vue';
import { useAnnotationsStore } from '../stores/annotations';
import { folioInRange } from '../utils/projectData';
import { sortedLines, lineLabel } from '../utils/lineSigns';
import { compareFolios } from '../utils/sorting';

/**
 * The lines of a project that marks whole text lines (`project.snippets === 'lines'`): one entry
 * per line, whichever kind of images the project uses, with the signs on it (by pattern code).
 *
 * An IIIF line is a region drawn on a page (`annotations.regions`); its items are the region's
 * own items, in the region's own coordinates (page percent) — ready for `AnnotationCutout`'s
 * `overlays`. A screenshot line is one of the collection's own line pictures; its items carry a
 * `box` (percent of the line's own picture).
 *
 * @param {ReturnType<import('./useProject').useProject>} context
 */
export function useProjectLines(context) {
    const annotations = useAnnotationsStore();
    const { project, collection, snippets } = context;

    const onLines = computed(() => !!project.value && project.value.snippets === 'lines');

    /** The project's snippets, by the line they are on (`lineId` or `regionId`). */
    const itemsByLine = computed(() => {
        const map = new Map();
        for (const [code, list] of snippets.value) {
            for (const s of list) {
                const key = s.kind === 'image' ? s.lineId : s.regionId;
                if (!key) continue;
                if (!map.has(key)) map.set(key, []);
                map.get(key).push({ id: s.id, code, points: s.points, box: s.box });
            }
        }
        return map;
    });

    const lines = computed(() => {
        const p = project.value;
        if (!p || !onLines.value) return [];

        if (p.images === 'screenshots') {
            return sortedLines(collection.value).map(l => ({
                id: l.id, kind: 'collection', folio: (l.attrs || {}).folio || '', name: (l.attrs || {}).line || '',
                label: lineLabel(l), image: l.image, items: itemsByLine.value.get(l.id) || []
            }));
        }

        const prefix = `${p.source}_`;
        const out = [];
        for (const [key, list] of Object.entries(annotations.regions)) {
            if (!key.startsWith(prefix)) continue;
            const folio = key.slice(prefix.length);
            if (!folioInRange(folio, p.from, p.to)) continue;
            for (const region of list || []) {
                out.push({
                    id: String(region.id), kind: 'iiif', folio, name: region.name || '',
                    label: [folio && `f. ${folio}`, region.name].filter(Boolean).join(' · '),
                    source: p.source, points: region.points, items: itemsByLine.value.get(String(region.id)) || []
                });
            }
        }
        out.sort((a, b) => compareFolios(a.folio, b.folio) || a.name.localeCompare(b.name, undefined, { numeric: true }));
        return out;
    });

    return { onLines, lines };
}

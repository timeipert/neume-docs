import { ref, computed } from 'vue';
import { useAnnotationsStore } from '../stores/annotations';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useIiifStore } from '../stores/iiif';
import { useTranscriptionData } from './useTranscriptionData';
import { useWorkspaceManagement } from './useWorkspaceManagement';
import { useToast } from './useToast';
import { loadOccurrences, loadNoteUuids } from '../services/corpus/corpusStore';
import {
    buildExchange, parseExchange, planImport, planIsEmpty, findDrift
} from '../services/exchange/annotationExchange';

/**
 * Annotations travelling between this editor and Monodi-Zero, as files.
 *
 * The rules (what is sent, what an import adds, how a page is told apart) are in
 * services/exchange/annotationExchange.js and are pure. This is the part that
 * holds the stores: it gathers what a source needs, shows the plan to the person
 * before anything changes, keeps a restore point, and applies the plan.
 */

/** Plans waiting for the person's OK: [{ plan, label }]. Kept outside any component. */
const pending = ref([]);
const pendingTitle = ref('');
const unmatched = ref([]); // sources in a file that are not in the loaded corpus
/** Folio drift found after a source was updated: [{ source, entries }]. */
const drift = ref([]);

const todayStamp = () => new Date().toISOString().slice(0, 10);

function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
}

export function useMonodiExchange() {
    const annotations = useAnnotationsStore();
    const tables = usePersonalTablesStore();
    const iiif = useIiifStore();
    const data = useTranscriptionData();
    const mgmt = useWorkspaceManagement();
    const toast = useToast();

    const workspace = () => ({
        regions: annotations.regions,
        regionItems: annotations.regionItems,
        personalTables: tables.tables,
        iiifLinks: iiif.links
    });

    /** The page images of a source, from its manifest or from the corpus's own image addresses. */
    async function pagesOf(name) {
        await iiif.ensureLoaded(name).catch(() => {});
        if (!iiif.parsedData[name]) {
            const images = (data.catalog.value[name] || {}).images || [];
            iiif.setFolioImages(name, images);
        }
        return iiif.parsedData[name] || [];
    }

    /** Everything the exchange needs to know about one source. */
    async function gather(name, { withUuids = true } = {}) {
        const record = data.catalog.value[name] || {};
        const [pages, occurrences, noteUuids] = await Promise.all([
            pagesOf(name),
            withUuids ? loadOccurrences(name) : null,
            withUuids ? loadNoteUuids(name) : null
        ]);
        return {
            name,
            id: (record.meta && record.meta.id) || '',
            lineUuids: record.lineUuids || {},
            pages,
            occurrences,
            noteUuids,
            manifestUrl: iiif.links[name] || ''
        };
    }

    /** Sources that have something to send. */
    const sendable = computed(() => {
        const ws = workspace();
        const names = new Set();
        for (const key of Object.keys(ws.regions)) {
            const i = key.lastIndexOf('_');
            if (i > 0) names.add(key.slice(0, i));
        }
        for (const t of ws.personalTables) if (t.source && (t.rows || []).length) names.add(t.source);
        return [...names].filter(n => data.catalog.value[n]).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    });

    /** Download the annotations of the given sources (default: all that have any) for Monodi-Zero. */
    async function send(names = sendable.value) {
        const sources = [];
        for (const name of names) sources.push(await gather(name));
        const { file, counts } = buildExchange(sources, workspace());
        if (!counts.sources) {
            toast.show('There is nothing to send yet: no line regions, snippets or table rows.', { tone: 'info' });
            return null;
        }
        download(`neumen-annotations-${todayStamp()}.json`, JSON.stringify(file, null, 2));
        toast.show(`Annotations for ${counts.sources} manuscript${counts.sources === 1 ? '' : 's'} downloaded. Import the file in Monodi-Zero.`, { tone: 'success' });
        return counts;
    }

    function matchSource(record) {
        const names = Object.keys(data.catalog.value);
        const byId = names.find(n => record.id && data.catalog.value[n].meta && data.catalog.value[n].meta.id === record.id);
        return byId || names.find(n => n === record.quellensigle) || null;
    }

    async function planFor(name, incoming) {
        const pages = await pagesOf(name);
        return planImport(incoming, { name, pages }, workspace());
    }

    /** Read an exchange file and put its plans up for the person's OK. */
    async function readFile(file) {
        const parsed = parseExchange(await file.text());
        const plans = [];
        const missing = [];
        for (const record of parsed.sources) {
            const name = matchSource(record);
            if (!name) { missing.push(record.quellensigle || record.id || '(unnamed)'); continue; }
            plans.push(await planFor(name, record));
        }
        offer(plans, `Annotations from ${file.name}`, missing);
        return { plans, missing };
    }

    /** Offer what the loaded files already held for these sources. */
    async function offerFoundIn(names) {
        const plans = [];
        for (const name of names) {
            const found = (data.catalog.value[name] || {}).monodiAnnotations;
            if (found) plans.push(await planFor(name, found));
        }
        offer(plans, 'Annotations already in your Monodi-Zero file', []);
        return plans;
    }

    function offer(plans, title, missing) {
        pending.value = plans.filter(p => !planIsEmpty(p) || p.counts.unplaced.length);
        pendingTitle.value = title;
        unmatched.value = missing;
        if (!pending.value.length) {
            toast.show(missing.length
                ? `Nothing to add. ${missing.length} manuscript${missing.length === 1 ? ' is' : 's are'} not in the loaded corpus: ${missing.slice(0, 3).join(', ')}.`
                : 'Nothing to add: everything in that file is already here.', { tone: 'info' });
        }
    }

    function dismiss() {
        pending.value = [];
        unmatched.value = [];
    }

    /** Apply the plans that are waiting, after a restore point. */
    async function apply() {
        const plans = pending.value.filter(p => !planIsEmpty(p));
        let point = null;
        try {
            point = await mgmt.createRestorePoint(pendingTitle.value, { auto: true });
        } catch (e) {
            toast.show(`${e.message}. Nothing was imported.`, { tone: 'error' });
            return false;
        }

        for (const plan of plans) {
            const regions = { ...annotations.regions };
            for (const { folio, region } of plan.regions) {
                const key = `${plan.source}_${folio}`;
                regions[key] = [...(regions[key] || []), region];
            }
            annotations.regions = regions;

            const regionItems = { ...annotations.regionItems };
            for (const { regionId, item } of plan.items) {
                regionItems[regionId] = [...(regionItems[regionId] || []), item];
            }
            annotations.regionItems = regionItems;

            if (plan.equivalents.length) {
                const tableId = tables.getOrCreateTableForSource(plan.source);
                const table = tables.getTable(tableId);
                const rows = [...table.rows];
                const patterns = [...table.patterns];
                for (const e of plan.equivalents) {
                    rows.push({ pattern: e.pattern, customId: e.customId, notes: e.notes });
                    if (!patterns.includes(e.pattern)) patterns.push(e.pattern);
                }
                tables.updateTable(tableId, { rows, patterns });
            }
            if (plan.iiifManifestUrl) await iiif.setLink(plan.source, plan.iiifManifestUrl);
        }

        const total = plans.reduce((n, p) => n + p.counts.regions + p.counts.items + p.counts.equivalents, 0);
        pending.value = [];
        unmatched.value = [];
        toast.show(`Added ${total} item${total === 1 ? '' : 's'} from Monodi-Zero.`, {
            tone: 'success',
            action: {
                label: 'Undo',
                run: async () => {
                    try { await mgmt.restore(point.id); toast.show('Import undone.', { tone: 'success' }); }
                    catch (e) { toast.show(`Could not undo: ${e.message}`, { tone: 'error' }); }
                }
            }
        });
        return true;
    }

    /**
     * Remember where each source's folios stood, so that after an update the pages
     * whose folio changed can be found. Call before the corpus is replaced.
     */
    function snapshotFolios() {
        const out = {};
        for (const [name, record] of Object.entries(data.catalog.value)) {
            out[name] = { importedAt: record.importedAt, folios: record.folios || [], images: record.images || [] };
        }
        return out;
    }

    /** Compare with a snapshot taken before an update and remember what drifted. */
    function checkDrift(before) {
        const found = [];
        for (const [name, record] of Object.entries(data.catalog.value)) {
            const was = before[name];
            if (!was || was.importedAt === record.importedAt) continue;
            const entries = findDrift({
                name, oldFolios: was.folios, newFolios: record.folios || [], oldImages: was.images, newImages: record.images || []
            }, workspace());
            if (entries.length) found.push({ source: name, entries });
        }
        drift.value = found;
        return found;
    }

    /** Move a drifted page's annotations to the folio that now carries it. */
    async function rehome(source, from, to) {
        const point = await mgmt.createRestorePoint(`Before moving ${source} ${from} to ${to}`, { auto: true }).catch(() => null);
        const a = annotations;
        const fromKey = `${source}_${from}`;
        const toKey = `${source}_${to}`;
        if (a.regions[fromKey]) {
            const regions = { ...a.regions };
            regions[toKey] = [...(regions[toKey] || []), ...regions[fromKey]];
            delete regions[fromKey];
            a.regions = regions;
        }
        if (a.manualLines[fromKey]) {
            const lines = { ...a.manualLines };
            lines[toKey] = [...new Set([...(lines[toKey] || []), ...lines[fromKey]])];
            delete lines[fromKey];
            a.manualLines = lines;
        }
        drift.value = drift.value
            .map(d => (d.source === source ? { ...d, entries: d.entries.filter(e => e.folio !== from) } : d))
            .filter(d => d.entries.length);
        toast.show(`Moved the annotations of ${from} to ${to}.`, {
            tone: 'success',
            action: point ? { label: 'Undo', run: () => mgmt.restore(point.id) } : null
        });
    }

    function dismissDrift() { drift.value = []; }

    return {
        pending, pendingTitle, unmatched, drift, sendable,
        send, readFile, offerFoundIn, apply, dismiss,
        snapshotFolios, checkDrift, rehome, dismissDrift
    };
}

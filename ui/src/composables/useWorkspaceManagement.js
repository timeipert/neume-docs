import { ref, computed, nextTick } from 'vue';
import { useSettingsStore } from '../stores/settings';
import { useAnnotationsStore } from '../stores/annotations';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useIiifStore } from '../stores/iiif';
import { useIiifRegistryStore } from '../stores/iiifRegistry';
import { usePatternLibraryStore } from '../stores/patternLibrary';
import { useManuscriptMetaStore } from '../stores/manuscriptMeta';
import { useDirectSnippetsStore } from '../stores/directSnippets';
import { useProjectsStore } from '../stores/projects';
import { useOmmrStore } from '../stores/ommr';
import { useSaveReminderStore } from '../stores/saveReminder';
import { useWorkspaceStorage } from './useWorkspaceStorage';
import { useDataManagement } from './useDataManagement';
import { getManuscriptStats } from '../utils/workspaceSharing';
import { useTranscriptionData } from './useTranscriptionData';
import { useCorpusImport } from './useCorpusImport';
import { clearStore, countStore } from '../utils/idb';
import { captureWorkspace, applyWorkspace } from '../utils/workspaceSnapshot';
import { AREAS, WORK_AREAS, areaByKey, measureAreas, clearAreas } from '../utils/workspaceAreas';
import {
    saveRestorePoint, listRestorePoints, loadRestorePoint, deleteRestorePoint, clearRestorePoints
} from '../utils/restorePoints';

/**
 * Looking after the workspace as a whole: what is in it, deleting parts of it or
 * all of it, and the restore points that make those deletions reversible.
 *
 * Every destructive action here first keeps a restore point and returns it, so
 * the caller can offer "Undo". If a restore point cannot be kept, nothing is
 * deleted unless the caller passes `force: true` after telling the user.
 */

// Shared by every caller, so the list on the workspace page and the undo button
// in a toast always agree.
const points = ref([]);
const busy = ref(false);

export class RestorePointError extends Error {
    constructor(cause) {
        super(`A restore point could not be saved: ${cause?.message || cause || 'unknown error'}`);
        this.name = 'RestorePointError';
    }
}

export function useWorkspaceManagement() {
    const settings = useSettingsStore();
    const annotations = useAnnotationsStore();
    const tables = usePersonalTablesStore();
    const iiif = useIiifStore();
    const registry = useIiifRegistryStore();
    const library = usePatternLibraryStore();
    const meta = useManuscriptMetaStore();
    const direct = useDirectSnippetsStore();
    const projects = useProjectsStore();
    const ommr = useOmmrStore();
    const reminder = useSaveReminderStore();
    const storage = useWorkspaceStorage();
    const corpus = useTranscriptionData();
    const corpusImport = useCorpusImport();

    const data = useDataManagement();

    const stores = { settings, annotations, tables, iiif, registry, library, meta, direct, projects };

    /**
     * The manuscripts that have work in them (snippets, line regions or table
     * rows), with their counts. Includes manuscripts that are not in the loaded
     * corpus, e.g. from an imported backup.
     */
    const manuscripts = computed(() => {
        const state = data.getLocalFullState();
        return data.extractSourcesFromContent(state)
            .map(source => ({ source, ...getManuscriptStats(state, source) }))
            .filter(m => m.hasData)
            .sort((a, b) => b.annotationsCount - a.annotationsCount || a.source.localeCompare(b.source, undefined, { numeric: true }));
    });

    /** What each part of the workspace holds right now. */
    const areas = computed(() => measureAreas(stores));
    const workAreas = computed(() => areas.value.filter(a => a.isWork));
    /** Items of the user's own work (everything except preferences). */
    const workCount = computed(() => workAreas.value.reduce((n, a) => n + a.count, 0));
    const isEmpty = computed(() => areas.value.every(a => a.count === 0));

    // --- Restore points ------------------------------------------------

    async function refreshPoints() {
        try {
            points.value = await listRestorePoints();
        } catch (e) {
            console.error('Could not read the restore points', e);
            points.value = [];
        }
        return points.value;
    }

    /** A line like "412 snippets · 3 tables" describing what a point holds. */
    function summaryOfWork() {
        return workAreas.value.filter(a => a.count).map(a => a.text || a.title).join(' · ');
    }

    /**
     * Keep a copy of the workspace as it is now.
     * @throws {RestorePointError}
     */
    async function createRestorePoint(label, { auto = false } = {}) {
        try {
            const snapshot = captureWorkspace(stores);
            const point = await saveRestorePoint(snapshot, { label, auto, summary: summaryOfWork() });
            await refreshPoints();
            return point;
        } catch (e) {
            throw new RestorePointError(e);
        }
    }

    /**
     * Run a destructive action behind a restore point.
     * @returns {Promise<object|null>} the restore point, or null when forced past
     */
    async function guarded(label, action, { force = false } = {}) {
        let point = null;
        try {
            point = await createRestorePoint(label, { auto: true });
        } catch (e) {
            if (!force) throw e;
        }
        busy.value = true;
        try {
            await action();
        } finally {
            busy.value = false;
        }
        return point;
    }

    /** Put the workspace back exactly as a restore point had it. */
    async function restore(id, options = {}) {
        const snapshot = await loadRestorePoint(id);
        if (!snapshot) throw new Error('That restore point is no longer available.');
        const point = points.value.find(p => p.id === id);
        // Restoring is itself reversible.
        const before = await guarded(`Before restoring “${point?.label || 'a restore point'}”`, async () => {
            applyWorkspace(stores, snapshot, { replace: true });
        }, options);
        await refreshPoints();
        return before;
    }

    async function removePoint(id) {
        await deleteRestorePoint(id);
        await refreshPoints();
    }

    async function removeAllPoints() {
        await clearRestorePoints();
        await refreshPoints();
    }

    // --- Deleting ------------------------------------------------------

    /** Empty one area (see utils/workspaceAreas). */
    async function clearArea(key, options = {}) {
        const area = areaByKey(key);
        if (!area) throw new Error(`Unknown part of the workspace: ${key}`);
        return guarded(`Before deleting: ${area.title}`, () => clearAreas(stores, [key]), options);
    }

    /** Empty every area that holds the user's own work. Preferences and the corpus stay. */
    async function deleteAllWork(options = {}) {
        return guarded('Before deleting all work', () => clearAreas(stores, WORK_AREAS.map(a => a.key)), options);
    }

    /** Delete (part of) one manuscript's data; see useDataManagement.deleteManuscriptData for the options. */
    async function deleteManuscript(source, deleteOptions, options = {}) {
        return guarded(`Before deleting data of ${source}`, () => data.deleteManuscriptData(source, deleteOptions), options);
    }

    /** The loaded corpus. It is not part of any restore point: it is reloaded from the user's files. */
    async function unloadCorpus() {
        busy.value = true;
        try {
            await corpus.clearAll();
            corpusImport.reset();
        } finally {
            busy.value = false;
        }
    }

    /** Downloaded IIIF manifests and cropped images; fetched again when needed. */
    async function clearCaches() {
        busy.value = true;
        try {
            await clearStore('manifests');
            await clearStore('images');
            iiif.parsedData = {};
            iiif.manifestStatus = {};
        } finally {
            busy.value = false;
        }
    }

    /** How much the caches hold, as a number of entries. */
    async function cacheEntries() {
        return (await countStore('manifests')) + (await countStore('images'));
    }

    /**
     * Back to a first visit: all work, the preferences, the loaded corpus, the
     * caches and OMMR data are gone. The restore point covers everything except
     * the corpus and the caches, which are rebuilt from files and the network.
     *
     * @param {{ disconnectFolder?: boolean, force?: boolean }} [options]
     *   With a project folder bound, the reset would otherwise be saved into its
     *   workspace.json at the next autosave. `disconnectFolder` leaves the
     *   folder's copy untouched instead.
     */
    async function resetApp({ disconnectFolder = false, force = false } = {}) {
        const point = await guarded('Before resetting the app', async () => {
            if (disconnectFolder && storage.folderName.value) await storage.disconnectFolder();
            clearAreas(stores, AREAS.map(a => a.key));
            ommr.clearAll();
        }, { force });
        await unloadCorpus();
        await clearCaches();
        // The watchers count the deletions above as changes; wait for them, then start the tally over.
        await nextTick();
        reminder.reset();
        return point;
    }

    return {
        areas, workAreas, workCount, isEmpty, manuscripts,
        points, busy,
        refreshPoints, createRestorePoint, restore, removePoint, removeAllPoints,
        clearArea, deleteManuscript, deleteAllWork, unloadCorpus, clearCaches, cacheEntries, resetApp
    };
}

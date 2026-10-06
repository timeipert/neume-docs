import { ref, watch } from 'vue';
import { getHandle, setHandle, deleteHandle } from '../utils/idb';
import { useSettingsStore } from '../stores/settings';
import { useAnnotationsStore } from '../stores/annotations';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useProjectsStore } from '../stores/projects';
import { useIiifStore } from '../stores/iiif';
import { useIiifRegistryStore } from '../stores/iiifRegistry';
import { usePatternLibraryStore } from '../stores/patternLibrary';
import { useManuscriptMetaStore } from '../stores/manuscriptMeta';
import { useDirectSnippetsStore } from '../stores/directSnippets';
import { captureWorkspace, applyWorkspace } from '../utils/workspaceSnapshot';

const SCHEMA_VERSION = 1;
const HANDLE_KEY = 'workspaceDirHandle';

const isSupported = 'showDirectoryPicker' in window;
const folderName = ref('');
const status = ref('idle'); // 'idle' | 'saving' | 'saved' | 'error'
const lastError = ref(null);
const lastSavedAt = ref(null);
const isStorageBypassed = ref(sessionStorage.getItem('workspace_bypassed') === 'true');

let directoryHandle = null;
let saveTimeout = null;
let isHydrating = false;
let isInitialized = false;

let _resolveInit;
const initPromise = new Promise(resolve => {
    _resolveInit = resolve;
});

function bypassStorage() {
    isStorageBypassed.value = true;
    sessionStorage.setItem('workspace_bypassed', 'true');
}

export function useWorkspaceStorage() {
    const settings = useSettingsStore();
    const annotStore = useAnnotationsStore();
    const tablesStore = usePersonalTablesStore();
    const iiifStore = useIiifStore();
    const registryStore = useIiifRegistryStore();
    const directStore = useDirectSnippetsStore();
    const libraryStore = usePatternLibraryStore();
    const metaStore = useManuscriptMetaStore();
    const projectsStore = useProjectsStore();


    const stores = () => ({
        settings,
        annotations: annotStore,
        tables: tablesStore,
        iiif: iiifStore,
        registry: registryStore,
        library: libraryStore,
        meta: metaStore,
        direct: directStore,
        projects: projectsStore
    });

    // Retrieve full app state as an object compatible with data management schema
    function serializeState() {
        return {
            schemaVersion: SCHEMA_VERSION,
            savedAt: new Date().toISOString(),
            label: settings.backupLabel || 'Workspace',
            data: captureWorkspace(stores(), { copy: false })
        };
    }

    // Hydrate stores from the loaded state
    function hydrateState(payload) {
        if (!payload) return;

        // Backwards compatibility for older workspace files
        if (payload.version && payload.content && !payload.schemaVersion) {
            payload.schemaVersion = payload.version;
            payload.data = payload.content;
        }

        if (!payload.data) return;
        isHydrating = true; // Prevent autosave from triggering during load
        applyWorkspace(stores(), payload.data);

        if (payload.savedAt) {
            lastSavedAt.value = new Date(payload.savedAt).toLocaleTimeString();
        }

        setTimeout(() => isHydrating = false, 100); // Re-enable autosave after next tick
    }

    async function verifyPermission(handle, withRequest = false) {
        const options = { mode: 'readwrite' };
        if (await handle.queryPermission(options) === 'granted') {
            return true;
        }
        if (withRequest && await handle.requestPermission(options) === 'granted') {
            return true;
        }
        return false;
    }

    async function chooseFolder() {
        if (!isSupported) {
            lastError.value = "File System Access API is not supported in this browser.";
            status.value = 'error';
            return;
        }

        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            if (await verifyPermission(handle, true)) {
                directoryHandle = handle;
                folderName.value = handle.name;
                await setHandle(HANDLE_KEY, handle);
                
                // Read existing workspace if any, otherwise save current state
                try {
                    const fileHandle = await directoryHandle.getFileHandle('workspace.json');
                    const file = await fileHandle.getFile();
                    const text = await file.text();
                    const payload = JSON.parse(text);
                    hydrateState(payload);
                    status.value = 'saved';
                } catch (e) {
                    // File doesn't exist or is invalid, just save current
                    await saveWorkspace();
                }
            } else {
                throw new Error("Permission to read/write was denied.");
            }
        } catch (e) {
            console.error(e);
            lastError.value = e.message;
            status.value = 'error';
        }
    }
    
    async function reGrantPermission() {
        if (!directoryHandle) return;
        try {
            if (await verifyPermission(directoryHandle, true)) {
                status.value = 'idle';
                lastError.value = null;
                // Attempt a save or load depending on state. Let's just save.
                await saveWorkspace();
            } else {
                throw new Error("Permission denied.");
            }
        } catch (e) {
            lastError.value = e.message;
            status.value = 'error';
        }
    }

    async function saveWorkspace() {
        if (!directoryHandle) return;
        if (isHydrating) return;
        
        status.value = 'saving';
        lastError.value = null;

        try {
            if (!(await verifyPermission(directoryHandle, false))) {
                throw new Error("Permission lost. Please re-grant access.");
            }

            const state = serializeState();
            const json = JSON.stringify(state, null, 2);

            const fileHandle = await directoryHandle.getFileHandle('workspace.json', { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(json);
            await writable.close();

            lastSavedAt.value = new Date().toLocaleTimeString();
            status.value = 'saved';
        } catch (e) {
            console.error("Save failed", e);
            lastError.value = e.message;
            status.value = 'error';
        }
    }

    /**
     * Stop saving to the project folder and forget it. Nothing in the folder is
     * touched: its workspace.json stays as it was, and can be picked again later.
     */
    async function disconnectFolder() {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = null;
        directoryHandle = null;
        folderName.value = '';
        // Without this the router would send the user back to the setup page.
        bypassStorage();
        status.value = 'idle';
        lastError.value = null;
        lastSavedAt.value = null;
        try { await deleteHandle(HANDLE_KEY); } catch (e) { console.error('Could not forget the project folder', e); }
    }

    function triggerAutosave() {
        if (isHydrating || !directoryHandle) return;
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveWorkspace();
        }, 1500);
    }

    // Initialization
    if (!isInitialized) {
        isInitialized = true;
        
        // Set up reactive watchers for autosave
        watch(
            [
                () => settings.$state,
                () => annotStore.$state,
                () => tablesStore.$state,
                () => iiifStore.$state,
                () => registryStore.entries,
                () => metaStore.$state,
                () => directStore.collections,
                () => projectsStore.projects
            ],
            () => {
                triggerAutosave();
            },
            { deep: true }
        );

        (async () => {
            if (!isSupported) {
                _resolveInit();
                return;
            }
            try {
                const handle = await getHandle(HANDLE_KEY);
                if (handle) {
                    directoryHandle = handle;
                    folderName.value = handle.name;
                    // Check if we have permission right away (unlikely on fresh load, but possible)
                    if (await verifyPermission(handle, false)) {
                        // Load it
                        const fileHandle = await directoryHandle.getFileHandle('workspace.json');
                        const file = await fileHandle.getFile();
                        const text = await file.text();
                        hydrateState(JSON.parse(text));
                        status.value = 'saved';
                    } else {
                        status.value = 'error';
                        lastError.value = "Permission needed to access your workspace folder.";
                    }
                }
            } catch (e) {
                console.error("Failed to restore handle", e);
            } finally {
                _resolveInit();
            }
        })();
    }

    return {
        isSupported,
        folderName,
        status,
        lastError,
        lastSavedAt,
        isStorageBypassed,
        initPromise,
        bypassStorage,
        chooseFolder,
        disconnectFolder,
        saveWorkspace,
        reGrantPermission
    };
}

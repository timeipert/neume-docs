<script setup>
import { ref } from 'vue';
import Panel from '../ui/Panel.vue';
import ImportMergeDialog from './ImportMergeDialog.vue';
import { useDataManagement } from '../../composables/useDataManagement';
import { useWorkspaceManagement } from '../../composables/useWorkspaceManagement';
import { useSettingsStore } from '../../stores/settings';
import { useToast } from '../../composables/useToast';

/**
 * Taking work out of the app as files and bringing it back. Export is one
 * button; the pieces (a few manuscripts, only the configuration) are offered
 * where they make sense. Import goes through a merge dialog when it would touch
 * manuscripts that already have work, and always keeps a restore point first.
 */
const settings = useSettingsStore();
const { exportData, exportConfiguration, importConfiguration, analyzeImportFiles, executeImport } = useDataManagement();
const mgmt = useWorkspaceManagement();
const toast = useToast();

const withSettings = ref(true);
const backupInput = ref(null);
const pending = ref(null); // the analysis waiting for a merge decision

function doExport() {
    exportData({ includeSettings: withSettings.value, onlyWithData: true });
    toast.show('Backup downloaded.', { tone: 'success' });
}

function doExportConfig() {
    exportConfiguration();
    toast.show('Configuration downloaded.', { tone: 'success' });
}

async function keepRestorePoint(label) {
    try {
        return await mgmt.createRestorePoint(label, { auto: true });
    } catch (e) {
        toast.show(`${e.message}. Nothing was imported.`, { tone: 'error' });
        return null;
    }
}

function undoFor(point) {
    return point ? {
        label: 'Undo',
        run: async () => {
            try { await mgmt.restore(point.id); toast.show('Import undone.', { tone: 'success' }); }
            catch (e) { toast.show(`Could not undo: ${e.message}`, { tone: 'error' }); }
        }
    } : null;
}

async function onBackupPicked(event) {
    const files = event.target.files;
    if (!files || !files.length) return;
    try {
        const [result] = await analyzeImportFiles(files);
        if (!result.success) {
            toast.show(`Could not read ${result.fileName}: ${result.error}`, { tone: 'error' });
            return;
        }
        if (result.isConfigOnly) {
            const point = await keepRestorePoint(`Before importing ${result.fileName}`);
            if (!point) return;
            importConfiguration(result.parsed);
            toast.show('Configuration imported.', { tone: 'success', action: undoFor(point) });
        } else if (result.overlapSources.length) {
            pending.value = result;
        } else {
            const point = await keepRestorePoint(`Before importing ${result.fileName}`);
            if (!point) return;
            executeImport(result.parsed, {}, { importSettings: true });
            toast.show(`Imported ${result.newSources.length} manuscript${result.newSources.length === 1 ? '' : 's'}.`, { tone: 'success', action: undoFor(point) });
        }
    } catch (e) {
        toast.show(`Import failed: ${e.message}`, { tone: 'error' });
    } finally {
        event.target.value = null;
    }
}

async function confirmMerge({ choices, importSettings }) {
    const analysis = pending.value;
    pending.value = null;
    const point = await keepRestorePoint(`Before importing ${analysis.fileName}`);
    if (!point) return;
    try {
        executeImport(analysis.parsed, { ...choices }, { importSettings });
        toast.show('Imported and merged.', { tone: 'success', action: undoFor(point) });
    } catch (e) {
        toast.show(`Import failed: ${e.message}`, { tone: 'error' });
    }
}
</script>

<template>
<Panel id="backup" title="Backup & share" description="Export your work as a file to keep, or to hand to a colleague. Only manuscripts that have work in them are included.">
    <div class="block">
        <div class="row">
            <div class="grow">
                <h3>Export a backup</h3>
                <p class="ne-muted">Projects, annotations and screenshots. To send only some manuscripts, select them under “Manuscripts” above. “Configuration only” leaves the manuscript work out: the pattern library, metadata edits and preferences, for giving a colleague the same set-up.</p>
            </div>
            <div class="controls">
                <div class="ne-field label-field">
                    <label for="backup-label">Name of the backup</label>
                    <input id="backup-label" class="ne-input" v-model="settings.backupLabel" placeholder="My backup" />
                </div>
                <label class="ne-check"><input type="checkbox" v-model="withSettings" /> Include pattern library, metadata edits and preferences</label>
                <div class="buttons">
                    <button class="ne-btn ne-btn--primary" @click="doExport">Download backup</button>
                    <button class="ne-btn" @click="doExportConfig">Configuration only</button>
                </div>
            </div>
        </div>
    </div>

    <div class="block">
        <div class="row">
            <div class="grow">
                <h3>Import</h3>
                <p class="ne-muted">Open a backup, a manuscript file or a configuration file. If it covers manuscripts you already have work on, you choose per manuscript what happens. A restore point is kept before anything changes.</p>
            </div>
            <div class="controls">
                <input ref="backupInput" type="file" accept=".json" multiple hidden @change="onBackupPicked" />
                <div><button class="ne-btn ne-btn--primary" @click="backupInput.click()">Import a file…</button></div>
            </div>
        </div>
    </div>

    <ImportMergeDialog :analysis="pending" @cancel="pending = null" @confirm="confirmMerge" />
</Panel>
</template>

<style scoped>
.block { padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg); }
.block + .block { margin-top: var(--space-3); }
.row { display: flex; gap: var(--space-4) var(--space-5); align-items: flex-start; flex-wrap: wrap; }
.grow { flex: 1 1 16rem; min-width: 0; }
h3 { margin: 0 0 var(--space-1); font-size: 0.98rem; }
p { margin: 0; font-size: 0.88rem; }
.controls { display: flex; flex-direction: column; gap: var(--space-3); align-items: flex-start; flex: 0 1 20rem; }
.buttons { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.label-field { width: 100%; }
</style>

<script setup>
import { ref } from 'vue';
import Panel from '../ui/Panel.vue';
import Disclosure from '../ui/Disclosure.vue';
import ImportMergeDialog from './ImportMergeDialog.vue';
import { useDataManagement } from '../../composables/useDataManagement';
import { useWorkspaceManagement } from '../../composables/useWorkspaceManagement';
import { useSettingsStore } from '../../stores/settings';
import { useSaveReminderStore } from '../../stores/saveReminder';
import { useToast } from '../../composables/useToast';

/**
 * Taking work out of the app as files and bringing it back, side by side: the
 * two things done most on this page. Export is one button; the pieces (a few
 * manuscripts, only the configuration) are offered where they make sense. Import
 * takes a file chosen or dropped, goes through a merge dialog when it would touch
 * manuscripts that already have work, and always keeps a restore point first.
 */
const settings = useSettingsStore();
const reminder = useSaveReminderStore();
const { exportData, exportConfiguration, importConfiguration, analyzeImportFiles, executeImport } = useDataManagement();
const mgmt = useWorkspaceManagement();
const toast = useToast();

const withSettings = ref(true);
const backupInput = ref(null);
const pending = ref(null); // the analysis waiting for a merge decision
const dragging = ref(false);

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

function onBackupPicked(event) {
    const files = event.target.files;
    return takeFiles(files).finally(() => { event.target.value = null; });
}

function onDrop(event) {
    dragging.value = false;
    return takeFiles(event.dataTransfer?.files);
}

async function takeFiles(files) {
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
<div class="transfer">
    <Panel id="backup" title="Export" tone="primary" description="Everything you have made, in one file: projects, annotations and screenshots.">
        <div class="xfer">
            <button class="ne-btn ne-btn--primary big" @click="doExport">⬇ Download backup</button>
            <p class="status" :class="{ stale: reminder.neverExported || reminder.changeCount > 0 }">
                <template v-if="reminder.neverExported">No backup yet<template v-if="reminder.changeCount"> · {{ reminder.changeCount }} change{{ reminder.changeCount === 1 ? '' : 's' }} so far</template>.</template>
                <template v-else-if="reminder.changeCount">{{ reminder.changeCount }} change{{ reminder.changeCount === 1 ? '' : 's' }} not in a backup yet · last backup {{ reminder.sinceExportLabel }}</template>
                <template v-else>Everything is in your last backup ({{ reminder.sinceExportLabel }}).</template>
            </p>
            <Disclosure title="Options" summary="name, what to include">
                <div class="ne-field label-field">
                    <label for="backup-label">Name of the backup</label>
                    <input id="backup-label" class="ne-input" v-model="settings.backupLabel" placeholder="My backup" />
                </div>
                <label class="ne-check"><input type="checkbox" v-model="withSettings" /> Include pattern library, metadata edits and preferences</label>
                <p class="ne-muted">To send only some manuscripts, use the table below.</p>
                <button class="ne-btn ne-btn--sm" @click="doExportConfig">Configuration only (leave the manuscript work out)</button>
            </Disclosure>
        </div>
    </Panel>

    <Panel id="import" title="Import" description="Open a backup, a manuscript file or a configuration file.">
        <div class="xfer">
            <input ref="backupInput" type="file" accept=".json" multiple hidden @change="onBackupPicked" />
            <button
                type="button" class="drop" :class="{ over: dragging }"
                @click="backupInput.click()"
                @dragover.prevent="dragging = true" @dragenter.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop"
            >
                <strong>Choose a file…</strong>
                <span>or drop it here</span>
            </button>
            <p class="ne-muted">If a file covers manuscripts you already have work on, you choose for each what happens. A restore point is kept first, so you can undo it.</p>
        </div>
    </Panel>

    <ImportMergeDialog :analysis="pending" @cancel="pending = null" @confirm="confirmMerge" />
</div>
</template>

<style scoped>
.transfer { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-5); align-items: stretch; margin-bottom: var(--space-5); }
.transfer :deep(.panel) { margin-bottom: 0; }
@media (max-width: 760px) { .transfer { grid-template-columns: 1fr; gap: var(--space-4); } }

.xfer { display: flex; flex-direction: column; align-items: stretch; gap: var(--space-3); }
.big { padding: 0.8em 1.4em; font-size: 1.05rem; }
.status { margin: 0; font-size: 0.85rem; color: var(--color-text-muted); }
.status.stale { color: var(--color-warning-dark); }
.xfer :deep(.disclosure) { box-shadow: none; background: transparent; border: none; border-top: 1px solid var(--color-border); border-radius: 0; }
.xfer :deep(.d-toggle) { padding-left: 0; padding-right: 0; border-radius: 0; }
.xfer :deep(.d-body) { padding: var(--space-3) 0 0; }
.xfer :deep(.d-body) { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-3); }
.label-field { width: 100%; }
p { margin: 0; font-size: 0.88rem; }

.drop {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    padding: 1.1em 1em; min-height: 4.2rem; width: 100%;
    border: 2px dashed var(--color-border-hover, var(--color-border)); border-radius: var(--radius-md);
    background: var(--color-bg); color: var(--color-text); font-size: 1rem; cursor: pointer;
}
.drop span { font-size: 0.85rem; color: var(--color-text-muted); font-weight: 400; }
.drop:hover, .drop.over { border-color: var(--color-primary); background: var(--color-primary-light); }
</style>

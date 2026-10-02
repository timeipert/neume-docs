<script setup>
import { computed } from 'vue';
import Panel from '../ui/Panel.vue';
import { useWorkspaceStorage } from '../../composables/useWorkspaceStorage';
import { useSaveReminderStore } from '../../stores/saveReminder';
import { useToast } from '../../composables/useToast';

const storage = useWorkspaceStorage();
const { folderName, status, lastError, lastSavedAt, isSupported } = storage;
const reminder = useSaveReminderStore();
const toast = useToast();

const hasFolder = computed(() => !!folderName.value);

async function disconnect() {
    await storage.disconnectFolder();
    toast.show('Project folder disconnected. Your work stays in this browser; the folder was not changed.', { tone: 'success' });
}
</script>

<template>
<Panel id="storage" title="Where your work is kept" description="Your work is saved in this browser automatically. A project folder adds a second, permanent copy on your disk that follows every change.">
    <div class="where">
        <div class="where-row">
            <span class="where-label">This browser</span>
            <span class="where-value">Always on. The browser may clear it if you wipe site data, so keep a backup or a project folder.</span>
        </div>

        <div class="where-row">
            <span class="where-label">Project folder</span>
            <div class="where-value">
                <template v-if="!isSupported">
                    <span class="ne-muted">Not available in this browser (it needs Chrome, Edge or another browser with the File System Access API). Use backups instead.</span>
                </template>
                <template v-else>
                    <p v-if="hasFolder" class="folder-line">
                        <strong class="ne-code">{{ folderName }}</strong>
                        <span v-if="status === 'saving'" class="state state--busy">Saving…</span>
                        <span v-else-if="status === 'saved'" class="state state--good">✓ Saved {{ lastSavedAt }}</span>
                        <span v-else-if="status === 'error'" class="state state--bad">⚠ {{ lastError }}</span>
                    </p>
                    <p v-else class="ne-muted folder-line">None connected.</p>
                    <div class="where-actions">
                        <button class="ne-btn ne-btn--sm" :class="{ 'ne-btn--primary': !hasFolder }" @click="storage.chooseFolder()">{{ hasFolder ? 'Change folder…' : 'Choose a folder…' }}</button>
                        <button v-if="hasFolder && status === 'error'" class="ne-btn ne-btn--sm" @click="storage.reGrantPermission()">Allow access again</button>
                        <button v-if="hasFolder" class="ne-btn ne-btn--sm" @click="storage.saveWorkspace()">Save now</button>
                        <button v-if="hasFolder" class="ne-btn ne-btn--sm ne-btn--ghost" title="Stop saving to the folder. The folder is not changed." @click="disconnect">Disconnect</button>
                    </div>
                </template>
            </div>
        </div>

        <div class="where-row">
            <span class="where-label">Backup reminder</span>
            <div class="where-value">
                <p class="reminder-line">
                    <span :class="reminder.disabled ? 'ne-muted' : 'on'">{{ reminder.disabled ? 'Off' : 'On' }}</span>
                    · {{ reminder.changeCount }} change{{ reminder.changeCount === 1 ? '' : 's' }} since the last backup · last backup {{ reminder.sinceExportLabel }}
                </p>
                <div class="where-actions">
                    <button v-if="reminder.disabled" class="ne-btn ne-btn--sm" @click="reminder.enableReminder()">Turn reminders on</button>
                    <button v-else class="ne-btn ne-btn--sm" @click="reminder.disableReminder()">Turn reminders off</button>
                </div>
            </div>
        </div>
    </div>
</Panel>
</template>

<style scoped>
.where { display: flex; flex-direction: column; }
.where-row { display: grid; grid-template-columns: 9rem minmax(0, 1fr); gap: var(--space-4); padding: var(--space-3) 0; border-top: 1px solid var(--color-border); font-size: 0.92rem; }
.where-row:first-child { border-top: none; padding-top: 0; }
.where-label { font-weight: 600; color: var(--color-text-muted); }
.where-value { min-width: 0; }
.where-value p { margin: 0 0 var(--space-2); }
.where-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.folder-line { display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
.state { font-size: 0.85rem; font-weight: 600; }
.state--busy { color: var(--color-text-muted); }
.state--good { color: var(--color-success-dark); }
.state--bad { color: var(--color-danger); }
.reminder-line .on { color: var(--color-success-dark); font-weight: 700; }
@media (max-width: 640px) { .where-row { grid-template-columns: 1fr; gap: var(--space-1); } }
</style>

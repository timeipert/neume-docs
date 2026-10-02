<script setup>
import { ref, computed, onMounted } from 'vue';
import Panel from '../ui/Panel.vue';
import ActionDialog from './ActionDialog.vue';
import { useWorkspaceManagement } from '../../composables/useWorkspaceManagement';
import { useWorkspaceStorage } from '../../composables/useWorkspaceStorage';
import { useToast } from '../../composables/useToast';

/**
 * The large deletions, kept together at the bottom of the page. From the
 * smallest to the largest: clear the caches, delete all work, reset the app.
 * Deleting work and resetting ask for a typed word, and both are undoable from a
 * restore point. (The loaded corpus is removed on the Corpus page, where it was
 * loaded; resetting the app removes it too.)
 */
const mgmt = useWorkspaceManagement();
const { workCount, workAreas } = mgmt;
const { folderName } = useWorkspaceStorage();
const toast = useToast();

const request = ref(null);
const cacheEntries = ref(0);

const refreshCaches = async () => { cacheEntries.value = await mgmt.cacheEntries(); };
onMounted(refreshCaches);

const workText = computed(() => workAreas.value.filter(a => a.count).map(a => a.text).join(' · '));
const folderNote = computed(() => (folderName.value
    ? ` The project folder “${folderName.value}” is updated to match, so the deletion is saved there too.`
    : ''));

function askDeleteWork() {
    request.value = {
        title: 'Delete all your work',
        paragraphs: [
            `This deletes ${workText.value}.${folderNote.value}`,
            'Your preferences and the loaded corpus stay. A restore point is kept first, so you can undo this.'
        ],
        confirmLabel: 'Delete all work',
        requireText: 'delete',
        run: (options) => mgmt.deleteAllWork(options),
        success: 'All your work was deleted.'
    };
}

function askReset() {
    request.value = {
        title: 'Reset the app',
        paragraphs: [
            'This puts the editor back to how it looks on a first visit: all your work and your preferences are deleted, the corpus is unloaded and the caches are cleared.',
            'A restore point of your work and preferences is kept first. The corpus is not part of it; load your files again on the Corpus page.'
        ],
        confirmLabel: 'Reset the app',
        requireText: 'reset',
        ...(folderName.value ? {
            option: { key: 'disconnectFolder', label: `Disconnect the project folder “${folderName.value}” first, so the work saved in it is kept`, default: true }
        } : {}),
        run: (options) => mgmt.resetApp(options),
        success: 'The app was reset.'
    };
}

async function clearCaches() {
    await mgmt.clearCaches();
    await refreshCaches();
    toast.show('Caches cleared. Manifests and images are fetched again when needed.', { tone: 'success' });
}
</script>

<template>
<Panel id="reset" title="Reset & delete" tone="danger" description="For starting over. Deleting work and resetting keep a restore point first, so they can be undone.">
    <ul class="rows">
        <li data-action="caches">
            <div class="what">
                <strong>Clear the caches</strong>
                <span>Downloaded IIIF manifests and cropped images · {{ cacheEntries }} saved. They are fetched again when needed. Nothing of yours is lost.</span>
            </div>
            <button class="ne-btn ne-btn--sm" :disabled="!cacheEntries" @click="clearCaches">Clear caches</button>
        </li>
        <li data-action="delete-work">
            <div class="what">
                <strong>Delete all your work</strong>
                <span>{{ workCount ? workText : 'Nothing to delete yet.' }}</span>
            </div>
            <button class="ne-btn ne-btn--sm ne-btn--danger" :disabled="!workCount" @click="askDeleteWork">Delete all work…</button>
        </li>
        <li data-action="reset">
            <div class="what">
                <strong>Reset the app</strong>
                <span>Work, preferences, corpus and caches: back to a first visit.</span>
            </div>
            <button class="ne-btn ne-btn--sm ne-btn--danger-solid" @click="askReset">Reset the app…</button>
        </li>
    </ul>
    <ActionDialog :request="request" @close="request = null" />
</Panel>
</template>

<style scoped>
.rows { list-style: none; margin: 0; padding: 0; }
.rows li { display: flex; justify-content: space-between; align-items: center; gap: var(--space-4); padding: var(--space-3) 0; border-top: 1px solid var(--color-border); }
.rows li:first-child { border-top: none; padding-top: 0; }
.what { min-width: 0; }
.what strong { display: block; font-size: 0.95rem; }
.what span { font-size: 0.85rem; color: var(--color-text-muted); }
</style>

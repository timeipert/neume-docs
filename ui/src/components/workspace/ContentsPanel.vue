<script setup>
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import Panel from '../ui/Panel.vue';
import ActionDialog from './ActionDialog.vue';
import { useWorkspaceManagement } from '../../composables/useWorkspaceManagement';

const mgmt = useWorkspaceManagement();
const { areas } = mgmt;
const request = ref(null);

function askDelete(area) {
    request.value = {
        title: `Delete: ${area.title}`,
        paragraphs: [
            `This deletes ${area.text}.`,
            'A restore point is kept first, so you can take this back from the toast that follows or from “Restore points” below.'
        ],
        confirmLabel: 'Delete',
        run: (options) => mgmt.clearArea(area.key, options),
        success: `Deleted: ${area.title.toLowerCase()}.`
    };
}

function askReset(area) {
    request.value = {
        title: 'Reset preferences',
        paragraphs: [`This puts ${area.text} back to the defaults.`, 'Your work is not touched.'],
        confirmLabel: 'Reset',
        run: (options) => mgmt.clearArea(area.key, options),
        success: 'Preferences are back to the defaults.'
    };
}
</script>

<template>
<Panel id="contents" title="What is in your workspace" description="Everything you have made, by kind. Each part can be opened, or deleted on its own. Loaded corpus data is not listed here: it is managed on the Corpus page.">
    <table class="ne-table">
        <thead>
            <tr><th>Part</th><th>Holds</th><th></th></tr>
        </thead>
        <tbody>
            <tr v-for="area in areas" :key="area.key" :data-area="area.key">
                <td class="name">
                    <RouterLink :to="area.to">{{ area.title }}</RouterLink>
                    <span class="blurb">{{ area.blurb }}</span>
                </td>
                <td class="holds">
                    <span v-if="area.count" class="holds-text">{{ area.text }}</span>
                    <span v-else class="ne-muted">{{ area.isWork ? 'Nothing yet' : 'All at the defaults' }}</span>
                </td>
                <td class="actions">
                    <button v-if="area.isWork" class="ne-btn ne-btn--sm ne-btn--danger" :disabled="!area.count" @click="askDelete(area)">Delete…</button>
                    <button v-else class="ne-btn ne-btn--sm" :disabled="!area.count" @click="askReset(area)">Reset…</button>
                </td>
            </tr>
        </tbody>
    </table>
    <ActionDialog :request="request" @close="request = null" />
</Panel>
</template>

<style scoped>
.name { width: 45%; }
.name a { font-weight: 600; }
.blurb { display: block; margin-top: 2px; font-size: 0.8rem; color: var(--color-text-muted); font-weight: 400; }
.holds { font-size: 0.88rem; }
@media (max-width: 640px) { .blurb { display: none; } }
</style>

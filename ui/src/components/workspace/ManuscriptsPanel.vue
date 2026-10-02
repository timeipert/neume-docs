<script setup>
import { ref, computed } from 'vue';
import Panel from '../ui/Panel.vue';
import ManuscriptDataDialog from './ManuscriptDataDialog.vue';
import { useWorkspaceManagement } from '../../composables/useWorkspaceManagement';
import { useDataManagement } from '../../composables/useDataManagement';
import { useToast } from '../../composables/useToast';

const { manuscripts } = useWorkspaceManagement();
const { exportManuscripts } = useDataManagement();
const toast = useToast();

const selected = ref([]);
const dialogSource = ref('');
const dialogOpen = ref(false);

// A manuscript whose work was deleted drops out of the selection.
const chosen = computed(() => selected.value.filter(s => manuscripts.value.some(m => m.source === s)));
const allSelected = computed(() => manuscripts.value.length > 0 && chosen.value.length === manuscripts.value.length);

function toggleAll(checked) {
    selected.value = checked ? manuscripts.value.map(m => m.source) : [];
}

function exportThese(sources) {
    try {
        exportManuscripts(sources);
    } catch (e) {
        toast.show(e.message, { tone: 'error' });
    }
}

function manage(source) {
    dialogSource.value = source;
    dialogOpen.value = true;
}
</script>

<template>
<Panel id="manuscripts" title="Manuscripts" description="The manuscripts you have worked on. Export some of them to share with a colleague, or delete the work on one of them.">
    <template #actions>
        <button class="ne-btn ne-btn--sm" :disabled="!chosen.length" @click="exportThese(chosen)">Export selected ({{ chosen.length }})</button>
    </template>

    <div v-if="!manuscripts.length" class="ne-empty">No manuscript has any work yet. Annotations, line regions and neume table rows will appear here.</div>
    <div v-else class="scroll">
        <table class="ne-table">
            <thead>
                <tr>
                    <th class="check"><input type="checkbox" :checked="allSelected" aria-label="Select all manuscripts" @change="toggleAll($event.target.checked)" /></th>
                    <th>Manuscript</th>
                    <th class="num">Snippets</th>
                    <th class="num">Lines</th>
                    <th class="num">Table rows</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="m in manuscripts" :key="m.source">
                    <td class="check"><input type="checkbox" :value="m.source" v-model="selected" :aria-label="`Select ${m.source}`" /></td>
                    <td><strong>{{ m.source }}</strong></td>
                    <td class="num">{{ m.annotationsCount }}</td>
                    <td class="num">{{ m.regionsCount }}</td>
                    <td class="num">{{ m.patternRowsCount }}</td>
                    <td class="actions">
                        <span class="btns">
                            <button class="ne-btn ne-btn--sm" @click="exportThese([m.source])">Export</button>
                            <button class="ne-btn ne-btn--sm ne-btn--danger" @click="manage(m.source)">Delete…</button>
                        </span>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
    <ManuscriptDataDialog :open="dialogOpen" :source="dialogSource" @close="dialogOpen = false" />
</Panel>
</template>

<style scoped>
.scroll { overflow-x: auto; }
.check { width: 2rem; }
.btns { display: inline-flex; gap: var(--space-2); }
</style>

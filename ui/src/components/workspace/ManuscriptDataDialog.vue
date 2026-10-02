<script setup>
import { ref, computed, watch } from 'vue';
import ModalDialog from '../ui/ModalDialog.vue';
import { useWorkspaceManagement, RestorePointError } from '../../composables/useWorkspaceManagement';
import { useDataManagement } from '../../composables/useDataManagement';
import { useIiifStore } from '../../stores/iiif';
import { useOmmrStore } from '../../stores/ommr';
import { useToast } from '../../composables/useToast';
import { getManuscriptStats } from '../../utils/workspaceSharing';

/**
 * Remove (part of) one manuscript's work: choose what, and for which folios.
 * Opened from the Workspace page and from the OMMR page.
 */
const props = defineProps({
    open: { type: Boolean, default: false },
    source: { type: String, default: '' }
});
const emit = defineEmits(['close']);

const mgmt = useWorkspaceManagement();
const { getLocalFullState } = useDataManagement();
const iiifStore = useIiifStore();
const ommrStore = useOmmrStore();
const toast = useToast();

const what = ref({ snippets: true, regions: true, manualLines: true, table: false, iiifLink: false, ommrDataset: false });
const folioScope = ref('all'); // 'all' | 'specific'
const selectedFolios = ref([]);
const busy = ref(false);
const error = ref('');
const force = ref(false);

const stats = computed(() => {
    if (!props.source) return null;
    return {
        ...getManuscriptStats(getLocalFullState(), props.source),
        hasIiif: !!iiifStore.links?.[props.source],
        hasOmmr: !!ommrStore.loadedDatasets?.[props.source]
    };
});

watch(() => props.open, (open) => {
    if (!open) return;
    what.value = { snippets: true, regions: true, manualLines: true, table: false, iiifLink: false, ommrDataset: false };
    folioScope.value = 'all';
    selectedFolios.value = stats.value?.foliosList ? [...stats.value.foliosList] : [];
    error.value = '';
    force.value = false;
});

const nothingChosen = computed(() => !Object.values(what.value).some(Boolean)
    || (folioScope.value === 'specific' && !selectedFolios.value.length));

async function run(options, message) {
    if (busy.value) return;
    busy.value = true;
    error.value = '';
    try {
        const point = await mgmt.deleteManuscript(props.source, options, { force: force.value });
        toast.show(message, {
            tone: 'success',
            action: point ? {
                label: 'Undo',
                run: async () => {
                    try { await mgmt.restore(point.id); toast.show('Undone: the data is back.', { tone: 'success' }); }
                    catch (e) { toast.show(`Could not undo: ${e.message}`, { tone: 'error' }); }
                }
            } : null
        });
        emit('close');
    } catch (e) {
        if (e instanceof RestorePointError) {
            force.value = true;
            error.value = `${e.message}. Nothing was deleted. Press the button again to continue without a restore point.`;
        } else {
            error.value = e.message || String(e);
        }
    } finally {
        busy.value = false;
    }
}

function deleteSelected() {
    run({
        snippets: what.value.snippets,
        regions: what.value.regions,
        manualLines: what.value.manualLines,
        table: what.value.table,
        iiifLink: what.value.iiifLink,
        ommrDataset: what.value.ommrDataset,
        folios: folioScope.value === 'specific' ? selectedFolios.value : null
    }, `Deleted the selected data of ${props.source}.`);
}

function deleteEverything() {
    run({
        snippets: true, regions: true, manualLines: true, table: true, iiifLink: true, ommrDataset: true, folios: null
    }, `Deleted all work on ${props.source}.`);
}

const rows = computed(() => !stats.value ? [] : [
    { key: 'snippets', label: 'Snippet annotations', hint: `${stats.value.annotationsCount} snippets`, available: stats.value.annotationsCount > 0 },
    { key: 'regions', label: 'Line regions', hint: `${stats.value.regionsCount} lines`, available: stats.value.regionsCount > 0 },
    { key: 'manualLines', label: 'Manual line numbers', hint: 'Resets the list of line numbers', available: true },
    { key: 'table', label: 'Neume table', hint: `${stats.value.patternRowsCount} pattern rows`, available: stats.value.patternRowsCount > 0 },
    { key: 'iiifLink', label: 'IIIF manifest link', hint: 'Unlinks the manifest of this manuscript', available: stats.value.hasIiif },
    ...(stats.value.hasOmmr ? [{ key: 'ommrDataset', label: 'Loaded OMMR dataset', hint: 'Clears the OMMR data held in memory', available: true }] : [])
]);
</script>

<template>
<ModalDialog :open="open" :title="`Delete data: ${source}`" width="36rem" :dismissable="!busy" @close="emit('close')">
    <template v-if="stats">
        <p class="md-intro ne-muted">Choose what to remove. A restore point is kept first, so this can be undone.</p>

        <div class="opts">
            <label v-for="r in rows" :key="r.key" class="opt" :class="{ off: !r.available }">
                <input type="checkbox" v-model="what[r.key]" :disabled="!r.available" />
                <span><strong>{{ r.label }}</strong><small>{{ r.hint }}</small></span>
            </label>
        </div>

        <div v-if="stats.foliosCount > 1" class="scope">
            <p class="ne-label">Which folios</p>
            <label class="ne-check"><input type="radio" v-model="folioScope" value="all" /> All {{ stats.foliosCount }} folios</label>
            <label class="ne-check"><input type="radio" v-model="folioScope" value="specific" /> Only the folios I pick</label>
            <div v-if="folioScope === 'specific'" class="folios">
                <div class="folios-head">
                    <button class="ne-btn ne-btn--sm" @click="selectedFolios = [...stats.foliosList]">All</button>
                    <button class="ne-btn ne-btn--sm" @click="selectedFolios = []">None</button>
                    <span class="ne-muted">{{ selectedFolios.length }} of {{ stats.foliosList.length }} selected</span>
                </div>
                <div class="chips">
                    <label v-for="f in stats.foliosList" :key="f" class="chip" :class="{ on: selectedFolios.includes(f) }">
                        <input type="checkbox" :value="f" v-model="selectedFolios" /> {{ f }}
                    </label>
                </div>
            </div>
        </div>
        <p v-if="error" class="ne-note ne-note--error" role="alert">{{ error }}</p>
    </template>
    <template #footer>
        <button class="ne-btn ne-btn--danger" :disabled="busy || !stats?.hasData" @click="deleteEverything">Delete all work on this manuscript</button>
        <span class="spacer"></span>
        <button class="ne-btn" :disabled="busy" @click="emit('close')">Cancel</button>
        <button class="ne-btn ne-btn--danger-solid" :disabled="busy || nothingChosen" @click="deleteSelected">{{ force ? 'Continue without a restore point' : 'Delete selected' }}</button>
    </template>
</ModalDialog>
</template>

<style scoped>
.md-intro { margin: 0 0 var(--space-4); font-size: 0.92rem; }
.opts { display: flex; flex-direction: column; gap: var(--space-2); }
.opt { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg); cursor: pointer; }
.opt:hover:not(.off) { border-color: var(--color-border-hover); }
.opt.off { opacity: 0.5; cursor: not-allowed; }
.opt input { margin-top: 0.25em; accent-color: var(--color-danger); }
.opt strong { display: block; font-size: 0.92rem; }
.opt small { color: var(--color-text-muted); font-size: 0.8rem; }
.scope { margin-top: var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); }
.scope .ne-label { margin: 0; }
.folios { padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg); }
.folios-head { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
.folios-head .ne-muted { margin-left: auto; font-size: 0.8rem; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; max-height: 9rem; overflow-y: auto; }
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-size: 0.8rem; cursor: pointer; }
.chip.on { border-color: var(--color-danger-muted); background: var(--color-danger-light); }
.chip input { margin: 0; }
.spacer { flex: 1; }
.ne-note { margin: var(--space-3) 0 0; }
</style>

<script setup>
import { ref, watch, computed } from 'vue';
import ModalDialog from '../ui/ModalDialog.vue';

/**
 * Decide, manuscript by manuscript, what to do when a backup file contains work
 * on manuscripts that already have work here. `analysis` is one entry of
 * useDataManagement.analyzeImportFiles.
 */
const props = defineProps({
    analysis: { type: Object, default: null }
});
const emit = defineEmits(['confirm', 'cancel']);

const choices = ref({});
const withSettings = ref(true);

watch(() => props.analysis, (a) => {
    if (!a) return;
    // Skipping is the safe default: nothing is overwritten unless asked for.
    choices.value = Object.fromEntries((a.overlapSources || []).map(o => [o.source, 'skip']));
    withSettings.value = !!a.hasSettings;
}, { immediate: true });

const overlaps = computed(() => props.analysis?.overlapSources || []);

function setAll(choice) {
    for (const item of overlaps.value) {
        // An empty incoming manuscript cannot replace or copy anything.
        if (choice !== 'skip' && !item.incomingStats.hasData) continue;
        choices.value[item.source] = choice;
    }
}

const describe = (s) => s.hasData
    ? `${s.annotationsCount} snippets in ${s.foliosCount} folios`
    : 'nothing';
</script>

<template>
<ModalDialog :open="!!analysis" title="Some manuscripts already have work here" width="46rem" @close="emit('cancel')">
    <template v-if="analysis">
        <p>The file <strong>{{ analysis.fileName }}</strong> has work on manuscripts you have also worked on. Choose what happens to each. A restore point is kept before anything changes.</p>

        <div v-if="analysis.newSources?.length" class="block">
            <h4>New here — imported as they are</h4>
            <div class="chips"><span v-for="n in analysis.newSources" :key="n.source" class="ne-chip">{{ n.source }} · {{ describe(n.incomingStats) }}</span></div>
        </div>

        <div class="block">
            <div class="block-head">
                <h4>Already here</h4>
                <div class="bulk">
                    <span class="ne-muted">All:</span>
                    <button class="ne-btn ne-btn--sm" @click="setAll('skip')">Skip</button>
                    <button class="ne-btn ne-btn--sm" @click="setAll('copy')">Import as copies</button>
                    <button class="ne-btn ne-btn--sm ne-btn--danger" @click="setAll('overwrite')">Overwrite</button>
                </div>
            </div>
            <div class="cards">
                <div v-for="item in overlaps" :key="item.source" class="card-item">
                    <strong>{{ item.source }}</strong>
                    <p class="cmp"><span>In the file: {{ describe(item.incomingStats) }}</span><span>Here: {{ describe(item.localStats) }}</span></p>
                    <div class="choice">
                        <label class="ne-check"><input type="radio" :name="`merge-${item.source}`" value="skip" v-model="choices[item.source]" /> Skip</label>
                        <label class="ne-check" :class="{ off: !item.incomingStats.hasData }"><input type="radio" :name="`merge-${item.source}`" value="copy" v-model="choices[item.source]" :disabled="!item.incomingStats.hasData" /> Import as a copy</label>
                        <label class="ne-check" :class="{ off: !item.incomingStats.hasData }"><input type="radio" :name="`merge-${item.source}`" value="overwrite" v-model="choices[item.source]" :disabled="!item.incomingStats.hasData" /> Overwrite what is here</label>
                    </div>
                </div>
            </div>
        </div>

        <label v-if="analysis.hasSettings" class="ne-check with-settings">
            <input type="checkbox" v-model="withSettings" />
            <span><strong>Also take the pattern library, metadata edits and preferences</strong> from this file</span>
        </label>
    </template>
    <template #footer>
        <button class="ne-btn" @click="emit('cancel')">Cancel</button>
        <button class="ne-btn ne-btn--primary" @click="emit('confirm', { choices, importSettings: withSettings })">Import</button>
    </template>
</ModalDialog>
</template>

<style scoped>
p { margin: 0 0 var(--space-3); font-size: 0.92rem; }
h4 { margin: 0; font-size: 0.95rem; }
.block { margin-top: var(--space-4); padding: var(--space-3) var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg); }
.block-head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-3); }
.bulk { display: flex; align-items: center; gap: var(--space-2); font-size: 0.85rem; }
.chips { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }
.cards { display: flex; flex-direction: column; gap: var(--space-2); }
.card-item { padding: var(--space-3); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.cmp { display: flex; gap: var(--space-4); flex-wrap: wrap; margin: var(--space-1) 0 var(--space-2); font-size: 0.82rem; color: var(--color-text-muted); }
.choice { display: flex; gap: var(--space-4); flex-wrap: wrap; }
.off { opacity: 0.45; cursor: not-allowed; }
.with-settings { margin-top: var(--space-4); align-items: flex-start; }
.with-settings input { margin-top: 0.3em; }
</style>

<script setup>
import { ref } from 'vue';
import { useSettingsStore } from '../../stores/settings';
import { useToast } from '../../composables/useToast';

/**
 * Your own default ID for a pattern (for example *dd → “Type A”). When
 * "fill in automatically" is on, the neume table and the annotation editor
 * offer it whenever the pattern is added.
 */
const settings = useSettingsStore();
const toast = useToast();

const pattern = ref('');
const id = ref('');

function add() {
    const p = pattern.value.trim();
    const value = id.value.trim();
    if (!p || !value) return;
    settings.setGlobalId(p, value);
    pattern.value = '';
    id.value = '';
}

function remove(code, value) {
    settings.removeGlobalId(code);
    toast.show(`Preferred ID for ${code} removed.`, { action: { label: 'Undo', run: () => settings.setGlobalId(code, value) } });
}
</script>

<template>
<div class="pids">
    <label class="ne-check auto">
        <input type="checkbox" v-model="settings.autoFillIds" />
        Fill in these IDs automatically when a pattern is added
    </label>

    <div class="add">
        <input v-model="pattern" class="ne-input ne-code" placeholder="Pattern, e.g. *dd" aria-label="Pattern" @keyup.enter="add" />
        <input v-model="id" class="ne-input" placeholder="ID, e.g. Type A" aria-label="Preferred ID" @keyup.enter="add" />
        <button class="ne-btn" :disabled="!pattern.trim() || !id.trim()" @click="add">Add</button>
    </div>

    <table v-if="Object.keys(settings.globalDisplayIds).length" class="ne-table">
        <thead><tr><th>Pattern</th><th>Preferred ID</th><th></th></tr></thead>
        <tbody>
            <tr v-for="(value, code) in settings.globalDisplayIds" :key="code">
                <td class="ne-code"><strong>{{ code }}</strong></td>
                <td>{{ value }}</td>
                <td class="actions"><button class="ne-btn ne-btn--sm ne-btn--danger" @click="remove(code, value)">Remove</button></td>
            </tr>
        </tbody>
    </table>
    <div v-else class="ne-empty">No preferred IDs yet.</div>
</div>
</template>

<style scoped>
.pids { max-width: 40rem; }
.auto { margin-bottom: var(--space-3); }
.add { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-bottom: var(--space-4); }
.add .ne-input { flex: 1 1 10rem; }
</style>

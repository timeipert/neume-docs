<script setup>
import { ref, computed } from 'vue';
import { useSettingsStore } from '../../stores/settings';
import { useToast } from '../../composables/useToast';

/**
 * The variant buttons offered while annotating a snippet: for shapes with the
 * SAME code but a different graphical execution. Only configured rows are
 * editable. While nothing is configured the store serves the built-in a–g, which
 * must not look like saved state, or removing a row would seem to do nothing.
 */
const settings = useSettingsStore();
const toast = useToast();

const rows = computed(() =>
    settings.hasSnippetVariantConfig() ? settings.getSnippetVariants().filter(v => v.key) : []
);
const usesDefaults = computed(() => !settings.hasSnippetVariantConfig());

const newKey = ref('');
const newLabel = ref('');
const error = ref('');

const copyRows = () => rows.value.map(v => ({ ...v }));
const commit = (list) => settings.setSnippetVariants(list);

/** Copy the built-in a–g into the configuration, as a starting point to edit. */
function adoptDefaults() {
    commit(settings.getSnippetVariants().filter(v => v.key).map(v => ({ key: v.key, label: v.label })));
}

function update(i, label) {
    const list = copyRows();
    list[i].label = label;
    commit(list);
}

function remove(i) {
    const before = copyRows();
    const list = copyRows();
    const [gone] = list.splice(i, 1);
    commit(list);
    toast.show(`Variant “${gone.key}” removed.`, { action: { label: 'Undo', run: () => commit(before) } });
}

function add() {
    const key = newKey.value.trim();
    error.value = '';
    if (!key) return;
    if (rows.value.some(v => v.key === key)) {
        error.value = `Variant “${key}” is already there.`;
        return;
    }
    commit([...copyRows(), { key, label: newLabel.value.trim() || key }]);
    newKey.value = '';
    newLabel.value = '';
}

function offerDefaultsAgain() {
    const before = copyRows();
    commit([]);
    toast.show('The built-in a–g are offered again.', { action: { label: 'Undo', run: () => commit(before) } });
}
</script>

<template>
<div class="sv">
    <p class="ne-muted intro">
        The buttons offered while annotating, for shapes with the <em>same</em> code but a different graphical execution.
        The keys are stored on the annotations, so existing annotations keep their letter even if it is no longer listed here.
    </p>
    <table class="ne-table">
        <thead><tr><th class="key">Key</th><th>Label</th><th></th></tr></thead>
        <tbody>
            <tr class="muted-row"><td class="ne-code">—</td><td>Base (always offered)</td><td></td></tr>
            <tr v-if="usesDefaults" class="muted-row">
                <td class="ne-code">a–g</td>
                <td>The built-in letters (not configured)</td>
                <td class="actions"><button class="ne-btn ne-btn--sm" @click="adoptDefaults">Edit them</button></td>
            </tr>
            <tr v-for="(v, i) in rows" :key="v.key">
                <td class="ne-code">{{ v.key }}</td>
                <td><input class="ne-input" :value="v.label" :aria-label="`Label of variant ${v.key}`" @input="update(i, $event.target.value)" /></td>
                <td class="actions"><button class="ne-btn ne-btn--sm ne-btn--danger" @click="remove(i)">Remove</button></td>
            </tr>
            <tr class="new-row">
                <td><input v-model="newKey" class="ne-input ne-code" placeholder="b" aria-label="Key of the new variant" @keyup.enter="add" /></td>
                <td><input v-model="newLabel" class="ne-input" placeholder="Label" aria-label="Label of the new variant" @keyup.enter="add" /></td>
                <td class="actions"><button class="ne-btn ne-btn--sm" :disabled="!newKey.trim()" @click="add">Add</button></td>
            </tr>
        </tbody>
    </table>
    <p v-if="error" class="ne-note ne-note--error" role="alert">{{ error }}</p>
    <p v-if="!usesDefaults" class="again"><button class="ne-btn ne-btn--sm ne-btn--ghost" @click="offerDefaultsAgain">Offer the built-in a–g again</button></p>
</div>
</template>

<style scoped>
.intro { margin: 0 0 var(--space-3); font-size: 0.88rem; max-width: 70ch; }
.sv { max-width: 40rem; }
.key { width: 7rem; }
.muted-row td { color: var(--color-text-muted); }
.new-row td { background: var(--color-surface-muted); }
.new-row .ne-input { width: 100%; }
.ne-note { margin: var(--space-2) 0 0; }
.again { margin: var(--space-3) 0 0; }
</style>

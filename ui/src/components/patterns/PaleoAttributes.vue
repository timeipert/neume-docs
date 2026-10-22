<script setup>
import { ref } from 'vue';
import { useSettingsStore } from '../../stores/settings';
import { useToast } from '../../composables/useToast';

/**
 * The paleographic attributes: what a snippet can say about the way a sign is written, beyond its code.
 * They are set when a snippet is made and written in braces after the code (`*Vdu{r}`), so what a key
 * means is defined here, once, and spelled the same way everywhere. The order is the order they are offered
 * in, and the order the places of a table follow.
 */
const settings = useSettingsStore();
const toast = useToast();

const newKey = ref('');
const newLabel = ref('');
const newDescription = ref('');
const error = ref('');

function add() {
    error.value = settings.addPaleoAttribute(newKey.value, newLabel.value, newDescription.value);
    if (error.value) return;
    newKey.value = '';
    newLabel.value = '';
    newDescription.value = '';
}

function remove(a) {
    const before = settings.paleoAttributes.map(x => ({ ...x }));
    settings.removePaleoAttribute(a.key);
    toast.show(`Attribute “${a.key}” removed. Snippets that have it keep it.`, { action: { label: 'Undo', run: () => { settings.paleoAttributes = before; } } });
}
</script>

<template>
<div class="pa">
    <p class="ne-muted intro">
        What a snippet says about how a sign is written — set when the snippet is made. An attribute is on one note of the pattern and is written
        in braces right after it, the way the sign of a code variant is: <code>*V{r}du</code> is <code>r</code> on the first note,
        <code>*Vdu{r}</code> on the last, <code>*V{r,l}du{rl}</code> has three. A key is lower-case letters and digits and can be longer than one letter.
        Define them here first, so the same thing is always spelled the same way.
        The columns of a table tell codes apart by their notes and the virga (<code>[ * V u d e ]</code>); everything finer is an attribute, and
        puts the snippets in rows under the code. Snippets with the same attribute on the same note stand at the same height in every manuscript.
    </p>
    <table class="ne-table">
        <thead><tr><th class="key">Key</th><th>Label</th><th>What it means</th><th></th></tr></thead>
        <tbody>
            <tr v-if="!settings.paleoAttributes.length" class="muted-row"><td colspan="4">None defined yet.</td></tr>
            <tr v-for="(a, i) in settings.paleoAttributes" :key="a.key">
                <td class="ne-code">{{ a.key }}</td>
                <td><input class="ne-input" :value="a.label" :aria-label="`Label of ${a.key}`" @change="settings.updatePaleoAttribute(a.key, { label: $event.target.value })" /></td>
                <td><input class="ne-input" :value="a.description" :aria-label="`Meaning of ${a.key}`" placeholder="e.g. the foot of the virga is turned to the right" @change="settings.updatePaleoAttribute(a.key, { description: $event.target.value })" /></td>
                <td class="actions">
                    <button class="ne-btn ne-btn--sm ne-btn--ghost" :disabled="i === 0" :aria-label="`Move ${a.key} up`" @click="settings.movePaleoAttribute(a.key, -1)">↑</button>
                    <button class="ne-btn ne-btn--sm ne-btn--ghost" :disabled="i === settings.paleoAttributes.length - 1" :aria-label="`Move ${a.key} down`" @click="settings.movePaleoAttribute(a.key, 1)">↓</button>
                    <button class="ne-btn ne-btn--sm ne-btn--danger" @click="remove(a)">Remove</button>
                </td>
            </tr>
            <tr class="new-row">
                <td><input v-model="newKey" class="ne-input ne-code" placeholder="r" aria-label="Key of the new attribute" autocomplete="off" @keyup.enter="add" /></td>
                <td><input v-model="newLabel" class="ne-input" placeholder="Label" aria-label="Label of the new attribute" @keyup.enter="add" /></td>
                <td><input v-model="newDescription" class="ne-input" placeholder="What it means" aria-label="Meaning of the new attribute" @keyup.enter="add" /></td>
                <td class="actions"><button class="ne-btn ne-btn--sm" :disabled="!newKey.trim()" @click="add">Add</button></td>
            </tr>
        </tbody>
    </table>
    <p v-if="error" class="ne-note ne-note--error" role="alert">{{ error }}</p>
</div>
</template>

<style scoped>
.intro { margin: 0 0 var(--space-3); font-size: 0.88rem; max-width: 74ch; }
.pa { max-width: 52rem; }
.key { width: 7rem; }
.muted-row td { color: var(--color-text-muted); }
.new-row td { background: var(--color-surface-muted); }
.new-row .ne-input, .pa td .ne-input { width: 100%; }
.actions { white-space: nowrap; text-align: right; }
.ne-note { margin: var(--space-2) 0 0; }
</style>

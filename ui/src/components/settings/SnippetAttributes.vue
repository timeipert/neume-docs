<script setup>
import { computed, ref } from 'vue';
import { useSettingsStore } from '../../stores/settings';
import { useToast } from '../../composables/useToast';
import { ATTRIBUTE_TYPES, attributeKey, defaultSnippetAttributes } from '../../utils/snippetAttributes';

/**
 * What a snippet says about itself. A line snippet has a folio and a line; a sign
 * snippet has a syllable. Both lists can be extended, and every attribute can be
 * required and checked — by default a folio is a number and r or v, a line is a
 * number. A sign that stands alone carries the attributes of a line as well.
 */
const settings = useSettingsStore();
const toast = useToast();

const LEVELS = [
    { key: 'line', title: 'Line snippets', note: 'A picture of a text line. Its folio and line say where it is, and the signs cut from it belong to it.' },
    { key: 'sign', title: 'Sign snippets', note: 'One neume. On a line it takes its place from the line; a sign that stands alone also carries the folio and line above, but does not have to.' }
];

const lists = computed(() => ({ line: settings.getSnippetAttributes('line'), sign: settings.getSnippetAttributes('sign') }));
const changed = computed(() => JSON.stringify(lists.value) !== JSON.stringify(defaultSnippetAttributes()));

const copy = (level) => lists.value[level].map(d => ({ ...d, options: [...(d.options || [])] }));
const commit = (level, list) => settings.setSnippetAttributes(level, list);

function patch(level, index, change) {
    const list = copy(level);
    list[index] = { ...list[index], ...change };
    commit(level, list);
}

function setType(level, index, type) {
    // Text is not checked unless asked; the others are checked unless that is turned off.
    patch(level, index, { type, validate: type !== 'text' });
}

function setOptions(level, index, value) {
    patch(level, index, { options: value.split(',').map(o => o.trim()).filter(Boolean) });
}

// A new attribute
const drafts = ref({ line: '', sign: '' });

function add(level) {
    const label = drafts.value[level].trim();
    if (!label) return;
    const list = copy(level);
    list.push({ key: attributeKey(label, list.map(d => d.key)), label, type: 'text', required: false, validate: false, hint: '', pattern: '', options: [] });
    commit(level, list);
    drafts.value[level] = '';
}

function remove(level, index) {
    const before = copy(level);
    const list = copy(level);
    const [gone] = list.splice(index, 1);
    commit(level, list);
    toast.show(`Attribute “${gone.label}” removed. What was entered under it stays with the snippets.`, {
        action: { label: 'Undo', run: () => commit(level, before) }
    });
}

function reset() {
    const before = { line: copy('line'), sign: copy('sign') };
    settings.resetSnippetAttributes();
    toast.show('Snippet attributes are back to the defaults.', {
        action: { label: 'Undo', run: () => { commit('line', before.line); commit('sign', before.sign); } }
    });
}
</script>

<template>
<div class="attrs">
    <section v-for="level in LEVELS" :key="level.key" class="level">
        <h3>{{ level.title }}</h3>
        <p class="note">{{ level.note }}</p>

        <div class="scroll"><table class="ne-table">
            <thead>
                <tr><th>Attribute</th><th>Kind</th><th>Required</th><th>Check</th><th>Details</th><th></th></tr>
            </thead>
            <tbody>
                <tr v-for="(d, i) in lists[level.key]" :key="d.key">
                    <td>
                        <input class="ne-input" :value="d.label" :aria-label="`Name of ${d.key}`" @change="patch(level.key, i, { label: $event.target.value.trim() || d.label })" />
                        <code class="key">{{ d.key }}</code>
                    </td>
                    <td>
                        <select class="ne-input" :value="d.type" :disabled="d.builtin" :aria-label="`Kind of ${d.label}`" @change="setType(level.key, i, $event.target.value)">
                            <option v-for="t in ATTRIBUTE_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
                        </select>
                    </td>
                    <td><label class="ne-check"><input type="checkbox" :checked="d.required" :aria-label="`${d.label} is required`" @change="patch(level.key, i, { required: $event.target.checked })" /></label></td>
                    <td><label class="ne-check" title="Refuse values that do not fit"><input type="checkbox" :checked="d.validate" :aria-label="`Check ${d.label}`" @change="patch(level.key, i, { validate: $event.target.checked })" /></label></td>
                    <td class="details">
                        <input v-if="d.type === 'choice'" class="ne-input" :value="d.options.join(', ')" placeholder="red, brown, black" aria-label="The choices, separated by commas" @change="setOptions(level.key, i, $event.target.value)" />
                        <input v-else-if="d.type === 'text'" class="ne-input" :value="d.pattern" placeholder="Pattern, e.g. ^[A-C]$ (optional)" aria-label="A pattern the value must match" @change="patch(level.key, i, { pattern: $event.target.value.trim() })" />
                        <span v-else class="ne-muted">{{ d.hint }}</span>
                    </td>
                    <td class="actions">
                        <button v-if="!d.builtin" class="ne-btn ne-btn--danger ne-btn--sm" :aria-label="`Remove ${d.label}`" @click="remove(level.key, i)">Remove</button>
                        <span v-else class="ne-muted" title="Every line has a folio and a line">built in</span>
                    </td>
                </tr>
            </tbody>
        </table></div>

        <form class="add" @submit.prevent="add(level.key)">
            <input v-model="drafts[level.key]" class="ne-input" :placeholder="level.key === 'line' ? 'New attribute of a line, e.g. Hand' : 'New attribute of a sign, e.g. Ink'" :aria-label="`New attribute of ${level.title.toLowerCase()}`" />
            <button type="submit" class="ne-btn" :disabled="!drafts[level.key].trim()">Add attribute</button>
        </form>
    </section>

    <p class="reset"><button class="ne-btn ne-btn--ghost ne-btn--sm" :disabled="!changed" @click="reset">Back to the defaults</button></p>
</div>
</template>

<style scoped>
.attrs { display: flex; flex-direction: column; gap: var(--space-5); }
h3 { margin: 0 0 var(--space-1); font-size: 1rem; }
.note { margin: 0 0 var(--space-3); color: var(--color-text-muted); font-size: 0.88rem; max-width: 70ch; }
.scroll { overflow-x: auto; }
.ne-table td { vertical-align: top; }
.ne-table .ne-input { width: 100%; }
.key { display: block; margin-top: 2px; font-size: 0.72rem; color: var(--color-text-light); }
.details { min-width: 14rem; }
.actions { text-align: right; white-space: nowrap; }
.add { display: flex; gap: var(--space-2); margin-top: var(--space-3); max-width: 34rem; }
.add .ne-input { flex: 1; }
.reset { margin: 0; }
</style>

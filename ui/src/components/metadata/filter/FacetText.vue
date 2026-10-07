<script setup>
import { computed, ref, watch } from 'vue';
import { ruleProblem } from '../../../utils/manuscriptFilter';

/** Text: contains, is, starts with, matches a pattern, or whether the cell is empty at all. */
const props = defineProps({
    rule: { type: Object, default: null }
});
const emit = defineEmits(['change']);

const OPS = [
    { value: 'contains', label: 'contains' },
    { value: 'equals', label: 'is exactly' },
    { value: 'starts', label: 'starts with' },
    { value: 'regex', label: 'matches the pattern' },
    { value: 'empty', label: 'is empty' },
    { value: 'filled', label: 'has a value' }
];

const op = ref(props.rule ? props.rule.op : 'contains');
const text = ref(props.rule ? props.rule.text : '');
const needsText = computed(() => op.value !== 'empty' && op.value !== 'filled');
watch(() => props.rule, (r) => { if (r) { op.value = r.op; if (r.text !== text.value.trim()) text.value = r.text; } else if (needsText.value) text.value = ''; });
const problem = computed(() => ruleProblem({ kind: 'text', op: op.value, text: text.value }));

function send() {
    const rule = { kind: 'text', op: op.value, text: needsText.value ? text.value : '', not: !!(props.rule && props.rule.not) };
    emit('change', !needsText.value || text.value.trim() ? rule : null);
}
</script>

<template>
<div class="text">
    <select v-model="op" class="ne-input" aria-label="How to compare" @change="send">
        <option v-for="o in OPS" :key="o.value" :value="o.value">{{ o.label }}</option>
    </select>
    <input v-if="needsText" v-model="text" class="ne-input" :class="{ bad: problem }" spellcheck="false" :placeholder="op === 'regex' ? 'e.g. ^(Köln|Trier)' : 'Text'" aria-label="Text to compare with" @input="send" />
    <p v-if="problem" class="problem">{{ problem }}</p>
    <label v-if="rule" class="ne-check">
        <input type="checkbox" :checked="rule.not" @change="emit('change', { ...rule, not: $event.target.checked })" />
        Everything that does not
    </label>
</div>
</template>

<style scoped>
.text { display: flex; flex-direction: column; gap: var(--space-2); }
.text .ne-input { font-size: 0.84rem; padding: 0.3em 0.6em; }
.bad { border-color: var(--color-danger) !important; }
.problem { margin: 0; font-size: 0.8rem; font-weight: 600; color: var(--color-danger); }
.ne-check { font-size: 0.82rem; }
</style>

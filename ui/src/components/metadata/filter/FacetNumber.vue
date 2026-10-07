<script setup>
import { computed } from 'vue';
import { numberInfo } from '../../../utils/manuscriptFilter';

/** A number range: at least, at most, or both. */
const props = defineProps({
    rule: { type: Object, default: null },
    rows: { type: Array, required: true },
    textOf: { type: Function, required: true }
});
const emit = defineEmits(['change']);

const info = computed(() => numberInfo(props.rows, props.textOf));

function typed(which, event) {
    const raw = event.target.value.trim().replace(',', '.');
    const n = raw === '' ? null : parseFloat(raw);
    if (raw !== '' && !Number.isFinite(n)) return;
    const min = which === 'min' ? n : (props.rule ? props.rule.min : null);
    const max = which === 'max' ? n : (props.rule ? props.rule.max : null);
    emit('change', min === null && max === null ? null : { kind: 'number', min, max, not: !!(props.rule && props.rule.not) });
}
</script>

<template>
<div class="number">
    <p v-if="!info.count" class="none">No value in this column is a number.</p>
    <template v-else>
        <div class="typed">
            <label>at least <input class="ne-input" inputmode="decimal" :value="rule && rule.min !== null ? rule.min : ''" :placeholder="String(info.min)" @change="typed('min', $event)" /></label>
            <label>at most <input class="ne-input" inputmode="decimal" :value="rule && rule.max !== null ? rule.max : ''" :placeholder="String(info.max)" @change="typed('max', $event)" /></label>
        </div>
        <p class="hint">{{ info.count }} of {{ rows.length }} have a number, from {{ info.min }} to {{ info.max }}.</p>
        <label v-if="rule" class="ne-check">
            <input type="checkbox" :checked="rule.not" @change="emit('change', { ...rule, not: $event.target.checked })" />
            Everything outside this range
        </label>
    </template>
</div>
</template>

<style scoped>
.number { display: flex; flex-direction: column; gap: var(--space-2); }
.none, .hint { margin: 0; font-size: 0.82rem; color: var(--color-text-muted); }
.typed { display: flex; gap: var(--space-3); }
.typed label { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--color-text-muted); flex: 1; }
.typed .ne-input { width: 100%; min-width: 0; padding: 0.25em 0.5em; font-size: 0.84rem; }
.ne-check { font-size: 0.82rem; }
</style>

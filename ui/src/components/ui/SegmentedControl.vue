<script setup>
/**
 * A row of mutually exclusive options, e.g. Standard Table / Expanded Documentation.
 * Arrow keys move between options, as a radio group does.
 */
const props = defineProps({
    modelValue: { type: String, required: true },
    /** [{ value, label, title? }] */
    options: { type: Array, required: true },
    label: { type: String, default: '' },
    size: { type: String, default: 'md' } // 'sm' | 'md'
});
const emit = defineEmits(['update:modelValue']);

function move(delta, event) {
    const i = props.options.findIndex(o => o.value === props.modelValue);
    const next = props.options[(i + delta + props.options.length) % props.options.length];
    emit('update:modelValue', next.value);
    // Keep focus on the newly selected option.
    const buttons = event.currentTarget.parentElement.querySelectorAll('button');
    const idx = props.options.indexOf(next);
    buttons[idx] && buttons[idx].focus();
}
</script>

<template>
<div class="seg" :class="`seg--${size}`" role="radiogroup" :aria-label="label || undefined">
    <button
        v-for="o in options"
        :key="o.value"
        type="button"
        role="radio"
        class="seg-btn"
        :class="{ on: o.value === modelValue }"
        :aria-checked="o.value === modelValue"
        :tabindex="o.value === modelValue ? 0 : -1"
        :title="o.title || undefined"
        @click="emit('update:modelValue', o.value)"
        @keydown.right.prevent="move(1, $event)"
        @keydown.left.prevent="move(-1, $event)"
    >{{ o.label }}</button>
</div>
</template>

<style scoped>
.seg { display: inline-flex; padding: 3px; gap: 2px; background: var(--color-surface-muted); border: 1px solid var(--color-border); border-radius: var(--radius-lg); }
.seg-btn { border: none; background: transparent; color: var(--color-text-muted); font-weight: 600; padding: 0.45em 1em; border-radius: calc(var(--radius-lg) - 2px); font-size: 0.9rem; transition: background-color 0.15s, color 0.15s, box-shadow 0.15s; }
.seg-btn:hover { background: rgba(255, 255, 255, 0.7); color: var(--color-text); }
.seg-btn.on { background: var(--color-surface); color: var(--color-primary-dark); box-shadow: var(--shadow-sm), 0 0 0 1px var(--color-border); }
.seg--sm .seg-btn { padding: 0.3em 0.75em; font-size: 0.82rem; }
</style>

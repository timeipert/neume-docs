<script setup>
/**
 * One question with a few big answers, each explained: a radio group drawn as
 * cards. Arrow keys move between the answers, as in any radio group.
 */
const props = defineProps({
    modelValue: { type: String, default: '' },
    /** [{ value, label, text, note?, disabled? }] */
    options: { type: Array, required: true },
    label: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue']);

function move(delta, event) {
    const enabled = props.options.filter(o => !o.disabled);
    if (!enabled.length) return;
    const i = enabled.findIndex(o => o.value === props.modelValue);
    const next = enabled[(i + delta + enabled.length) % enabled.length];
    emit('update:modelValue', next.value);
    const buttons = event.currentTarget.parentElement.querySelectorAll('button');
    const button = buttons[props.options.indexOf(next)];
    if (button) button.focus();
}
</script>

<template>
<div class="cc" role="radiogroup" :aria-label="label || undefined">
    <button
        v-for="o in options"
        :key="o.value"
        type="button"
        role="radio"
        class="cc-card"
        :class="{ on: o.value === modelValue }"
        :aria-checked="o.value === modelValue"
        :disabled="o.disabled"
        :tabindex="o.value === modelValue || (!modelValue && o === options.find(x => !x.disabled)) ? 0 : -1"
        @click="emit('update:modelValue', o.value)"
        @keydown.right.prevent="move(1, $event)"
        @keydown.down.prevent="move(1, $event)"
        @keydown.left.prevent="move(-1, $event)"
        @keydown.up.prevent="move(-1, $event)"
    >
        <span class="cc-radio" aria-hidden="true"></span>
        <span class="cc-body">
            <strong class="cc-label">{{ o.label }}</strong>
            <span class="cc-text">{{ o.text }}</span>
            <span v-if="o.note" class="cc-note">{{ o.note }}</span>
        </span>
    </button>
</div>
</template>

<style scoped>
.cc { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--space-3); }
.cc-card {
    display: flex; align-items: flex-start; gap: var(--space-3); text-align: left;
    padding: var(--space-4); background: var(--color-surface); color: var(--color-text);
    border: 1px solid var(--color-border-hover); border-radius: var(--radius-lg);
    transition: border-color 0.15s, box-shadow 0.15s, background-color 0.15s;
}
.cc-card:hover:not(:disabled) { border-color: var(--color-primary-muted); background: var(--color-surface); box-shadow: var(--shadow-sm); }
.cc-card.on { border-color: var(--color-primary); background: var(--color-primary-light); box-shadow: 0 0 0 1px var(--color-primary); }
.cc-card:focus-visible { box-shadow: var(--ring); }
.cc-card:disabled { opacity: 0.6; cursor: not-allowed; }
.cc-radio { flex: 0 0 auto; width: 18px; height: 18px; margin-top: 2px; border: 2px solid var(--color-border-hover); border-radius: 50%; background: var(--color-surface); position: relative; }
.cc-card.on .cc-radio { border-color: var(--color-primary); }
.cc-card.on .cc-radio::after { content: ""; position: absolute; inset: 3px; border-radius: 50%; background: var(--color-primary); }
.cc-body { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
.cc-label { font-size: 1.02rem; }
.cc-text { color: var(--color-text-muted); font-size: 0.9rem; font-weight: 400; line-height: 1.45; }
.cc-card.on .cc-text { color: var(--color-primary-dark); }
.cc-note { font-size: 0.8rem; font-weight: 600; color: var(--color-warning-dark); }
</style>

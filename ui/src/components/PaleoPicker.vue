<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useSettingsStore } from '../stores/settings';
import { normalizePaleo, paleoSuffix } from '../utils/paleo';

/**
 * The paleographic attributes of a snippet, as buttons to switch on and off: the ones defined in the
 * pattern library, and — dashed — any a snippet has that are no longer defined, so they are not lost
 * by accident. Shows the result the way it is written after the code: `{r,l}`.
 */
const props = defineProps({
    modelValue: { type: Array, default: () => [] },
    /** a label above the buttons; false for none */
    label: { type: [String, Boolean], default: 'Paleographic attributes' },
    /** the code the attributes are written after, to show the result (`*Vdu` gives `*Vdu{r}`) */
    code: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue']);

const settings = useSettingsStore();
const order = computed(() => settings.paleoKeys());
const chosen = computed(() => normalizePaleo(props.modelValue, order.value));
const choices = computed(() => [
    ...settings.paleoAttributes.map(a => ({ key: a.key, label: a.label, title: a.description || a.key })),
    ...chosen.value.filter(k => !order.value.includes(k)).map(k => ({ key: k, label: k, title: 'No longer defined', legacy: true }))
]);

function toggle(key) {
    const next = chosen.value.includes(key) ? chosen.value.filter(k => k !== key) : [...chosen.value, key];
    emit('update:modelValue', normalizePaleo(next, order.value));
}
</script>

<template>
<div class="pp">
    <span v-if="label" class="lab">{{ label }}</span>
    <div v-if="choices.length" class="chips" role="group" :aria-label="typeof label === 'string' ? label : 'Paleographic attributes'">
        <button
            v-for="c in choices"
            :key="c.key"
            type="button"
            class="chip"
            :class="{ on: chosen.includes(c.key), legacy: c.legacy }"
            :aria-pressed="chosen.includes(c.key)"
            :title="c.title"
            @click="toggle(c.key)"
        ><code>{{ c.key }}</code><span v-if="c.label !== c.key"> {{ c.label }}</span></button>
        <code v-if="chosen.length" class="result">{{ code ? code : '' }}{{ paleoSuffix(chosen) }}</code>
    </div>
    <p v-else class="none">None defined yet. <RouterLink :to="{ path: '/patterns', query: { setup: 'paleo' } }">Define them in Patterns</RouterLink>.</p>
</div>
</template>

<style scoped>
.pp { display: flex; flex-direction: column; gap: 4px; }
.lab { font-size: 0.76rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); }
.chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.chip { display: inline-flex; align-items: baseline; gap: 2px; padding: 1px 9px; font-size: 0.82rem; line-height: 1.6; border-radius: 999px; background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border-hover); cursor: pointer; }
.chip code { background: transparent; padding: 0; font-weight: 700; }
.chip:hover { border-color: var(--color-primary); }
.chip.on { background: var(--color-primary); border-color: var(--color-primary-hover); color: #fff; }
.chip.legacy { border-style: dashed; }
.result { margin-left: 4px; font-size: 0.82rem; color: var(--color-text-muted); background: transparent; }
.none { margin: 0; font-size: 0.82rem; color: var(--color-text-muted); }
</style>

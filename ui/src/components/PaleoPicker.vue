<script setup>
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useSettingsStore } from '../stores/settings';
import { codeNotes, normalizePaleo, splitPaleo, withPaleo } from '../utils/paleo';

/**
 * The attributes of a snippet. They are for the ones who need them, so they stay out of the way: a button, "Add attributes",
 * opens them. An attribute is on one note, so each note of the pattern has its row of buttons; the result is shown the way it is
 * written, with the braces after the notes they are on — `[*V{e}d]` is `[*Vd]` with an `e` on the virga. What an attribute
 * means is up to the person who defines it (a mark on the sign, a time, …). The ones defined in the pattern library are offered, and
 * — dashed — any a snippet has that are no longer defined, so they are not lost by accident.
 */
const props = defineProps({
    /** `{ key, note }` (a plain key is on the last note) */
    modelValue: { type: Array, default: () => [] },
    /** a label above (none by default: the button says what it is) */
    label: { type: [String, Boolean], default: false },
    /** the pattern the attributes are on */
    code: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue']);

const settings = useSettingsStore();
const base = computed(() => splitPaleo(props.code).base);
const order = computed(() => settings.paleoKeys());
const notes = computed(() => codeNotes(base.value));
const entries = computed(() => normalizePaleo(props.modelValue, order.value, base.value));
const choices = computed(() => [
    ...settings.paleoAttributes.map(a => ({ key: a.key, label: a.label, title: a.description || a.key })),
    ...[...new Set(entries.value.map(e => e.key))].filter(k => !order.value.includes(k)).map(k => ({ key: k, label: k, title: 'No longer defined', legacy: true }))
]);
const written = computed(() => (entries.value.length ? withPaleo(base.value, entries.value) : ''));
const open = ref(false);

const isOn = (key, note) => entries.value.some(e => e.key === key && e.note === note);

function toggle(key, note) {
    const next = isOn(key, note) ? entries.value.filter(e => !(e.key === key && e.note === note)) : [...entries.value, { key, note }];
    emit('update:modelValue', normalizePaleo(next, order.value, base.value));
}
</script>

<template>
<div class="pp">
    <span v-if="label" class="lab">{{ label }}</span>
    <div class="head">
        <button type="button" class="opener" :aria-expanded="open" @click="open = !open">
            <span class="caret" aria-hidden="true">{{ open ? '▾' : '▸' }}</span>{{ entries.length ? 'Edit attributes' : 'Add attributes' }}
        </button>
        <code v-if="written" class="result">{{ written }}</code>
    </div>
    <template v-if="open">
        <div v-if="choices.length && notes.length" class="rows">
            <div v-for="(n, i) in notes" :key="i" class="row">
                <code v-if="notes.length > 1" class="note" :title="`Note ${i + 1}`">{{ n.text }}</code>
                <div class="chips" role="group" :aria-label="`Attributes of note ${i + 1}, ${n.text}`">
                    <button
                        v-for="c in choices"
                        :key="c.key"
                        type="button"
                        class="chip"
                        :class="{ on: isOn(c.key, i), legacy: c.legacy }"
                        :aria-pressed="isOn(c.key, i)"
                        :title="c.title"
                        @click="toggle(c.key, i)"
                    ><code>{{ c.key }}</code><span v-if="c.label !== c.key"> {{ c.label }}</span></button>
                </div>
            </div>
        </div>
        <p v-else-if="!choices.length" class="none">No attributes defined yet. <RouterLink :to="{ path: '/patterns', query: { setup: 'paleo' } }">Define them in Patterns</RouterLink>.</p>
        <p v-else class="none">This code has no notes to put an attribute on.</p>
    </template>
</div>
</template>

<style scoped>
.pp { display: flex; flex-direction: column; gap: 4px; }
.lab { font-size: 0.76rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); }
.head { display: flex; align-items: center; gap: 8px; }
.opener { display: inline-flex; align-items: center; gap: 4px; padding: 0; font-size: 0.82rem; font-weight: 600; color: var(--color-primary-dark); background: transparent; border: none; cursor: pointer; }
.opener:hover { text-decoration: underline; }
.caret { display: inline-block; width: 0.9em; }
.result { font-size: 0.82rem; font-weight: 600; color: var(--color-text); background: transparent; }
.rows { display: flex; flex-direction: column; gap: 3px; }
.row { display: flex; align-items: center; gap: 8px; }
.note { flex: 0 0 3.2em; font-size: 0.82rem; font-weight: 700; color: var(--color-text-muted); background: transparent; padding: 0; text-align: right; }
.chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.chip { display: inline-flex; align-items: baseline; gap: 2px; padding: 1px 9px; font-size: 0.82rem; line-height: 1.6; border-radius: 999px; background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border-hover); cursor: pointer; }
.chip code { background: transparent; padding: 0; font-weight: 700; }
.chip:hover { border-color: var(--color-primary); }
.chip.on { background: var(--color-primary); border-color: var(--color-primary-hover); color: #fff; }
.chip.legacy { border-style: dashed; }
.none { margin: 0; font-size: 0.82rem; color: var(--color-text-muted); }
</style>

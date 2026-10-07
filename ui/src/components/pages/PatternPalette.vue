<script setup>
import { computed, ref, watch } from 'vue';
import PatternDisplay from '../PatternDisplay.vue';
import PatternCode from '../PatternCode.vue';
import { checkCode } from '../../utils/projectTable';

/**
 * The patterns to choose from, as cards big enough to see the neume on: a picture, its code, and
 * how many snippets of it there already are. A search narrows them, a code typed in full can be
 * used even if the library does not have it yet, and the groups (the project's columns, what the
 * transcription has on this page, everything) are one click apart.
 */
const props = defineProps({
    modelValue: { type: String, default: '' },
    /** [{ key, label, codes: string[] }] */
    groups: { type: Array, required: true },
    glyphs: { type: Object, required: true },
    /** code -> how many snippets there are (here: in the line) */
    counts: { type: Object, default: () => ({}) }
});
const emit = defineEmits(['update:modelValue', 'create']);

const LIMIT = 90;

const usable = computed(() => props.groups.filter(g => g.codes.length));
const groupKey = ref('');
const search = ref('');
const showAll = ref(false);

watch(usable, (list) => {
    if (!list.some(g => g.key === groupKey.value)) groupKey.value = list.length ? list[0].key : '';
}, { immediate: true });
watch([groupKey, search], () => { showAll.value = false; });

const group = computed(() => usable.value.find(g => g.key === groupKey.value) || { codes: [] });
const bare = (code) => code.replace(/[[\]{}]/g, '');

/** While searching, every group is searched: the person looks for a code, not for a group. */
const matches = computed(() => {
    const q = search.value.trim();
    if (!q) return group.value.codes;
    const test = (code) => (/[[\]{}]/.test(q) ? code.includes(q) : bare(code).includes(q));
    const seen = new Set();
    const out = [];
    for (const g of [group.value, ...usable.value]) {
        for (const code of g.codes) if (!seen.has(code) && test(code)) { seen.add(code); out.push(code); }
    }
    return out;
});
const shown = computed(() => (showAll.value || search.value.trim() ? matches.value.slice(0, 300) : matches.value.slice(0, LIMIT)));

/** What was typed is a good code that none of the groups has. */
const typed = computed(() => {
    const check = checkCode(search.value);
    return check.ok && !usable.value.some(g => g.codes.includes(check.code)) ? check.code : '';
});

const count = (code) => {
    const c = props.counts instanceof Map ? props.counts.get(code) : props.counts[code];
    return c || 0;
};

function pick(code, created = false) {
    emit('update:modelValue', code);
    if (created) emit('create', code);
}

function onEnter() {
    if (typed.value) { pick(typed.value, true); search.value = ''; return; }
    if (matches.value.length === 1) { pick(matches.value[0]); search.value = ''; }
}
</script>

<template>
<div class="palette">
    <div class="top">
        <input v-model="search" class="ne-input find" type="search" placeholder="Find a pattern, or type a code" aria-label="Find a pattern" autocomplete="off" spellcheck="false" @keydown.enter.prevent="onEnter" />
        <div v-if="usable.length > 1 && !search.trim()" class="groups" role="tablist" aria-label="Which patterns">
            <button v-for="g in usable" :key="g.key" type="button" role="tab" class="chip" :class="{ on: g.key === groupKey }" :aria-selected="g.key === groupKey" @click="groupKey = g.key">
                {{ g.label }} <span class="n">{{ g.codes.length }}</span>
            </button>
        </div>
    </div>

    <div class="cards" role="listbox" aria-label="Patterns">
        <button v-if="typed" type="button" class="card new" @click="pick(typed, true); search = ''">
            <span class="plus" aria-hidden="true">+</span>
            <PatternCode :pattern="typed" />
            <span class="sub">Use this code</span>
        </button>
        <button
            v-for="code in shown"
            :key="code"
            type="button"
            role="option"
            class="card"
            :class="{ on: code === modelValue }"
            :aria-selected="code === modelValue"
            :title="code"
            @click="pick(code)"
        >
            <span class="glyph"><PatternDisplay :pattern="code" :glyphs="glyphs" :scale="1.1" /></span>
            <PatternCode :pattern="code" class="code" />
            <span v-if="count(code)" class="done" :title="`${count(code)} here`">{{ count(code) }}</span>
        </button>
        <p v-if="!shown.length && !typed" class="none">No pattern matches “{{ search }}”.</p>
    </div>

    <button v-if="!search.trim() && matches.length > shown.length" type="button" class="ne-btn ne-btn--sm more" @click="showAll = true">
        Show all {{ matches.length }}
    </button>
</div>
</template>

<style scoped>
.palette { display: flex; flex-direction: column; gap: var(--space-3); min-height: 0; height: 100%; }
.top { display: flex; flex-direction: column; gap: var(--space-2); flex: 0 0 auto; }
.find { width: 100%; }
.groups { display: flex; gap: 4px; flex-wrap: wrap; }
.chip { padding: 2px 10px; font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); background: var(--color-surface-muted); border: 1px solid transparent; border-radius: 999px; }
.chip:hover { color: var(--color-text); background: var(--color-border); }
.chip.on { color: var(--color-primary-dark); background: var(--color-primary-light); border-color: var(--color-primary-muted); }
.chip .n { margin-left: 3px; font-weight: 500; opacity: 0.75; }

.cards { flex: 1; min-height: 0; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: var(--space-2); align-content: start; padding: 2px; }
.card { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 4px; min-height: 96px; padding: var(--space-2) 4px; text-align: center; background: var(--color-surface); border: 1.5px solid var(--color-border); border-radius: var(--radius-md); }
.card:hover { border-color: var(--color-primary-muted); background: var(--color-primary-light); }
.card.on { border-color: var(--color-primary); background: var(--color-primary-light); box-shadow: 0 0 0 2px var(--color-primary); }
.glyph { display: inline-flex; align-items: center; justify-content: center; min-height: 52px; }
.card :deep(.pattern-code) { font-size: 0.82rem; font-weight: 700; overflow-wrap: anywhere; background: transparent; padding: 0; }
.done { position: absolute; top: 4px; right: 4px; min-width: 18px; padding: 0 5px; font-size: 0.68rem; font-weight: 700; line-height: 1.5; color: #fff; background: var(--color-success); border-radius: 999px; }
.card.new { border-style: dashed; justify-content: center; }
.plus { font-size: 1.4rem; line-height: 1; color: var(--color-primary); }
.sub { font-size: 0.7rem; color: var(--color-text-muted); }
.none { grid-column: 1 / -1; margin: var(--space-3) 0; font-size: 0.88rem; color: var(--color-text-muted); }
.more { align-self: center; flex: 0 0 auto; }
</style>

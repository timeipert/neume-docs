<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import PatternDisplay from '../PatternDisplay.vue';
import PatternCode from '../PatternCode.vue';
import { libraryForColumn, selectedSignatures, signatureOf, tierOf } from '../../utils/neumeTable';

/**
 * The pattern library for one column of the standard table.
 *
 * A directional column offers the plain ways its neume can be written — no
 * special signs, which is what keeps everyday use simple. A special column
 * (L, O, Q, ",") offers every pattern that carries that sign, and a manuscript
 * picks at most three constellations from it.
 */
const props = defineProps({
    column: { type: Object, required: true },
    /** the manuscript's table rows */
    rows: { type: Array, default: () => [] },
    allCodes: { type: Array, required: true },
    freq: { type: Object, required: true },
    glyphs: { type: Object, required: true },
    counts: { type: Object, default: () => ({}) },
    max: { type: Number, default: 3 }
});

const emit = defineEmits(['toggle', 'close']);

const PAGE = 24;
const query = ref('');
const shown = ref(PAGE);

watch(query, () => { shown.value = PAGE; });

const groups = computed(() => libraryForColumn(props.allCodes, props.column, props.freq));

const filtered = computed(() => {
    const q = query.value.trim().replace(/[[\]{}()]/g, '');
    return q ? groups.value.filter(g => g.signature.includes(q)) : groups.value;
});

const visible = computed(() => filtered.value.slice(0, shown.value));

const chosenSignatures = computed(() => (
    props.column.slot ? selectedSignatures(props.rows, props.column.group) : []
));

/** Codes in the table at the standard tier: these show as selected. */
const selected = computed(() => new Set(
    props.rows.filter(r => tierOf(r) === 'standard').map(r => r.pattern)
));

/** The row exists but only as an expanded addition: choosing it promotes it. */
const expandedOnly = computed(() => new Set(
    props.rows.filter(r => tierOf(r) !== 'standard').map(r => r.pattern)
));

function blocked(code) {
    if (!props.column.slot) return false;
    const sig = signatureOf(code);
    return !chosenSignatures.value.includes(sig) && chosenSignatures.value.length >= props.max;
}

const title = computed(() => (
    props.column.slot ? `${props.column.label} (${props.column.header})` : props.column.header
));

const fmt = (n) => n.toLocaleString('en-US');

function onKey(e) { if (e.key === 'Escape') emit('close'); }
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
<div class="overlay" @click.self="emit('close')">
    <section class="picker" role="dialog" aria-modal="true" :aria-label="`Pattern library — ${title}`">
        <header>
            <div>
                <h2>Pattern library <span class="col-name">{{ title }}</span></h2>
                <p v-if="column.slot" class="rule">
                    Choose up to {{ max }} constellations. A pattern with several signs belongs to the column of its first sign.
                    <strong class="count" :class="{ full: chosenSignatures.length >= max }">{{ chosenSignatures.length }}/{{ max }} chosen</strong>
                    <span v-if="chosenSignatures.length" class="chosen-list">: {{ chosenSignatures.join('  ') }}</span>
                </p>
                <p v-else class="rule">The ways this neume can be written without special signs.</p>
            </div>
            <button class="close" aria-label="Close" @click="emit('close')">✕</button>
        </header>

        <div v-if="column.slot" class="search">
            <input v-model="query" type="search" placeholder="Narrow down by code, e.g. *ud" aria-label="Narrow down the library by code" />
            <span class="found">{{ filtered.length }} constellation{{ filtered.length === 1 ? '' : 's' }}</span>
        </div>

        <div class="body">
            <p v-if="filtered.length === 0" class="empty">Nothing in the library matches.</p>

            <section v-for="g in visible" :key="g.signature" class="sig-group">
                <div class="sig-head">
                    <div class="sig-glyph"><PatternDisplay :pattern="g.signature" :glyphs="glyphs" /></div>
                    <strong class="sig-code">{{ g.signature }}</strong>
                    <span class="sig-freq">{{ fmt(freq.signature(g.signature)) }}× in the CM</span>
                </div>
                <div class="variants">
                    <button
                        v-for="v in g.variants"
                        :key="v"
                        class="variant"
                        :class="{ on: selected.has(v), promote: expandedOnly.has(v) }"
                        :disabled="blocked(v) && !selected.has(v)"
                        :aria-pressed="selected.has(v)"
                        :title="blocked(v) && !selected.has(v) ? `${max} constellations are already chosen for this column` : ''"
                        @click="emit('toggle', v)"
                    >
                        <span class="v-glyph"><PatternDisplay :pattern="v" :glyphs="glyphs" /></span>
                        <PatternCode :pattern="v" />
                        <span class="v-meta">
                            {{ fmt(freq.code(v)) }}× CM<template v-if="counts[v]"> · {{ fmt(counts[v]) }}× here</template>
                        </span>
                        <span v-if="selected.has(v)" class="tick" aria-hidden="true">✓</span>
                        <span v-else-if="expandedOnly.has(v)" class="tick soft" title="Already in the expanded documentation">+</span>
                    </button>
                </div>
            </section>

            <button v-if="filtered.length > visible.length" class="more" @click="shown += PAGE * 2">
                Show more ({{ filtered.length - visible.length }} further constellations)
            </button>
        </div>

        <footer>
            <button class="done" @click="emit('close')">Done</button>
        </footer>
    </section>
</div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); display: flex; align-items: center; justify-content: center; z-index: 400; padding: var(--space-4); }
.picker { background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); width: min(860px, 100%); max-height: 88vh; display: flex; flex-direction: column; }
header { display: flex; justify-content: space-between; gap: var(--space-4); padding: var(--space-4) var(--space-5) var(--space-2); }
h2 { margin: 0; font-size: 1.15rem; }
.col-name { font-family: ui-monospace, Menlo, monospace; background: var(--color-primary-light); color: var(--color-primary-dark); padding: 0 0.4em; border-radius: var(--radius-sm); margin-left: 0.3em; }
.rule { margin: var(--space-1) 0 0; color: var(--color-text-muted); font-size: 0.88rem; }
.count { color: var(--color-text); }
.count.full { color: var(--color-warning-dark); }
.chosen-list { font-family: ui-monospace, Menlo, monospace; color: var(--color-text); }
.close { align-self: flex-start; border-color: transparent; background: transparent; }

.search { display: flex; align-items: center; gap: var(--space-3); padding: 0 var(--space-5) var(--space-2); }
.search input { flex: 1; padding: 0.45em 0.7em; border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.found { color: var(--color-text-muted); font-size: 0.82rem; white-space: nowrap; }

.body { overflow-y: auto; padding: var(--space-2) var(--space-5) var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
.empty { color: var(--color-text-light); text-align: center; padding: var(--space-5); font-style: italic; }

.sig-group { border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); }
.sig-head { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2); }
.sig-glyph { width: 44px; display: flex; justify-content: center; }
.sig-code { font-family: ui-monospace, Menlo, monospace; font-size: 1.05rem; }
.sig-freq { color: var(--color-text-muted); font-size: 0.8rem; }

.variants { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.variant { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: var(--space-2) var(--space-3); min-width: 112px; background: var(--color-bg); }
.variant.on { background: var(--color-primary-light); border-color: var(--color-primary); }
.variant.promote:not(.on) { border-style: dashed; }
.v-glyph { min-height: 32px; display: flex; align-items: center; }
.v-meta { font-size: 0.7rem; color: var(--color-text-muted); }
.tick { position: absolute; top: 3px; right: 6px; color: var(--color-primary); font-weight: 700; }
.tick.soft { color: var(--color-text-light); }

.more { align-self: center; }
footer { display: flex; justify-content: flex-end; padding: var(--space-3) var(--space-5); border-top: 1px solid var(--color-border); }
.done { background: var(--color-primary); border-color: var(--color-primary); color: #fff; font-weight: 600; }
.done:hover { background: var(--color-primary-hover); }
</style>

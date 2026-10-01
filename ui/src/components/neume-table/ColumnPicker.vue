<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import PatternDisplay from '../PatternDisplay.vue';
import PatternCode from '../PatternCode.vue';
import { libraryForColumn, selectedSignatures, signatureOf, tierOf, columnFor } from '../../utils/neumeTable';

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
const onlyHere = ref(false);
const shown = ref(PAGE);
const searchEl = ref(null);
const panel = ref(null);

watch([query, onlyHere], () => { shown.value = PAGE; });

const groups = computed(() => libraryForColumn(props.allCodes, props.column, props.freq));
const hasLoadedCounts = computed(() => Object.keys(props.counts).length > 0);

const filtered = computed(() => {
    const q = query.value.trim().replace(/[[\]{}()]/g, '');
    let list = q ? groups.value.filter(g => g.signature.includes(q)) : groups.value;
    if (onlyHere.value) {
        list = list
            .map(g => ({ ...g, variants: g.variants.filter(v => props.counts[v]) }))
            .filter(g => g.variants.length > 0);
    }
    return list;
});

const visible = computed(() => filtered.value.slice(0, shown.value));

const chosenSignatures = computed(() => (
    props.column.slot ? selectedSignatures(props.rows, props.column.group) : []
));

/** What the manuscript has chosen in THIS column. */
const chosenCodes = computed(() => props.rows
    .filter(r => tierOf(r) === 'standard' && (columnFor(r.pattern, 'standard') || {}).key === props.column.key)
    .map(r => r.pattern));

const selected = computed(() => new Set(chosenCodes.value));

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
const singleGroup = computed(() => !props.column.slot);

const fmt = (n) => n.toLocaleString('en-US');

function onKey(e) { if (e.key === 'Escape') emit('close'); }
onMounted(async () => {
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    await nextTick();
    if (searchEl.value) searchEl.value.focus({ preventScroll: true });
    else if (panel.value) panel.value.focus();
});
onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
});
</script>

<template>
<div class="overlay" @click.self="emit('close')">
    <section ref="panel" class="picker" role="dialog" aria-modal="true" tabindex="-1" :aria-label="`Pattern library — ${title}`">
        <header>
            <div class="head-main">
                <div class="head-glyph" aria-hidden="true">
                    <PatternDisplay v-if="column.pattern" :pattern="column.pattern" :glyphs="glyphs" :scale="1.4" />
                    <span v-else class="head-letter">{{ column.header }}</span>
                </div>
                <div>
                    <p class="eyebrow">Pattern library</p>
                    <h2><code>{{ column.header }}</code><span v-if="column.slot" class="col-label">{{ column.label }}</span></h2>
                    <p v-if="column.slot" class="rule">
                        Choose up to {{ max }} constellations. A pattern with several signs belongs to the column of its <strong>first</strong> sign.
                    </p>
                    <p v-else class="rule">The ways this neume can be written without special signs. Choose how this manuscript writes it.</p>
                </div>
            </div>
            <button class="ne-btn ne-btn--ghost close" aria-label="Close" @click="emit('close')">✕</button>
        </header>

        <div class="chosen-bar" :class="{ empty: chosenCodes.length === 0 }">
            <span class="chosen-label">
                <template v-if="column.slot"><strong :class="{ full: chosenSignatures.length >= max }">{{ chosenSignatures.length }}/{{ max }}</strong> chosen</template>
                <template v-else><strong>{{ chosenCodes.length }}</strong> chosen</template>
            </span>
            <button v-for="c in chosenCodes" :key="c" class="chip" :title="`Remove ${c}`" @click="emit('toggle', c)">
                <PatternCode :pattern="c" /> <span aria-hidden="true">✕</span>
            </button>
            <span v-if="chosenCodes.length === 0" class="chosen-none">Nothing yet</span>
        </div>

        <div class="tools">
            <input ref="searchEl" v-model="query" type="search" class="search" placeholder="Narrow down by code, e.g. *ud" aria-label="Narrow down the library by code" />
            <label v-if="hasLoadedCounts" class="here" title="Only patterns that occur in this manuscript's transcription">
                <input type="checkbox" v-model="onlyHere" /> Found in this manuscript
            </label>
            <span class="found">{{ filtered.length }} {{ column.slot ? 'constellation' : 'signature' }}{{ filtered.length === 1 ? '' : 's' }}</span>
        </div>

        <div class="body">
            <p v-if="filtered.length === 0" class="empty">
                Nothing in the library matches<template v-if="onlyHere"> — try switching off “Found in this manuscript”</template>.
            </p>

            <section v-for="g in visible" :key="g.signature" class="sig-group">
                <div v-if="!singleGroup" class="sig-head">
                    <div class="sig-glyph"><PatternDisplay :pattern="g.signature" :glyphs="glyphs" :scale="1.15" /></div>
                    <strong class="sig-code">{{ g.signature }}</strong>
                    <span class="sig-freq">{{ fmt(freq.signature(g.signature)) }}× in the CM</span>
                </div>
                <div class="variants">
                    <button
                        v-for="v in g.variants"
                        :key="v"
                        class="variant"
                        :class="{ on: selected.has(v), promote: expandedOnly.has(v) && !selected.has(v), here: counts[v] }"
                        :disabled="blocked(v) && !selected.has(v)"
                        :aria-pressed="selected.has(v)"
                        :title="blocked(v) && !selected.has(v) ? `${max} constellations are already chosen for this column` : ''"
                        @click="emit('toggle', v)"
                    >
                        <span class="v-glyph"><PatternDisplay :pattern="v" :glyphs="glyphs" :scale="1.35" /></span>
                        <PatternCode :pattern="v" />
                        <span class="v-meta">
                            {{ fmt(freq.code(v)) }}× CM
                        </span>
                        <span v-if="counts[v]" class="v-here" title="Occurs in this manuscript">{{ fmt(counts[v]) }}× here</span>
                        <span v-if="selected.has(v)" class="tick" aria-hidden="true">✓</span>
                        <span v-else-if="expandedOnly.has(v)" class="tick soft" title="Already in the expanded documentation">+</span>
                    </button>
                </div>
            </section>

            <button v-if="filtered.length > visible.length" class="ne-btn more" @click="shown += PAGE * 2">
                Show more ({{ filtered.length - visible.length }} further)
            </button>
        </div>

        <footer>
            <button class="ne-btn ne-btn--primary" @click="emit('close')">Done</button>
        </footer>
    </section>
</div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 400; padding: var(--space-4); animation: fade 0.15s ease-out; }
@keyframes fade { from { opacity: 0; } }
.picker { background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); width: min(920px, 100%); max-height: 90vh; display: flex; flex-direction: column; outline: none; animation: rise 0.18s ease-out; }
@keyframes rise { from { transform: translateY(8px); opacity: 0; } }

header { display: flex; justify-content: space-between; gap: var(--space-4); padding: var(--space-4) var(--space-5) var(--space-3); }
.head-main { display: flex; gap: var(--space-4); align-items: center; min-width: 0; }
.head-glyph { flex: 0 0 76px; height: 64px; display: flex; align-items: center; justify-content: center; background: var(--color-surface-muted); border-radius: var(--radius-md); }
.head-letter { font-size: 1.8rem; font-weight: 700; color: var(--color-text-muted); }
.eyebrow { margin: 0; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-primary); }
h2 { margin: 0; font-size: 1.35rem; display: flex; align-items: baseline; gap: var(--space-2); flex-wrap: wrap; }
h2 code { font-family: ui-monospace, Menlo, monospace; }
.col-label { font-size: 0.95rem; font-weight: 500; color: var(--color-text-muted); }
.rule { margin: var(--space-1) 0 0; color: var(--color-text-muted); font-size: 0.86rem; max-width: 62ch; }
.close { align-self: flex-start; }

.chosen-bar { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; padding: var(--space-2) var(--space-5); background: var(--color-primary-light); border-block: 1px solid #bfdbfe; min-height: 40px; }
.chosen-bar.empty { background: var(--color-surface-muted); border-color: var(--color-border); }
.chosen-label { font-size: 0.82rem; color: var(--color-text-muted); margin-right: var(--space-2); }
.chosen-label strong { color: var(--color-primary-dark); }
.chosen-label strong.full { color: var(--color-warning-dark); }
.chosen-none { font-size: 0.82rem; color: var(--color-text-light); font-style: italic; }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 999px; background: var(--color-surface); border-color: var(--color-primary-muted); }
.chip :deep(.pattern-code) { font-size: 12px; color: var(--color-text); }
.chip:hover { background: var(--color-danger-light); border-color: var(--color-danger-muted); }
.chip span[aria-hidden] { font-size: 0.7rem; color: var(--color-text-light); }

.tools { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-3) var(--space-5) var(--space-2); flex-wrap: wrap; }
.search { flex: 1; min-width: 200px; padding: 0.5em 0.8em; border: 1px solid var(--color-border-hover); border-radius: var(--radius-md); font-size: 0.92rem; }
.here { display: inline-flex; align-items: center; gap: var(--space-1); font-size: 0.85rem; color: var(--color-text-muted); cursor: pointer; white-space: nowrap; }
.found { color: var(--color-text-muted); font-size: 0.82rem; white-space: nowrap; }

.body { overflow-y: auto; padding: var(--space-2) var(--space-5) var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
.empty { color: var(--color-text-light); text-align: center; padding: var(--space-5); font-style: italic; }

.sig-group { border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); }
.sig-head { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); }
.sig-glyph { min-width: 44px; display: flex; justify-content: center; }
.sig-code { font-family: ui-monospace, Menlo, monospace; font-size: 1.05rem; }
.sig-freq { color: var(--color-text-muted); font-size: 0.8rem; }

.variants { display: grid; grid-template-columns: repeat(auto-fill, minmax(124px, 1fr)); gap: var(--space-2); }
.variant { position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: var(--space-3) var(--space-2) var(--space-2); background: var(--color-bg); min-width: 0; }
.variant:hover:not(:disabled) { border-color: var(--color-primary); background: var(--color-primary-light); }
.variant.on { background: var(--color-primary-light); border-color: var(--color-primary); box-shadow: 0 0 0 1px var(--color-primary); }
.variant.promote { border-style: dashed; }
.variant:disabled { opacity: 0.45; }
.v-glyph { min-height: 44px; display: flex; align-items: center; }
.v-meta { font-size: 0.7rem; color: var(--color-text-muted); }
.v-here { font-size: 0.68rem; font-weight: 600; color: var(--color-success-dark); background: var(--color-success-light); padding: 0 6px; border-radius: 999px; }
.tick { position: absolute; top: 4px; right: 7px; color: var(--color-primary); font-weight: 700; }
.tick.soft { color: var(--color-text-light); }

.more { align-self: center; }
footer { display: flex; justify-content: flex-end; padding: var(--space-3) var(--space-5); border-top: 1px solid var(--color-border); }

@media (max-width: 640px) {
    .overlay { padding: 0; align-items: flex-end; }
    .picker { max-height: 94vh; border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
    header, .tools, .body, footer, .chosen-bar { padding-left: var(--space-4); padding-right: var(--space-4); }
}
</style>

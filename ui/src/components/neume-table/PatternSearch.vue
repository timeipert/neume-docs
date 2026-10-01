<script setup>
import { computed, ref } from 'vue';
import PatternDisplay from '../PatternDisplay.vue';
import PatternCode from '../PatternCode.vue';
import { searchLibrary, sortCodes, classify } from '../../utils/neumeTable';

/**
 * Adds patterns to the expanded documentation: by searching the whole pattern
 * library by code, or from what this manuscript actually contains. It sits
 * beside the table, so every addition shows up at once.
 */
const props = defineProps({
    allCodes: { type: Array, required: true },
    freq: { type: Object, required: true },
    glyphs: { type: Object, required: true },
    /** code -> occurrences in this manuscript */
    counts: { type: Object, default: () => ({}) },
    /** codes already in the table */
    inTable: { type: Object, required: true }
});

const emit = defineEmits(['add']);

const query = ref('');
const showAll = ref(false);
const SUGGESTIONS = 20;

const results = computed(() => searchLibrary(props.allCodes, query.value, props.freq, {
    exclude: props.inTable,
    limit: 60
}));

/** What the manuscript has that the table does not yet cover, in table order. */
const found = computed(() => {
    const codes = Object.keys(props.counts).filter(c => {
        if (props.inTable.has(c)) return false;
        const kind = classify(c).kind;
        return kind !== 'other' && kind !== 'clef' && kind !== 'custos';
    });
    return sortCodes(codes, props.freq);
});

const searching = computed(() => query.value.trim().length > 0);
const list = computed(() => (searching.value ? results.value : (showAll.value ? found.value : found.value.slice(0, SUGGESTIONS))));

const fmt = (n) => n.toLocaleString('en-US');
</script>

<template>
<section class="panel" aria-label="Add patterns to the expanded documentation">
    <header>
        <label for="pattern-search" class="title">Add a pattern</label>
        <div class="input-wrap">
            <input
                id="pattern-search"
                v-model="query"
                type="search"
                placeholder="Code, e.g. *udL, *eO, [*u]d"
                autocomplete="off"
                @keydown.esc="query = ''"
            />
        </div>
        <p class="hint">Without brackets a code matches every way of writing it; with brackets, exactly. The whole library is searched.</p>
    </header>

    <h3 class="list-title">
        <template v-if="searching">{{ results.length }} match{{ results.length === 1 ? '' : 'es' }}</template>
        <template v-else>Found in this manuscript <span class="n">{{ found.length }}</span></template>
    </h3>

    <ul v-if="list.length" class="results">
        <li v-for="code in list" :key="code">
            <button class="result" :title="`Add ${code} to the expanded documentation`" @click="emit('add', code)">
                <span class="r-glyph"><PatternDisplay :pattern="code" :glyphs="glyphs" :scale="0.9" /></span>
                <span class="r-text">
                    <PatternCode :pattern="code" />
                    <span class="r-meta">{{ fmt(freq.code(code)) }}× CM<template v-if="counts[code]"> · <strong>{{ fmt(counts[code]) }}× here</strong></template></span>
                </span>
                <span class="r-add" aria-hidden="true">+</span>
            </button>
        </li>
    </ul>
    <p v-else-if="searching" class="empty">No pattern in the library contains “{{ query }}”.</p>
    <p v-else class="empty">Everything this manuscript contains is already in the table, or no corpus is loaded for it.</p>

    <button v-if="!searching && found.length > SUGGESTIONS" class="ne-btn ne-btn--sm more" @click="showAll = !showAll">
        {{ showAll ? 'Show fewer' : `Show all ${found.length}` }}
    </button>
</section>
</template>

<style scoped>
.panel { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); display: flex; flex-direction: column; min-height: 0; }
.title { display: block; font-weight: 700; margin-bottom: var(--space-2); }
.input-wrap input { width: 100%; box-sizing: border-box; padding: 0.5em 0.8em; border: 1px solid var(--color-border-hover); border-radius: var(--radius-md); font-family: ui-monospace, Menlo, monospace; font-size: 0.95rem; }
.hint { margin: var(--space-2) 0 0; color: var(--color-text-muted); font-size: 0.78rem; line-height: 1.4; }
.list-title { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); margin: var(--space-4) 0 var(--space-2); }
.n { background: var(--color-surface-muted); border-radius: 999px; padding: 0 0.5em; margin-left: 0.3em; }

.results { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; min-height: 0; }
.result { width: 100%; display: flex; align-items: center; gap: var(--space-3); padding: var(--space-1) var(--space-2); text-align: left; background: transparent; border-color: transparent; }
.result:hover { background: var(--color-primary-light); border-color: var(--color-primary-muted); }
.r-glyph { flex: 0 0 64px; min-height: 34px; display: flex; align-items: center; justify-content: center; }
.r-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.r-text :deep(.pattern-code) { font-size: 12px; color: var(--color-text); overflow: hidden; text-overflow: ellipsis; }
.r-meta { font-size: 0.72rem; color: var(--color-text-muted); }
.r-meta strong { color: var(--color-success-dark); font-weight: 600; }
.r-add { color: var(--color-primary); font-weight: 700; font-size: 1.15rem; opacity: 0.4; }
.result:hover .r-add { opacity: 1; }
.empty { color: var(--color-text-light); font-style: italic; margin: var(--space-2) 0 0; font-size: 0.88rem; }
.more { margin-top: var(--space-3); align-self: flex-start; }
</style>

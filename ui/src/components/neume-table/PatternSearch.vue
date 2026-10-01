<script setup>
import { computed, ref } from 'vue';
import PatternDisplay from '../PatternDisplay.vue';
import PatternCode from '../PatternCode.vue';
import { searchLibrary, sortCodes, classify } from '../../utils/neumeTable';

/**
 * Adds patterns to the expanded documentation: by searching the whole pattern
 * library by code, or from what this manuscript actually contains.
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
const showAllSuggestions = ref(false);
const SUGGESTIONS = 18;

const results = computed(() => searchLibrary(props.allCodes, query.value, props.freq, {
    exclude: props.inTable,
    limit: 40
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

const suggestions = computed(() => (showAllSuggestions.value ? found.value : found.value.slice(0, SUGGESTIONS)));

const searching = computed(() => query.value.trim().length > 0);
const list = computed(() => (searching.value ? results.value : suggestions.value));

const fmt = (n) => n.toLocaleString('en-US');

function add(code) {
    emit('add', code);
}
</script>

<template>
<section class="search-panel" aria-label="Add patterns to the expanded documentation">
    <div class="field">
        <label for="pattern-search">Add a pattern by code</label>
        <div class="input-wrap">
            <input
                id="pattern-search"
                v-model="query"
                type="search"
                placeholder="e.g. *udL, *eO, [*u]d …"
                autocomplete="off"
                @keydown.esc="query = ''"
            />
        </div>
        <p class="hint">
            Without brackets the code matches every way of writing it; with brackets it matches exactly.
            The whole pattern library is searched.
        </p>
    </div>

    <h3 class="list-title">
        <template v-if="searching">{{ results.length }} match{{ results.length === 1 ? '' : 'es' }} in the library</template>
        <template v-else>Found in this manuscript, not yet in the table <span class="n">{{ found.length }}</span></template>
    </h3>

    <ul v-if="list.length" class="results">
        <li v-for="code in list" :key="code">
            <button class="result" :title="`Add ${code} to the expanded documentation`" @click="add(code)">
                <span class="r-glyph"><PatternDisplay :pattern="code" :glyphs="glyphs" /></span>
                <PatternCode :pattern="code" />
                <span class="r-meta">{{ fmt(freq.code(code)) }}× CM<template v-if="counts[code]"> · {{ fmt(counts[code]) }}× here</template></span>
                <span class="r-add" aria-hidden="true">+</span>
            </button>
        </li>
    </ul>
    <p v-else-if="searching" class="empty">No pattern in the library contains “{{ query }}”.</p>
    <p v-else class="empty">Everything this manuscript contains is already in the table, or no corpus is loaded for it.</p>

    <button v-if="!searching && found.length > SUGGESTIONS" class="more" @click="showAllSuggestions = !showAllSuggestions">
        {{ showAllSuggestions ? 'Show fewer' : `Show all ${found.length}` }}
    </button>
</section>
</template>

<style scoped>
.search-panel { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); }
.field label { display: block; font-weight: 600; margin-bottom: var(--space-1); }
.input-wrap input { width: 100%; box-sizing: border-box; padding: 0.55em 0.8em; border: 1px solid var(--color-border-hover); border-radius: var(--radius-md); font-family: ui-monospace, Menlo, monospace; font-size: 1rem; }
.hint { margin: var(--space-1) 0 0; color: var(--color-text-muted); font-size: 0.82rem; }
.list-title { font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); margin: var(--space-4) 0 var(--space-2); }
.n { background: var(--color-surface-muted); border-radius: 999px; padding: 0 0.5em; margin-left: 0.3em; }
.results { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: var(--space-2); }
.result { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: var(--space-2); position: relative; background: var(--color-bg); }
.result:hover { border-color: var(--color-primary); background: var(--color-primary-light); }
.r-glyph { min-height: 32px; display: flex; align-items: center; }
.r-meta { font-size: 0.7rem; color: var(--color-text-muted); }
.r-add { position: absolute; top: 2px; right: 8px; color: var(--color-primary); font-weight: 700; font-size: 1.1rem; }
.empty { color: var(--color-text-light); font-style: italic; margin: var(--space-2) 0 0; }
.more { margin-top: var(--space-3); font-size: 0.85rem; }
</style>

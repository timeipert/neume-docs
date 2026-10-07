<script setup>
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import FilterPanel from '../../components/metadata/FilterPanel.vue';
import { useDocs } from '../../composables/useDocsContext';
import { useRowFilter } from '../../composables/useRowFilter';
import { compareCells } from '../../utils/gridOps';
import { decodeFilter, encodeFilter, fold } from '../../utils/manuscriptFilter';

/**
 * The manuscripts of a documentation, with the metadata its authors chose to show. What can be
 * filtered is the authors' choice too (their index says which columns, and how). The filter that is
 * set is part of the address (`f`), so a selection can be linked to, and handed on to the neume table.
 */
const docs = useDocs();
const route = useRoute();
const router = useRouter();

const entries = docs.entries;
const columns = docs.columns;

const search = ref(typeof route.query.q === 'string' ? route.query.q : '');
const panelOpen = ref(typeof route.query.f === 'string' && route.query.f !== '');
const sort = ref({ key: 'source', dir: 'asc' });

// ---- the filter, kept in the address -----------------------------------------------------

const filter = ref(decodeFilter(typeof route.query.f === 'string' ? route.query.f : ''));
let writing = false;
watch(filter, (f) => {
    writing = true;
    const f2 = encodeFilter(f);
    router.replace({ query: { ...route.query, f: f2 || undefined } }).finally(() => { writing = false; });
}, { deep: true });
watch(() => route.query.f, (text) => {
    if (!writing) filter.value = decodeFilter(typeof text === 'string' ? text : '');
});

const meta = (id, key) => {
    const e = docs.entry(id);
    return (e && e.meta[key]) || '';
};

const model = useRowFilter({
    filter,
    ids: computed(() => entries.value.map(e => e.id)),
    columns,
    cell: (id, col) => meta(id, col.key),
    configOf: (col) => ({ kind: col.filter || 'values', auto: col.filter || 'values', offered: !!col.filter })
});
const f = { ...model, views: ref([]), editable: false };

// ---- the rows ---------------------------------------------------------------------------------

const rows = computed(() => {
    const passing = new Set(model.active.value ? model.matching.value : entries.value.map(e => e.id));
    const q = fold(search.value);
    let list = entries.value.filter(e => passing.has(e.id)).filter(e => {
        if (!q) return true;
        return fold(`${e.source} ${e.name} ${Object.values(e.meta).join(' ')}`).includes(q);
    });
    const { key, dir } = sort.value;
    const value = (e) => (key === 'source' ? e.source : key === 'patterns' ? String(e.patterns).padStart(6, '0') : key === 'snippets' ? String(e.snippets).padStart(6, '0') : (e.meta[key] || ''));
    list = [...list].sort((a, b) => compareCells(value(a), value(b), dir === 'desc') || a.source.localeCompare(b.source, undefined, { numeric: true }));
    return list;
});

function sortBy(key) {
    const s = sort.value;
    sort.value = s.key !== key ? { key, dir: 'asc' } : (s.dir === 'asc' ? { key, dir: 'desc' } : { key: 'source', dir: 'asc' });
}
const arrow = (key) => (sort.value.key === key ? (sort.value.dir === 'asc' ? ' ▲' : ' ▼') : '');

const filterCount = computed(() => model.chips.value.length);
const summary = computed(() => model.chips.value.map(c => `${c.label}: ${c.text}`).join('; '));

function share() {
    docs.cite({ kind: 'selection', count: rows.value.length, summary: summary.value }, '', { f: encodeFilter(filter.value) });
}

const tableQuery = computed(() => ({ f: encodeFilter(filter.value) || undefined }));

function clearAll() { model.clear(); search.value = ''; }

const rowsCopy = computed(() => rows.value.map(r => r.source));
</script>

<template>
<div class="catalogue">
    <div class="tools">
        <input v-model="search" type="search" class="search" placeholder="Search the manuscripts…" aria-label="Search the manuscripts" />
        <button v-if="columns.some(c => c.filter)" type="button" class="ne-btn ne-btn--sm" :class="{ on: panelOpen || filterCount }" :aria-pressed="panelOpen" @click="panelOpen = !panelOpen">
            Filter<template v-if="filterCount"> · {{ filterCount }}</template>
        </button>
        <button v-if="filterCount || search" type="button" class="ne-btn ne-btn--sm ne-btn--ghost" @click="clearAll">Clear</button>
        <span class="grow"></span>
        <span class="count">{{ rows.length }} of {{ entries.length }} manuscripts</span>
        <RouterLink v-if="rows.length" :to="{ name: 'docs_table', params: { endpoint: docs.id.value }, query: tableQuery }" class="ne-btn ne-btn--sm ne-btn--primary">
            {{ filterCount ? 'Compare these in the neume table →' : 'Neume table →' }}
        </RouterLink>
    </div>

    <div v-if="model.chips.value.length" class="chips" role="list" aria-label="Filters that are set">
        <span v-if="model.chips.value.length > 1" class="join">{{ model.filter.value.mode === 'any' ? 'Any of' : 'All of' }}</span>
        <button v-for="c in model.chips.value" :key="c.key" type="button" class="chip" role="listitem" title="Open this filter" @click="panelOpen = true">
            <span class="chip-key">{{ c.label }}</span><span class="chip-val">{{ c.text }}</span>
            <span class="chip-x" role="button" tabindex="0" :aria-label="`Remove the filter on ${c.label}`" @click.stop="model.setRule(c.key, null)" @keydown.enter.stop="model.setRule(c.key, null)">×</span>
        </button>
    </div>

    <div class="work">
        <FilterPanel
            v-if="panelOpen"
            :f="f"
            :shown="rows.length"
            :total="entries.length"
            :sigla="rowsCopy"
            @close="panelOpen = false"
            @share="share"
        />

        <div class="table-wrap">
            <p v-if="!entries.length" class="ne-empty">This documentation has no manuscripts yet.</p>
            <p v-else-if="!rows.length" class="ne-empty">No manuscript matches. <button type="button" class="link" @click="clearAll">Clear the filters</button></p>
            <table v-else class="ms">
                <thead>
                    <tr>
                        <th class="sticky"><button type="button" @click="sortBy('source')">Manuscript{{ arrow('source') }}</button></th>
                        <th v-for="c in columns" :key="c.key"><button type="button" @click="sortBy(c.key)">{{ c.label }}{{ arrow(c.key) }}</button></th>
                        <th class="num"><button type="button" @click="sortBy('patterns')">Patterns{{ arrow('patterns') }}</button></th>
                        <th class="num"><button type="button" @click="sortBy('snippets')">Snippets{{ arrow('snippets') }}</button></th>
                        <th class="ref"><span class="sr-only">Link and cite</span></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="e in rows" :key="e.id">
                        <th scope="row" class="sticky">
                            <RouterLink :to="docs.manuscriptPath(e.id)" class="name">
                                <strong>{{ e.source }}</strong>
                                <span v-if="e.name && e.name !== e.source" class="sub">{{ e.name }}</span>
                            </RouterLink>
                            <span v-if="e.kind === 'collection'" class="own" title="Documented from screenshots, not from IIIF pages">screenshots</span>
                        </th>
                        <td v-for="c in columns" :key="c.key">{{ e.meta[c.key] || '' }}</td>
                        <td class="num">{{ e.patterns }}</td>
                        <td class="num">{{ e.snippets }}</td>
                        <td class="ref">
                            <button type="button" class="ref-btn" :aria-label="`Link to and cite ${e.source}`" title="Link and cite" @click="docs.cite({ kind: 'manuscript', source: e.source, entryId: e.id }, `/m/${encodeURIComponent(e.id)}`)">⛓</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</div>
</template>

<style scoped>
.catalogue { display: flex; flex-direction: column; gap: var(--space-3); }
.tools { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.search { padding: 0.4em 0.8em; border: 1px solid var(--color-border-hover); border-radius: var(--radius-md); width: 18rem; max-width: 100%; font-size: 0.9rem; background: var(--color-surface); }
.grow { flex: 1; }
.count { color: var(--color-text-muted); font-size: 0.84rem; white-space: nowrap; }
.ne-btn.on { background: var(--color-primary-light); border-color: var(--color-primary-muted); color: var(--color-primary-dark); }

.chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.join { font-size: 0.76rem; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.chip { display: inline-flex; align-items: center; gap: 6px; max-width: 24rem; padding: 2px 4px 2px 10px; border: 1px solid var(--color-primary-muted); border-radius: 999px; background: var(--color-primary-light); font-size: 0.8rem; cursor: pointer; }
.chip:hover { background: var(--color-surface); }
.chip-key { font-weight: 700; flex: none; }
.chip-val { color: var(--color-primary-dark); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip-x { width: 1.3rem; height: 1.3rem; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 1rem; line-height: 1; color: var(--color-text-muted); }
.chip-x:hover { background: var(--color-danger-light); color: var(--color-danger); }

.work { display: flex; gap: var(--space-3); align-items: flex-start; }
.work > :deep(.fp) { position: sticky; top: var(--space-3); max-height: calc(100vh - 2 * var(--space-3)); }
.table-wrap { flex: 1; min-width: 0; overflow-x: auto; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); }
.ne-empty { padding: var(--space-5); margin: 0; text-align: center; color: var(--color-text-muted); }

.ms { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.9rem; }
.ms th, .ms td { padding: 0.55em 0.9em; border-bottom: 1px solid var(--color-surface-muted); text-align: left; vertical-align: top; }
.ms thead th { position: sticky; top: 0; background: var(--color-bg); z-index: 2; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-muted); white-space: nowrap; }
.ms thead button { border: none; background: none; padding: 0; font: inherit; text-transform: inherit; letter-spacing: inherit; color: inherit; cursor: pointer; }
.ms thead button:hover { color: var(--color-text); }
.ms tbody tr:hover { background: var(--color-surface-muted); }
.ms .sticky { position: sticky; left: 0; background: var(--color-surface); z-index: 1; font-weight: inherit; }
.ms thead .sticky { z-index: 3; background: var(--color-bg); }
.ms tbody tr:hover .sticky { background: var(--color-surface-muted); }
.num { text-align: right !important; font-variant-numeric: tabular-nums; }
.name { display: flex; flex-direction: column; text-decoration: none; color: inherit; }
.name strong { color: var(--color-primary-hover); }
.name:hover strong { text-decoration: underline; }
.sub { font-size: 0.8rem; color: var(--color-text-muted); font-weight: 400; }
.own { display: inline-block; margin-top: 2px; padding: 0 7px; border-radius: 999px; background: var(--color-surface-muted); font-size: 0.68rem; color: var(--color-text-muted); }
.ref { width: 2.2rem; text-align: center !important; }
.ref-btn { border: none; background: none; cursor: pointer; opacity: 0.35; font-size: 1rem; }
.ms tbody tr:hover .ref-btn, .ref-btn:focus-visible { opacity: 1; }
.link { border: none; background: none; padding: 0; color: var(--color-primary); cursor: pointer; }
.link:hover { text-decoration: underline; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (max-width: 900px) { .work { flex-direction: column; } .work > :deep(.fp) { position: static; width: 100%; max-height: 22rem; } }
</style>

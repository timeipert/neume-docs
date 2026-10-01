<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useSettingsStore } from '../stores/settings';
import { useTranscriptionData } from '../composables/useTranscriptionData';
import { usePatternCatalog } from '../composables/usePatternCatalog';
import {
    STANDARD_DIRECTIONS,
    SPECIAL_COLUMNS,
    MAX_SPECIAL_SIGNATURES,
    buildColumns,
    columnFor,
    rowsForMode,
    tierOf,
    compareCodes,
    canSelectForStandard,
    tableProgress,
    groupColumns
} from '../utils/neumeTable';
import NeumeColumnCard from '../components/neume-table/NeumeColumnCard.vue';
import ColumnPicker from '../components/neume-table/ColumnPicker.vue';
import PatternSearch from '../components/neume-table/PatternSearch.vue';

const route = useRoute();
const router = useRouter();
const tableStore = usePersonalTablesStore();
const settings = useSettingsStore();
const { glyphs, catalog, hasCorpus, loading } = useTranscriptionData();
const { freq, allCodes } = usePatternCatalog();

const source = computed(() => String(route.params.source || ''));
const record = computed(() => catalog.value[source.value] || null);
const counts = computed(() => (record.value && record.value.counts) || {});

// ---- mode ------------------------------------------------------------------

const mode = ref(route.query.mode === 'expanded' ? 'expanded' : 'standard');
watch(mode, (m) => router.replace({ query: { ...route.query, mode: m === 'standard' ? undefined : m } }));

// ---- rows and columns ------------------------------------------------------

const rows = computed(() => tableStore.rowsFor(source.value));
const visibleRows = computed(() => rowsForMode(rows.value, mode.value));
const hiddenCount = computed(() => rows.value.length - visibleRows.value.length);

const columns = computed(() => buildColumns(mode.value, visibleRows.value.map(r => r.pattern), freq.value));

const rowsByColumn = computed(() => {
    const map = new Map();
    for (const row of visibleRows.value) {
        const col = columnFor(row.pattern, mode.value);
        if (!col) continue;
        if (!map.has(col.key)) map.set(col.key, []);
        map.get(col.key).push(row);
    }
    for (const list of map.values()) list.sort((a, b) => compareCodes(a.pattern, b.pattern, freq.value));
    return map;
});

const unplaced = computed(() => visibleRows.value.filter(r => !columnFor(r.pattern, mode.value)));

const inTable = computed(() => new Set(rows.value.map(r => r.pattern)));

function isAdded(column) {
    const list = rowsByColumn.value.get(column.key) || [];
    if (column.slot || column.group === 'clef' || column.group === 'custos') return false;
    if (column.group === 'direction' && STANDARD_DIRECTIONS.includes(column.pattern)) return false;
    return list.length === 0 || list.every(r => tierOf(r) === 'expanded');
}

/** Columns under their headings. */
const sections = computed(() => groupColumns(columns.value));

// ---- progress --------------------------------------------------------------

const progress = computed(() => {
    const p = tableProgress(rows.value);
    return { ...p, specials: SPECIAL_COLUMNS.map(c => ({ ...c, n: p.specials[c.key] })) };
});

// ---- editing ---------------------------------------------------------------

const picker = ref(null);
const notice = ref('');
let noticeTimer = null;

function say(text) {
    notice.value = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.value = ''; }, 4500);
}

function defaultId(code) {
    return settings.autoFillIds ? settings.getGlobalId(code) : '';
}

/** Choose or release a pattern for the standard selection (the library picker). */
function toggleStandard(code) {
    const row = rows.value.find(r => r.pattern === code);
    if (row && tierOf(row) === 'standard') {
        tableStore.removeRow(source.value, code);
        return;
    }
    const verdict = canSelectForStandard(rows.value, code, MAX_SPECIAL_SIGNATURES);
    if (!verdict.ok) { say(verdict.reason); return; }
    tableStore.addRow(source.value, code, { tier: 'standard', customId: row ? undefined : defaultId(code) });
}

/** Add a pattern to the expanded documentation (search by code). */
function addExpanded(code) {
    tableStore.addRow(source.value, code, { tier: 'expanded', customId: defaultId(code) });
    mode.value = 'expanded';
}

function remove(code) {
    const row = rows.value.find(r => r.pattern === code);
    if (row && row.notes && !window.confirm(`Remove ${code}? Its notes are lost.`)) return;
    tableStore.removeRow(source.value, code);
}

function setId(code, value) {
    tableStore.updateRow(source.value, code, { customId: value.trim() });
}

function togglePseudo(code) {
    if (inTable.value.has(code)) tableStore.removeRow(source.value, code);
    else tableStore.addRow(source.value, code, { tier: 'standard' });
}

function annotate() {
    const id = tableStore.getOrCreateTableForSource(source.value);
    router.push({ name: 'annotations', params: { id } });
}

const meta = computed(() => {
    const m = (record.value && record.value.meta) || {};
    return [m.herkunftsort, m.datierung, [m.bibliothek, m.bibliothekssignatur].filter(Boolean).join(' ')]
        .filter(Boolean).join(' · ');
});

const fmt = (n) => n.toLocaleString('en-US');
const cmCount = (col) => (col.pattern ? (col.group === 'direction' ? freq.value.direction(col.pattern) : freq.value.signature(col.pattern)) : 0);
</script>

<template>
<div class="table-view">
    <header class="head">
        <div class="crumbs">
            <button class="crumb" @click="router.push('/table')">&larr; All manuscripts</button>
        </div>
        <div class="title-row">
            <div>
                <h1>{{ source }} <span class="tag">Neumentabelle</span></h1>
                <p v-if="meta" class="meta">{{ meta }}</p>
                <p v-else-if="!loading && !record" class="meta warn">
                    This source is not in the loaded corpus. Frequencies are those of the whole CM.
                </p>
                <p v-if="record" class="meta">
                    {{ fmt(Object.values(counts).reduce((a, b) => a + b, 0)) }} neumes in {{ fmt((record.documents || []).length) }} documents
                </p>
            </div>
            <div class="actions">
                <button @click="annotate" title="Mark the snippets on the manuscript images">Annotate snippets &rarr;</button>
                <button @click="router.push({ path: '/public/table' })" title="Compare with the other manuscripts">Compare &rarr;</button>
            </div>
        </div>

        <div class="mode-row">
            <div class="mode-switch" role="group" aria-label="Table mode">
                <button :class="{ on: mode === 'standard' }" :aria-pressed="mode === 'standard'" @click="mode = 'standard'">
                    Standard table
                </button>
                <button :class="{ on: mode === 'expanded' }" :aria-pressed="mode === 'expanded'" @click="mode = 'expanded'">
                    Expanded documentation
                </button>
            </div>
            <p class="mode-note">
                <template v-if="mode === 'standard'">
                    The standard selection only. Columns are ordered by tones, then by frequency in the CM.
                </template>
                <template v-else>
                    The standard table plus everything added for this manuscript, each at its place in the ordering.
                </template>
            </p>
        </div>

        <ul class="progress" aria-label="Progress of the standard table">
            <li :class="{ done: progress.directions === STANDARD_DIRECTIONS.length }">
                Shapes <strong>{{ progress.directions }}/{{ STANDARD_DIRECTIONS.length }}</strong>
            </li>
            <li v-for="s in progress.specials" :key="s.key" :class="{ done: s.n > 0 }">
                {{ s.header }} <strong>{{ s.n }}/{{ MAX_SPECIAL_SIGNATURES }}</strong>
            </li>
            <li :class="{ done: progress.clef }">Clef <strong>{{ progress.clef ? '✓' : '–' }}</strong></li>
            <li :class="{ done: progress.custos }">Custos <strong>{{ progress.custos ? '✓' : '–' }}</strong></li>
            <li v-if="progress.expanded" class="extra">+{{ progress.expanded }} expanded</li>
        </ul>
    </header>

    <p v-if="notice" class="notice" role="status">{{ notice }}</p>

    <p v-if="mode === 'standard' && hiddenCount" class="hidden-note">
        {{ hiddenCount }} further pattern{{ hiddenCount === 1 ? ' is' : 's are' }} documented for this manuscript.
        <button class="inline" @click="mode = 'expanded'">Show expanded documentation</button>
    </p>

    <PatternSearch
        v-if="mode === 'expanded'"
        class="search"
        :all-codes="allCodes"
        :freq="freq"
        :glyphs="glyphs"
        :counts="counts"
        :in-table="inTable"
        @add="addExpanded"
    />

    <section v-for="section in sections" :key="section.key" class="section">
        <h2 class="section-heading">{{ section.label }}</h2>
        <div class="grid">
            <NeumeColumnCard
                v-for="col in section.columns"
                :key="col.key"
                :column="col"
                :rows="rowsByColumn.get(col.key) || []"
                :glyphs="glyphs"
                :cm-count="cmCount(col)"
                :counts="counts"
                :max="MAX_SPECIAL_SIGNATURES"
                :added="isAdded(col)"
                @pick="picker = $event"
                @remove="remove"
                @id="setId"
                @toggle-pseudo="togglePseudo"
            />
        </div>
    </section>

    <section v-if="unplaced.length" class="unplaced">
        <h2 class="section-heading">Without a column</h2>
        <p class="meta">These entries are not neume shapes, so they have no place in the table.</p>
        <ul>
            <li v-for="r in unplaced" :key="r.pattern">
                <code>{{ r.pattern }}</code>
                <button class="x" :aria-label="`Remove ${r.pattern}`" @click="remove(r.pattern)">✕</button>
            </li>
        </ul>
    </section>

    <ColumnPicker
        v-if="picker"
        :column="picker"
        :rows="rows"
        :all-codes="allCodes"
        :freq="freq"
        :glyphs="glyphs"
        :counts="counts"
        :max="MAX_SPECIAL_SIGNATURES"
        @toggle="toggleStandard"
        @close="picker = null"
    />
</div>
</template>

<style scoped>
.table-view { padding: var(--space-5) var(--space-6) var(--space-6); max-width: 1400px; margin: 0 auto; overflow-y: auto; height: 100%; box-sizing: border-box; }
.head { margin-bottom: var(--space-4); }
.crumb { border: none; background: none; padding: 0; color: var(--color-primary); font-size: 0.9rem; }
.crumb:hover { background: none; text-decoration: underline; }
.title-row { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-4); flex-wrap: wrap; }
h1 { margin: var(--space-1) 0 0; font-size: 1.7rem; }
.tag { font-size: 0.8rem; font-weight: 600; vertical-align: middle; color: var(--color-primary-dark); background: var(--color-primary-light); padding: 0.15em 0.6em; border-radius: 999px; margin-left: 0.4em; }
.meta { margin: var(--space-1) 0 0; color: var(--color-text-muted); font-size: 0.9rem; }
.meta.warn { color: var(--color-warning-dark); }
.actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }

.mode-row { display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap; margin-top: var(--space-4); }
.mode-switch { display: inline-flex; border: 1px solid var(--color-border-hover); border-radius: var(--radius-md); overflow: hidden; }
.mode-switch button { border: none; border-radius: 0; padding: 0.5em 1.1em; font-weight: 600; background: var(--color-surface); }
.mode-switch button + button { border-left: 1px solid var(--color-border-hover); }
.mode-switch button.on { background: var(--color-primary); color: #fff; }
.mode-note { margin: 0; color: var(--color-text-muted); font-size: 0.88rem; flex: 1; min-width: 240px; }

.progress { list-style: none; display: flex; flex-wrap: wrap; gap: var(--space-2); padding: 0; margin: var(--space-3) 0 0; }
.progress li { background: var(--color-surface-muted); border-radius: 999px; padding: 0.2em 0.8em; font-size: 0.82rem; color: var(--color-text-muted); }
.progress li.done { background: var(--color-success-light); color: #166534; }
.progress li.extra { background: #ede9fe; color: #5b21b6; }
.progress strong { margin-left: 0.25em; }

.notice { background: var(--color-warning-light); border: 1px solid var(--color-warning-muted); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); margin: 0 0 var(--space-3); }
.hidden-note { color: var(--color-text-muted); font-size: 0.9rem; margin: 0 0 var(--space-3); }
button.inline { border: none; background: none; padding: 0; color: var(--color-primary); font-size: inherit; text-decoration: underline; }
button.inline:hover { background: none; }

.search { margin-bottom: var(--space-4); }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: var(--space-3); align-items: stretch; }
.section { margin-top: var(--space-5); }
.section-heading { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); margin: 0 0 var(--space-3); padding-bottom: var(--space-1); border-bottom: 1px solid var(--color-border); }

.unplaced ul { list-style: none; padding: 0; display: flex; gap: var(--space-2); flex-wrap: wrap; }
.unplaced li { background: var(--color-surface-muted); padding: 0.2em 0.5em; border-radius: var(--radius-sm); display: flex; align-items: center; gap: var(--space-2); }
.x { padding: 0 6px; border-color: transparent; background: transparent; }

@media (max-width: 720px) {
    .table-view { padding: var(--space-4); }
}
</style>

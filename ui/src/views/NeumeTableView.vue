<script setup>
import { computed, ref, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useSettingsStore } from '../stores/settings';
import { useTranscriptionData } from '../composables/useTranscriptionData';
import { usePatternCatalog } from '../composables/usePatternCatalog';
import {
    STANDARD_DIRECTIONS,
    MAX_SPECIAL_SIGNATURES,
    buildColumns,
    columnFor,
    rowsForMode,
    tierOf,
    compareCodes,
    canSelectForStandard,
    standardCellStates,
    groupColumns
} from '../utils/neumeTable';
import NeumeColumnCard from '../components/neume-table/NeumeColumnCard.vue';
import ColumnPicker from '../components/neume-table/ColumnPicker.vue';
import PatternSearch from '../components/neume-table/PatternSearch.vue';
import TableProgress from '../components/neume-table/TableProgress.vue';
import SegmentedControl from '../components/ui/SegmentedControl.vue';
import PageHeader from '../components/ui/PageHeader.vue';

const route = useRoute();
const router = useRouter();
const tableStore = usePersonalTablesStore();
const settings = useSettingsStore();
const { glyphs, catalog, loading } = useTranscriptionData();
const { freq, allCodes } = usePatternCatalog();

const source = computed(() => String(route.params.source || ''));
const record = computed(() => catalog.value[source.value] || null);
const counts = computed(() => (record.value && record.value.counts) || {});

// ---- mode ------------------------------------------------------------------

const MODES = [
    { value: 'standard', label: 'Standard Table', title: 'Show Standard Table: the standard selection only' },
    { value: 'expanded', label: 'Expanded Documentation', title: 'Show Expanded Documentation: the standard table plus what this manuscript needs beyond it' }
];
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
const sections = computed(() => groupColumns(columns.value).map(section => ({
    ...section,
    filled: section.columns.filter(c => (rowsByColumn.value.get(c.key) || []).length > 0).length
})));

// ---- progress --------------------------------------------------------------

const standardColumns = computed(() => buildColumns('standard', [], freq.value));
const cellStates = computed(() => standardCellStates(rows.value, standardColumns.value));
const filledCells = computed(() => cellStates.value.filter(c => c.filled).length);
const expandedCount = computed(() => rows.value.filter(r => tierOf(r) === 'expanded').length);

const highlightKey = ref('');
let highlightTimer = null;

/** Scroll to a cell and flash it. In the expanded view a special-sign cell is several columns; go to the first. */
async function jump(key) {
    const state = cellStates.value.find(c => c.key === key);
    await nextTick();
    const root = document.querySelector('.table-view');
    let target = root && root.querySelector(`[data-column="${key}"]`);
    if (!target && state && root) target = root.querySelector(`[data-group="${state.group}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    highlightKey.value = target.getAttribute('data-column');
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => { highlightKey.value = ''; }, 1500);
}

// ---- editing ---------------------------------------------------------------

const picker = ref(null);
const notice = ref('');
let noticeTimer = null;

function say(text) {
    notice.value = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.value = ''; }, 5000);
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

const published = computed(() => {
    const t = tableStore.tables.find(x => x.source === source.value);
    return !!(t && t.isPublished);
});

function setPublished(value) {
    const id = tableStore.getOrCreateTableForSource(source.value);
    tableStore.updateTable(id, { isPublished: value });
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

const neumeTotal = computed(() => Object.values(counts.value).reduce((a, b) => a + b, 0));
const fmt = (n) => n.toLocaleString('en-US');
const cmCount = (col) => (col.pattern ? (col.group === 'direction' ? freq.value.direction(col.pattern) : freq.value.signature(col.pattern)) : 0);
</script>

<template>
<div class="table-view">
    <div class="wrap">
        <nav class="crumbs" aria-label="Breadcrumb">
            <button class="ne-btn ne-btn--ghost ne-btn--sm" @click="router.push('/table')">&larr; All manuscripts</button>
        </nav>

        <PageHeader :title="source" eyebrow="Neumentabelle">
            <template #subtitle>
                <p v-if="meta">{{ meta }}</p>
                <p v-if="record" class="dim">{{ fmt(neumeTotal) }} neumes in {{ fmt((record.documents || []).length) }} documents</p>
                <p v-else-if="!loading" class="warn">This source is not in the loaded corpus. Frequencies are those of the whole CM.</p>
            </template>
            <template #actions>
                <label class="switch" title="Show this manuscript in the comparison table">
                    <input type="checkbox" :checked="published" @change="setPublished($event.target.checked)" />
                    <span class="track" aria-hidden="true"></span>
                    Published
                </label>
                <button class="ne-btn" title="Mark the snippets on the manuscript images" @click="annotate">Annotate snippets &rarr;</button>
                <button class="ne-btn" title="Compare with the other manuscripts" @click="router.push('/compare')">Compare &rarr;</button>
            </template>
        </PageHeader>

        <div class="toolbar">
            <div class="toolbar-top">
                <SegmentedControl v-model="mode" :options="MODES" label="Table mode" />
                <p class="mode-note">
                    <template v-if="mode === 'standard'">The standard selection only — columns ordered by tones, then frequency in the CM.</template>
                    <template v-else>The standard table plus everything added for this manuscript, each at its place in the ordering.</template>
                </p>
            </div>
            <div class="toolbar-progress">
                <TableProgress :cells="cellStates" @select="jump" />
                <span class="summary">
                    <strong>{{ filledCells }}</strong> of {{ cellStates.length }} filled
                    <template v-if="expandedCount"> · <span class="plus">+{{ expandedCount }} expanded</span></template>
                </span>
            </div>
        </div>

        <p v-if="notice" class="notice" role="status">{{ notice }}</p>

        <p v-if="mode === 'standard' && hiddenCount" class="hidden-note">
            <span>{{ hiddenCount }} further pattern{{ hiddenCount === 1 ? ' is' : 's are' }} documented for this manuscript.</span>
            <button class="ne-btn ne-btn--sm" @click="mode = 'expanded'">Show Expanded Documentation</button>
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
            <h2 class="section-heading">
                {{ section.label }}
                <span class="section-count">{{ section.filled }} of {{ section.columns.length }}</span>
            </h2>
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
                    :highlighted="highlightKey === col.key"
                    :data-group="col.group"
                    @pick="picker = $event"
                    @remove="remove"
                    @id="setId"
                    @toggle-pseudo="togglePseudo"
                />
            </div>
        </section>

        <section v-if="unplaced.length" class="section">
            <h2 class="section-heading">Without a column</h2>
            <p class="dim small">These entries are not neume shapes, so they have no place in the table.</p>
            <ul class="unplaced">
                <li v-for="r in unplaced" :key="r.pattern">
                    <code>{{ r.pattern }}</code>
                    <button class="x" :aria-label="`Remove ${r.pattern}`" @click="remove(r.pattern)">✕</button>
                </li>
            </ul>
        </section>
    </div>

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
.table-view { height: 100%; overflow-y: auto; box-sizing: border-box; padding: 0 var(--space-6) var(--space-6); }
.wrap { max-width: 1400px; margin: 0 auto; }
.crumbs { padding-top: var(--space-4); margin-left: -0.7em; }

.dim { color: var(--color-text-muted); font-size: 0.9rem; }
.small { font-size: 0.85rem; }
.warn { color: var(--color-warning-dark); }

/* Publish switch */
.switch { display: inline-flex; align-items: center; gap: var(--space-2); font-size: 0.9rem; font-weight: 600; color: var(--color-text-muted); cursor: pointer; margin-right: var(--space-2); }
.switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.track { position: relative; width: 34px; height: 20px; border-radius: 999px; background: var(--color-border-hover); transition: background-color 0.15s; flex: 0 0 auto; }
.track::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: var(--shadow-sm); transition: transform 0.15s; }
.switch input:checked + .track { background: var(--color-primary); }
.switch input:checked + .track::after { transform: translateX(14px); }
.switch input:focus-visible + .track { box-shadow: var(--ring); }

/* Mode switch + progress stay in view while the table scrolls underneath */
.toolbar {
    position: sticky; top: 0; z-index: 20; margin: 0 calc(var(--space-6) * -1) var(--space-4); padding: var(--space-3) var(--space-6);
    background: rgba(248, 250, 252, 0.94); backdrop-filter: blur(6px); border-bottom: 1px solid var(--color-border);
    display: flex; flex-direction: column; gap: var(--space-3);
}
.toolbar-top { display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap; }
.mode-note { margin: 0; color: var(--color-text-muted); font-size: 0.86rem; flex: 1; min-width: 240px; }
.toolbar-progress { display: flex; align-items: center; gap: var(--space-5); flex-wrap: wrap; }
.summary { color: var(--color-text-muted); font-size: 0.85rem; white-space: nowrap; }
.summary strong { color: var(--color-text); }
.plus { color: var(--color-accent-dark); font-weight: 600; }

.notice { background: var(--color-warning-light); border: 1px solid var(--color-warning-muted); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); margin: 0 0 var(--space-3); }
.hidden-note { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; background: var(--color-surface); border: 1px dashed var(--color-border-hover); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); color: var(--color-text-muted); font-size: 0.9rem; margin: 0 0 var(--space-4); }

.search { margin-bottom: var(--space-4); }

.section { margin-top: var(--space-5); }
.section:first-of-type { margin-top: 0; }
.section-heading { display: flex; align-items: baseline; gap: var(--space-2); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--color-text-muted); margin: 0 0 var(--space-3); padding-bottom: var(--space-1); border-bottom: 1px solid var(--color-border); }
.section-count { font-weight: 500; text-transform: none; letter-spacing: 0; color: var(--color-text-light); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: var(--space-3); align-items: stretch; }

.unplaced { list-style: none; padding: 0; display: flex; gap: var(--space-2); flex-wrap: wrap; }
.unplaced li { background: var(--color-surface-muted); padding: 0.2em 0.5em; border-radius: var(--radius-sm); display: flex; align-items: center; gap: var(--space-2); }
.x { padding: 0 6px; border-color: transparent; background: transparent; }

@media (max-width: 720px) {
    .table-view { padding: 0 var(--space-4) var(--space-5); }
    .toolbar { position: static; margin: 0 calc(var(--space-4) * -1) var(--space-4); padding: var(--space-3) var(--space-4); backdrop-filter: none; }
    .mode-note { display: none; }
    .grid { grid-template-columns: repeat(auto-fill, minmax(146px, 1fr)); }
}
</style>

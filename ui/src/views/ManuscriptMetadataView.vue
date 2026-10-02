<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useTranscriptionData } from '../composables/useTranscriptionData';
import { useManuscriptTable } from '../composables/useManuscriptTable';
import { useManuscriptMetaStore } from '../stores/manuscriptMeta';
import { useIiifStore } from '../stores/iiif';
import {
    matchesFilter, compareCells, planMap, planReplace, planImport, parseDelimited, formatDelimited, CLEAN_UP
} from '../utils/gridOps';
import { META_TYPES } from '../utils/sourceMeta';
import DataGrid from '../components/grid/DataGrid.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import SegmentedControl from '../components/ui/SegmentedControl.vue';
import StateWrapper from '../components/StateWrapper.vue';

const router = useRouter();
const { catalog, hasCorpus, loading, error } = useTranscriptionData();
const table = useManuscriptTable();
const meta = useManuscriptMetaStore();
const iiif = useIiifStore();

const GROUP_LABELS = { id: '', catalogue: 'Corpus catalogue', iiif: 'IIIF', project: 'Your fields', corpus: 'Corpus' };

// ---- what is shown --------------------------------------------------------

const search = ref('');
const quick = ref('all');
const showFilters = ref(false);
const filters = ref({});
const sort = ref({ key: 'source', dir: 'asc' });

const QUICK = [
    { value: 'all', label: 'All' },
    { value: 'edited', label: 'Edited' },
    { value: 'no-iiif', label: 'No IIIF' },
    { value: 'problems', label: 'Problems' }
];

const columns = computed(() => table.visibleColumns.value);

function rowHasProblem(id) {
    return columns.value.some(col => table.invalid(col, table.value(id, col)));
}
function rowIsEdited(id) {
    return table.columns.value.some(col => table.isEdited(id, col));
}
function rowHasIiif(id) {
    return !!table.value(id, table.columnByKey.value.get('iiif:manifest')) || !!table.value(id, table.columnByKey.value.get('iiif:state'));
}

const rowIds = computed(() => {
    const q = search.value.trim().toLowerCase();
    const textColumns = columns.value;
    const active = Object.entries(filters.value).filter(([, f]) => f && f.trim());
    const byKey = table.columnByKey.value;

    let ids = table.sources.value.filter(id => {
        if (q && !textColumns.some(col => table.value(id, col).toLowerCase().includes(q))) return false;
        for (const [key, expr] of active) {
            const col = byKey.get(key);
            if (col && !matchesFilter(table.value(id, col), expr)) return false;
        }
        if (quick.value === 'edited') return rowIsEdited(id);
        if (quick.value === 'no-iiif') return !rowHasIiif(id);
        if (quick.value === 'problems') return rowHasProblem(id);
        return true;
    });

    const col = sort.value.key && byKey.get(sort.value.key);
    if (col && sort.value.dir) {
        const desc = sort.value.dir === 'desc';
        ids = [...ids].sort((a, b) => compareCells(table.value(a, col), table.value(b, col), desc) || a.localeCompare(b, undefined, { numeric: true }));
    }
    return ids;
});

const quietRows = computed(() => new Set(table.sources.value.filter(s => !catalog.value[s])));

function cycleSort(key) {
    const s = sort.value;
    if (s.key !== key) sort.value = { key, dir: 'asc' };
    else if (s.dir === 'asc') sort.value = { key, dir: 'desc' };
    else sort.value = { key: 'source', dir: 'asc' };
}

function setFilter(key, text) {
    filters.value = { ...filters.value, [key]: text };
}

const filterCount = computed(() => Object.values(filters.value).filter(f => f && f.trim()).length);

function clearFilters() {
    filters.value = {};
    search.value = '';
    quick.value = 'all';
}

// ---- cells ------------------------------------------------------------------

const get = (id, col) => table.value(id, col);
const isEdited = (id, col) => table.isEdited(id, col);
const isInvalid = (id, col, text) => table.invalid(col, text);

// ---- changes and history ---------------------------------------------------------

const undoStack = ref([]);
const redoStack = ref([]);
const MAX_HISTORY = 200;

function carryOut(changes) {
    const byKey = table.columnByKey.value;
    for (const ch of changes) {
        const col = byKey.get(ch.colKey);
        if (col && !col.readonly) table.write(ch.rowId, col, ch.value);
    }
}

function apply(changes) {
    if (!changes.length) return;
    carryOut(changes);
    undoStack.value = [...undoStack.value.slice(-(MAX_HISTORY - 1)), changes];
    redoStack.value = [];
}

function undo() {
    const last = undoStack.value[undoStack.value.length - 1];
    if (!last) { say('Nothing to undo.'); return; }
    carryOut(last.map(ch => ({ ...ch, value: ch.before })));
    undoStack.value = undoStack.value.slice(0, -1);
    redoStack.value = [...redoStack.value, last];
    say(`Undone — ${last.length} cell${last.length === 1 ? '' : 's'}`);
}

function redo() {
    const last = redoStack.value[redoStack.value.length - 1];
    if (!last) { say('Nothing to redo.'); return; }
    carryOut(last);
    redoStack.value = redoStack.value.slice(0, -1);
    undoStack.value = [...undoStack.value, last];
    say(`Redone — ${last.length} cell${last.length === 1 ? '' : 's'}`);
}

// ---- messages -----------------------------------------------------------------------

const notice = ref('');
let noticeTimer = null;
function say(text) {
    notice.value = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.value = ''; }, 3800);
}

// ---- the selection and the formula bar -----------------------------------------------

const grid = ref(null);
const sel = ref({ rowIds: [], colKeys: [], activeRowId: undefined, activeColKey: undefined, activeText: '' });
const barText = ref('');
const barFocused = ref(false);

function onSelection(s) {
    sel.value = s;
    if (!barFocused.value) barText.value = s.activeText;
}

watch(() => sel.value.activeText, (t) => { if (!barFocused.value) barText.value = t; });

const activeColumn = computed(() => table.columnByKey.value.get(sel.value.activeColKey));
const barReadonly = computed(() => !activeColumn.value || activeColumn.value.readonly);
const cellCount = computed(() => sel.value.rowIds.length * sel.value.colKeys.length);

function commitBar() {
    const col = activeColumn.value;
    const id = sel.value.activeRowId;
    if (!col || col.readonly || id === undefined) return;
    const before = table.value(id, col);
    if (barText.value !== before) apply([{ rowId: id, colKey: col.key, before, value: barText.value }]);
}

function onBarKey(ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); commitBar(); grid.value && grid.value.focus(); }
    else if (ev.key === 'Escape') { ev.preventDefault(); barText.value = sel.value.activeText; grid.value && grid.value.focus(); }
}

// ---- a grid view of the visible table, for the bulk tools ------------------------------

function visibleAccess() {
    const ids = rowIds.value;
    const cols = columns.value;
    return {
        ids, cols,
        get: (r, c) => table.value(ids[r], cols[c]),
        isReadonly: (r, c) => !!cols[c].readonly
    };
}

function toChanges(plan, ids, cols) {
    return plan.changes.map(ch => ({ rowId: ids[ch.r], colKey: cols[ch.c].key, before: ch.before, value: ch.value }));
}

// ---- clean up ---------------------------------------------------------------------

const cleanMenu = ref(false);

function cleanUp(kind) {
    cleanMenu.value = false;
    const { ids, cols, get: g, isReadonly } = visibleAccess();
    const range = sel.value.range;
    if (!range) return;
    const plan = planMap({ range, get: g, isReadonly, fn: CLEAN_UP[kind] });
    apply(toChanges(plan, ids, cols));
    say(plan.changes.length ? `${plan.changes.length} cell${plan.changes.length === 1 ? '' : 's'} cleaned up` : 'Nothing to change in the selection.');
}

// ---- find and replace -----------------------------------------------------------------

const replaceOpen = ref(false);
const rep = ref({ find: '', replace: '', scope: 'selection', matchCase: false, wholeCell: false, regex: false });

function openReplace(scope = null) {
    if (scope) rep.value.scope = scope;
    else rep.value.scope = cellCount.value > 1 ? 'selection' : 'column';
    replaceOpen.value = true;
    nextTick(() => document.getElementById('rep-find') && document.getElementById('rep-find').focus());
}

const repRange = computed(() => {
    const n = rowIds.value.length;
    const m = columns.value.length;
    if (!n || !m) return null;
    const sr = sel.value.range;
    if (rep.value.scope === 'selection' && sr) return sr;
    if (rep.value.scope === 'column' && sr) return { r0: 0, c0: sr.c0, r1: n - 1, c1: sr.c0 };
    return { r0: 0, c0: 0, r1: n - 1, c1: m - 1 };
});

const repPlan = computed(() => {
    if (!replaceOpen.value || !repRange.value || !rep.value.find) return { changes: [] };
    const { get: g, isReadonly } = visibleAccess();
    return planReplace({ range: repRange.value, get: g, isReadonly, ...rep.value });
});

const repPreview = computed(() => repPlan.value.changes.slice(0, 5).map(ch => ({
    where: `${rowIds.value[ch.r]} · ${columns.value[ch.c].label}`, before: ch.before, after: ch.value
})));

const repScopeLabel = computed(() => {
    const sr = sel.value.range;
    const col = sr && columns.value[sr.c0];
    return {
        selection: `Selected cells (${cellCount.value})`,
        column: col ? `Column “${col.label}”` : 'Column',
        all: 'All shown rows and columns'
    };
});

function doReplace() {
    const { ids, cols } = visibleAccess();
    const changes = toChanges(repPlan.value, ids, cols);
    apply(changes);
    say(changes.length ? `${changes.length} cell${changes.length === 1 ? '' : 's'} replaced` : 'No match.');
    replaceOpen.value = false;
}

// ---- columns ---------------------------------------------------------------------------

const columnsOpen = ref(false);
const newColumn = ref({ label: '', type: 'text' });

function addColumn() {
    const label = newColumn.value.label.trim();
    if (!label) return;
    const field = table.addProjectColumn(label, newColumn.value.type);
    if (!field) { say(`There is already a column called “${label}”.`); return; }
    newColumn.value.label = '';
    say(`Column “${label}” added. Values you type are kept in your workspace and can be used as a filter on the public pages.`);
}

const columnMenu = ref(null); // { col, x, y }

function openColumnMenu({ col, rect }) {
    columnMenu.value = { col, x: Math.min(rect.left, window.innerWidth - 250), y: rect.bottom + 4 };
}

function menuSort(dir) {
    const col = columnMenu.value.col;
    sort.value = dir ? { key: col.key, dir } : { key: 'source', dir: 'asc' };
    columnMenu.value = null;
}

function menuHide() {
    table.toggleColumn(columnMenu.value.col.key);
    columnMenu.value = null;
}

function menuReplace() {
    const col = columnMenu.value.col;
    columnMenu.value = null;
    const c = columns.value.findIndex(x => x.key === col.key);
    sel.value = { ...sel.value, range: { r0: 0, c0: c, r1: Math.max(0, rowIds.value.length - 1), c1: c } };
    openReplace('column');
}

function menuRevert() {
    const col = columnMenu.value.col;
    columnMenu.value = null;
    const edited = table.sources.value.filter(id => table.isEdited(id, col));
    if (!edited.length) { say('Nothing in that column differs from the corpus.'); return; }
    apply(edited.map(id => ({ rowId: id, colKey: col.key, before: table.value(id, col), value: table.baseValue(id, col) })));
    say(`${edited.length} value${edited.length === 1 ? '' : 's'} put back to what the corpus says`);
}

function menuCopyToFilter() {
    const col = columnMenu.value.col;
    columnMenu.value = null;
    const field = table.copyToFilterColumn(col);
    say(field ? `“${col.label}” copied to a column of your own — it is now a filter on the public pages.` : `There is already a column called “${col.label}”.`);
}

function menuDelete() {
    const col = columnMenu.value.col;
    columnMenu.value = null;
    if (!window.confirm(`Delete the column “${col.label}” and the values in it?`)) return;
    table.removeProjectColumn(col);
}

function onResize(key, width, final) {
    // Live while dragging, saved when let go.
    const col = table.columnByKey.value.get(key);
    if (col) col.width = width;
    if (final) meta.setWidth(key, width);
}

// column widths the user chose
watch(() => meta.widths, (w) => {
    for (const [key, px] of Object.entries(w)) {
        const col = table.columnByKey.value.get(key);
        if (col) col.width = px;
    }
}, { immediate: true, deep: true });
watch(() => table.columns.value, () => {
    for (const [key, px] of Object.entries(meta.widths)) {
        const col = table.columnByKey.value.get(key);
        if (col) col.width = px;
    }
});

// ---- export -------------------------------------------------------------------------------

const exportOpen = ref(false);

function matrixOfView() {
    const cols = columns.value;
    return [cols.map(c => c.label), ...rowIds.value.map(id => cols.map(c => table.value(id, c)))];
}

async function copyTable() {
    exportOpen.value = false;
    try {
        await navigator.clipboard.writeText(formatDelimited(matrixOfView(), '\t'));
        say('Table copied — paste it into Excel or any spreadsheet.');
    } catch {
        say('The browser did not allow copying. Use Download instead.');
    }
}

function download(delimiter, ext, mime) {
    exportOpen.value = false;
    // A byte order mark, so Excel reads the umlauts and accents right.
    const text = `﻿${formatDelimited(matrixOfView(), delimiter)}`;
    const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `manuscript-metadata-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    say(`${rowIds.value.length} manuscripts downloaded.`);
}

// ---- import -------------------------------------------------------------------------------

const importInput = ref(null);
const importing = ref(null); // { fileName, plan, ids, cols }

async function onImportFile(ev) {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    const matrix = parseDelimited(await file.text());

    // The whole table, hidden columns included, whatever is filtered right now.
    const ids = table.sources.value;
    const cols = table.columns.value;
    const rowIndexByKey = new Map(ids.map((id, i) => [id.toLowerCase(), i]));
    const plan = planImport(matrix, {
        columns: cols, rowIndexByKey, keyColumn: 'source',
        get: (r, c) => table.value(ids[r], cols[c]),
        isReadonly: (r, c) => !!cols[c].readonly
    });
    importing.value = { fileName: file.name, plan, ids, cols };
}

function applyImport() {
    const { plan, ids, cols } = importing.value;
    const changes = toChanges(plan, ids, cols);
    apply(changes);
    importing.value = null;
    say(`${changes.length} cell${changes.length === 1 ? '' : 's'} imported`);
}

// ---- summary -------------------------------------------------------------------------------

const summary = computed(() => {
    const ids = table.sources.value;
    const manifestCol = table.columnByKey.value.get('iiif:manifest');
    const stateCol = table.columnByKey.value.get('iiif:state');
    let manifests = 0;
    let fromDocs = 0;
    let invalid = 0;
    for (const id of ids) {
        const m = table.value(id, manifestCol);
        if (m) { manifests++; if (table.invalid(manifestCol, m)) invalid++; }
        else if (table.value(id, stateCol) === 'documents') fromDocs++;
    }
    return { total: ids.length, manifests, fromDocs, invalid, edited: meta.editedCount() };
});

// ---- closing menus ----------------------------------------------------------------------------

function onDocClick(e) {
    if (!e.target.closest('.menu, .menu-anchor, .col-menu')) {
        columnMenu.value = null; columnsOpen.value = false; exportOpen.value = false; cleanMenu.value = false;
    }
}
function onDocKey(e) {
    if (e.key === 'Escape') {
        columnMenu.value = null; columnsOpen.value = false; exportOpen.value = false; cleanMenu.value = false;
        replaceOpen.value = false; importing.value = null;
    }
}
onMounted(() => { document.addEventListener('click', onDocClick); document.addEventListener('keydown', onDocKey); });
onBeforeUnmount(() => { document.removeEventListener('click', onDocClick); document.removeEventListener('keydown', onDocKey); });

const fmt = (n) => n.toLocaleString('en-US');
</script>

<template>
<div class="meta-view">
    <div class="head">
        <PageHeader title="Manuscript metadata">
            <template #subtitle>
                <p>Edit all manuscripts like a spreadsheet. Your changes stay in your workspace; the corpus stays as it was imported.</p>
            </template>
        </PageHeader>
    </div>

    <StateWrapper :loading="loading" :error="error" loadingText="Reading the loaded corpus…">
        <div v-if="!hasCorpus && table.sources.value.length === 0" class="empty">
            <h2>No manuscripts yet</h2>
            <p>The editor starts without data. Load a Monodi-Zero workspace or a Corpus Monodicum project, and its manuscripts appear here.</p>
            <button class="ne-btn ne-btn--primary" @click="router.push('/corpus')">Load data</button>
        </div>

        <template v-else>
            <div class="tools">
                <div class="tools-row">
                    <input v-model="search" type="search" class="search" placeholder="Search all columns…" aria-label="Search all columns" />
                    <SegmentedControl v-model="quick" :options="QUICK" label="Show" size="sm" />
                    <button class="ne-btn ne-btn--sm" :class="{ on: showFilters || filterCount }" :aria-pressed="showFilters" @click="showFilters = !showFilters">
                        Filters<template v-if="filterCount"> · {{ filterCount }}</template>
                    </button>
                    <button v-if="filterCount || search || quick !== 'all'" class="ne-btn ne-btn--sm ne-btn--ghost" @click="clearFilters">Clear</button>
                    <span class="spacer"></span>
                    <span class="count">{{ fmt(rowIds.length) }} of {{ fmt(table.sources.value.length) }} manuscripts</span>
                </div>

                <div class="tools-row">
                    <button class="ne-btn ne-btn--sm" :disabled="!undoStack.length" title="Undo (Ctrl+Z)" @click="undo">↶ Undo</button>
                    <button class="ne-btn ne-btn--sm" :disabled="!redoStack.length" title="Redo (Ctrl+Shift+Z)" @click="redo">↷ Redo</button>
                    <span class="divider"></span>

                    <button class="ne-btn ne-btn--sm" title="Find and replace text in the selected cells, a column or the whole table" @click="openReplace()">Find &amp; replace…</button>

                    <span class="menu-anchor">
                        <button class="ne-btn ne-btn--sm" :aria-expanded="cleanMenu" title="Tidy the selected cells" @click.stop="cleanMenu = !cleanMenu; exportOpen = false; columnsOpen = false">Clean up ▾</button>
                        <div v-if="cleanMenu" class="menu" @click.stop>
                            <p class="menu-note">Applies to the selected cells</p>
                            <button @click="cleanUp('trim')">Trim extra spaces</button>
                            <button @click="cleanUp('title')">Title Case</button>
                            <button @click="cleanUp('upper')">UPPER CASE</button>
                            <button @click="cleanUp('lower')">lower case</button>
                        </div>
                    </span>

                    <span class="menu-anchor">
                        <button class="ne-btn ne-btn--sm" :aria-expanded="columnsOpen" @click.stop="columnsOpen = !columnsOpen; exportOpen = false; cleanMenu = false">Columns ▾</button>
                        <div v-if="columnsOpen" class="menu menu--wide" @click.stop>
                            <div class="menu-scroll">
                                <label v-for="col in table.columns.value.filter(c => !c.frozen)" :key="col.key" class="check">
                                    <input type="checkbox" :checked="columns.some(c => c.key === col.key)" @change="table.toggleColumn(col.key)" />
                                    {{ col.label }}
                                    <span class="tag" :class="`tag--${col.group}`">{{ GROUP_LABELS[col.group] || '' }}</span>
                                </label>
                            </div>
                            <div class="menu-foot">
                                <button class="link" @click="table.showAllColumns()">Show all</button>
                                <button class="link" @click="meta.setHidden(table.columns.value.filter(c => c.hiddenByDefault).map(c => c.key))">Reset</button>
                            </div>
                            <div class="add-column">
                                <p class="menu-note">Add a column of your own</p>
                                <div class="add-row">
                                    <input v-model="newColumn.label" placeholder="Name, e.g. Notation type" @keydown.enter="addColumn" />
                                    <select v-model="newColumn.type" :title="META_TYPES.find(t => t.key === newColumn.type).hint">
                                        <option v-for="t in META_TYPES" :key="t.key" :value="t.key">{{ t.label }}</option>
                                    </select>
                                    <button class="ne-btn ne-btn--sm ne-btn--primary" :disabled="!newColumn.label.trim()" @click="addColumn">Add</button>
                                </div>
                            </div>
                        </div>
                    </span>

                    <span class="divider"></span>
                    <button class="ne-btn ne-btn--sm" title="Fill a table from a CSV or tab-separated file; rows are matched by siglum" @click="importInput.click()">Import…</button>
                    <input ref="importInput" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" hidden @change="onImportFile" />

                    <span class="menu-anchor">
                        <button class="ne-btn ne-btn--sm" :aria-expanded="exportOpen" @click.stop="exportOpen = !exportOpen; columnsOpen = false; cleanMenu = false">Export ▾</button>
                        <div v-if="exportOpen" class="menu" @click.stop>
                            <p class="menu-note">The rows and columns shown</p>
                            <button @click="copyTable">Copy to clipboard (for Excel)</button>
                            <button @click="download(',', 'csv', 'text/csv')">Download CSV</button>
                            <button @click="download(';', 'csv', 'text/csv')">Download CSV (semicolon — German Excel)</button>
                            <button @click="download('\t', 'tsv', 'text/tab-separated-values')">Download TSV</button>
                        </div>
                    </span>
                    <span class="spacer"></span>
                    <span class="hints" title="Excel-style: arrows, Enter, Tab, F2, typing, Ctrl+C / X / V, Ctrl+D fill down, Ctrl+R fill right, Delete, Ctrl+Z">Keyboard works like Excel — <kbd>F2</kbd> edit, <kbd>Ctrl</kbd>+<kbd>D</kbd> fill down</span>
                </div>

                <div class="formula" :class="{ readonly: barReadonly }">
                    <span class="where">
                        <template v-if="sel.activeRowId !== undefined && activeColumn">{{ sel.activeRowId }} · {{ activeColumn.label }}</template>
                        <template v-else>—</template>
                    </span>
                    <input
                        v-model="barText"
                        class="bar"
                        :readonly="barReadonly"
                        :placeholder="barReadonly ? 'This value is calculated and cannot be edited' : 'Value of the selected cell'"
                        aria-label="Value of the selected cell"
                        @focus="barFocused = true"
                        @blur="barFocused = false; commitBar()"
                        @keydown="onBarKey"
                    />
                </div>
            </div>

            <div class="iiif-note" v-if="summary.total">
                <span><strong>{{ summary.manifests }}</strong> manuscript{{ summary.manifests === 1 ? '' : 's' }} with a IIIF manifest</span>
                <span v-if="summary.fromDocs"><strong>{{ summary.fromDocs }}</strong> show pages from addresses in the corpus's document metadata</span>
                <span v-if="summary.invalid" class="bad"><strong>{{ summary.invalid }}</strong> address{{ summary.invalid === 1 ? ' is' : 'es are' }} not a web address</span>
                <span v-if="summary.edited"><strong>{{ summary.edited }}</strong> edited value{{ summary.edited === 1 ? '' : 's' }}</span>
            </div>

            <div class="grid-wrap">
                <DataGrid
                    ref="grid"
                    :columns="columns"
                    :row-ids="rowIds"
                    :get="get"
                    :is-edited="isEdited"
                    :is-invalid="isInvalid"
                    :suggest="table.suggestions"
                    :sort="sort"
                    :filters="filters"
                    :show-filters="showFilters"
                    :group-labels="GROUP_LABELS"
                    :quiet-rows="quietRows"
                    @commit="apply"
                    @sort="cycleSort"
                    @filter="setFilter"
                    @column-menu="openColumnMenu"
                    @resize="onResize"
                    @selection="onSelection"
                    @undo="undo"
                    @redo="redo"
                    @notice="say"
                />
            </div>

            <div class="status">
                <span v-if="cellCount > 1">{{ fmt(cellCount) }} cells selected</span>
                <span v-else>Click a cell to select it, double-click or press F2 to edit</span>
                <span class="grow"></span>
                <span v-if="quietRows.size" class="dim">Italic rows are not in the loaded corpus right now</span>
            </div>
        </template>
    </StateWrapper>

    <!-- column menu -->
    <div v-if="columnMenu" class="menu menu--float" :style="{ left: columnMenu.x + 'px', top: columnMenu.y + 'px' }" @click.stop>
        <p class="menu-title">{{ columnMenu.col.label }}</p>
        <button @click="menuSort('asc')">Sort A → Z</button>
        <button @click="menuSort('desc')">Sort Z → A</button>
        <button @click="menuSort('')">Clear sort</button>
        <hr />
        <button v-if="!columnMenu.col.readonly" @click="menuReplace">Find &amp; replace in this column…</button>
        <button v-if="columnMenu.col.group === 'catalogue' || columnMenu.col.key === 'iiif:manifest'" @click="menuRevert">Put back to what the corpus says</button>
        <button v-if="columnMenu.col.group === 'catalogue'" @click="menuCopyToFilter" title="Makes a column of your own with the same values, usable as a filter on the public pages">Copy to a filter column of my own</button>
        <button v-if="!columnMenu.col.frozen" @click="menuHide">Hide this column</button>
        <button v-if="columnMenu.col.removable" class="danger" @click="menuDelete">Delete this column…</button>
    </div>

    <!-- find and replace -->
    <div v-if="replaceOpen" class="overlay" @click.self="replaceOpen = false">
        <section class="dialog" role="dialog" aria-modal="true" aria-label="Find and replace">
            <header><h2>Find &amp; replace</h2><button class="ne-btn ne-btn--ghost" aria-label="Close" @click="replaceOpen = false">✕</button></header>
            <div class="dialog-body">
                <label class="field">Find
                    <input id="rep-find" v-model="rep.find" placeholder="Text to find" @keydown.enter="doReplace" />
                </label>
                <label class="field">Replace with
                    <input v-model="rep.replace" placeholder="Leave empty to remove the text" @keydown.enter="doReplace" />
                </label>
                <label class="field">Where
                    <select v-model="rep.scope">
                        <option value="selection">{{ repScopeLabel.selection }}</option>
                        <option value="column">{{ repScopeLabel.column }}</option>
                        <option value="all">{{ repScopeLabel.all }}</option>
                    </select>
                </label>
                <div class="opts">
                    <label><input type="checkbox" v-model="rep.matchCase" /> Match case</label>
                    <label><input type="checkbox" v-model="rep.wholeCell" /> Whole cell only</label>
                    <label><input type="checkbox" v-model="rep.regex" /> Pattern (regular expression)</label>
                </div>
                <p v-if="repPlan.error" class="bad">{{ repPlan.error }}</p>
                <p v-else-if="rep.find" class="found"><strong>{{ repPlan.changes.length }}</strong> cell{{ repPlan.changes.length === 1 ? '' : 's' }} will change</p>
                <ul v-if="repPreview.length" class="preview">
                    <li v-for="(p, i) in repPreview" :key="i"><span class="where">{{ p.where }}</span><span class="from">{{ p.before }}</span><span class="arrow">→</span><span class="to">{{ p.after }}</span></li>
                </ul>
                <p class="note">Read-only columns are never changed. You can undo the whole replacement in one step.</p>
            </div>
            <footer>
                <button class="ne-btn" @click="replaceOpen = false">Cancel</button>
                <button class="ne-btn ne-btn--primary" :disabled="!repPlan.changes.length" @click="doReplace">Replace {{ repPlan.changes.length || '' }}</button>
            </footer>
        </section>
    </div>

    <!-- import -->
    <div v-if="importing" class="overlay" @click.self="importing = null">
        <section class="dialog" role="dialog" aria-modal="true" aria-label="Import a table">
            <header><h2>Import {{ importing.fileName }}</h2><button class="ne-btn ne-btn--ghost" aria-label="Close" @click="importing = null">✕</button></header>
            <div class="dialog-body">
                <p v-if="importing.plan.error" class="bad">{{ importing.plan.error }}</p>
                <template v-else>
                    <p class="found">
                        <strong>{{ importing.plan.matchedRows }}</strong> manuscript{{ importing.plan.matchedRows === 1 ? '' : 's' }} found,
                        <strong>{{ importing.plan.changes.length }}</strong> cell{{ importing.plan.changes.length === 1 ? '' : 's' }} will change.
                    </p>
                    <p v-if="importing.plan.unmatchedRows.length" class="note">
                        Not in the table, left out ({{ importing.plan.unmatchedRows.length }}): {{ importing.plan.unmatchedRows.slice(0, 8).join(', ') }}<template v-if="importing.plan.unmatchedRows.length > 8">, …</template>
                    </p>
                    <p v-if="importing.plan.unknownColumns.length" class="note">
                        No column of that name, left out: {{ importing.plan.unknownColumns.join(', ') }}
                    </p>
                    <p v-if="importing.plan.readonlyColumns.length" class="note">
                        Calculated columns are never changed: {{ importing.plan.readonlyColumns.join(', ') }}
                    </p>
                    <p class="note">The first row must name the columns, and one of them must be “Siglum”. Cells you leave empty in the file empty the cell. You can undo the whole import in one step.</p>
                </template>
            </div>
            <footer>
                <button class="ne-btn" @click="importing = null">Cancel</button>
                <button v-if="!importing.plan.error" class="ne-btn ne-btn--primary" :disabled="!importing.plan.changes.length" @click="applyImport">Import {{ importing.plan.changes.length || '' }}</button>
            </footer>
        </section>
    </div>

    <Transition name="toast">
        <div v-if="notice" class="toast" role="status" aria-live="polite">{{ notice }}</div>
    </Transition>
</div>
</template>

<style scoped>
.meta-view { height: 100%; box-sizing: border-box; padding: 0 var(--space-5) var(--space-3); display: flex; flex-direction: column; min-height: 0; }
.head { flex: 0 0 auto; padding-top: var(--space-4); }
.head :deep(.page-header) { margin-bottom: var(--space-3); }
.head :deep(h1) { font-size: 1.5rem; }
.head :deep(.ph-sub) { font-size: 0.9rem; }

.tools { flex: 0 0 auto; display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-2); }
.tools-row { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.search { padding: 0.35em 0.8em; border: 1px solid var(--color-border-hover); border-radius: var(--radius-md); width: 260px; max-width: 100%; font-size: 0.88rem; background: var(--color-surface); }
.spacer { flex: 1; }
.count { color: var(--color-text-muted); font-size: 0.82rem; white-space: nowrap; }
.divider { width: 1px; height: 20px; background: var(--color-border); margin: 0 var(--space-1); }
.ne-btn.on { background: var(--color-primary-light); border-color: var(--color-primary-muted); color: var(--color-primary-dark); }
.hints { color: var(--color-text-light); font-size: 0.76rem; }
kbd { font-family: inherit; font-size: 0.72rem; background: var(--color-surface-muted); border: 1px solid var(--color-border); border-bottom-width: 2px; border-radius: 4px; padding: 0 4px; }

.formula { display: flex; align-items: stretch; border: 1px solid var(--color-border-hover); border-radius: var(--radius-md); background: var(--color-surface); overflow: hidden; }
.formula .where { flex: 0 0 auto; min-width: 190px; max-width: 320px; padding: 0.35em 0.8em; background: var(--color-surface-muted); border-right: 1px solid var(--color-border); font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.formula .bar { flex: 1; min-width: 0; border: none; padding: 0.35em 0.8em; font-size: 0.88rem; outline: none; background: transparent; }
.formula:focus-within { box-shadow: var(--ring); }
.formula.readonly .bar { color: var(--color-text-muted); background: #fafbfc; }

.iiif-note { flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); font-size: 0.8rem; color: var(--color-text-muted); margin-bottom: var(--space-2); }
.iiif-note strong { color: var(--color-text); }
.iiif-note .bad, .bad { color: var(--color-danger); }

.grid-wrap { flex: 1; min-height: 0; }
.status { flex: 0 0 auto; display: flex; gap: var(--space-4); padding-top: var(--space-1); font-size: 0.78rem; color: var(--color-text-muted); }
.status .grow { flex: 1; }
.dim { color: var(--color-text-light); }

.empty { text-align: center; padding: var(--space-6) var(--space-4); max-width: 480px; margin: 0 auto; }
.empty p { color: var(--color-text-muted); }

/* menus */
.menu-anchor { position: relative; display: inline-block; }
.menu { position: absolute; top: calc(100% + 4px); left: 0; z-index: 300; min-width: 230px; padding: 6px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); display: flex; flex-direction: column; }
.menu--wide { min-width: 340px; }
.menu--float { position: fixed; }
.menu button:not(.ne-btn):not(.link) { text-align: left; border: none; background: transparent; padding: 0.45em 0.7em; border-radius: var(--radius-sm); font-size: 0.86rem; }
.menu button:not(.ne-btn):not(.link):hover { background: var(--color-primary-light); }
.menu button.danger { color: var(--color-danger); }
.menu button.danger:hover { background: var(--color-danger-light); }
.menu hr { border: none; border-top: 1px solid var(--color-border); margin: 4px 0; width: 100%; }
.menu-title { margin: 2px 8px 4px; font-weight: 700; font-size: 0.82rem; }
.menu-note { margin: 2px 8px 4px; font-size: 0.72rem; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.menu-scroll { max-height: 280px; overflow-y: auto; }
.check { display: flex; align-items: center; gap: var(--space-2); padding: 0.3em 0.7em; font-size: 0.86rem; cursor: pointer; }
.check:hover { background: var(--color-surface-muted); }
.tag { margin-left: auto; font-size: 0.66rem; padding: 0 6px; border-radius: 999px; background: var(--color-surface-muted); color: var(--color-text-muted); }
.tag--catalogue { background: #eef2ff; color: #3730a3; }
.tag--iiif { background: #ecfeff; color: #155e75; }
.tag--project { background: var(--color-accent-light); color: var(--color-accent-dark); }
.menu-foot { display: flex; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-top: 1px solid var(--color-border); }
.link { border: none; background: none; padding: 0; color: var(--color-primary); font-size: 0.82rem; }
.link:hover { background: none; text-decoration: underline; }
.add-column { border-top: 1px solid var(--color-border); padding-top: var(--space-1); }
.add-row { display: flex; gap: var(--space-2); padding: var(--space-1) var(--space-2) var(--space-2); }
.add-row input { flex: 1; min-width: 0; padding: 0.3em 0.6em; border: 1px solid var(--color-border-hover); border-radius: var(--radius-sm); font-size: 0.84rem; }
.add-row select { padding: 0.3em; border: 1px solid var(--color-border-hover); border-radius: var(--radius-sm); font-size: 0.82rem; max-width: 110px; }

/* dialogs */
.overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); display: flex; align-items: center; justify-content: center; z-index: 400; padding: var(--space-4); }
.dialog { background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); width: min(560px, 100%); max-height: 88vh; display: flex; flex-direction: column; }
.dialog header { display: flex; justify-content: space-between; align-items: center; padding: var(--space-3) var(--space-4) var(--space-2); }
.dialog h2 { margin: 0; font-size: 1.1rem; }
.dialog-body { padding: 0 var(--space-4) var(--space-3); overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-3); }
.dialog footer { display: flex; justify-content: flex-end; gap: var(--space-2); padding: var(--space-3) var(--space-4); border-top: 1px solid var(--color-border); }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 0.82rem; font-weight: 600; color: var(--color-text-muted); }
.field input, .field select { padding: 0.45em 0.7em; border: 1px solid var(--color-border-hover); border-radius: var(--radius-md); font-size: 0.92rem; font-weight: 400; color: var(--color-text); }
.opts { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); font-size: 0.85rem; }
.opts label { display: inline-flex; align-items: center; gap: 6px; }
.found { margin: 0; font-size: 0.9rem; }
.note { margin: 0; font-size: 0.8rem; color: var(--color-text-muted); }
.preview { list-style: none; margin: 0; padding: 0; font-size: 0.8rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
.preview li { display: grid; grid-template-columns: 1.2fr 1fr auto 1fr; gap: var(--space-2); padding: 4px 8px; border-bottom: 1px solid var(--color-surface-muted); align-items: center; }
.preview li:last-child { border-bottom: none; }
.preview .where { color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.preview .from { color: var(--color-danger); text-decoration: line-through; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.preview .to { color: var(--color-success-dark); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* toast */
.toast { position: fixed; left: 50%; transform: translateX(-50%); bottom: 52px; z-index: 500; max-width: min(92vw, 560px); padding: var(--space-2) var(--space-4); border-radius: var(--radius-lg); background: #0f172a; color: #f1f5f9; box-shadow: var(--shadow-lg); font-size: 0.88rem; }
.toast-enter-active, .toast-leave-active { transition: opacity 0.2s, transform 0.2s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(10px); }

@media (max-width: 720px) { .meta-view { padding: 0 var(--space-3) var(--space-2); } .hints { display: none; } }
</style>

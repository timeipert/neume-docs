<script setup>
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import SegmentedControl from '../../components/ui/SegmentedControl.vue';
import SnippetDialog from '../../components/docs/SnippetDialog.vue';
import DocPattern from '../../components/docs/DocPattern.vue';
import DocSnippet from '../../components/docs/DocSnippet.vue';
import { useDocs } from '../../composables/useDocsContext';
import { useHighlight } from '../../composables/useHighlight';
import { loadAllManuscripts } from '../../composables/useDocumentations';
import cmReference from '../../data/cmReference.json';
import { decodeFilter, describeRule, filterRows, fold } from '../../utils/manuscriptFilter';
import { buildColumns, buildFrequency, columnFor, defaultTier, groupColumns, sortCodes } from '../../utils/neumeTable';
import { buildPatternHierarchy, getBaseCode } from '../../utils/patternCode';
import { compareChantPatterns } from '../../utils/sorting';

/**
 * The comparison table of a documentation: manuscripts as rows, neume shapes as columns, every cell
 * the snippets of that manuscript for that shape. The columns follow the order of the Corpus
 * Monodicum (number of tones, then how often a shape occurs there). A selection made in the manuscripts
 * list (`f`) or here (`only`) limits the rows; `ms`, `col` and `mode` in the address bring a row,
 * a column or a cell into view.
 */
const docs = useDocs();
const route = useRoute();
const router = useRouter();

const freq = buildFrequency(cmReference.patterns);

const MODES = [
    { value: 'standard', label: 'Standard table', title: 'The standard selection of every manuscript, in the fixed columns' },
    { value: 'expanded', label: 'Expanded documentation', title: 'The standard table plus whatever each manuscript documents beyond it' },
    { value: 'codes', label: 'All codes', title: 'Every pattern code as a column of its own' }
];

const q = (name) => (typeof route.query[name] === 'string' ? route.query[name] : '');
const mode = computed({
    get: () => (MODES.some(m => m.value === q('mode')) ? q('mode') : 'standard'),
    set: (m) => router.replace({ query: { ...route.query, mode: m === 'standard' ? undefined : m } })
});
const columnMode = computed(() => (mode.value === 'standard' ? 'standard' : 'expanded'));

// what the reader sets for looking at the table
const colSearch = ref('');
const size = ref(80);               // the width of a snippet, in pixels
const onlyWithSnippets = ref(true); // in the expanded table: leave out the extra columns nothing is in
const sortMode = ref('tones');      // the order of the codes in "All codes"
const onlyStarred = ref(false);
const SORTS = [
    { value: 'tones', label: 'Tones, then frequency in the CM' },
    { value: 'freq', label: 'Frequency here' },
    { value: 'length', label: 'Neume length' },
    { value: 'alpha', label: 'Alphabetical (ignoring [ ])' },
    { value: 'id', label: 'Pattern code' }
];

const targetMs = computed(() => q('ms'));
const targetCol = computed(() => q('col') || q('pattern'));

// ---- the manuscripts shown ------------------------------------------------------------------

const filter = computed(() => decodeFilter(q('f')));
const only = computed(() => new Set(q('only').split(',').filter(Boolean)));
const metaOf = (id, key) => (docs.entry(id) || { meta: {} }).meta[key] || '';

const shown = computed(() => {
    const ids = docs.entries.value.map(e => e.id);
    const filtered = Object.keys(filter.value.rules).length ? filterRows(filter.value, ids, metaOf) : ids;
    const set = new Set(filtered);
    return docs.entries.value.filter(e => set.has(e.id) && (!only.value.size || only.value.has(e.id)));
});

const selectionText = computed(() => Object.entries(filter.value.rules).map(([k, r]) => `${docs.columnLabel(k)}: ${describeRule(r)}`).join('; '));

function setOnly(set) {
    router.replace({ query: { ...route.query, only: set.size ? [...set].join(',') : undefined } });
}
function toggleOnly(id) {
    const next = new Set(only.value);
    if (next.has(id)) next.delete(id); else next.add(id);
    setOnly(next);
}
function clearSelection() { router.replace({ query: { ...route.query, f: undefined, only: undefined } }); }

const picking = ref(false);
const pickSearch = ref('');
const pickable = computed(() => {
    const term = fold(pickSearch.value);
    return docs.entries.value.filter(e => !term || fold(`${e.source} ${e.name}`).includes(term));
});

// ---- the files --------------------------------------------------------------------------------------

const loading = ref(true);
watch(() => docs.state.value, async (state) => {
    loading.value = true;
    await loadAllManuscripts(state);
    loading.value = false;
}, { immediate: true });

const slotOf = (id) => docs.state.value.manuscripts[id];
const dataOf = (id) => {
    const slot = slotOf(id);
    return slot && slot.status === 'ready' ? slot.data : null;
};
const failed = computed(() => shown.value.filter(e => { const s = slotOf(e.id); return s && s.status === 'error'; }));

// ---- what is in each cell ------------------------------------------------------------------------------

/** Whether a manuscript shows a pattern in this view: the standard table shows its standard selection. */
function shows(data, pattern) {
    if (mode.value !== 'standard') return true;
    const base = getBaseCode(pattern);
    const row = data.rows.find(r => r.pattern === pattern || r.pattern === base);
    return ((row && row.tier) || defaultTier(base)) === 'standard';
}

/** { [entry id]: { [column key]: snippets[] } } and the patterns in play. */
const cells = computed(() => {
    const out = {};
    const inPlay = new Set();
    for (const e of shown.value) {
        const data = dataOf(e.id);
        const byColumn = {};
        if (data) {
            for (const s of data.snippets) {
                if (!shows(data, s.pattern)) continue;
                if (onlyStarred.value && !docs.stars.has(e.id, s.id)) continue;
                const col = mode.value === 'codes' ? { key: s.pattern } : columnFor(s.pattern, columnMode.value);
                if (!col) continue;
                inPlay.add(mode.value === 'codes' ? s.pattern : getBaseCode(s.pattern));
                (byColumn[col.key] || (byColumn[col.key] = [])).push(s);
            }
        }
        out[e.id] = byColumn;
    }
    return { byEntry: out, inPlay };
});

const columnGroups = computed(() => {
    const { byEntry, inPlay } = cells.value;
    const hasContent = (col) => shown.value.some(e => (byEntry[e.id] || {})[col.key]);
    const q = colSearch.value.trim().toLowerCase();
    const matches = (col) => !q || `${col.header} ${col.pattern || ''}`.toLowerCase().includes(q);

    if (mode.value === 'codes') {
        // how often each code occurs in what is shown, for the orders that need it
        const counts = new Map();
        for (const e of shown.value) for (const [code, list] of Object.entries(cells.value.byEntry[e.id] || {})) counts.set(code, (counts.get(code) || 0) + list.length);
        const codes = [...inPlay].filter(c => !q || c.toLowerCase().includes(q));
        const ordered = sortMode.value === 'tones' ? sortCodes(codes, freq) : [...codes].sort((a, b) => compareChantPatterns(a, b, sortMode.value, counts));
        const rank = new Map(ordered.map((c, i) => [c, i]));
        // the hierarchy of the pattern library: direction, ligature, modifiers
        const tree = buildPatternHierarchy(ordered, { signKeys: Object.keys(docs.signs.value), customSigns: docs.signList.value, compare: (a, b) => rank.get(a) - rank.get(b) });
        const groups = [];
        for (const dir of tree) for (const lig of dir.groups) for (const mod of lig.groups) {
            groups.push({
                key: `${dir.key}/${lig.key}/${mod.key}`,
                label: `${dir.label} · ${lig.label}${mod.key === '_base' ? '' : ` · ${mod.label}`}`,
                columns: mod.codes.map(code => ({ key: code, header: code, pattern: code }))
            });
        }
        return groups;
    }

    let cols = buildColumns(columnMode.value, inPlay, freq);
    // The standard table always has its columns — that fixed layout is the point of it; extras only if they hold something.
    if (mode.value === 'expanded' && onlyWithSnippets.value) {
        const standard = new Set(buildColumns('standard', [], freq).map(c => c.key));
        cols = cols.filter(c => standard.has(c.key) || hasContent(c));
    }
    return groupColumns(cols.filter(matches));
});
const columnCount = computed(() => columnGroups.value.reduce((n, g) => n + g.columns.length, 0));

const collapsed = ref(new Set());
function expandAll() { collapsed.value = new Set(); }
function collapseAll() { collapsed.value = new Set(columnGroups.value.map(g => g.key)); }

function toggleGroup(key) {
    const next = new Set(collapsed.value);
    if (next.has(key)) next.delete(key); else next.add(key);
    collapsed.value = next;
}
const open = (key) => !collapsed.value.has(key);

// ---- looking and referring ---------------------------------------------------------------------------------

const looking = ref(null); // { snippet, entry, list }
const MORE = 6;
const expanded = ref(new Set());

const cellKey = (e, col) => `${e.id}|${col.key}`;
const snippetsIn = (e, col) => (cells.value.byEntry[e.id] || {})[col.key] || [];
const visibleIn = (e, col) => (expanded.value.has(cellKey(e, col)) ? snippetsIn(e, col) : snippetsIn(e, col).slice(0, MORE));
function expand(e, col) { expanded.value = new Set([...expanded.value, cellKey(e, col)]); }

const isTargetRow = (e) => targetMs.value === e.id;
const isTargetCol = (col) => !!targetCol.value && (targetCol.value === col.key || targetCol.value === col.pattern);
const isTargetCell = (e, col) => isTargetRow(e) && isTargetCol(col);

const tableQuery = (extra) => ({ mode: mode.value === 'standard' ? undefined : mode.value, f: q('f') || undefined, only: q('only') || undefined, ...extra });

function citeCell(e, col) {
    docs.cite({ kind: 'cell', source: e.source, entryId: e.id, pattern: col.pattern || col.header }, '/table', tableQuery({ ms: e.id, col: col.key }));
}
function citeColumn(col) {
    docs.cite({ kind: 'pattern-column', pattern: col.pattern || col.header }, '/table', tableQuery({ col: col.key }));
}
function citeRow(e) {
    docs.cite({ kind: 'manuscript', source: e.source, entryId: e.id }, '/table', tableQuery({ ms: e.id }));
}

const ready = computed(() => !loading.value && columnCount.value > 0);
useHighlight(ready);
</script>

<template>
<div class="table-page">
    <div class="tools">
        <SegmentedControl v-model="mode" :options="MODES" label="Table view" size="sm" />
        <span class="hint">
            <template v-if="mode === 'standard'">The standard selection of every manuscript.</template>
            <template v-else-if="mode === 'expanded'">The standard table plus what each manuscript documents beyond it.</template>
            <template v-else>Every pattern code as a column of its own.</template>
        </span>
        <span class="grow"></span>
        <span class="count">{{ shown.length }} of {{ docs.entries.value.length }} manuscripts · {{ columnCount }} column{{ columnCount === 1 ? '' : 's' }}</span>
        <button type="button" class="ne-btn ne-btn--sm" :aria-expanded="picking" @click="picking = !picking">
            Manuscripts: {{ only.size ? `${only.size} chosen` : 'all' }} <span aria-hidden="true">{{ picking ? '▴' : '▾' }}</span>
        </button>
    </div>

    <div class="tools tools--sub">
        <div class="find">
            <input v-model="colSearch" type="search" class="ne-input" placeholder="Find a column: *u, *uudd, [*ud]…" aria-label="Find a column" @keydown.esc="colSearch = ''" />
        </div>
        <label class="inline">Snippet size
            <input v-model.number="size" type="range" min="48" max="160" step="8" aria-label="Snippet size" /> <span class="px">{{ size }}px</span>
        </label>
        <label v-if="mode === 'expanded'" class="ne-check small" title="Leave out the extra columns that nothing is in"><input v-model="onlyWithSnippets" type="checkbox" /> Only columns with snippets</label>
        <label v-if="mode === 'codes'" class="inline">Order
            <select v-model="sortMode" class="ne-input"><option v-for="o in SORTS" :key="o.value" :value="o.value">{{ o.label }}</option></select>
        </label>
        <label v-if="docs.stars.count.value" class="ne-check small"><input v-model="onlyStarred" type="checkbox" /> Only starred ({{ docs.stars.count.value }})</label>
        <span class="grow"></span>
        <button type="button" class="link" @click="expandAll">Expand all</button>
        <button type="button" class="link" @click="collapseAll">Fold all</button>
    </div>

    <div v-if="selectionText" class="selection ne-note ne-note--info">
        <span>Selection from the manuscripts list: <strong>{{ selectionText }}</strong></span>
        <RouterLink :to="{ name: 'docs_catalogue', params: { endpoint: docs.id.value }, query: { f: q('f') } }" class="link">Change it</RouterLink>
        <button type="button" class="link" @click="clearSelection">Show all</button>
    </div>

    <div v-if="picking" class="picker">
        <input v-if="docs.entries.value.length > 8" v-model="pickSearch" type="search" class="ne-input" placeholder="Find a manuscript…" aria-label="Find a manuscript" />
        <div class="pills">
            <button type="button" class="pill" :class="{ on: !only.size }" @click="setOnly(new Set())">All ({{ docs.entries.value.length }})</button>
            <button v-for="e in pickable" :key="e.id" type="button" class="pill" :class="{ on: only.has(e.id) }" :aria-pressed="only.has(e.id)" @click="toggleOnly(e.id)">{{ e.source }}</button>
            <span v-if="!pickable.length" class="hint">No manuscript matches.</span>
        </div>
    </div>

    <p v-if="failed.length" class="ne-note ne-note--warn">
        {{ failed.length }} manuscript file{{ failed.length === 1 ? '' : 's' }} could not be read ({{ failed.map(e => e.source).join(', ') }}); the table is without {{ failed.length === 1 ? 'it' : 'them' }}.
    </p>

    <p v-if="loading" class="status" role="status">Reading the manuscripts…</p>
    <p v-else-if="!shown.length" class="ne-empty">No manuscript is selected. <button type="button" class="link" @click="clearSelection">Show all</button></p>
    <p v-else-if="!columnCount" class="ne-empty">None of these manuscripts has snippets for this view. Try “Expanded documentation”.</p>

    <div v-else class="matrix-wrap">
        <table class="matrix">
            <thead>
                <tr class="groups">
                    <th class="corner sticky"></th>
                    <th v-for="g in columnGroups" :key="g.key" :colspan="open(g.key) ? g.columns.length : 1" class="group" :class="{ closed: !open(g.key) }" :title="open(g.key) ? 'Fold this group away' : `Show ${g.label}`" @click="toggleGroup(g.key)">
                        <span class="caret" aria-hidden="true">{{ open(g.key) ? '▾' : '▸' }}</span> {{ g.label }} <span class="n">{{ g.columns.length }}</span>
                    </th>
                </tr>
                <tr>
                    <th class="corner sticky"><span>Manuscript \ Pattern</span></th>
                    <template v-for="g in columnGroups" :key="g.key">
                        <th v-if="!open(g.key)" class="folded"></th>
                        <th v-else v-for="col in g.columns" :key="col.key" class="pattern" :class="{ 'is-target': isTargetCol(col) }" :data-target="isTargetCol(col) && !targetMs ? 'true' : null">
                            <div class="head-box">
                                <DocPattern v-if="col.pattern" :pattern="col.pattern" :signs="docs.signs.value" />
                                <span v-else class="pseudo" :title="col.label">{{ col.header }}</span>
                                <button type="button" class="ref-btn" :aria-label="`Link to and cite the column ${col.header}`" title="Link and cite this column" @click="citeColumn(col)">⛓</button>
                            </div>
                        </th>
                    </template>
                </tr>
            </thead>
            <tbody>
                <tr v-for="e in shown" :key="e.id" :class="{ 'row-target': isTargetRow(e) }">
                    <th scope="row" class="ms sticky" :class="{ 'is-target': isTargetRow(e) && !targetCol }" :data-target="isTargetRow(e) && !targetCol ? 'true' : null">
                        <RouterLink :to="docs.manuscriptPath(e.id)" class="ms-link"><strong>{{ e.source }}</strong> <span aria-hidden="true">→</span></RouterLink>
                        <span v-if="e.name && e.name !== e.source" class="sub">{{ e.name }}</span>
                        <button type="button" class="ref-btn" :aria-label="`Link to and cite ${e.source}`" title="Link and cite this manuscript" @click="citeRow(e)">⛓</button>
                    </th>
                    <template v-for="g in columnGroups" :key="g.key">
                        <td v-if="!open(g.key)" class="folded"></td>
                        <td v-else v-for="col in g.columns" :key="col.key" class="cell" :class="{ 'is-target': isTargetCell(e, col), 'in-row': isTargetRow(e), 'in-col': isTargetCol(col) }" :data-target="isTargetCell(e, col) ? 'true' : null">
                            <div v-if="snippetsIn(e, col).length" class="snips">
                                <span v-for="s in visibleIn(e, col)" :key="s.id" class="snip-wrap">
                                <button type="button" class="snip" :title="`${s.refId}${s.folio ? ` · f. ${s.folio}` : ''}`" @click="looking = { snippet: s, entry: e, list: snippetsIn(e, col) }">
                                    <DocSnippet :snippet="s" :width="size" />
                                    <span class="snip-id">{{ s.refId }}</span>
                                </button>
                                <button type="button" class="snip-star" :class="{ on: docs.stars.has(e.id, s.id) }" :aria-pressed="docs.stars.has(e.id, s.id)" :aria-label="docs.stars.has(e.id, s.id) ? `Remove the star from ${s.refId}` : `Star ${s.refId}`" @click.stop="docs.stars.toggle(e.id, s.id)">{{ docs.stars.has(e.id, s.id) ? '★' : '☆' }}</button>
                                </span>
                                <button v-if="snippetsIn(e, col).length > visibleIn(e, col).length" type="button" class="more" @click="expand(e, col)">+{{ snippetsIn(e, col).length - MORE }}</button>
                                <button type="button" class="ref-btn cell-ref" :aria-label="`Link to and cite this cell: ${e.source}, ${col.header}`" title="Link and cite this cell" @click="citeCell(e, col)">⛓</button>
                            </div>
                            <span v-else class="dash">—</span>
                        </td>
                    </template>
                </tr>
            </tbody>
        </table>
    </div>

    <SnippetDialog :snippet="looking && looking.snippet" :entry="looking ? looking.entry : { id: '', source: '' }" :siblings="looking ? looking.list : []" @close="looking = null" @step="s => (looking = { ...looking, snippet: s })" />
</div>
</template>

<style scoped>
.table-page { display: flex; flex-direction: column; gap: var(--space-3); }
.tools { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.hint { font-size: 0.84rem; color: var(--color-text-muted); }
.grow { flex: 1; }
.count { color: var(--color-text-muted); font-size: 0.84rem; white-space: nowrap; }
.selection { display: flex; gap: var(--space-4); align-items: center; flex-wrap: wrap; margin: 0; }
.link { border: none; background: none; padding: 0; color: var(--color-primary); cursor: pointer; font: inherit; text-decoration: none; }
.link:hover { text-decoration: underline; }
.status, .ne-empty { color: var(--color-text-muted); text-align: center; padding: var(--space-5); margin: 0; }

.tools--sub { gap: var(--space-4); }
.find .ne-input { width: 16rem; max-width: 100%; font-size: 0.86rem; padding: 0.3em 0.7em; }
.inline { display: flex; align-items: center; gap: 6px; font-size: 0.82rem; color: var(--color-text-muted); }
.inline .ne-input { font-size: 0.82rem; padding: 0.2em 0.4em; }
.px { min-width: 3.2rem; font-variant-numeric: tabular-nums; }
.small { font-size: 0.84rem; }
.snip-wrap { position: relative; display: inline-flex; }
.snip-star { position: absolute; top: 0; right: 0; border: none; background: rgba(255,255,255,0.75); border-radius: 4px; padding: 0 3px; font-size: 0.9rem; line-height: 1.2; cursor: pointer; color: var(--color-text-light); opacity: 0; }
.snip-wrap:hover .snip-star, .snip-star.on, .snip-star:focus-visible { opacity: 1; }
.snip-star.on { color: #e0a100; }
.picker { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.picker .ne-input { max-width: 18rem; font-size: 0.86rem; padding: 0.3em 0.6em; }
.pills { display: flex; flex-wrap: wrap; gap: 6px; max-height: 9rem; overflow-y: auto; }
.pill { padding: 2px 10px; border: 1px solid var(--color-border); border-radius: 999px; background: var(--color-surface); font-size: 0.8rem; cursor: pointer; }
.pill.on { background: var(--color-primary-light); border-color: var(--color-primary-muted); color: var(--color-primary-dark); font-weight: 700; }

.matrix-wrap { overflow: auto; max-height: calc(100vh - 14rem); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); }
.matrix { border-collapse: separate; border-spacing: 0; min-width: 100%; }
.matrix th, .matrix td { border-bottom: 1px solid var(--color-border); border-right: 1px solid var(--color-surface-muted); }
.matrix thead th { position: sticky; background: var(--color-bg); z-index: 3; }
.groups th { top: 0; padding: 6px 10px; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-muted); text-align: left; cursor: pointer; white-space: nowrap; }
.groups th.group:hover { color: var(--color-text); }
.groups .corner { cursor: default; }
.matrix thead tr:nth-child(2) th { top: 31px; }
.n { margin-left: 4px; padding: 0 6px; border-radius: 999px; background: var(--color-surface-muted); }
.sticky { position: sticky; left: 0; z-index: 4 !important; }
.corner { min-width: 11rem; text-align: left; padding: 8px 12px; font-size: 0.72rem; text-transform: uppercase; color: var(--color-text-muted); border-right: 2px solid var(--color-border) !important; }
.pattern { min-width: 6.5rem; padding: 8px 8px; vertical-align: top; }
.head-box { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.pseudo { font-weight: 700; font-size: 0.82rem; }
.folded { width: 1.2rem; min-width: 1.2rem; background: var(--color-surface-muted) !important; }
.ms { min-width: 11rem; padding: 8px 12px; text-align: left; vertical-align: top; background: var(--color-surface); border-right: 2px solid var(--color-border) !important; position: sticky; }
.ms .ms-link { text-decoration: none; color: var(--color-primary-hover); }
.ms .ms-link:hover strong { text-decoration: underline; }
.ms .sub { display: block; font-size: 0.78rem; color: var(--color-text-muted); font-weight: 400; }
.ms .ref-btn { position: absolute; top: 6px; right: 6px; }
.cell { padding: 8px; vertical-align: top; position: relative; }
.snips { display: flex; flex-wrap: wrap; gap: 6px; }
.snip { display: flex; flex-direction: column; align-items: center; gap: 1px; border: none; background: none; padding: 0; cursor: zoom-in; }
.snip-id { font-size: 0.66rem; font-weight: 700; color: var(--color-primary-hover); }
.more { align-self: center; border: 1px dashed var(--color-border-hover); background: none; border-radius: var(--radius-sm); padding: 4px 8px; color: var(--color-text-muted); cursor: pointer; }
.dash { color: var(--color-border-hover); }
.ref-btn { border: none; background: none; cursor: pointer; opacity: 0; font-size: 0.9rem; line-height: 1; }
.pattern:hover .ref-btn, .ms:hover .ref-btn, .cell:hover .ref-btn, .ref-btn:focus-visible { opacity: 1; }
.cell-ref { position: absolute; top: 2px; right: 2px; }

/* what an address points at: the row and the column fade a little, the cell itself is marked */
.row-target > .cell.in-col, .cell.in-row.in-col { background: color-mix(in srgb, var(--color-warning-light) 55%, transparent); }
.is-target { background: var(--color-warning-light) !important; box-shadow: inset 0 0 0 2px var(--color-warning); animation: pointed 2.4s ease-out 1; }
@keyframes pointed { from { box-shadow: inset 0 0 0 6px var(--color-warning); } }
@media (prefers-reduced-motion: reduce) { .is-target { animation: none; } }
</style>

<script setup>
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import PatternHierarchyTree from '../../components/patterns/PatternHierarchyTree.vue';
import SegmentedControl from '../../components/ui/SegmentedControl.vue';
import DocLineGallery from '../../components/docs/DocLineGallery.vue';
import DocPattern from '../../components/docs/DocPattern.vue';
import DocSnippet from '../../components/docs/DocSnippet.vue';
import SnippetDialog from '../../components/docs/SnippetDialog.vue';
import { useDocs } from '../../composables/useDocsContext';
import { useHighlight } from '../../composables/useHighlight';
import { loadManuscript } from '../../composables/useDocumentations';
import { stripSignKeys } from '../../utils/signs';
import cmReference from '../../data/cmReference.json';
import { buildFrequency, sortCodes } from '../../utils/neumeTable';
import { compareChantPatterns } from '../../utils/sorting';

/**
 * One manuscript of a documentation: its metadata, its patterns (as the hierarchy of the pattern
 * library, or as a table) with where each occurs, and its snippets — drawn on their lines, or as a
 * grid. Anything on the page can be linked to and cited; an address with `pattern=` or `snippet=`
 * brings that into view, softly highlighted. Snippets can be starred.
 */
const props = defineProps({ source: { type: String, required: true } });
const docs = useDocs();
const route = useRoute();
const router = useRouter();

const entry = computed(() => docs.entry(props.source));
const slot = ref(null);
watch([entry, () => docs.state.value], async ([e, state]) => {
    slot.value = null;
    if (!e) return;
    slot.value = await loadManuscript(state, e);
}, { immediate: true });

const ms = computed(() => (slot.value && slot.value.status === 'ready' ? slot.value.data : null));
const ready = computed(() => !!ms.value);

const targetPattern = computed(() => (typeof route.query.pattern === 'string' ? route.query.pattern : ''));
const targetSnippet = computed(() => (typeof route.query.snippet === 'string' ? route.query.snippet : ''));
useHighlight(ready);

// ---- neighbours -----------------------------------------------------------------------------

const position = computed(() => docs.entries.value.findIndex(e => e.id === props.source));
const previous = computed(() => docs.entries.value[position.value - 1] || null);
const next = computed(() => docs.entries.value[position.value + 1] || null);

// ---- patterns ---------------------------------------------------------------------------------

const signKeys = computed(() => Object.keys(docs.signs.value));

/** The rows of the table, and any pattern the snippets show that the table has no row for; each with where it occurs. */
const patternRows = computed(() => {
    if (!ms.value) return [];
    const rows = ms.value.rows.map(r => ({ ...r, snippets: [] }));
    const byPattern = new Map(rows.map(r => [r.pattern, r]));
    for (const s of ms.value.snippets) {
        let row = byPattern.get(s.pattern) || byPattern.get(stripSignKeys(s.pattern, signKeys.value));
        if (!row) {
            row = { pattern: s.pattern, refId: '', notes: '', tier: '', snippets: [] };
            rows.push(row);
            byPattern.set(s.pattern, row);
        }
        row.snippets.push(s);
    }
    for (const row of rows) {
        // where it occurs, by variant, one mark for each place
        const groups = new Map();
        for (const s of row.snippets) {
            const key = s.variant || '_base';
            if (!groups.has(key)) groups.set(key, new Map());
            const label = [s.folio, s.line].filter(Boolean).join(' / ') || s.refId;
            if (!groups.get(key).has(label)) groups.get(key).set(label, s);
        }
        row.count = row.snippets.length;
        row.occurrences = [...groups].map(([variant, places]) => ({ variant, places: [...places].map(([label, snippet]) => ({ label, snippet })) }));
    }
    return rows;
});
const rowByCode = computed(() => new Map(patternRows.value.map(r => [r.pattern, r])));
const codes = computed(() => patternRows.value.map(r => r.pattern));

// the table is the overview of the printed volumes; the hierarchy is the other way to read the same patterns
const patternView = ref('table');
const PATTERN_VIEWS = [{ value: 'tree', label: 'Hierarchy' }, { value: 'table', label: 'Table' }];
const tree = ref(null);

// what the reader sets for the table: a search, the tier, whether snippets exist, the order
const freq = buildFrequency(cmReference.patterns);
const pSearch = ref('');
const pTier = ref('');
const pHas = ref('');
const pSort = ref('cm');
const PATTERN_SORTS = [
    { value: 'cm', label: 'Order of the CM (tones, then frequency)' },
    { value: 'ref', label: 'Ref ID' },
    { value: 'count', label: 'Most snippets first' },
    { value: 'alpha', label: 'Alphabetical (ignoring [ ])' },
    { value: 'length', label: 'Neume length' }
];
const refNumber = (r) => { const n = parseFloat(r.refId); return Number.isFinite(n) ? n : Infinity; };
const tableRows = computed(() => {
    const term = pSearch.value.trim().toLowerCase();
    let rows = patternRows.value.filter(r => (!term || `${r.pattern} ${r.refId} ${r.notes}`.toLowerCase().includes(term))
        && (!pTier.value || r.tier === pTier.value)
        && (!pHas.value || (pHas.value === 'with' ? r.count > 0 : r.count === 0)));
    const by = new Map(rows.map(r => [r.pattern, r]));
    if (pSort.value === 'cm') return sortCodes(rows.map(r => r.pattern), freq).map(c => by.get(c));
    if (pSort.value === 'ref') return [...rows].sort((a, b) => refNumber(a) - refNumber(b) || a.pattern.localeCompare(b.pattern));
    if (pSort.value === 'count') return [...rows].sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern));
    return [...rows].sort((a, b) => compareChantPatterns(a.pattern, b.pattern, pSort.value));
});
const tiers = computed(() => [...new Set(patternRows.value.map(r => r.tier).filter(Boolean))]);
const filtering = computed(() => !!(pSearch.value || pTier.value || pHas.value));
function clearPatternFilter() { pSearch.value = ''; pTier.value = ''; pHas.value = ''; }

const THUMBS = 8;
const openThumbs = ref(new Set());
const thumbsOf = (row) => (openThumbs.value.has(row.pattern) ? row.snippets : row.snippets.slice(0, THUMBS));
function moreThumbs(row) { openThumbs.value = new Set([...openThumbs.value, row.pattern]); }
/** Where a pattern occurs, as short as it can be said: the folios. */
const foliosOf = (row) => [...new Set(row.snippets.map(s => s.folio).filter(Boolean))].join(', ');

// ---- snippets -----------------------------------------------------------------------------------

const shownPattern = ref('');
const onlyStarred = ref(false);
watch(targetPattern, (p) => { if (p) shownPattern.value = ''; });

const snippetsById = computed(() => Object.fromEntries((ms.value ? ms.value.snippets : []).map(s => [s.id, s])));
const hasLines = computed(() => !!ms.value && ms.value.lines.length > 0);
const snippetView = ref('');
const effectiveView = computed(() => snippetView.value || (hasLines.value ? 'lines' : 'snippets'));
const SNIPPET_VIEWS = [{ value: 'lines', label: 'On their lines' }, { value: 'snippets', label: 'As a grid' }];

const listed = computed(() => {
    if (!ms.value) return [];
    const row = shownPattern.value ? rowByCode.value.get(shownPattern.value) : null;
    return ms.value.snippets.filter(s => (!shownPattern.value || (!!row && row.snippets.includes(s))) && (!onlyStarred.value || docs.stars.has(props.source, s.id)));
});

const groups = computed(() => {
    const out = [];
    for (const s of listed.value) {
        const key = `${s.folio}|${s.line}`;
        let g = out[out.length - 1];
        if (!g || g.key !== key) { g = { key, folio: s.folio, line: s.line, snippets: [] }; out.push(g); }
        g.snippets.push(s);
    }
    return out;
});
const starCount = computed(() => (ms.value ? ms.value.snippets.filter(s => docs.stars.has(props.source, s.id)).length : 0));

// ---- looking and referring -------------------------------------------------------------------------

const looking = ref(null);
const context = ref([]);
function look(snippet, list) { context.value = list && list.length ? list : (ms.value ? ms.value.snippets : []); looking.value = snippet; }

function citeRow(row) {
    docs.cite({ kind: 'pattern', source: ms.value.source, entryId: props.source, pattern: row.pattern, refId: row.refId }, `/m/${encodeURIComponent(props.source)}`, { pattern: row.pattern });
}

/** Bring a snippet into view where it is drawn: on its line, or in the grid. */
function focus(snippet) {
    snippetView.value = hasLines.value && snippet.lineId ? 'lines' : 'snippets';
    shownPattern.value = '';
    onlyStarred.value = false;
    router.replace({ query: { ...route.query, snippet: snippet.id, pattern: undefined } });
}

function showInTable() {
    router.push({ name: 'docs_table', params: { endpoint: docs.id.value }, query: { ms: props.source } });
}

const metaList = computed(() => (entry.value ? docs.columns.value.filter(c => entry.value.meta[c.key]).map(c => ({ label: c.label, value: entry.value.meta[c.key] })) : []));
</script>

<template>
<div class="ms-page">
    <p v-if="!entry" class="ne-note ne-note--error">
        There is no manuscript “{{ source }}” in this documentation.
        <RouterLink :to="docs.path()">Back to the manuscripts</RouterLink>
    </p>

    <template v-else>
        <nav class="crumbs" aria-label="Manuscripts">
            <RouterLink :to="docs.path()">← All manuscripts</RouterLink>
            <span class="grow"></span>
            <RouterLink v-if="previous" :to="docs.manuscriptPath(previous.id)" class="step">‹ {{ previous.source }}</RouterLink>
            <RouterLink v-if="next" :to="docs.manuscriptPath(next.id)" class="step">{{ next.source }} ›</RouterLink>
        </nav>

        <header class="title">
            <div>
                <h2>{{ entry.source }}</h2>
                <p v-if="entry.name && entry.name !== entry.source" class="sub">{{ entry.name }}</p>
            </div>
            <div class="title-actions">
                <button type="button" class="ne-btn" @click="docs.cite({ kind: 'manuscript', source: entry.source, entryId: entry.id }, `/m/${encodeURIComponent(entry.id)}`)">Link and cite…</button>
                <button type="button" class="ne-btn" @click="showInTable">In the synopsis →</button>
            </div>
        </header>

        <dl v-if="metaList.length" class="meta">
            <div v-for="m in metaList" :key="m.label"><dt>{{ m.label }}</dt><dd>{{ m.value }}</dd></div>
        </dl>
        <p v-if="ms && ms.notes" class="notes">{{ ms.notes }}</p>

        <p v-if="!slot || slot.status === 'loading'" class="status" role="status">Reading the manuscript…</p>
        <p v-else-if="slot.status === 'error'" class="ne-note ne-note--error">{{ slot.error }}</p>

        <template v-else-if="ms">
            <section aria-labelledby="patterns-title">
                <div class="section-head">
                    <h3 id="patterns-title">Patterns <span class="n">{{ patternRows.length }}</span></h3>
                    <span class="grow"></span>
                    <template v-if="patternRows.length">
                        <template v-if="patternView === 'tree'">
                            <button type="button" class="link" @click="tree && tree.expandAll()">Expand all</button>
                            <button type="button" class="link" @click="tree && tree.collapseAll()">Collapse</button>
                        </template>
                        <SegmentedControl v-model="patternView" :options="PATTERN_VIEWS" label="Show the patterns as" size="sm" />
                    </template>
                </div>
                <div v-if="patternRows.length && patternView === 'table'" class="ptools">
                    <input v-model="pSearch" type="search" class="ne-input" placeholder="Find a pattern, Ref ID or note…" aria-label="Find a pattern" @keydown.esc="pSearch = ''" />
                    <select v-model="pTier" class="ne-input" aria-label="Which table">
                        <option value="">All tables</option>
                        <option v-for="t in tiers" :key="t" :value="t">{{ t }}</option>
                    </select>
                    <select v-model="pHas" class="ne-input" aria-label="Snippets">
                        <option value="">With and without snippets</option>
                        <option value="with">Only with snippets</option>
                        <option value="without">Only without snippets</option>
                    </select>
                    <label class="inline">Order
                        <select v-model="pSort" class="ne-input"><option v-for="o in PATTERN_SORTS" :key="o.value" :value="o.value">{{ o.label }}</option></select>
                    </label>
                    <span class="grow"></span>
                    <span class="hint">{{ tableRows.length }} of {{ patternRows.length }}</span>
                    <button v-if="filtering" type="button" class="link" @click="clearPatternFilter">Clear</button>
                </div>
                <p v-if="!patternRows.length" class="ne-empty">No patterns are documented for this manuscript.</p>

                <PatternHierarchyTree v-else-if="patternView === 'tree'" ref="tree" :codes="codes" :custom-signs="docs.signList.value" default-open v-slot="{ code }">
                    <div v-if="rowByCode.get(code)" class="entry" :class="{ 'is-target': code === targetPattern }" :data-target="code === targetPattern ? 'true' : null">
                        <div class="entry-head">
                            <DocPattern :pattern="code" :signs="docs.signs.value" />
                            <span v-if="rowByCode.get(code).refId" class="refid" title="Ref ID">Ref {{ rowByCode.get(code).refId }}</span>
                            <span v-if="rowByCode.get(code).tier" class="tier" :class="rowByCode.get(code).tier">{{ rowByCode.get(code).tier }}</span>
                            <button v-if="rowByCode.get(code).count" type="button" class="link" :title="`Show only the snippets of ${code}`" @click="shownPattern = shownPattern === code ? '' : code">{{ rowByCode.get(code).count }} snippet{{ rowByCode.get(code).count === 1 ? '' : 's' }}</button>
                            <span v-else class="none">no snippets</span>
                            <button type="button" class="ref-btn" :aria-label="`Link to and cite ${code}`" title="Link and cite" @click="citeRow(rowByCode.get(code))">⛓</button>
                        </div>
                        <p v-if="rowByCode.get(code).notes" class="entry-note">{{ rowByCode.get(code).notes }}</p>
                        <div v-for="g in rowByCode.get(code).occurrences" :key="g.variant" class="occ">
                            <span v-if="g.variant !== '_base'" class="variant">Variant {{ g.variant }}</span>
                            <button v-for="p in g.places" :key="p.snippet.id" type="button" class="loc" :title="`Show ${p.label} where it is drawn`" @click="focus(p.snippet)">{{ p.label }}</button>
                        </div>
                    </div>
                </PatternHierarchyTree>

                <div v-else class="patterns-wrap">
                <table class="patterns">
                    <thead><tr><th>Pattern</th><th>Ref ID</th><th>Table</th><th>Notes</th><th class="num">Snippets</th><th>Folios</th><th>Snippets shown</th><th class="ref"><span class="sr-only">Link and cite</span></th></tr></thead>
                    <tbody>
                        <tr v-if="!tableRows.length"><td colspan="8" class="ne-empty">No pattern matches. <button type="button" class="link" @click="clearPatternFilter">Clear the filter</button></td></tr>
                        <tr v-for="row in tableRows" :key="row.pattern" :class="{ 'is-target': row.pattern === targetPattern }" :data-target="row.pattern === targetPattern ? 'true' : null">
                            <td class="glyph"><DocPattern :pattern="row.pattern" :signs="docs.signs.value" /></td>
                            <td class="refid">{{ row.refId || '–' }}</td>
                            <td><span v-if="row.tier" class="tier" :class="row.tier">{{ row.tier }}</span></td>
                            <td class="note">{{ row.notes }}</td>
                            <td class="num">
                                <button v-if="row.count" type="button" class="link" :title="`Show only the snippets of ${row.pattern}`" @click="shownPattern = shownPattern === row.pattern ? '' : row.pattern">{{ row.count }}</button>
                                <template v-else>0</template>
                            </td>
                            <td class="folios">{{ foliosOf(row) }}</td>
                            <td class="thumbs">
                                <button v-for="s in thumbsOf(row)" :key="s.id" type="button" class="thumb" :aria-label="`Open the snippet from ${s.folio || 'this manuscript'}`" @click="look(s, row.snippets)"><DocSnippet :snippet="s" :width="56" /></button>
                                <button v-if="row.snippets.length > thumbsOf(row).length" type="button" class="more" @click="moreThumbs(row)">+{{ row.snippets.length - THUMBS }}</button>
                            </td>
                            <td class="ref"><button type="button" class="ref-btn" :aria-label="`Link to and cite ${row.pattern}`" title="Link and cite" @click="citeRow(row)">⛓</button></td>
                        </tr>
                    </tbody>
                </table>
                </div>
            </section>

            <section aria-labelledby="snippets-title">
                <div class="section-head">
                    <h3 id="snippets-title">
                        Snippets <span class="n">{{ ms.snippets.length }}</span>
                        <span v-if="shownPattern" class="showing">of <code>{{ shownPattern }}</code> <button type="button" class="link" @click="shownPattern = ''">show all</button></span>
                    </h3>
                    <span class="grow"></span>
                    <label v-if="starCount" class="ne-check small"><input v-model="onlyStarred" type="checkbox" /> Only starred ({{ starCount }})</label>
                    <SegmentedControl v-if="hasLines" :model-value="effectiveView" :options="SNIPPET_VIEWS" label="Show the snippets" size="sm" @update:model-value="snippetView = $event" />
                </div>
                <p v-if="!ms.snippets.length" class="ne-empty">No snippets have been marked yet.</p>
                <p v-else-if="!listed.length" class="ne-empty">No snippet matches.</p>

                <DocLineGallery v-else-if="effectiveView === 'lines'" :entry="entry" :lines="ms.lines.filter(l => l.items.some(i => listed.some(s => s.id === i.id)))" :snippets="snippetsById" :target="targetSnippet" @open="s => look(s, listed)" />

                <template v-else>
                    <div v-for="g in groups" :key="g.key" class="line">
                        <h4>
                            <template v-if="g.folio">f. {{ g.folio }}</template><template v-if="g.folio && g.line"> · </template><template v-if="g.line">line {{ g.line }}</template>
                            <template v-if="!g.folio && !g.line">Without a place</template>
                        </h4>
                        <ul class="cards">
                            <li v-for="s in g.snippets" :key="s.id" class="card" :class="{ 'is-target': s.id === targetSnippet }" :data-target="s.id === targetSnippet ? 'true' : null">
                                <button type="button" class="open" :aria-label="`Open the snippet ${s.refId}`" @click="look(s, listed)"><DocSnippet :snippet="s" :width="104" /></button>
                                <button type="button" class="card-star" :class="{ on: docs.stars.has(source, s.id) }" :aria-pressed="docs.stars.has(source, s.id)" :aria-label="docs.stars.has(source, s.id) ? 'Remove the star' : 'Star this snippet'" @click="docs.stars.toggle(source, s.id)">{{ docs.stars.has(source, s.id) ? '★' : '☆' }}</button>
                                <div class="card-meta">
                                    <span class="id">{{ s.refId }}</span>
                                    <code :title="s.pattern">{{ s.pattern }}</code>
                                    <span v-if="s.syllable" class="syl">{{ s.syllable }}</span>
                                </div>
                            </li>
                        </ul>
                    </div>
                </template>
            </section>
        </template>
    </template>

    <SnippetDialog v-if="entry" :snippet="looking" :entry="entry" :siblings="context" @close="looking = null" @step="s => (looking = s)" />
</div>
</template>

<style scoped>
.ms-page { display: flex; flex-direction: column; gap: var(--space-4); }
.crumbs { display: flex; align-items: center; gap: var(--space-3); font-size: 0.88rem; }
.grow { flex: 1; }
.step { color: var(--color-text-muted); }
.title { display: flex; gap: var(--space-4); justify-content: space-between; align-items: flex-start; flex-wrap: wrap; }
.title h2 { margin: 0; font-size: 1.5rem; }
.sub { margin: 2px 0 0; color: var(--color-text-muted); }
.title-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.meta { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-5); margin: 0; }
.meta div { display: flex; flex-direction: column; }
.meta dt { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); }
.meta dd { margin: 0; }
.notes { margin: 0; white-space: pre-wrap; max-width: 70ch; }
.status { color: var(--color-text-muted); }
.section-head { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; margin: var(--space-3) 0 var(--space-2); }
h3 { margin: 0; font-size: 1.1rem; display: flex; align-items: baseline; gap: var(--space-2); }
.n { font-size: 0.78rem; padding: 0 8px; border-radius: 999px; background: var(--color-surface-muted); color: var(--color-text-muted); font-weight: 600; }
.showing { font-size: 0.84rem; font-weight: 400; color: var(--color-text-muted); }
.small { font-size: 0.84rem; }
.ne-empty { margin: 0; padding: var(--space-4); text-align: center; color: var(--color-text-muted); }

.entry { padding: 6px 8px; border-radius: var(--radius-md); }
.entry-head { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.entry-note { margin: 4px 0 0 4rem; color: var(--color-text-muted); font-size: 0.86rem; }
.occ { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0 0 4rem; align-items: center; }
.variant { font-size: 0.68rem; font-weight: 800; text-transform: uppercase; color: var(--color-text-muted); letter-spacing: 0.05em; }
.loc { border: none; background: var(--color-primary-light); color: var(--color-primary-dark); border-radius: 4px; padding: 1px 8px; font-size: 0.75rem; font-weight: 600; cursor: pointer; }
.loc:hover { background: var(--color-primary-muted); }
.none { font-size: 0.82rem; color: var(--color-text-light); }

.ptools { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-2); }
.ptools .ne-input { font-size: 0.86rem; padding: 0.3em 0.6em; }
.ptools input[type=search] { width: 16rem; max-width: 100%; }
.inline { display: flex; align-items: center; gap: 6px; font-size: 0.82rem; color: var(--color-text-muted); }
.hint { font-size: 0.84rem; color: var(--color-text-muted); }
.patterns-wrap { overflow: auto; max-height: calc(100vh - 12rem); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }
.patterns-wrap .patterns { border: none; border-radius: 0; overflow: visible; }
.patterns thead th { position: sticky; top: 0; z-index: 2; }
.folios { max-width: 11rem; font-size: 0.78rem; color: var(--color-text-muted); }
.thumbs { white-space: normal !important; min-width: 14rem; }
.more { border: 1px dashed var(--color-border-hover); background: none; border-radius: var(--radius-sm); padding: 2px 8px; color: var(--color-text-muted); cursor: pointer; vertical-align: top; }
.patterns { width: 100%; border-collapse: collapse; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden; font-size: 0.9rem; }
.patterns th, .patterns td { padding: 0.5em 0.8em; border-bottom: 1px solid var(--color-surface-muted); text-align: left; vertical-align: middle; }
.patterns thead th { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-muted); background: var(--color-bg); }
.patterns tbody tr:last-child td { border-bottom: none; }
.glyph { min-width: 7rem; text-align: center !important; }
.refid { font-weight: 700; color: var(--color-primary-hover); font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.86rem; }
.tier { padding: 0 8px; border-radius: 999px; font-size: 0.7rem; background: var(--color-surface-muted); color: var(--color-text-muted); }
.tier.standard { background: var(--color-primary-light); color: var(--color-primary-dark); }
.note { max-width: 24rem; color: var(--color-text-muted); }
.num { text-align: right !important; font-variant-numeric: tabular-nums; }
.thumb { border: none; background: none; padding: 0; margin-right: 4px; cursor: pointer; }
.ref { width: 2.2rem; text-align: center !important; }
.ref-btn { border: none; background: none; cursor: pointer; opacity: 0.35; font-size: 1rem; }
.entry:hover .ref-btn, .patterns tbody tr:hover .ref-btn, .ref-btn:focus-visible { opacity: 1; }
.link { border: none; background: none; padding: 0; color: var(--color-primary); cursor: pointer; font: inherit; font-size: 0.86rem; }
.link:hover { text-decoration: underline; }

.line h4 { margin: var(--space-3) 0 var(--space-2); font-size: 0.86rem; color: var(--color-text-muted); }
.cards { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-3); }
.card { position: relative; display: flex; flex-direction: column; gap: 4px; padding: 6px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.open { border: none; background: none; padding: 0; cursor: zoom-in; }
.card-star { position: absolute; top: 2px; right: 4px; border: none; background: rgba(255,255,255,0.7); border-radius: 4px; font-size: 1rem; line-height: 1; cursor: pointer; color: var(--color-text-light); opacity: 0; }
.card:hover .card-star, .card-star.on, .card-star:focus-visible { opacity: 1; }
.card-star.on { color: #e0a100; }
.card-meta { display: flex; justify-content: space-between; gap: 8px; font-size: 0.72rem; max-width: 104px; }
.id { font-weight: 700; color: var(--color-primary-hover); }
.card-meta code { color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; }
.syl { color: var(--color-text-muted); }

/* what an address points at */
.is-target { background: var(--color-warning-light) !important; box-shadow: 0 0 0 2px var(--color-warning); border-radius: var(--radius-md); animation: pointed 2.4s ease-out 1; }
tr.is-target { box-shadow: inset 0 0 0 2px var(--color-warning); }
@keyframes pointed { from { box-shadow: 0 0 0 6px var(--color-warning); } }
@media (prefers-reduced-motion: reduce) { .is-target { animation: none; } }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import PageHeader from '../../components/ui/PageHeader.vue';
import Panel from '../../components/ui/Panel.vue';
import NeumaSnippetCard from '../../components/neuma/NeumaSnippetCard.vue';
import NeumaFocusDialog from '../../components/neuma/NeumaFocusDialog.vue';
import { GLYPHS } from '../../data/glyphs';
import { useNeumaReview } from '../../composables/useNeumaReview';
import { useToast } from '../../composables/useToast';
import { filterSnippets, stateOf, summarize, summarizeByColumn } from '../../utils/neumaReview';

/**
 * A tool for going through the snippets of the Hungarian Neume Catalogue (neuma.zti.hu), one by one or
 * a screenful at a time: each is shown with the pattern its column proposes, and is accepted, corrected,
 * set aside or discarded. The decisions make a documentation neume-docs can read. It has no link in
 * the editor; its address is `#/tools/neuma`.
 */
const route = useRoute();
const router = useRouter();
const review = useNeumaReview();
const toast = useToast();
const { status, snippets, decisions, sources, columns } = review;

// the glyph of the virga is a note, told apart by its letter (the documentation says so in its signs)
const signs = { V: { viewBox: GLYPHS.note.viewBox, d: GLYPHS.note.d } };

const STATE_OPTIONS = [
    ['open', 'Still to do'], ['undecided', 'Undecided'], ['accepted', 'Accepted'], ['corrected', 'Corrected'],
    ['later', 'Set aside'], ['discarded', 'Discarded'], ['', 'All']
];
const CONFIDENCE_OPTIONS = [['', 'Any proposal'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low'], ['none', 'None (combinations)']];

const q = route.query;
const filters = reactive({
    column: typeof q.column === 'string' ? q.column : '',
    source: typeof q.source === 'string' ? q.source : '',
    state: typeof q.state === 'string' ? q.state : 'open',
    confidence: typeof q.confidence === 'string' ? q.confidence : '',
    odd: q.odd === '1'
});
const pageSize = ref(48);
const page = ref(Math.max(1, parseInt(q.page, 10) || 1));

watch([filters, page], () => {
    const query = {};
    if (filters.column) query.column = filters.column;
    if (filters.source) query.source = filters.source;
    if (filters.state !== 'open') query.state = filters.state || 'all';
    if (filters.confidence) query.confidence = filters.confidence;
    if (filters.odd) query.odd = '1';
    if (page.value > 1) query.page = String(page.value);
    router.replace({ query });
}, { deep: true });
if (filters.state === 'all') filters.state = '';
watch(() => [filters.column, filters.source, filters.state, filters.confidence, filters.odd, pageSize.value], () => { page.value = 1; });

const shown = computed(() => filterSnippets(snippets.value, decisions, filters));
const pages = computed(() => Math.max(1, Math.ceil(shown.value.length / pageSize.value)));
const visible = computed(() => shown.value.slice((Math.min(page.value, pages.value) - 1) * pageSize.value, Math.min(page.value, pages.value) * pageSize.value));
const summary = computed(() => summarize(snippets.value, decisions));
const byColumn = computed(() => summarizeByColumn(snippets.value, decisions));
const columnList = computed(() => [...columns.value.values()]);
const sourceList = computed(() => [...sources.value.values()]);
const acceptable = computed(() => shown.value.filter(s => stateOf(s, decisions[s.id]).state === 'undecided' && s.suggestion && s.suggestion.code).length);
const percent = (n) => (summary.value.total ? `${(n / summary.value.total) * 100}%` : '0%');

// ---- the one-snippet dialog ------------------------------------------------------------------

/** The snippets of the selection as it was when the dialog opened, so that deciding does not shuffle it. */
const walk = ref([]);
const at = ref(-1);
const byId = computed(() => new Map(snippets.value.map(s => [s.id, s])));
const current = computed(() => (at.value >= 0 ? byId.value.get(walk.value[at.value]) || null : null));
const currentCell = computed(() => {
    const s = current.value;
    if (!s) return null;
    const cell = sources.value.get(s.source)?.cells[s.column];
    return cell ? { url: review.cellUrl(s), width: cell.width, height: cell.height } : null;
});

function openAt(snippet) {
    walk.value = shown.value.map(s => s.id);
    at.value = walk.value.indexOf(snippet.id);
}
function closeDialog() { at.value = -1; }
function go(delta) {
    const i = at.value + delta;
    if (i >= 0 && i < walk.value.length) at.value = i;
}
/** After a decision: on to the next snippet of the walk that is not decided yet. */
function advance() {
    for (let i = at.value + 1; i < walk.value.length; i++) {
        const s = byId.value.get(walk.value[i]);
        if (s && !stateOf(s, decisions[s.id]).decided) { at.value = i; return; }
    }
    toast.show('That was the last one of this selection.', { tone: 'success' });
    closeDialog();
}
const decide = (code) => { review.setCode(current.value, code); advance(); };
const acceptCurrent = () => { if (review.accept(current.value)) advance(); };
const setAsideCurrent = () => { review.setAside(current.value); advance(); };
const discardCurrent = () => { review.discard(current.value); advance(); };

// ---- bulk, undo -----------------------------------------------------------------------------------

function acceptShown() {
    const n = review.acceptAll(shown.value);
    if (n) toast.show(`Accepted ${n} proposal${n === 1 ? '' : 's'}.`, { tone: 'success', action: { label: 'Undo', run: () => review.undo() } });
}
function undo() {
    if (!review.canUndo.value) return;
    const label = review.lastLabel.value;
    review.undo();
    toast.show(`Undone: ${label}`);
}
function onKey(e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        undo();
    }
}

// ---- the decisions and the documentation -----------------------------------------------------------

const includeProposed = ref(false);
const building = ref(false);
const progress = ref('');
const built = ref(null);
const buildError = ref('');
const DOCS_ENDPOINT = 'url:/neuma-data/documentation/';
const nothingYet = computed(() => !summary.value.accepted && !summary.value.corrected && !includeProposed.value);

/** The documentation as a ZIP: made in this browser, from the decisions and the snippets' pictures. */
async function downloadZip() {
    building.value = true;
    buildError.value = '';
    built.value = null;
    try {
        const result = await review.downloadDocumentation(includeProposed.value ? 'proposed' : 'reviewed', (done, total) => { progress.value = `${done} of ${total} pictures`; });
        built.value = { ...result, zip: true };
    } catch (e) {
        buildError.value = e.message;
    } finally {
        building.value = false;
        progress.value = '';
    }
}

/** With the development server: the documentation as a folder on that computer, to look at in the viewer. */
async function writeFolder() {
    building.value = true;
    buildError.value = '';
    built.value = null;
    try {
        built.value = { ...(await review.writeDocumentationFolder(includeProposed.value ? 'proposed' : 'reviewed')), zip: false };
    } catch (e) {
        buildError.value = e.message;
    } finally {
        building.value = false;
    }
}

const loadInput = ref(null);
async function onLoadFile(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
        const { count, dropped } = await review.loadDecisionsFile(file);
        toast.show(`Took ${count.toLocaleString()} decision${count === 1 ? '' : 's'} from the file${dropped ? `; ${dropped} could not be read` : ''}.`, { tone: 'success', action: { label: 'Undo', run: () => review.undo() } });
    } catch (e) {
        toast.show(e.message, { tone: 'error' });
    }
}

const SAVE_TEXT = computed(() => ({
    saved: review.mode.value === 'server' ? 'Saved' : 'Saved in this browser',
    pending: 'Saving…', saving: 'Saving…',
    error: review.mode.value === 'server' ? 'Not saved' : 'Not saved: this browser keeps nothing'
}));
const DEV = import.meta.env.DEV;

onMounted(() => { review.load(); document.addEventListener('keydown', onKey); });
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
<div class="neuma-tool">
    <PageHeader title="Hungarian Neume Catalogue: what is each snippet?" eyebrow="Tool · neuma.zti.hu">
        <template #subtitle>
            <p>The catalogue's overview table, taken apart: every snippet is a picture of its own, proposed as the pattern its column names. Accept it, change it, set it aside or discard it; what is decided becomes a documentation the viewer can read.</p>
        </template>
        <template #actions>
            <span v-if="status === 'ready'" class="save" :class="`save-${review.saving.value}`" role="status">{{ SAVE_TEXT[review.saving.value] }}</span>
            <button v-if="status === 'ready'" type="button" class="ne-btn" :disabled="!review.canUndo.value" :title="review.canUndo.value ? `Undo: ${review.lastLabel.value}` : 'Nothing to undo'" @click="undo">Undo</button>
            <RouterLink to="/" class="ne-btn ne-btn--ghost">neume-docs →</RouterLink>
        </template>
    </PageHeader>

    <p v-if="status === 'idle' || status === 'loading'" class="ne-empty">Loading the catalogue…</p>

    <div v-else-if="status === 'missing'" class="ne-empty missing">
        <template v-if="DEV">
            <p><strong>There is no catalogue data here.</strong> It is third-party data, so it is collected on the computer that uses it.</p>
            <p>In the folder <code>neuma-import/</code>:</p>
            <pre>npm install      # once
npm run crawl    # the overview page, its sources and ≈ 3,400 files (a polite crawl; it can be stopped and run again)
npm run split    # every snippet becomes a picture of its own</pre>
            <p>Then reload this page. <code>neuma-import/README.md</code> says more.</p>
        </template>
        <p v-else><strong>The catalogue's snippets are not on this site.</strong> They are published under <code>hung/</code> by <code>npm run publish-site</code> in <code>neuma-import/</code>.</p>
    </div>

    <p v-else-if="status === 'error'" class="ne-note ne-note--error">The catalogue could not be read: {{ review.error.value }}. <button type="button" class="ne-btn ne-btn--sm" @click="review.load()">Try again</button></p>

    <template v-else>
        <p v-if="review.stale.value" class="ne-note ne-note--warn">
            {{ review.stale.value.toLocaleString() }} earlier decision{{ review.stale.value === 1 ? '' : 's' }} no longer fit{{ review.stale.value === 1 ? 's' : '' }} the snippets: the catalogue was split again and they moved.
            They are kept in <code>decisions.json</code> but do not count, and the snippets show as not looked at.
        </p>

        <section class="progress" aria-label="Progress">
            <div class="bar" role="img" :aria-label="`${summary.done} of ${summary.total} done`">
                <span class="seg accepted" :style="{ width: percent(summary.accepted) }"></span>
                <span class="seg corrected" :style="{ width: percent(summary.corrected) }"></span>
                <span class="seg discarded" :style="{ width: percent(summary.discarded) }"></span>
                <span class="seg later" :style="{ width: percent(summary.later) }"></span>
            </div>
            <p class="counts">
                <strong>{{ summary.done.toLocaleString() }}</strong> of {{ summary.total.toLocaleString() }} done —
                {{ summary.accepted.toLocaleString() }} accepted · {{ summary.corrected.toLocaleString() }} corrected ·
                {{ summary.later.toLocaleString() }} set aside · {{ summary.discarded.toLocaleString() }} discarded ·
                {{ summary.undecided.toLocaleString() }} not looked at
            </p>
        </section>

        <section class="filters" aria-label="Filters">
            <div class="columns" role="group" aria-label="Column of the catalogue's table">
                <button type="button" class="chip" :class="{ on: !filters.column }" @click="filters.column = ''">All columns</button>
                <button v-for="c in columnList" :key="c.key" type="button" class="chip" :class="{ on: filters.column === c.key }" :title="c.about" @click="filters.column = c.key">
                    {{ c.name }} <span class="n">{{ byColumn[c.key] ? `${byColumn[c.key].done}/${byColumn[c.key].total}` : '0' }}</span>
                </button>
            </div>
            <div class="row">
                <div class="ne-field"><label for="nr-source">Source</label>
                    <select id="nr-source" v-model="filters.source" class="ne-input">
                        <option value="">All {{ sourceList.length }} sources</option>
                        <option v-for="s in sourceList" :key="s.id" :value="s.id">{{ s.id }} · {{ s.siglum }}</option>
                    </select>
                </div>
                <div class="ne-field"><label for="nr-state">Show</label>
                    <select id="nr-state" v-model="filters.state" class="ne-input"><option v-for="[v, l] in STATE_OPTIONS" :key="v" :value="v">{{ l }}</option></select>
                </div>
                <div class="ne-field"><label for="nr-conf">Proposal</label>
                    <select id="nr-conf" v-model="filters.confidence" class="ne-input"><option v-for="[v, l] in CONFIDENCE_OPTIONS" :key="v" :value="v">{{ l }}</option></select>
                </div>
                <label class="ne-check"><input v-model="filters.odd" type="checkbox" /> Only cuts that look odd</label>
                <div class="grow"></div>
                <button type="button" class="ne-btn ne-btn--primary" :disabled="!acceptable" :title="acceptable ? 'Accept what is proposed for every undecided snippet in this selection (undoable)' : 'No undecided snippet with a proposal in this selection'" @click="acceptShown">Accept {{ acceptable.toLocaleString() }} proposal{{ acceptable === 1 ? '' : 's' }} shown</button>
            </div>
        </section>

        <p v-if="!shown.length" class="ne-empty">No snippet matches. {{ filters.state === 'open' && !filters.column && !filters.source ? 'Everything is decided.' : 'Change the filters above.' }}</p>

        <template v-else>
            <p class="range">{{ shown.length.toLocaleString() }} snippet{{ shown.length === 1 ? '' : 's' }}</p>
            <div class="grid">
                <NeumaSnippetCard
                    v-for="s in visible" :key="s.id"
                    :snippet="s" :decision="decisions[s.id]" :url="review.imageUrl(s)" :signs="signs" :column="columns.get(s.column)"
                    :active="current && current.id === s.id"
                    @accept="review.accept(s)" @open="openAt(s)" @reopen="review.reopen(s)"
                />
            </div>
            <nav class="pager" aria-label="Pages">
                <button type="button" class="ne-btn ne-btn--sm" :disabled="page <= 1" @click="page--">‹ Previous</button>
                <span>Page {{ Math.min(page, pages) }} of {{ pages }}</span>
                <button type="button" class="ne-btn ne-btn--sm" :disabled="page >= pages" @click="page++">Next ›</button>
                <select v-model.number="pageSize" class="ne-input" aria-label="Snippets per page"><option :value="24">24 per page</option><option :value="48">48 per page</option><option :value="96">96 per page</option><option :value="192">192 per page</option></select>
            </nav>
        </template>

        <Panel id="documentation" title="Your decisions and the documentation" description="What is accepted or corrected, by manuscript, as the files neume-docs reads (neume-docs.json, data/, images/). Discarded snippets and those not looked at are left out.">
            <p v-if="review.mode.value === 'static'" class="ne-note ne-note--info">Your decisions are kept in <strong>this browser</strong> only. Save them as a file now and then — and before you clear the browser's data — and load that file to go on somewhere else.</p>
            <div class="build">
                <div class="row">
                    <button type="button" class="ne-btn" @click="review.saveDecisionsFile()">Save the decisions as a file</button>
                    <button type="button" class="ne-btn" @click="loadInput.click()">Load decisions from a file…</button>
                    <input ref="loadInput" type="file" accept="application/json,.json" class="hidden" aria-label="Decisions file" @change="onLoadFile" />
                </div>
            </div>
            <div class="build">
                <label class="ne-check"><input v-model="includeProposed" type="checkbox" /> Also take the proposals not looked at yet (they are only proposals)</label>
                <div class="row">
                    <button v-if="review.mode.value === 'server'" type="button" class="ne-btn" :disabled="building || nothingYet" @click="writeFolder">Write it to a folder</button>
                    <button type="button" class="ne-btn ne-btn--primary" :disabled="building || nothingYet" @click="downloadZip">{{ building ? (progress || 'Writing…') : 'Download the documentation (ZIP)' }}</button>
                </div>
            </div>
            <p v-if="buildError" class="ne-note ne-note--error">{{ buildError }}</p>
            <div v-if="built && built.zip" class="ne-note ne-note--success">
                <p><strong>{{ built.manuscripts }}</strong> manuscripts with <strong>{{ built.snippets.toLocaleString() }}</strong> snippets are in the ZIP. Unpack it into a folder of a GitHub repository (or any web server): that folder is a documentation the viewer can read.</p>
            </div>
            <div v-if="built && !built.zip" class="ne-note ne-note--success">
                <p><strong>{{ built.manuscripts }}</strong> manuscripts with <strong>{{ built.snippets.toLocaleString() }}</strong> snippets written to <code>neuma-import/data/documentation/</code>.</p>
                <p><RouterLink :to="{ name: 'docs_catalogue', params: { endpoint: DOCS_ENDPOINT } }" class="ne-btn ne-btn--sm">Look at it in the viewer →</RouterLink></p>
            </div>
        </Panel>

        <p class="credit">Snippets, sources and everything said about them: <a href="https://neuma.zti.hu/" target="_blank" rel="noopener">Hungarian Neume Catalogue</a> — Gabriella Gilányi (content), Zsolt Kemecsei (programming), Adrienn Ádám (pictures). The snippets are excerpts from manuscripts, whose copyright remains with their holders; they are used here with the agreement of the catalogue's editors. Cite the catalogue (and the source of the snippet) when you use one.</p>
    </template>

    <NeumaFocusDialog
        :open="!!current" :snippet="current" :decision="current ? decisions[current.id] : undefined" :url="current ? review.imageUrl(current) : ''"
        :cell="currentCell" :source="current ? sources.get(current.source) : null" :column="current ? columns.get(current.column) : null" :signs="signs"
        :position="at + 1" :total="walk.length"
        @close="closeDialog" @prev="go(-1)" @next="go(1)" @decide="decide" @accept="acceptCurrent"
        @later="setAsideCurrent" @discard="discardCurrent" @reopen="current && review.reopen(current)"
    />
</div>
</template>

<style scoped>
.neuma-tool { max-width: 92rem; margin: 0 auto; padding: var(--space-5) var(--space-4) var(--space-6); display: flex; flex-direction: column; gap: var(--space-4); }
.neuma-tool :deep(.page-header) { margin-bottom: 0; }
.save { font-size: 0.78rem; font-weight: 700; padding: 0.15em 0.7em; border-radius: 999px; background: var(--color-surface-muted); color: var(--color-text-muted); }
.save-saved { background: var(--color-success-light); color: var(--color-success-dark); }
.save-error { background: var(--color-danger-light); color: #991b1b; }
.missing pre { text-align: left; display: inline-block; padding: var(--space-3) var(--space-4); background: var(--color-surface-muted); border-radius: var(--radius-md); }
.progress { display: flex; flex-direction: column; gap: var(--space-2); }
.bar { display: flex; height: 0.6rem; border-radius: 999px; overflow: hidden; background: var(--color-surface-muted); }
.seg.accepted { background: var(--color-success); }
.seg.corrected { background: var(--color-primary); }
.seg.discarded { background: var(--color-text-light); }
.seg.later { background: var(--color-warning); }
.counts { margin: 0; font-size: 0.85rem; color: var(--color-text-muted); }
.filters { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-3); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); }
.columns { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.chip { display: inline-flex; align-items: center; gap: var(--space-2); padding: 0.3em 0.8em; border: 1px solid var(--color-border-hover); border-radius: 999px; background: var(--color-surface); font-size: 0.82rem; font-weight: 600; cursor: pointer; }
.chip:hover { background: var(--color-surface-muted); }
.chip.on { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
.chip .n { font-weight: 500; opacity: 0.75; font-variant-numeric: tabular-nums; }
.row { display: flex; align-items: flex-end; gap: var(--space-3); flex-wrap: wrap; }
.grow { flex: 1; }
.range { margin: 0; font-size: 0.85rem; color: var(--color-text-muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr)); gap: var(--space-3); }
.pager { display: flex; align-items: center; justify-content: center; gap: var(--space-3); flex-wrap: wrap; }
.build { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
.credit { margin: 0; font-size: 0.78rem; color: var(--color-text-muted); }
.hidden { display: none; }
.build + .build { margin-top: var(--space-3); }
</style>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/ui/PageHeader.vue';
import MetadataTabs from '../components/metadata/MetadataTabs.vue';
import MmmoCandidate from '../components/metadata/MmmoCandidate.vue';
import AddManuscriptDialog from '../components/metadata/AddManuscriptDialog.vue';
import { useIiifRegistryStore } from '../stores/iiifRegistry';
import { useIiifStore } from '../stores/iiif';
import { useManuscriptMetaStore } from '../stores/manuscriptMeta';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useTranscriptionData } from '../composables/useTranscriptionData';
import { useEffectiveMeta } from '../composables/useEffectiveMeta';
import { useMmmo, queryFromSource, MMMO_NAME, MMMO_URL } from '../composables/useMmmo';
import { useToast } from '../composables/useToast';
import { isUrl } from '../composables/useManuscriptTable';

/**
 * The table of IIIF resources, one row per (manuscript, address): the ones you add,
 * the ones in use, what the corpus documents name, and, from the MMMO catalogue,
 * suggestions for manuscripts that have no images yet.
 */
const route = useRoute();
const router = useRouter();
const registry = useIiifRegistryStore();
const iiif = useIiifStore();
const meta = useManuscriptMetaStore();
const tables = usePersonalTablesStore();
const { catalog, sourceNames } = useTranscriptionData();
const metaOf = useEffectiveMeta();
const mmmo = useMmmo();
const toast = useToast();

onMounted(() => mmmo.load());

// ---- the manuscripts we know ------------------------------------------------------------

const allSources = computed(() => {
    const names = new Set(sourceNames.value);
    for (const t of tables.tables) if (t.source) names.add(t.source);
    for (const s of Object.keys(meta.overrides)) names.add(s);
    for (const e of registry.entries) names.add(e.siglum);
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
});

const corpusPages = (name) => (catalog.value[name]?.images || []).length;

/** A manuscript has images when it has a manifest in use or the corpus documents name its pages. */
const hasImages = (name) => !!iiif.links[name] || corpusPages(name) > 0;

// ---- the table --------------------------------------------------------------------------

const ORIGIN_LABEL = { own: 'Yours', mmmo: 'MMMO', linked: 'In use', corpus: 'Corpus' };

const rows = computed(() => {
    const out = [];
    for (const e of registry.entries) {
        out.push({ key: e.id, origin: e.origin === 'mmmo' ? 'mmmo' : 'own', entry: e, siglum: e.siglum, url: e.url, kind: e.kind, label: e.label, inUse: iiif.links[e.siglum] === e.url });
    }
    // A manifest that is in use but not in the table: the one set in the metadata table, or taken from the corpus.
    for (const [siglum, url] of Object.entries(iiif.links)) {
        if (!registry.find(siglum, url)) out.push({ key: `link:${siglum}`, origin: 'linked', siglum, url, kind: 'manifest', label: '', inUse: true });
    }
    for (const name of sourceNames.value) {
        const images = catalog.value[name]?.images || [];
        if (images.length) {
            out.push({ key: `corpus:${name}`, origin: 'corpus', siglum: name, url: images[0][1], kind: 'images', label: `${images.length} page image${images.length === 1 ? '' : 's'} named in the corpus documents`, inUse: !iiif.links[name] });
        }
    }
    return out.sort((a, b) => a.siglum.localeCompare(b.siglum, undefined, { numeric: true }) || a.url.localeCompare(b.url));
});

const filter = ref(typeof route.query.q === 'string' ? route.query.q : '');
const origin = ref('all');
const ORIGINS = [
    { value: 'all', label: 'All' },
    { value: 'own', label: 'Yours' },
    { value: 'mmmo', label: 'From MMMO' },
    { value: 'linked', label: 'In use' },
    { value: 'corpus', label: 'Corpus' }
];

const shown = computed(() => {
    const q = filter.value.trim().toLowerCase();
    return rows.value.filter(r => (origin.value === 'all' || r.origin === origin.value)
        && (!q || `${r.siglum} ${r.url} ${r.label}`.toLowerCase().includes(q)));
});

function use(row) {
    iiif.setLink(row.siglum, row.url);
}
function stopUsing(row) {
    iiif.setLink(row.siglum, '');
}
function adopt(row) {
    registry.add({ siglum: row.siglum, url: row.url, kind: 'manifest', label: 'Set in the metadata table' });
}
function setUrl(row, value) {
    const next = value.trim();
    if (!next || next === row.url) return;
    if (row.inUse) iiif.setLink(row.siglum, next);
    registry.update(row.entry.id, { url: next });
}
function remove(row) {
    const kept = { ...row.entry };
    const wasInUse = row.inUse;
    registry.remove(kept.id);
    if (wasInUse) iiif.setLink(kept.siglum, '');
    toast.show(`Removed the row for ${kept.siglum}.`, {
        action: { label: 'Undo', run: () => { registry.add(kept); if (wasInUse) iiif.setLink(kept.siglum, kept.url); } }
    });
}

// ---- adding a row -----------------------------------------------------------------------

const draft = ref({ siglum: '', url: '', kind: 'manifest', label: '', useNow: true });
const draftError = ref('');

const draftSuggestions = computed(() => {
    const s = draft.value.siglum.trim();
    if (!s || !mmmo.ready.value) return [];
    return mmmo.suggest({ siglum: s, city: metaOf(s, 'bibliotheksort'), shelfmark: metaOf(s, 'bibliothekssignatur'), date: metaOf(s, 'datierung') || metaOf(s, 'jahrhundert') }, { limit: 3 })
        .filter(c => c.record.manifest);
});

function addRow() {
    draftError.value = '';
    const d = draft.value;
    if (!d.siglum.trim()) { draftError.value = 'Which manuscript is it for?'; return; }
    if (!isUrl(d.url)) { draftError.value = 'The address must be a web address (https://…).'; return; }
    const entry = registry.add({ siglum: d.siglum, url: d.url, kind: d.kind, label: d.label });
    if (d.useNow && d.kind === 'manifest' && !iiif.links[entry.siglum]) iiif.setLink(entry.siglum, entry.url);
    draft.value = { siglum: '', url: '', kind: 'manifest', label: '', useNow: true };
}

function takeForDraft(record) {
    draft.value.url = record.manifest;
    if (!draft.value.label) draft.value.label = `${MMMO_NAME}: ${record.siglum}`;
    draft.value.mmmo = record.id;
}

// ---- suggestions for manuscripts without images ----------------------------------------

const SUGGESTION_LIMIT = 40;
const showAll = ref(false);

const suggestions = computed(() => {
    if (!mmmo.ready.value) return [];
    const out = [];
    for (const name of allSources.value) {
        if (hasImages(name)) continue;
        const candidates = mmmo.suggest(queryFromSource(name, metaOf), { limit: 4 })
            .filter(c => c.record.manifest && !registry.isDismissed(name, c.record.id));
        if (candidates.length) out.push({ source: name, candidates, best: candidates[0].score });
    }
    return out.sort((a, b) => b.best - a.best || a.source.localeCompare(b.source, undefined, { numeric: true }));
});
const visibleSuggestions = computed(() => (showAll.value ? suggestions.value : suggestions.value.slice(0, SUGGESTION_LIMIT)));
const withoutImages = computed(() => allSources.value.filter(n => !hasImages(n)).length);

function acceptSuggestion(source, candidate) {
    const entry = registry.add({
        siglum: source, url: candidate.record.manifest, kind: 'manifest',
        label: `${MMMO_NAME}: ${candidate.record.siglum}`, origin: 'mmmo', mmmoId: candidate.record.id
    });
    iiif.setLink(source, entry.url);
    toast.show(`${source} now uses the manifest of ${candidate.record.siglum}.`, {
        tone: 'success',
        action: { label: 'Undo', run: () => { iiif.setLink(source, ''); registry.remove(entry.id); } }
    });
}

function rejectSuggestion(source, candidate) {
    registry.dismiss(source, candidate.record.id);
    toast.show(`${candidate.record.siglum} will not be suggested for ${source} again.`, {
        action: { label: 'Undo', run: () => registry.undismiss(source, candidate.record.id) }
    });
}

// ---- searching the catalogue -------------------------------------------------------------

const searchText = ref('');
const results = computed(() => (searchText.value.trim().length >= 2 ? mmmo.search(searchText.value, { limit: 25 }) : []));

function addFromCatalogue(record) {
    const entry = registry.add({ siglum: record.siglum, url: record.manifest, kind: 'manifest', label: `${MMMO_NAME}: ${record.siglum}`, origin: 'mmmo', mmmoId: record.id });
    toast.show(`Added ${record.siglum} to your table.`, { tone: 'success', action: { label: 'Undo', run: () => registry.remove(entry.id) } });
}

// ---- adding a manuscript -----------------------------------------------------------------

const adding = ref(false);
function onAdded(siglum) {
    router.push({ path: '/metadata', query: { q: siglum } });
}

const fmt = (n) => n.toLocaleString('en-US');
</script>

<template>
<div class="iiif-view">
    <MetadataTabs :badge="suggestions.length" />

    <PageHeader title="IIIF sources" eyebrow="Metadata">
        <template #subtitle>
            <p>Where each manuscript's images come from. Add manifests of your own, and let the editor suggest the ones the {{ MMMO_NAME }} knows.</p>
        </template>
        <template #actions>
            <button class="ne-btn" @click="adding = true">Add a manuscript…</button>
        </template>
    </PageHeader>

    <p v-if="mmmo.status.value === 'ready'" class="catalogue ne-muted">
        Catalogue: <a :href="MMMO_URL" target="_blank" rel="noopener">{{ MMMO_NAME }}</a>,
        {{ fmt(mmmo.info.value.count) }} manuscripts, {{ fmt(mmmo.info.value.withManifest) }} with a IIIF manifest
        <template v-if="mmmo.info.value.checked && mmmo.info.value.checked < mmmo.info.value.count">
            ({{ fmt(mmmo.info.value.checked) }} checked so far)
        </template>
        · collected {{ mmmo.info.value.collectedAt }}
    </p>
    <p v-else-if="mmmo.status.value === 'loading'" class="catalogue ne-muted">Reading the catalogue…</p>
    <p v-else class="ne-note ne-note--info catalogue">
        The {{ MMMO_NAME }} catalogue has not been collected on this installation, so no suggestions can be made.
        Run <code>npm run crawl:mmmo</code> in the <code>ui</code> folder (it is slow on purpose, and can be stopped and continued), then rebuild or reload.
    </p>

    <!-- The table -->
    <section class="block" id="table">
        <header class="block-head">
            <h2>Your table</h2>
            <div class="tools">
                <input v-model="filter" type="search" class="ne-input" placeholder="Filter…" aria-label="Filter the table" />
                <select v-model="origin" class="ne-input" aria-label="Show rows from">
                    <option v-for="o in ORIGINS" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
            </div>
        </header>

        <form class="add" @submit.prevent="addRow">
            <input v-model="draft.siglum" class="ne-input" list="iiif-sources" placeholder="Manuscript (siglum)" aria-label="Manuscript" />
            <datalist id="iiif-sources"><option v-for="s in allSources" :key="s" :value="s" /></datalist>
            <input v-model="draft.url" class="ne-input url" placeholder="Manifest or image address (https://…)" aria-label="Address" />
            <select v-model="draft.kind" class="ne-input" aria-label="Kind">
                <option value="manifest">Manifest</option>
                <option value="images">Image API</option>
            </select>
            <input v-model="draft.label" class="ne-input" placeholder="Label (optional)" aria-label="Label" />
            <label class="ne-check" title="Use it for this manuscript if it has no manifest yet"><input type="checkbox" v-model="draft.useNow" /> Use now</label>
            <button class="ne-btn ne-btn--primary" type="submit">Add</button>
        </form>
        <ul v-if="draftSuggestions.length" class="draft-suggest">
            <li v-for="c in draftSuggestions" :key="c.record.id">
                <MmmoCandidate :record="c.record" :reasons="c.reasons" :confidence="c.confidence">
                    <button class="ne-btn ne-btn--sm" type="button" @click="takeForDraft(c.record)">Fill in its manifest</button>
                </MmmoCandidate>
            </li>
        </ul>
        <p v-if="draftError" class="ne-note ne-note--error" role="alert">{{ draftError }}</p>

        <div v-if="!rows.length" class="ne-empty">Nothing here yet. Add a manifest above, or take a suggestion below.</div>
        <div v-else class="scroll">
            <table class="ne-table" data-table="iiif">
                <thead><tr><th>Manuscript</th><th>Address</th><th>Kind</th><th>From</th><th>Label</th><th></th></tr></thead>
                <tbody>
                    <tr v-for="r in shown" :key="r.key" :class="{ 'in-use': r.inUse && r.kind === 'manifest' }">
                        <td class="siglum"><strong>{{ r.siglum }}</strong></td>
                        <td class="address">
                            <input v-if="r.entry" class="ne-input url-edit" :value="r.url" :aria-label="`Address for ${r.siglum}`" @change="setUrl(r, $event.target.value)" />
                            <a v-else :href="r.url" target="_blank" rel="noopener" :title="r.url" class="ellipsis">{{ r.url }}</a>
                        </td>
                        <td>{{ r.kind === 'images' ? 'Image API' : 'Manifest' }}</td>
                        <td><span class="ne-chip" :class="`from-${r.origin}`">{{ ORIGIN_LABEL[r.origin] }}</span></td>
                        <td class="label">{{ r.label }}</td>
                        <td class="actions">
                            <span class="btns">
                                <template v-if="r.entry">
                                    <span v-if="r.inUse" class="using">✓ in use</span>
                                    <button v-if="r.inUse" class="ne-btn ne-btn--sm" @click="stopUsing(r)">Stop using</button>
                                    <button v-else-if="r.kind === 'manifest'" class="ne-btn ne-btn--sm" @click="use(r)">Use</button>
                                    <button class="ne-btn ne-btn--sm ne-btn--ghost" :aria-label="`Remove the row for ${r.siglum}`" title="Remove this row" @click="remove(r)">✕</button>
                                </template>
                                <button v-else-if="r.origin === 'linked'" class="ne-btn ne-btn--sm" title="Keep this address in your table" @click="adopt(r)">Add to my table</button>
                                <span v-else class="ne-muted note">used automatically</span>
                            </span>
                        </td>
                    </tr>
                    <tr v-if="!shown.length"><td colspan="6" class="empty-row">No row matches.</td></tr>
                </tbody>
            </table>
        </div>
    </section>

    <!-- Suggestions -->
    <section class="block" id="suggestions">
        <header class="block-head">
            <h2>Suggestions <span v-if="suggestions.length" class="ne-chip">{{ suggestions.length }}</span></h2>
            <span class="ne-muted small">{{ withoutImages }} manuscript{{ withoutImages === 1 ? '' : 's' }} without images</span>
        </header>
        <p v-if="!mmmo.ready.value" class="ne-muted">Suggestions need the {{ MMMO_NAME }} catalogue (see above).</p>
        <p v-else-if="!suggestions.length" class="ne-empty">Nothing to suggest: every manuscript without images has no match with a manifest in the catalogue{{ withoutImages ? '' : ', or all of them have images already' }}.</p>
        <template v-else>
            <p class="ne-muted lead">The catalogue knows a manifest for these manuscripts, judged by library, shelfmark and date. Check that it is the right book before taking it.</p>
            <ul class="sugg">
                <li v-for="s in visibleSuggestions" :key="s.source" class="sugg-item">
                    <div class="sugg-for">
                        <strong>{{ s.source }}</strong>
                        <span class="ne-muted">{{ [metaOf(s.source, 'bibliotheksort'), metaOf(s.source, 'bibliothekssignatur'), metaOf(s.source, 'datierung') || metaOf(s.source, 'jahrhundert')].filter(Boolean).join(' · ') }}</span>
                    </div>
                    <ul class="cands">
                        <li v-for="c in s.candidates" :key="c.record.id">
                            <MmmoCandidate :record="c.record" :reasons="c.reasons" :confidence="c.confidence">
                                <button class="ne-btn ne-btn--sm ne-btn--primary" @click="acceptSuggestion(s.source, c)">Use this manifest</button>
                                <button class="ne-btn ne-btn--sm ne-btn--ghost" @click="rejectSuggestion(s.source, c)">Not this one</button>
                            </MmmoCandidate>
                        </li>
                    </ul>
                </li>
            </ul>
            <button v-if="suggestions.length > SUGGESTION_LIMIT && !showAll" class="ne-btn" @click="showAll = true">Show all {{ suggestions.length }}</button>
        </template>
    </section>

    <!-- Search -->
    <section class="block" id="search">
        <header class="block-head"><h2>Search the catalogue</h2></header>
        <input v-model="searchText" type="search" class="ne-input wide" :disabled="!mmmo.ready.value" placeholder="Library, city, shelfmark, type… e.g. “Admont graduale”" aria-label="Search the catalogue" />
        <ul v-if="results.length" class="results">
            <li v-for="r in results" :key="r.id">
                <MmmoCandidate :record="r">
                    <button v-if="r.manifest" class="ne-btn ne-btn--sm" @click="addFromCatalogue(r)">Add to my table</button>
                </MmmoCandidate>
            </li>
        </ul>
        <p v-else-if="searchText.trim().length >= 2 && mmmo.ready.value" class="ne-muted">No match.</p>
    </section>

    <AddManuscriptDialog :open="adding" @close="adding = false" @added="onAdded" />
</div>
</template>

<style scoped>
.iiif-view { max-width: 1180px; margin: 0 auto; padding: var(--space-4) var(--space-5) var(--space-6); }
.catalogue { margin: 0 0 var(--space-4); font-size: 0.88rem; }
.catalogue.ne-note { font-size: 0.88rem; }
code { background: var(--color-surface-muted); padding: 0.05em 0.35em; border-radius: var(--radius-sm); font-size: 0.9em; }
.block { margin-bottom: var(--space-5); padding: var(--space-4) var(--space-5); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
.block-head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-3); }
.block-head h2 { margin: 0; font-size: 1.05rem; display: flex; align-items: center; gap: var(--space-2); }
.small { font-size: 0.82rem; }
.tools { display: flex; gap: var(--space-2); }
.add { display: flex; gap: var(--space-2); flex-wrap: wrap; align-items: center; margin-bottom: var(--space-3); padding: var(--space-3); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.add .ne-input { flex: 1 1 9rem; }
.add .url { flex: 3 1 16rem; }
.draft-suggest { list-style: none; margin: 0 0 var(--space-3); padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.draft-suggest li { padding: var(--space-2) var(--space-3); border: 1px dashed var(--color-border-hover); border-radius: var(--radius-md); }
.ne-note { margin: 0 0 var(--space-3); }
.scroll { overflow-x: auto; }
.siglum { white-space: nowrap; }
.address { max-width: 26rem; }
.url-edit { width: 100%; font-size: 0.82rem; }
.ellipsis { display: block; max-width: 26rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.82rem; }
.label { font-size: 0.85rem; color: var(--color-text-muted); }
.in-use td { background: color-mix(in srgb, var(--color-success-light) 45%, transparent); }
.using { font-size: 0.78rem; font-weight: 700; color: var(--color-success-dark); }
.btns { display: inline-flex; align-items: center; gap: var(--space-2); }
.note { font-size: 0.8rem; }
.empty-row { text-align: center; color: var(--color-text-muted); padding: var(--space-4); }
.from-mmmo { background: var(--color-accent-light); color: var(--color-accent-dark); }
.from-own { background: var(--color-primary-light); color: var(--color-primary-dark); }
.from-linked { background: var(--color-success-light); color: var(--color-success-dark); }
.lead { margin: 0 0 var(--space-3); font-size: 0.9rem; }
.sugg, .cands, .results { list-style: none; margin: 0 0 var(--space-3); padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.sugg-item { padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg); }
.sugg-for { display: flex; gap: var(--space-3); align-items: baseline; flex-wrap: wrap; margin-bottom: var(--space-2); }
.cands li { padding: var(--space-2) var(--space-3); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.results li { padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.wide { width: 100%; margin-bottom: var(--space-3); }
</style>

<script setup>
import { computed, ref, shallowRef, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import CiteDialog from '../../components/docs/CiteDialog.vue';
import StarredDialog from '../../components/docs/StarredDialog.vue';
import PicturesDialog from '../../components/docs/PicturesDialog.vue';
import { provideDocs } from '../../composables/useDocsContext';
import { openDocumentation, previewUnpublished, setPreviewUnpublished, useDocumentations } from '../../composables/useDocumentations';
import { LOCAL_ID, combineId, combinedParts, isCombineId } from '../../utils/documentation';
import { canPin, isPinned, latestId, shortSha } from '../../utils/documentationVersion';

/**
 * The frame of one documentation: a slim bar (where you are, how to leave), the documentation's
 * title and authors, its pages as tabs, and the one place where a reference is turned into
 * a link and a citation. The pages themselves only read.
 */
const props = defineProps({ endpoint: { type: String, required: true } });
const route = useRoute();
const router = useRouter();

const state = shallowRef(openDocumentation(props.endpoint));
watch(() => props.endpoint, (id) => { state.value = openDocumentation(id); });

const citing = ref(null); // { target, url, sub, query }
const docs = provideDocs(state, {
    cite(target, sub = '', query = {}) {
        // what is cited is named with where its manuscript is kept
        const entry = docs.entry(target.entryId) || docs.entries.value.find(e => e.source === target.source);
        const named = entry && !target.holding ? { ...target, holding: docs.holding(entry.id) } : target;
        // in a combination, a manuscript is cited by the documentation it comes from
        citing.value = { target: named, url: docs.permalink(sub, query), sub, query, info: entry && entry.origin ? entry.origin : null };
    }
});
const pinnedFor = computed(() => (citing.value ? () => docs.pinned(citing.value.sub, citing.value.query) : null));

const ready = computed(() => state.value.status === 'ready');

// ---- the starred snippets ---------------------------------------------------------------------
const starsOpen = ref(false);
const picturesOpen = ref(false);
function showStarred({ entry, snippet }) {
    starsOpen.value = false;
    router.push({ path: docs.manuscriptPath(entry.id), query: { snippet: snippet.id } });
}
const info = computed(() => (ready.value ? state.value.index.info : null));
const isLocal = computed(() => props.endpoint === LOCAL_ID);
const parts = computed(() => combinedParts(props.endpoint));
const combined = computed(() => isCombineId(props.endpoint));
const includesLocal = computed(() => isLocal.value || parts.value.includes(LOCAL_ID));

// ---- looking at several documentations together ---------------------------------------------
const { endpoints } = useDocumentations();
const combining = ref(false);
const candidates = computed(() => {
    const here = new Set(combined.value ? parts.value : [props.endpoint]);
    return [{ id: LOCAL_ID, name: 'This browser (your own work)' }, ...endpoints.value].filter(e => !here.has(e.id));
});
function combineWith(id) {
    combining.value = false;
    const ids = combined.value ? parts.value : [props.endpoint];
    router.push(`/docs/${encodeURIComponent(combineId([...ids, id]))}`);
}
function leave(id) {
    const rest = parts.value.filter(p => p !== id);
    router.push(rest.length > 1 ? `/docs/${encodeURIComponent(combineId(rest))}` : `/docs/${encodeURIComponent(rest[0])}`);
}
const partName = (id) => {
    const part = ready.value && info.value.parts ? info.value.parts.find(p => p.id === id) : null;
    return part ? part.title : (id === LOCAL_ID ? 'This browser' : id);
};
const pinnedVersion = computed(() => (ready.value && isPinned(state.value.endpoint) ? shortSha(state.value.endpoint.branch) : ''));
const latestPath = computed(() => (pinnedVersion.value ? `/docs/${encodeURIComponent(latestId(state.value.endpoint))}` : ''));

const tabs = computed(() => [
    { label: 'Manuscripts', badge: ready.value ? state.value.index.manuscripts.length : undefined, to: docs.path(), active: route.name === 'docs_catalogue' || route.name === 'docs_manuscript' },
    { label: 'Synopsis', to: docs.path('/table'), active: route.name === 'docs_table' },
    { label: 'About', to: docs.path('/about'), active: route.name === 'docs_about' }
]);

watch([ready, info, () => route.params.source, () => route.name], () => {
    const page = route.name === 'docs_manuscript' ? `${route.params.source} — ` : route.name === 'docs_table' ? 'Synopsis — ' : route.name === 'docs_about' ? 'About — ' : '';
    document.title = ready.value ? `${page}${info.value.title}${info.value.title === 'Neumedocs' ? '' : ' — Neumedocs'}` : 'Documentation — Neumedocs';
}, { immediate: true });

// A dialog about one thing must not stay open over another page.
watch(() => route.fullPath, () => { citing.value = null; });

function retry() { state.value = openDocumentation(props.endpoint, { refresh: true }); }
function citeWhole() {
    // a combination has no authors of its own: each documentation in it is cited on its own page
    if (combined.value) router.push(docs.path('/about'));
    else docs.cite({ kind: 'documentation' }, '');
}
</script>

<template>
<div class="docs docs-classic">
    <header class="bar">
        <RouterLink to="/docs" class="brand" aria-label="Front page">
            Neumedocs
        </RouterLink>
        <!-- the name of the documentation, unless it is the site's own name -->
        <span v-if="(ready ? info.title : '') !== 'Neumedocs'" class="crumbs here">{{ ready ? info.title : (state.endpoint ? state.endpoint.name : endpoint) }}</span>
 <span class="grow"></span>
        <button v-if="ready" type="button" class="stars" :title="docs.stars.count.value ? 'The snippets you starred' : 'Star snippets to collect them here'" @click="starsOpen = true">
            <span aria-hidden="true">{{ docs.stars.count.value ? '★' : '☆' }}</span> Starred<span v-if="docs.stars.count.value" class="stars-n">{{ docs.stars.count.value }}</span>
        </button>
        <RouterLink v-if="isLocal" to="/workspace" class="ne-btn ne-btn--sm">Back to the editor</RouterLink>
        <RouterLink v-else to="/projects" class="ne-btn ne-btn--sm ne-btn--ghost">Editor →</RouterLink>
    </header>

    <div v-if="state.status === 'loading'" class="center" role="status">
        <p>Opening the documentation…</p>
    </div>

    <div v-else-if="state.status === 'error'" class="center">
        <div class="problem ne-note ne-note--error" role="alert">
            <strong>{{ state.error }}</strong>
            <p v-if="state.hint">{{ state.hint }}</p>
            <div class="actions">
                <button type="button" class="ne-btn" @click="retry">Try again</button>
                <RouterLink to="/docs" class="ne-btn ne-btn--ghost">All documentations</RouterLink>
            </div>
        </div>
    </div>

    <template v-else>
        <div v-if="includesLocal" class="preview ne-note ne-note--info">
            <strong>{{ isLocal ? 'Preview.' : 'Includes your own work.' }}</strong>
            Your own work is {{ previewUnpublished ? 'shown whether it is published or not' : 'shown as readers will see it' }}. Nobody else sees it, and links made here open only in this browser, until you put the files on a server —
            <RouterLink to="/workspace/share?section=publish">Workspace → Publish a documentation</RouterLink>.
            <label class="ne-check also"><input type="checkbox" :checked="previewUnpublished" @change="setPreviewUnpublished($event.target.checked)" /> Also show what is not published yet</label>
        </div>

        <div v-if="combined && state.source.problems.length" class="preview ne-note ne-note--warn">
            <strong>Not all could be opened.</strong>
            <span v-for="p in state.source.problems" :key="p.id"> {{ p.id }}: {{ p.message }}</span>
        </div>
        <div v-if="combined && state.index.signClashes.length" class="preview ne-note ne-note--warn">
            The signs {{ state.index.signClashes.join(', ') }} are drawn differently in different documentations here; the drawing of the first is used for all, so a code with {{ state.index.signClashes.length === 1 ? 'that sign' : 'those signs' }} may look wrong in the others.
        </div>

        <div v-if="pinnedVersion" class="preview ne-note ne-note--info">
            <strong>An earlier version.</strong> You are looking at this documentation as it was at <code>{{ pinnedVersion }}</code>, the version a link or a citation named.
            <RouterLink :to="latestPath">Open the latest version</RouterLink>
        </div>

        <section class="head">
            <div class="head-text">
                <h1>{{ info.title }}</h1>
                <p v-if="info.authors.length" class="authors">{{ info.authors.join(', ') }}<template v-if="info.year"> · {{ info.year }}</template></p>
                <ul v-if="combined" class="parts" aria-label="The documentations in this combination">
                    <li v-for="p in parts" :key="p"><span>{{ partName(p) }}</span><button v-if="parts.length > 1" type="button" :aria-label="`Leave out ${partName(p)}`" title="Leave this one out" @click="leave(p)">×</button></li>
                </ul>
                <p v-if="info.description" class="description">{{ info.description }}</p>
            </div>
            <div class="head-actions">
                <div class="combine">
                    <button type="button" class="ne-btn" :aria-expanded="combining" title="Look at another documentation together with this one: your own work with a repository's, say" @click="combining = !combining">Combine with… <span aria-hidden="true">▾</span></button>
                    <ul v-if="combining" class="combine-menu" role="menu">
                        <li v-for="c in candidates" :key="c.id" role="none"><button type="button" role="menuitem" @click="combineWith(c.id)">{{ c.name }}</button></li>
                        <li v-if="!candidates.length" class="none">There is nothing else to combine with. Documentations are listed on the start page.</li>
                    </ul>
                </div>
                <button v-if="ready && !combined" type="button" class="ne-btn" title="Keep the snippet pictures in this browser, so they load at once" @click="picturesOpen = true">Pictures…</button>
                <button type="button" class="ne-btn" :title="combined ? 'Each documentation in a combination is cited on its own' : 'A link to this documentation and suggestions for citing it'" @click="citeWhole">{{ combined ? 'How to cite…' : 'Cite…' }}</button>
            </div>
        </section>

        <nav class="tabs" aria-label="Pages of this documentation">
            <RouterLink v-for="t in tabs" :key="t.label" :to="t.to" class="tab" :class="{ on: t.active }" :aria-current="t.active ? 'page' : null">
                {{ t.label }}<span v-if="t.badge !== undefined" class="badge">{{ t.badge }}</span>
            </RouterLink>
        </nav>

        <main class="page">
            <RouterView />
        </main>
    </template>

    <PicturesDialog v-if="ready && !combined" :open="picturesOpen" @close="picturesOpen = false" />
    <StarredDialog :open="starsOpen" @close="starsOpen = false" @open-snippet="showStarred" />

    <CiteDialog
        :open="!!citing"
        :info="(citing && citing.info) || info || { title: '', authors: [] }"
        :generated="(citing && citing.info && citing.info.generated) || (ready ? state.index.generated : '')"
        :target="citing && citing.target"
        :url="citing ? citing.url : ''"
        :pinned="canPin(state.endpoint) ? pinnedFor : null"
        @close="citing = null"
    />
</div>
</template>

<style scoped>
.docs { min-height: 100%; background: var(--color-bg); display: flex; flex-direction: column; }
/* a running head, as at the top of a printed page: the name, where one is, a hairline below */
.bar { display: flex; align-items: center; gap: var(--space-4); padding: 0 var(--space-5); min-height: 52px; background: var(--color-bg); border-bottom: 1px solid var(--color-border); color: var(--color-text-muted); }
.brand { color: var(--color-text) !important; font-size: 1.15rem; text-decoration: none; white-space: nowrap; letter-spacing: 0.01em; }
.crumbs { display: flex; align-items: center; gap: var(--space-2); font-size: 0.92rem; font-style: italic; min-width: 0; }
.crumbs a { color: var(--color-text-muted); text-decoration: none; }
.crumbs a:hover { color: var(--color-primary); text-decoration: underline; }
.here { color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.grow { flex: 1; }
.bar .ne-btn--ghost { color: var(--color-text-muted); }
.stars { border: 1px solid var(--color-border); background: transparent; color: var(--color-text); border-radius: var(--radius-md); padding: 0.2em 0.7em; font: inherit; font-size: 0.9rem; cursor: pointer; }
.stars:hover { border-color: var(--color-border-hover); }
.stars-n { margin-left: 6px; color: var(--color-primary); font-weight: 600; }

.center { max-width: 44rem; margin: var(--space-6) auto; padding: 0 var(--space-4); width: 100%; box-sizing: border-box; }
.problem p { margin: var(--space-2) 0; }
.actions { display: flex; gap: var(--space-2); margin-top: var(--space-3); }
.preview { margin: var(--space-3) var(--space-5) 0; }

.head { display: flex; gap: var(--space-4); align-items: flex-start; justify-content: space-between; padding: var(--space-5) var(--space-5) var(--space-3); }
.head h1 { margin: 0; font-size: 2rem; }
.authors { margin: 4px 0 0; color: var(--color-text-muted); font-style: italic; }
.description { margin: var(--space-2) 0 0; max-width: 70ch; color: var(--color-text-muted); font-style: italic; font-size: 1.05rem; }
.head-actions { flex: none; display: flex; gap: var(--space-2); align-items: flex-start; }
.combine { position: relative; }
.combine-menu { position: absolute; right: 0; top: calc(100% + 4px); z-index: 50; min-width: 16rem; margin: 0; padding: 4px; list-style: none; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); }
.combine-menu button { width: 100%; text-align: left; border: none; background: none; padding: 0.5em 0.8em; border-radius: var(--radius-sm); font-size: 0.88rem; cursor: pointer; }
.combine-menu button:hover { background: var(--color-primary-light); }
.combine-menu .none { padding: 0.5em 0.8em; font-size: 0.82rem; color: var(--color-text-muted); }
.parts { list-style: none; margin: var(--space-2) 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.parts li { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 10px; border: 1px solid var(--color-primary-muted); border-radius: 999px; background: var(--color-primary-light); font-size: 0.8rem; }
.parts button { border: none; background: none; cursor: pointer; font-size: 1rem; line-height: 1; color: var(--color-text-muted); }
.parts button:hover { color: var(--color-danger); }
.also { display: inline-flex; margin-left: var(--space-3); font-size: 0.86rem; }

.tabs { display: flex; gap: var(--space-1); padding: 0 var(--space-5); border-bottom: 1px solid var(--color-border); }
.tab { padding: 0.5em 1em; color: var(--color-text-muted); text-decoration: none; border-bottom: 1px solid transparent; margin-bottom: -1px; font-variant: small-caps; letter-spacing: 0.06em; font-size: 1.05rem; }
.tab:hover { color: var(--color-text); }
.tab.on { color: var(--color-text); border-bottom-color: var(--color-primary); }
.badge { margin-left: 6px; font-size: 0.85rem; color: var(--color-text-light); font-variant: normal; }

.page { flex: 1; min-height: 0; padding: var(--space-4) var(--space-5) var(--space-6); }
@media (max-width: 720px) { .head { flex-direction: column; } .head, .tabs, .page { padding-left: var(--space-3); padding-right: var(--space-3); } .preview { margin-left: var(--space-3); margin-right: var(--space-3); } }
</style>

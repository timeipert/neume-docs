<script setup>
import { computed, ref, shallowRef, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import CiteDialog from '../../components/docs/CiteDialog.vue';
import StarredDialog from '../../components/docs/StarredDialog.vue';
import { provideDocs } from '../../composables/useDocsContext';
import { openDocumentation } from '../../composables/useDocumentations';
import { LOCAL_ID } from '../../utils/documentation';
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
        citing.value = { target: named, url: docs.permalink(sub, query), sub, query };
    }
});
const pinnedFor = computed(() => (citing.value ? () => docs.pinned(citing.value.sub, citing.value.query) : null));

const ready = computed(() => state.value.status === 'ready');

// ---- the starred snippets ---------------------------------------------------------------------
const starsOpen = ref(false);
function showStarred({ entry, snippet }) {
    starsOpen.value = false;
    router.push({ path: docs.manuscriptPath(entry.id), query: { snippet: snippet.id } });
}
const info = computed(() => (ready.value ? state.value.index.info : null));
const isLocal = computed(() => props.endpoint === LOCAL_ID);
const pinnedVersion = computed(() => (ready.value && isPinned(state.value.endpoint) ? shortSha(state.value.endpoint.branch) : ''));
const latestPath = computed(() => (pinnedVersion.value ? `/docs/${encodeURIComponent(latestId(state.value.endpoint))}` : ''));

const tabs = computed(() => [
    { label: 'Manuscripts', badge: ready.value ? state.value.index.manuscripts.length : undefined, to: docs.path(), active: route.name === 'docs_catalogue' || route.name === 'docs_manuscript' },
    { label: 'Neume table', to: docs.path('/table'), active: route.name === 'docs_table' },
    { label: 'About', to: docs.path('/about'), active: route.name === 'docs_about' }
]);

watch([ready, info, () => route.params.source, () => route.name], () => {
    const page = route.name === 'docs_manuscript' ? `${route.params.source} — ` : route.name === 'docs_table' ? 'Neume table — ' : route.name === 'docs_about' ? 'About — ' : '';
    document.title = ready.value ? `${page}${info.value.title} — neume-docs` : 'Documentation — neume-docs';
}, { immediate: true });

// A dialog about one thing must not stay open over another page.
watch(() => route.fullPath, () => { citing.value = null; });

function retry() { state.value = openDocumentation(props.endpoint, { refresh: true }); }
function citeWhole() { docs.cite({ kind: 'documentation' }, ''); }
</script>

<template>
<div class="docs">
    <header class="bar">
        <RouterLink to="/" class="brand" aria-label="neume-docs start">
            <span class="mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16"><ellipse cx="8" cy="8" rx="4.2" ry="3.2" transform="rotate(-18 8 8)" fill="currentColor"/><ellipse cx="16" cy="16" rx="4.2" ry="3.2" transform="rotate(-18 16 16)" fill="currentColor"/></svg></span>
            neume-docs
        </RouterLink>
        <nav class="crumbs" aria-label="Where you are">
            <RouterLink to="/docs">Documentations</RouterLink>
            <span aria-hidden="true">/</span>
            <span class="here">{{ ready ? info.title : (state.endpoint ? state.endpoint.name : endpoint) }}</span>
        </nav>
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
        <div v-if="isLocal" class="preview ne-note ne-note--info">
            <strong>Preview.</strong> This is what you have published in the editor, as readers will see it. Nobody else sees it until you put the files on a server —
            <RouterLink to="/workspace#publish">Workspace → Publish documentation</RouterLink>.
        </div>

        <div v-if="pinnedVersion" class="preview ne-note ne-note--info">
            <strong>An earlier version.</strong> You are looking at this documentation as it was at <code>{{ pinnedVersion }}</code>, the version a link or a citation named.
            <RouterLink :to="latestPath">Open the latest version</RouterLink>
        </div>

        <section class="head">
            <div class="head-text">
                <h1>{{ info.title }}</h1>
                <p v-if="info.authors.length" class="authors">{{ info.authors.join(', ') }}<template v-if="info.year"> · {{ info.year }}</template></p>
                <p v-if="info.description" class="description">{{ info.description }}</p>
            </div>
            <div class="head-actions">
                <button type="button" class="ne-btn" title="A link to this documentation and suggestions for citing it" @click="citeWhole">Cite…</button>
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

    <StarredDialog :open="starsOpen" @close="starsOpen = false" @open-snippet="showStarred" />

    <CiteDialog
        :open="!!citing"
        :info="info || { title: '', authors: [] }"
        :generated="ready ? state.index.generated : ''"
        :target="citing && citing.target"
        :url="citing ? citing.url : ''"
        :pinned="canPin(state.endpoint) ? pinnedFor : null"
        @close="citing = null"
    />
</div>
</template>

<style scoped>
.docs { min-height: 100%; background: var(--color-bg); display: flex; flex-direction: column; }
.bar { display: flex; align-items: center; gap: var(--space-4); padding: 0 var(--space-4); min-height: 48px; background: var(--color-nav-bg); color: var(--color-text-light); }
.brand { display: inline-flex; align-items: center; gap: var(--space-2); color: #fff !important; font-weight: 700; text-decoration: none; white-space: nowrap; }
.mark { display: inline-flex; width: 24px; height: 24px; align-items: center; justify-content: center; border-radius: 7px; background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%); }
.crumbs { display: flex; align-items: center; gap: var(--space-2); font-size: 0.86rem; min-width: 0; }
.crumbs a { color: var(--color-text-light); text-decoration: none; }
.crumbs a:hover { color: #fff; }
.here { color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.grow { flex: 1; }
.bar .ne-btn--ghost { color: var(--color-text-light); }
.stars { border: 1px solid rgba(255,255,255,0.2); background: transparent; color: #fff; border-radius: var(--radius-md); padding: 0.25em 0.7em; font-size: 0.84rem; cursor: pointer; }
.stars:hover { background: rgba(255,255,255,0.1); }
.stars-n { margin-left: 6px; padding: 0 6px; border-radius: 999px; background: #e0a100; color: #1e293b; font-weight: 700; font-size: 0.74rem; }

.center { max-width: 44rem; margin: var(--space-6) auto; padding: 0 var(--space-4); width: 100%; box-sizing: border-box; }
.problem p { margin: var(--space-2) 0; }
.actions { display: flex; gap: var(--space-2); margin-top: var(--space-3); }
.preview { margin: var(--space-3) var(--space-5) 0; }

.head { display: flex; gap: var(--space-4); align-items: flex-start; justify-content: space-between; padding: var(--space-5) var(--space-5) var(--space-3); }
.head h1 { margin: 0; font-size: 1.7rem; letter-spacing: -0.01em; }
.authors { margin: 4px 0 0; color: var(--color-text-muted); }
.description { margin: var(--space-2) 0 0; max-width: 70ch; color: var(--color-text); }
.head-actions { flex: none; }

.tabs { display: flex; gap: var(--space-1); padding: 0 var(--space-5); border-bottom: 1px solid var(--color-border); }
.tab { padding: 0.55em 1em; color: var(--color-text-muted); text-decoration: none; border-bottom: 2px solid transparent; margin-bottom: -1px; font-weight: 600; font-size: 0.92rem; }
.tab:hover { color: var(--color-text); }
.tab.on { color: var(--color-primary-hover); border-bottom-color: var(--color-primary); }
.badge { margin-left: 6px; padding: 0 7px; border-radius: 999px; background: var(--color-surface-muted); font-size: 0.74rem; color: var(--color-text-muted); }

.page { flex: 1; min-height: 0; padding: var(--space-4) var(--space-5) var(--space-6); }
@media (max-width: 720px) { .head { flex-direction: column; } .head, .tabs, .page { padding-left: var(--space-3); padding-right: var(--space-3); } .preview { margin-left: var(--space-3); margin-right: var(--space-3); } }
</style>

<script setup>
import { computed } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import ManagerSidebar from '../components/manager/ManagerSidebar.vue';
import PageWorkbench from '../components/pages/PageWorkbench.vue';
import IiifSetup from '../components/iiif/IiifSetup.vue';
import { useProjectsStore } from '../stores/projects';
import { useIiifStore } from '../stores/iiif';
import { useImageManifest } from '../composables/useImageManifest';
import { iiifStatus } from '../utils/iiifStatus';
import { projectPageLocation } from '../utils/projectChoices';

/**
 * The pages of every manuscript, on their own: a list of folios, and the workbench for the one
 * that is open. Seen from a project the same workbench opens inside it; here a strip names the
 * projects of the manuscript, or offers to start one.
 */
const route = useRoute();
const router = useRouter();
const projects = useProjectsStore();
const iiif = useIiifStore();
const { resolveIiifSource } = useImageManifest();

const text = (v) => (typeof v === 'string' ? v : '');
const source = computed(() => text(route.query.source));
const folio = computed(() => text(route.query.folio));
const line = computed(() => text(route.query.line) || text(route.query.region));
const code = computed(() => text(route.query.highlight));
const fromGallery = computed(() => route.query.return_to === 'annotations');

function onSelect({ source: src, folio: f }) {
    router.push({ query: { ...route.query, source: src, folio: f, line: undefined, region: undefined, highlight: undefined } });
}

function go(target) {
    const query = { ...route.query, region: undefined };
    if ('folio' in target) query.folio = target.folio;
    if ('line' in target) query.line = target.line || undefined;
    router.push({ query });
}

const imagesReady = computed(() => !source.value || iiifStatus(iiif, resolveIiifSource(source.value) || source.value).state === 'ready');
const projectsHere = computed(() => projects.projects.filter(p => p.source === source.value).slice(0, 3));

function backToGallery() {
    router.push({ name: 'annotations', params: { id: route.query.return_id }, query: { gallery: code.value || undefined } });
}
</script>

<template>
<div class="manager-layout">
    <ManagerSidebar :selectedSource="source || null" :selectedFolio="folio || null" @select="onSelect" />

    <section class="work">
        <div v-if="!source || (imagesReady && !folio)" class="choose">
            <strong>Choose a page.</strong>
            <p>Pick a folio of a manuscript in the list on the left to mark lines and signs on it.</p>
        </div>

        <div v-else-if="!imagesReady" class="no-images">
            <IiifSetup :source="source" purpose="browse and mark the pages of this manuscript" />
        </div>

        <template v-else>
            <div class="strip">
                <button v-if="fromGallery" class="ne-btn ne-btn--sm" @click="backToGallery">&larr; Back to the gallery</button>
                <strong>{{ source }} · f. {{ folio }}</strong>
                <span class="grow"></span>
                <template v-if="projectsHere.length">
                    <span class="ne-muted">In a project:</span>
                    <RouterLink v-for="p in projectsHere" :key="p.id" :to="projectPageLocation(p.id, { folio, code, line })" :title="`Open this page inside the project ${p.name}`">{{ p.name }} &rarr;</RouterLink>
                </template>
                <template v-else>
                    <span class="ne-muted">This manuscript has no project yet.</span>
                    <RouterLink :to="{ name: 'project_new', query: { source } }">Start one &rarr;</RouterLink>
                </template>
            </div>
            <PageWorkbench class="bench" :source="source" :folio="folio" :line="line" :code="code" @go="go" />
        </template>
    </section>
</div>
</template>

<style scoped>
.manager-layout { display: flex; height: 100%; min-height: 0; overflow: hidden; width: 100%; }
.work { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.strip { flex: 0 0 auto; display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; padding: 6px var(--space-4); background: var(--color-primary-light); border-bottom: 1px solid var(--color-border); font-size: 0.86rem; }
.strip .grow { flex: 1; }
.strip a { font-weight: 600; }
.bench { flex: 1; min-height: 0; }
.choose { padding: 40px; text-align: center; color: var(--color-text-muted); }
.choose strong { color: var(--color-text); font-size: 1.05rem; }
.choose p { margin: 6px 0 0; }
.no-images { padding: var(--space-5); overflow-y: auto; }
</style>

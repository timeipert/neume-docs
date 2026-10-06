<script setup>
import { computed, provide, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { useProjectsStore } from '../stores/projects';
import { useToast } from '../composables/useToast';
import { PROJECT_CONTEXT, useProject } from '../composables/useProject';
import { describeRange } from '../utils/projectData';
import PageHeader from '../components/ui/PageHeader.vue';
import ProjectTabs from '../components/projects/ProjectTabs.vue';
import ProjectSettingsDialog from '../components/projects/ProjectSettingsDialog.vue';

/**
 * The frame of one project: its name, and the four tabs that lead through the
 * work. What a tab shows is a child route, so every step has an address of its own.
 */
const route = useRoute();
const router = useRouter();
const store = useProjectsStore();
const toast = useToast();

const id = computed(() => String(route.params.id));
const context = useProject(id);
const { project, progress, hasTranscription, manuscriptFolios } = context;
provide(PROJECT_CONTEXT, context);

watch(id, (value) => store.markOpened(value), { immediate: true });

const settingsOpen = ref(false);

function remove() {
    const gone = store.remove(id.value);
    settingsOpen.value = false;
    if (!gone) return;
    router.push({ name: 'projects' });
    toast.show(`“${gone.name}” deleted. Its snippets are still with the manuscript.`, {
        action: { label: 'Undo', run: () => store.restore(gone) }
    });
}
</script>

<template>
<div class="shell">
    <div v-if="!project" class="missing ne-empty">
        <h2>This project does not exist (any more)</h2>
        <RouterLink :to="{ name: 'projects' }" class="ne-btn ne-btn--primary">All projects &rarr;</RouterLink>
    </div>

    <template v-else>
        <div class="top">
            <div class="wrap">
                <RouterLink :to="{ name: 'projects' }" class="back">&larr; Projects</RouterLink>
                <PageHeader :title="project.name">
                    <template #badge><span v-if="project.published" class="tag" title="Shown in the public views">Public</span></template>
                    <template #subtitle>
                        <p>{{ project.source }} · {{ describeRange(project.from, project.to) }}<template v-if="project.scribe"> · {{ project.scribe }}</template></p>
                    </template>
                    <template #actions>
                        <button class="ne-btn" @click="settingsOpen = true">Settings…</button>
                    </template>
                </PageHeader>
                <ProjectTabs :id="id" :project="project" :progress="progress" :project-count="store.projects.length" />
            </div>
        </div>

        <div class="body">
            <div class="wrap">
                <RouterView />
            </div>
        </div>

        <ProjectSettingsDialog
            :open="settingsOpen"
            :project="project"
            :folios="manuscriptFolios"
            :has-transcription="hasTranscription"
            @close="settingsOpen = false"
            @delete="remove"
        />
    </template>
</div>
</template>

<style scoped>
.shell { height: 100%; overflow-y: auto; box-sizing: border-box; }
.top { background: var(--color-surface); border-bottom: 1px solid var(--color-border); padding: 0 var(--space-6); }
.body { padding: var(--space-5) var(--space-6) var(--space-6); }
.wrap { max-width: 1500px; margin: 0 auto; }
.back { display: inline-block; margin-top: var(--space-3); font-size: 0.85rem; font-weight: 600; color: var(--color-text-muted); text-decoration: none; }
.back:hover { color: var(--color-primary); }
.top :deep(.page-header) { margin: var(--space-1) 0 var(--space-3); align-items: center; }
.top :deep(h1) { font-size: 1.5rem; }
.tag { margin-left: var(--space-2); font-size: 0.7rem; font-weight: 700; vertical-align: middle; padding: 1px 9px; border-radius: 999px; background: var(--color-success-light); color: var(--color-success-dark); }
.missing { max-width: 520px; margin: var(--space-6) auto; }
.missing h2 { margin: 0 0 var(--space-3); color: var(--color-text); font-size: 1.2rem; }
@media (max-width: 720px) { .top, .body { padding-left: var(--space-4); padding-right: var(--space-4); } }
</style>

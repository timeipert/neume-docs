<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useProjectsStore } from '../stores/projects';
import PageHeader from '../components/ui/PageHeader.vue';
import ProjectCard from '../components/projects/ProjectCard.vue';

const route = useRoute();
const router = useRouter();
const store = useProjectsStore();

const filter = ref(typeof route.query.q === 'string' ? route.query.q : '');
const projects = computed(() => {
    const q = filter.value.trim().toLowerCase();
    return [...store.projects]
        .filter(p => !q || `${p.name} ${p.source} ${p.scribe}`.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
});

</script>

<template>
<div class="projects-view">
    <div class="wrap">
        <PageHeader title="Projects">
            <template #actions>
                <button class="ne-btn ne-btn--primary" @click="router.push({ name: 'project_new' })">New project &rarr;</button>
            </template>
        </PageHeader>

        <div v-if="store.projects.length === 0" class="ne-empty empty">
            <h2>No project yet</h2>
            <p>A project is a range of folios in one manuscript, with its own table of neumes.</p>
            <button class="ne-btn ne-btn--primary" @click="router.push({ name: 'project_new' })">Create the first project &rarr;</button>
        </div>

        <template v-else>
            <input v-if="store.projects.length > 6 || filter" v-model="filter" type="search" class="ne-input search" placeholder="Find a project or manuscript…" aria-label="Find a project" />
            <div class="cards">
                <ProjectCard v-for="p in projects" :id="p.id" :key="p.id" />
                <p v-if="projects.length === 0" class="none">No project matches.</p>
            </div>
        </template>
    </div>
</div>
</template>

<style scoped>
.projects-view { height: 100%; overflow-y: auto; box-sizing: border-box; padding: var(--space-6); }
.wrap { max-width: 1300px; margin: 0 auto; }
.search { width: 300px; max-width: 100%; margin-bottom: var(--space-4); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-4); }
.none { grid-column: 1 / -1; text-align: center; color: var(--color-text-muted); font-style: italic; padding: var(--space-5); }
.empty { max-width: 560px; margin: var(--space-6) auto; }
.empty h2 { margin: 0 0 var(--space-2); color: var(--color-text); }
.empty p { margin: 0 0 var(--space-4); }
@media (max-width: 720px) { .projects-view { padding: var(--space-4); } }
</style>

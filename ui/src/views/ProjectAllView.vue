<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useProjectsStore } from '../stores/projects';
import { useAllProjectSnippets, useProjectContext } from '../composables/useProject';
import { useTranscriptionData } from '../composables/useTranscriptionData';
import { describeRange } from '../utils/projectData';
import { groupSelected, tableCodes } from '../utils/projectTable';
import ProjectTable from '../components/projects/ProjectTable.vue';
import SegmentedControl from '../components/ui/SegmentedControl.vue';
import SnippetThumb from '../components/projects/SnippetThumb.vue';

/**
 * Step 4: every project as a row, the columns they have chosen side by side.
 * The same two-level header as in the project's own tables; a cell opens that
 * project's table at that column.
 */
const router = useRouter();
const store = useProjectsStore();
const { project, library, glyphs } = useProjectContext();
const allSnippets = useAllProjectSnippets();
useTranscriptionData();

const scope = ref('standard');
const SCOPES = [
    { value: 'standard', label: 'Standard table', title: 'The columns chosen for each standard table' },
    { value: 'extended', label: 'Extended table', title: 'The standard columns and what each project added' }
];

const projects = computed(() => [...store.projects]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));

const codes = computed(() => {
    const all = new Set();
    for (const p of projects.value) for (const code of tableCodes(p, scope.value)) all.add(code);
    return all;
});
const groups = computed(() => groupSelected(library.value, codes.value));

const rows = computed(() => projects.value.map(p => ({
    id: p.id,
    name: p.name,
    sub: `${p.source} · ${describeRange(p.from, p.to)}`,
    to: { name: p.columnsChosen ? 'project_standard' : 'project_columns', params: { id: p.id } },
    snippets: allSnippets.value.get(p.id) || new Map(),
    has: new Set(tableCodes(p, scope.value)),
    active: p.id === project.value.id
})));

function openCell({ row, code }) {
    const p = store.get(row.id);
    const extendedOnly = p && !p.columns.includes(code) && p.extended.includes(code);
    router.push({ name: extendedOnly ? 'project_extended' : 'project_standard', params: { id: row.id }, query: { cell: code } });
}

</script>

<template>
<div class="all-view">
    <SegmentedControl v-model="scope" :options="SCOPES" label="Which columns" size="sm" />

    <p v-if="projects.length === 1" class="ne-note ne-note--info">Only one project so far. Another manuscript, or another hand, gets its own row.</p>

    <ProjectTable
        mode="matrix"
        :groups="groups"
        :rows="rows"
        :snippets="new Map()"
        :glyphs="glyphs"
        empty-text="No project has chosen columns yet."
        @open-cell="openCell"
    >
        <template #thumb="{ snippet }"><SnippetThumb :snippet="snippet" :width="64" :height="48" /></template>
    </ProjectTable>
</div>
</template>

<style scoped>
.all-view { display: flex; flex-direction: column; gap: var(--space-3); align-items: flex-start; }
.all-view > :deep(.pt-scroll), .all-view > :deep(.ne-note) { align-self: stretch; }
.ne-note { margin: 0; }
</style>

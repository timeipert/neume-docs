<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useProjectsStore } from '../stores/projects';
import { useIiifStore } from '../stores/iiif';
import { useAllProjectSnippets, useProjectContext } from '../composables/useProject';
import { useTranscriptionData } from '../composables/useTranscriptionData';
import { describeRange } from '../utils/projectData';
import { groupSelected, tableCodes } from '../utils/projectTable';
import { useManuscriptTable } from '../composables/useManuscriptTable';
import { useManuscriptFilter } from '../composables/useManuscriptFilter';
import { fold } from '../utils/manuscriptFilter';
import FilterPanel from '../components/metadata/FilterPanel.vue';
import ProjectTable from '../components/projects/ProjectTable.vue';
import SegmentedControl from '../components/ui/SegmentedControl.vue';
import SnippetThumb from '../components/projects/SnippetThumb.vue';

/**
 * Step 3: every project as a row, the columns they have chosen side by side.
 * The same two-level header as in the project's own tables; a cell opens that
 * project's table at that column.
 *
 * The projects can be narrowed by what the metadata of their manuscripts says, with the same filter
 * as on the Manuscripts page (and the same one: what is set there is set here, and the other way
 * round). A project is kept when its manuscript passes.
 */
const router = useRouter();
const store = useProjectsStore();
const iiif = useIiifStore();
const { project, library, glyphs } = useProjectContext();
const allSnippets = useAllProjectSnippets();
useTranscriptionData();
const table = useManuscriptTable();
const mf = useManuscriptFilter(table);
// The snippets of the other projects are cut from their own manuscripts' pages: those manifests are
// needed too, not only the one of the project this tab belongs to.
watch(() => store.projects.map(p => (p.images === 'iiif' ? p.source : '')), (sources) => {
    for (const source of new Set(sources)) if (source) iiif.ensureLoaded(source);
}, { immediate: true });

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

// ---- narrowing the projects by the metadata of their manuscript -----------------------------

const search = ref('');
const filterOpen = ref(false);
const filterCount = computed(() => mf.chips.value.length);

const shownProjects = computed(() => {
    const passing = mf.active.value ? new Set(mf.matching.value) : null;
    const q = fold(search.value);
    return projects.value.filter((p) => {
        if (passing && !passing.has(p.source)) return false;
        if (!q) return true;
        const meta = mf.filterable.value.map(col => table.value(p.source, col));
        return fold([p.name, p.source, ...meta].join(' ')).includes(q);
    });
});
const narrowed = computed(() => !!(filterCount.value || search.value));
function clearAll() { mf.clear(); search.value = ''; }
function settingsOfFilters() {
    router.push({ name: 'settings_fields', query: { section: 'manuscript-metadata' } });
}

const rows = computed(() => shownProjects.value.map(p => ({
    id: p.id,
    name: p.name,
    sub: [p.name === p.source ? '' : p.source, describeRange(p.from, p.to)].filter(Boolean).join(' · '),
    to: { name: 'project_standard', params: { id: p.id } },
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

    <div class="tools">
        <input v-model="search" type="search" class="search" placeholder="Search the projects…" aria-label="Search the projects" />
        <button type="button" class="ne-btn ne-btn--sm" :class="{ on: filterOpen || filterCount }" :aria-pressed="filterOpen" title="Show the projects whose manuscript has certain values, dates or numbers" @click="filterOpen = !filterOpen">
            Filter<template v-if="filterCount"> · {{ filterCount }}</template>
        </button>
        <button v-if="narrowed" type="button" class="ne-btn ne-btn--sm ne-btn--ghost" @click="clearAll">Clear</button>
        <span class="grow"></span>
        <span class="count">{{ rows.length }} of {{ projects.length }} projects</span>
    </div>

    <div v-if="mf.chips.value.length" class="chips" role="list" aria-label="Filters that are set">
        <span v-if="mf.chips.value.length > 1" class="join">{{ mf.filter.value.mode === 'any' ? 'Any of' : 'All of' }}</span>
        <button v-for="c in mf.chips.value" :key="c.key" type="button" class="chip" :class="{ bad: c.problem }" role="listitem" :title="c.problem || 'Open this filter'" @click="filterOpen = true">
            <span class="chip-key">{{ c.label }}</span><span class="chip-val">{{ c.text }}</span>
            <span class="chip-x" role="button" tabindex="0" :aria-label="`Remove the filter on ${c.label}`" @click.stop="mf.setRule(c.key, null)" @keydown.enter.stop="mf.setRule(c.key, null)">×</span>
        </button>
    </div>

    <p v-if="projects.length === 1" class="ne-note ne-note--info">Only one project so far. Another manuscript, or another hand, gets its own row.</p>

    <div class="work">
        <FilterPanel
            v-if="filterOpen"
            :f="mf"
            :shown="rows.length"
            :total="projects.length"
            :sigla="rows.map(r => r.name)"
            :heading-filters="false"
            @settings="settingsOfFilters"
            @close="filterOpen = false"
        />
        <div class="table-wrap">
            <ProjectTable
                mode="matrix"
                :groups="groups"
                :rows="rows"
                :snippets="new Map()"
                :glyphs="glyphs"
                :empty-text="narrowed && !rows.length ? 'No project matches. Clear the filter to see them all.' : 'No project has chosen columns yet.'"
                @open-cell="openCell"
            >
                <template #thumb="{ snippet }"><SnippetThumb :snippet="snippet" :width="84" :height="60" /></template>
            </ProjectTable>
        </div>
    </div>
</div>
</template>

<style scoped>
.all-view { display: flex; flex-direction: column; gap: var(--space-3); align-items: stretch; }
.ne-note { margin: 0; }
.tools { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.search { padding: 0.4em 0.8em; border: 1px solid var(--color-border-hover); border-radius: var(--radius-md); width: 18rem; max-width: 100%; font-size: 0.9rem; background: var(--color-surface); font-family: inherit; }
.grow { flex: 1; }
.count { color: var(--color-text-muted); font-size: 0.84rem; white-space: nowrap; }
.ne-btn.on { background: var(--color-primary-light); border-color: var(--color-primary-muted); color: var(--color-primary-dark); }

.chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.join { font-size: 0.76rem; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.chip { display: inline-flex; align-items: center; gap: 6px; max-width: 24rem; padding: 2px 4px 2px 10px; border: 1px solid var(--color-primary-muted); border-radius: 999px; background: var(--color-primary-light); font-size: 0.8rem; cursor: pointer; }
.chip:hover { background: var(--color-surface); }
.chip.bad { border-color: var(--color-danger); }
.chip-key { font-weight: 700; flex: none; }
.chip-val { color: var(--color-primary-dark); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip-x { width: 1.3rem; height: 1.3rem; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 1rem; line-height: 1; color: var(--color-text-muted); }
.chip-x:hover { background: var(--color-danger-light); color: var(--color-danger); }

.work { display: flex; gap: var(--space-3); align-items: flex-start; }
.work > :deep(.fp) { position: sticky; top: var(--space-3); max-height: calc(100vh - 2 * var(--space-3)); }
.table-wrap { flex: 1; min-width: 0; }
@media (max-width: 900px) { .work { flex-direction: column; } .work > :deep(.fp) { position: static; width: 100%; max-height: 22rem; } }
</style>

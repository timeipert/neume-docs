<script setup>
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useProjectsStore } from '../stores/projects';
import { usePatternLibraryStore } from '../stores/patternLibrary';
import { useToast } from '../composables/useToast';
import { useProjectContext } from '../composables/useProject';
import { getBaseCode } from '../utils/patternCode';
import { groupSelected } from '../utils/projectTable';
import ProjectTable from '../components/projects/ProjectTable.vue';
import SnippetThumb from '../components/projects/SnippetThumb.vue';
import CellDrawer from '../components/projects/CellDrawer.vue';
import LinesPanel from '../components/projects/LinesPanel.vue';
import LineEditor from '../components/projects/LineEditor.vue';
import PatternSearch from '../components/neume-table/PatternSearch.vue';

/**
 * Steps 2 and 3: the table of the project, with one cell per column to put
 * snippets in. The standard table is the columns chosen in step 1; the extended
 * table is those and whatever the pattern library has beyond them.
 */
const props = defineProps({ scope: { type: String, default: 'standard' } });

const route = useRoute();
const router = useRouter();
const store = useProjectsStore();
const patterns = usePatternLibraryStore();
const toast = useToast();
const {
    project, library, glyphs, freq, snippets, occurrences, occurringCounts, annotatedCounts,
    hasTranscription, occurrencesLoaded, standardCodes, extendedCodes
} = useProjectContext();

const extended = computed(() => props.scope === 'extended');
const codes = computed(() => (extended.value ? extendedCodes.value : standardCodes.value));
const groups = computed(() => groupSelected(library.value, codes.value));
const orderedCodes = computed(() => groups.value.flatMap(g => g.columns.map(c => c.code)));
const removable = computed(() => (extended.value ? new Set(project.value.extended) : new Set()));

// ---- the open cell ---------------------------------------------------------

const cell = computed(() => (route.query.cell ? getBaseCode(String(route.query.cell)) : ''));
const open = (code) => router.push({ query: { ...route.query, cell: code } });
const move = (code) => router.replace({ query: { ...route.query, cell: code } });
const close = () => router.replace({ query: { ...route.query, cell: undefined } });

// ---- lines of screenshots --------------------------------------------------

/** Screenshots of lines: the signs are marked on the line, in the line editor. */
const onLines = computed(() => project.value.images === 'screenshots' && project.value.snippets === 'lines');
const editor = ref(null); // { lineId, draft, code, focusSign }

function openLine({ lineId = '', draft, code = '', focusSign = '' } = {}) {
    editor.value = { lineId, draft: draft || { attrs: {} }, code, focusSign };
}

// ---- the extended table ----------------------------------------------------

const allCodes = computed(() => [...library.value.byCode.keys()]);
const inTable = computed(() => new Set(extendedCodes.value));
/** What the folios hold that the table does not have a column for: from the transcription, else the snippets. */
const counts = computed(() => {
    const map = hasTranscription.value && occurrencesLoaded.value ? occurringCounts.value : annotatedCounts.value;
    return Object.fromEntries(map);
});

function addColumn(code) {
    const p = project.value;
    if (p.columns.includes(code) || p.extended.includes(code)) return;
    store.setExtended(p.id, [...p.extended, code]);
    open(code);
}

function removeColumn(code) {
    const p = project.value;
    const before = [...p.extended];
    store.setExtended(p.id, before.filter(c => c !== code));
    if (cell.value === code) close();
    toast.show(`${code} taken out of the extended table. Its snippets are kept.`, {
        action: { label: 'Undo', run: () => store.setExtended(p.id, before) }
    });
}

/** A code the library did not have: made, and put in the table. */
function createColumn(code) {
    patterns.addManualPattern(code);
    toast.show(`${code} added to the pattern library.`, { tone: 'success' });
    addColumn(code);
}

const next = computed(() => (extended.value
    ? { name: 'project_all', label: 'All manuscripts' }
    : { name: 'project_extended', label: 'Extended table' }));
</script>

<template>
<div class="table-view">
    <div v-if="!groups.length" class="ne-empty empty">
        <p>No columns yet.</p>
        <RouterLink :to="{ name: 'project_columns', params: { id: project.id } }" class="ne-btn ne-btn--primary">Choose columns &rarr;</RouterLink>
    </div>

    <div v-else class="layout" :class="{ 'layout--aside': extended || cell }">
        <div class="main">
            <LinesPanel v-if="onLines" @open="openLine({ lineId: $event })" @add="openLine({ draft: { attrs: { ...$event } } })" />

            <ProjectTable
                mode="fill"
                :groups="groups"
                :snippets="snippets"
                :occurrences="hasTranscription && occurrencesLoaded ? occurrences : null"
                :glyphs="glyphs"
                :removable="removable"
                :active="cell"
                @open="open"
                @remove="removeColumn"
            >
                <template #thumb="{ snippet }"><SnippetThumb :snippet="snippet" :width="56" :height="42" /></template>
            </ProjectTable>

            <footer class="next">
                <RouterLink :to="{ name: next.name, params: { id: project.id } }" class="ne-btn ne-btn--primary">{{ next.label }} &rarr;</RouterLink>
            </footer>
        </div>

        <aside v-if="cell || extended" class="aside">
            <CellDrawer v-if="cell" :key="cell" :code="cell" :codes="orderedCodes" @close="close" @navigate="move" @open-line="openLine" />
            <PatternSearch
                v-else
                :all-codes="allCodes"
                :freq="freq"
                :glyphs="glyphs"
                :counts="counts"
                :in-table="inTable"
                @add="addColumn"
                @create="createColumn"
            />
        </aside>
    </div>

    <LineEditor
        v-if="editor"
        :open="true"
        :line-id="editor.lineId"
        :draft="editor.draft"
        :code="editor.code"
        :focus-sign="editor.focusSign"
        @update:line-id="editor.lineId = $event"
        @close="editor = null"
    />
</div>
</template>

<style scoped>
.table-view { display: flex; flex-direction: column; gap: var(--space-4); }
.empty { max-width: 560px; margin: var(--space-5) auto; }
.empty p { margin: 0 0 var(--space-3); }

.layout { display: block; }
.layout--aside { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: var(--space-5); align-items: start; }
.main { min-width: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.aside { position: sticky; top: var(--space-3); min-width: 0; }
.aside :deep(.panel) { max-height: calc(100vh - 150px); overflow: hidden; }
.next { display: flex; justify-content: flex-end; }

@media (max-width: 1100px) {
    .layout--aside { grid-template-columns: 1fr; }
    .aside { position: static; order: -1; }
}
</style>

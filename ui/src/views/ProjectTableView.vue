<script setup>
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useProjectsStore } from '../stores/projects';
import { usePatternLibraryStore } from '../stores/patternLibrary';
import { useToast } from '../composables/useToast';
import { useProjectContext } from '../composables/useProject';
import { useColumnChoice } from '../composables/useColumnChoice';
import { useSettingsStore } from '../stores/settings';
import { getBaseCode } from '../utils/patternCode';
import { filterByPaleo, paleoOf } from '../utils/paleo';
import { groupSelected, selectColumn } from '../utils/projectTable';
import ProjectTable from '../components/projects/ProjectTable.vue';
import SegmentedControl from '../components/ui/SegmentedControl.vue';
import AddPatternDialog from '../components/projects/AddPatternDialog.vue';
import VariantEditorModal from '../components/VariantEditorModal.vue';
import SnippetThumb from '../components/projects/SnippetThumb.vue';
import CellDrawer from '../components/projects/CellDrawer.vue';
import LinesPanel from '../components/projects/LinesPanel.vue';
import ScreenshotsPanel from '../components/projects/ScreenshotsPanel.vue';
import IiifSetup from '../components/iiif/IiifSetup.vue';
import LineEditor from '../components/projects/LineEditor.vue';
import PatternSearch from '../components/neume-table/PatternSearch.vue';

/**
 * Steps 1 and 2: the table of the project, with one cell per column to put
 * snippets in.
 *
 * The standard table is where a project starts. It offers every possibility —
 * the standard shapes with their ways of writing and their variants (the virga
 * among them), a group for each special sign, clef and custos — and the person
 * chooses the columns right in it: tick a header, or fill a cell. The extended
 * table is those columns and whatever the pattern library has beyond them.
 */
const props = defineProps({ scope: { type: String, default: 'standard' } });

const route = useRoute();
const router = useRouter();
const store = useProjectsStore();
const patterns = usePatternLibraryStore();
const toast = useToast();
const context = useProjectContext();
const {
    project, library, glyphs, freq, snippets, occurrences, occurringCounts, annotatedCounts,
    hasTranscription, occurrencesLoaded, standardCodes, extendedCodes, needsIiif
} = context;

const settings = useSettingsStore();
const extended = computed(() => props.scope === 'extended');

// ---- paleographic attributes: show only the snippets that have them ----------------------
// The columns tell codes apart by their notes and the virga; everything finer is an attribute of the
// snippet, and puts snippets in rows under the code. This asks for the snippets that have an attribute, and hides the rest.
const paleoUsed = computed(() => {
    const order = settings.paleoKeys();
    const used = new Set();
    for (const list of context.snippets.value.values()) for (const s of list) paleoOf(s, order).forEach(e => used.add(e.key));
    return [...order.filter(k => used.has(k)), ...[...used].filter(k => !order.includes(k))];
});
const paleoFilter = ref([]);
function togglePaleo(key) {
    paleoFilter.value = paleoFilter.value.includes(key) ? paleoFilter.value.filter(k => k !== key) : [...paleoFilter.value, key];
}
const shownSnippets = computed(() => (paleoFilter.value.length
    ? new Map([...snippets.value].map(([code, list]) => [code, filterByPaleo(list, paleoFilter.value, settings.paleoKeys())]))
    : snippets.value));
const table = ref(null);

// ---- what the table shows ----------------------------------------------------

// The standard table offers every possibility and the person chooses in it (see useColumnChoice).
const {
    selected, view, VIEWS, query, groups: possibilities, emptyText, expanded, toggleExpanded,
    choose, toggle, suggested, addSuggested, clearColumns,
    unknown, adding, addInitial, addCode, chooseNew, variantFor
} = useColumnChoice(context, { table, active: () => !extended.value });

/** The columns the project has, in the order of the library: what the extended table shows, and what the arrows step through. */
const chosenGroups = computed(() => groupSelected(library.value, extended.value ? extendedCodes.value : standardCodes.value));
const groups = computed(() => (extended.value ? chosenGroups.value : possibilities.value));
const orderedCodes = computed(() => chosenGroups.value.flatMap(g => g.columns.map(c => c.code)));
const removable = computed(() => (extended.value ? new Set(project.value.extended) : new Set()));

// ---- the open cell ---------------------------------------------------------

const cell = computed(() => (route.query.cell ? getBaseCode(String(route.query.cell)) : ''));
const open = (code) => router.push({ query: { ...route.query, cell: code } });
/** A cell of a column that is not chosen yet chooses it — unless the rules refuse, and then they say why. */
function openCell(code) {
    if (!extended.value && !choose(code)) return;
    open(code);
}
const move = (code) => router.replace({ query: { ...route.query, cell: code } });
const close = () => router.replace({ query: { ...route.query, cell: undefined } });

// ---- lines of screenshots --------------------------------------------------

/** Screenshots of lines: the signs are marked on the line, in the line editor. */
const onLines = computed(() => project.value.images === 'screenshots' && project.value.snippets === 'lines');
const editor = ref(null); // { lineId, draft, code, focusSign }

/** Screenshots of single signs: an inbox for those not yet filed under a code. */
const onSigns = computed(() => project.value.images === 'screenshots' && project.value.snippets === 'signs');

/** A screenshot was filed: its cell opens, in the extended table if the standard one has no column for the code. */
function onFiled(code) {
    if (orderedCodes.value.includes(code)) open(code);
    else router.push({ name: 'project_extended', params: { id: project.value.id }, query: { cell: code } });
}

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
    // A code the standard table has a place for is a column of the standard table.
    const standard = selectColumn(p.columns, code, undefined, library.value.variantOf);
    if (standard.ok) store.setColumns(p.id, standard.columns);
    else store.setExtended(p.id, [...p.extended, code]);
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
    ? { name: 'project_tree', label: 'Neume tree' }
    : { name: 'project_extended', label: 'Extended table' }));
</script>

<template>
<div class="table-view">
    <div v-if="extended && !groups.length" class="ne-empty empty">
        <p>No columns yet.</p>
        <RouterLink :to="{ name: 'project_standard', params: { id: project.id } }" class="ne-btn ne-btn--primary">Choose columns in the standard table &rarr;</RouterLink>
    </div>

    <div v-else class="layout" :class="{ 'layout--aside': extended || cell }">
        <div class="main">
            <!-- A project of page images without any: say so, here, where cells would offer them. -->
            <IiifSetup v-if="needsIiif && !cell" :source="project.source" purpose="mark snippets on the pages of this manuscript">
                <template #alternative>To work from screenshots instead, change the project in its <em>Settings</em>.</template>
            </IiifSetup>
            <LinesPanel v-if="onLines" @open="openLine({ lineId: $event })" @add="openLine({ draft: { attrs: { ...$event } } })" />
            <ScreenshotsPanel v-if="onSigns" :codes="orderedCodes" :paused="!!cell" @filed="onFiled" />

            <template v-if="!extended">
                <div class="toolbar">
                    <input v-model="query" type="search" class="ne-input search" placeholder="Search codes, or type a new one" aria-label="Search codes" autocomplete="off" spellcheck="false" />
                    <SegmentedControl v-model="view" :options="VIEWS" label="Which codes to show" size="sm" />
                    <span class="spacer"></span>
                    <button v-if="suggested.length" class="ne-btn" title="Columns with snippets in these folios, and the most frequent code of each shape in the transcription" @click="addSuggested">Add suggested · {{ suggested.length }}</button>
                    <button class="ne-btn ne-btn--ghost" :disabled="!project.columns.length" @click="clearColumns">Clear</button>
                </div>

                <p v-if="unknown" class="ne-note ne-note--info unknown">
                    <span><code>{{ unknown.code }}</code> is not in the pattern library.</span>
                    <button class="ne-btn ne-btn--sm" @click="addCode(unknown.code)">Add it…</button>
                </p>
            </template>

            <div v-if="paleoUsed.length" class="paleo-filter" role="group" aria-label="Show only snippets with an attribute">
                <span class="lab">Attributes</span>
                <button v-for="k in paleoUsed" :key="k" type="button" class="chip" :class="{ on: paleoFilter.includes(k) }" :aria-pressed="paleoFilter.includes(k)" @click="togglePaleo(k)"><code>{{ k }}</code></button>
                <button type="button" class="chip" :class="{ on: paleoFilter.includes('-') }" :aria-pressed="paleoFilter.includes('-')" title="Snippets without an attribute" @click="togglePaleo('-')">none</button>
                <button v-if="paleoFilter.length" type="button" class="ne-btn ne-btn--ghost ne-btn--sm" @click="paleoFilter = []">Show all</button>
            </div>

            <ProjectTable
                ref="table"
                mode="fill"
                :choose="!extended"
                :groups="groups"
                :selected="selected"
                :snippets="shownSnippets"
                :occurrences="hasTranscription && occurrencesLoaded ? occurrences : null"
                :glyphs="glyphs"
                :removable="removable"
                :active="cell"
                :expanded="expanded"
                :empty-text="emptyText"
                @toggle="toggle"
                @expand="toggleExpanded"
                @variant="variantFor = $event"
                @open="openCell"
                @remove="removeColumn"
            >
                <template #thumb="{ snippet }"><SnippetThumb :snippet="snippet" :width="84" :height="60" /></template>
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

    <AddPatternDialog v-if="!extended" :open="adding" :glyphs="glyphs" :library="library" :initial="addInitial" target="standard" @close="adding = false" @added="chooseNew($event.code)" />
    <VariantEditorModal v-if="!extended" :visible="!!variantFor" :base-code="variantFor" :glyphs="glyphs" @close="variantFor = ''" @saved="chooseNew($event.code)" />

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
.toolbar { display: flex; align-items: center; gap: var(--space-2) var(--space-3); flex-wrap: wrap; }
.search { width: 280px; max-width: 100%; }
.spacer { flex: 1; }
.paleo-filter { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
.paleo-filter .lab { font-size: 0.76rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); margin-right: 4px; }
.chip { display: inline-flex; align-items: baseline; padding: 1px 9px; font-size: 0.82rem; line-height: 1.6; border-radius: 999px; background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border-hover); cursor: pointer; }
.chip code { background: transparent; padding: 0; font-weight: 700; }
.chip:hover { border-color: var(--color-primary); }
.chip.on { background: var(--color-primary); border-color: var(--color-primary-hover); color: #fff; }
.unknown { display: flex; align-items: center; gap: var(--space-3); margin: 0; }
.empty { max-width: 560px; margin: var(--space-5) auto; }
.empty p { margin: 0 0 var(--space-3); }

.layout { display: block; }
.layout--aside { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: var(--space-5); align-items: start; }
.main { min-width: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.aside { position: sticky; top: var(--space-3); min-width: 0; }
.aside :deep(.panel) { max-height: calc(100vh - 150px); overflow: hidden; }
.next { display: flex; justify-content: flex-start; }

@media (max-width: 1100px) {
    .layout--aside { grid-template-columns: 1fr; }
    .aside { position: static; order: -1; }
}
</style>

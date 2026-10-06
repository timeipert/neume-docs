<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useProjectsStore } from '../stores/projects';
import { useToast } from '../composables/useToast';
import { useProjectContext } from '../composables/useProject';
import { categoryOf, checkCode, columnsToShow, deselectColumn, selectColumn, suggestColumns } from '../utils/projectTable';
import ProjectTable from '../components/projects/ProjectTable.vue';
import SegmentedControl from '../components/ui/SegmentedControl.vue';
import AddPatternDialog from '../components/projects/AddPatternDialog.vue';
import VariantEditorModal from '../components/VariantEditorModal.vue';

/**
 * Step 1: which columns the standard table has. The whole pattern library is one
 * table — shapes over the codes that write them, in the order of length, then
 * frequency — and what the project's folios already hold is shown in it.
 */
const router = useRouter();
const store = useProjectsStore();
const toast = useToast();
const {
    project, library, glyphs, snippets, occurrences, annotatedCounts, occurringCounts,
    hasTranscription, occurrencesLoaded
} = useProjectContext();

const table = ref(null);
const expanded = ref(new Set());
const query = ref('');

const selected = computed(() => new Set(project.value.columns));

// ---- what is shown ---------------------------------------------------------

const view = ref('all');
const VIEWS = computed(() => [
    { value: 'all', label: 'All', title: 'Every code of the pattern library' },
    { value: 'chosen', label: `Chosen ${project.value.columns.length}`, title: 'Only the columns of this project' },
    { value: 'snippets', label: `With snippets ${annotatedCounts.value.size}`, title: 'Codes that already have a snippet in these folios' },
    ...(hasTranscription.value ? [{ value: 'transcription', label: `In the transcription ${occurringCounts.value.size}`, title: 'Codes the transcription has in these folios' }] : [])
]);
watch(VIEWS, (list) => { if (!list.some(v => v.value === view.value)) view.value = 'all'; });

const bare = (code) => code.replace(/[[\]{}]/g, '');
const searching = computed(() => query.value.trim().length > 0);
const matchesQuery = (code) => {
    const q = query.value.trim();
    return !q || (/[[\]{}]/.test(q) ? code.includes(q) : bare(code).includes(q));
};
const matchesView = (code) => {
    if (view.value === 'chosen') return selected.value.has(code);
    if (view.value === 'snippets') return annotatedCounts.value.has(code);
    if (view.value === 'transcription') return occurringCounts.value.has(code);
    return true;
};

/** The groups of the standard table, each with the columns to draw. */
const groups = computed(() => {
    const keep = new Set([...project.value.columns, ...annotatedCounts.value.keys()]);
    const out = [];
    for (const cat of library.value.categories) {
        const all = cat.columns.filter(c => c.standard);
        if (!all.length) continue;
        if (view.value !== 'all' || searching.value) {
            const columns = all.filter(c => matchesView(c.code) && matchesQuery(c.code));
            if (columns.length) out.push({ ...cat, total: columns.length, columns });
        } else {
            out.push({ ...cat, total: all.length, columns: columnsToShow({ columns: all }, { keep, expanded: expanded.value.has(cat.key), top: 5 }) });
        }
    }
    return out;
});

const emptyText = computed(() => {
    if (searching.value) return `No column matches “${query.value.trim()}”.`;
    return {
        chosen: 'No column is chosen yet.',
        snippets: 'No snippet has been drawn in these folios yet.',
        transcription: 'The transcription has nothing in these folios.'
    }[view.value] || 'Nothing here yet.';
});

function toggleExpanded(key) {
    const next = new Set(expanded.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expanded.value = next;
}

// ---- choosing --------------------------------------------------------------

function toggle(code) {
    const p = project.value;
    if (selected.value.has(code)) {
        store.setColumns(p.id, deselectColumn(p.columns, code));
        return;
    }
    const result = selectColumn(p.columns, code, undefined, library.value.variantOf);
    if (!result.ok) {
        toast.show(result.reason, { tone: 'error' });
        return;
    }
    store.setColumns(p.id, result.columns);
}

const suggestion = computed(() => suggestColumns(library.value, {
    annotated: annotatedCounts.value,
    occurring: occurringCounts.value,
    current: project.value.columns
}));
const suggested = computed(() => [...suggestion.value.fromAnnotations, ...suggestion.value.fromTranscription]);

function addSuggested() {
    const p = project.value;
    const before = [...p.columns];
    const codes = suggested.value;
    store.setColumns(p.id, [...p.columns, ...codes]);
    toast.show(`${codes.length} column${codes.length === 1 ? '' : 's'} added.`, {
        action: { label: 'Undo', run: () => store.setColumns(p.id, before) }
    });
}

function clearColumns() {
    const p = project.value;
    if (!p.columns.length) return;
    const before = [...p.columns];
    store.setColumns(p.id, []);
    toast.show('All columns taken out.', { action: { label: 'Undo', run: () => store.setColumns(p.id, before) } });
}

// A project that is new starts from what its folios already hold.
let started = false;
watch([() => project.value && project.value.id, annotatedCounts], () => {
    const p = project.value;
    if (started || !p) return;
    started = true;
    if (p.columnsChosen || p.columns.length) return;
    const { fromAnnotations } = suggestColumns(library.value, { annotated: annotatedCounts.value });
    if (!fromAnnotations.length) return;
    store.update(p.id, { columns: fromAnnotations });
    toast.show(`${fromAnnotations.length} column${fromAnnotations.length === 1 ? '' : 's'} with snippets in these folios chosen to start with.`, {
        action: { label: 'Undo', run: () => store.update(p.id, { columns: [] }) }
    });
}, { immediate: true });

// ---- a code that is not there, a variant of one that is ----------------------

/** What was typed is a good code the library does not have yet. */
const unknown = computed(() => {
    const check = checkCode(query.value);
    return check.ok && !library.value.byCode.has(check.code) ? check : null;
});

const adding = ref(false);
const addInitial = ref('');
function addCode(initial = '') {
    addInitial.value = initial;
    adding.value = true;
}

/** A code or variant that was just made is chosen for the table, if the rules allow. */
async function chooseNew(code) {
    await nextTick();
    const p = project.value;
    if (p.columns.includes(code)) return;
    const result = selectColumn(p.columns, code, undefined, library.value.variantOf);
    if (!result.ok) {
        toast.show(result.reason, { tone: 'error' });
        return;
    }
    store.setColumns(p.id, result.columns);
    query.value = '';
    view.value = 'all';
    const cat = categoryOf(library.value.variantOf(code) || code);
    if (cat) toggleExpanded(cat.key);
    await nextTick();
    table.value && table.value.reveal(code);
}

const variantFor = ref('');

function next() {
    const p = project.value;
    store.setColumns(p.id, p.columns);
    router.push({ name: 'project_standard', params: { id: p.id } });
}
</script>

<template>
<div class="columns-view">
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

    <ProjectTable
        ref="table"
        mode="select"
        :groups="groups"
        :selected="selected"
        :snippets="snippets"
        :occurrences="hasTranscription && occurrencesLoaded ? occurrences : null"
        :glyphs="glyphs"
        :expanded="expanded"
        :empty-text="emptyText"
        @toggle="toggle"
        @expand="toggleExpanded"
        @variant="variantFor = $event"
    />

    <footer class="next">
        <button class="ne-btn ne-btn--primary" :disabled="!project.columns.length" :title="project.columns.length ? '' : 'Choose at least one column'" @click="next">
            Standard table &rarr;
        </button>
    </footer>

    <AddPatternDialog :open="adding" :glyphs="glyphs" :library="library" :initial="addInitial" target="standard" @close="adding = false" @added="chooseNew($event.code)" />
    <VariantEditorModal :visible="!!variantFor" :base-code="variantFor" :glyphs="glyphs" @close="variantFor = ''" @saved="chooseNew($event.code)" />
</div>
</template>

<style scoped>
.columns-view { display: flex; flex-direction: column; gap: var(--space-3); }
.toolbar { display: flex; align-items: center; gap: var(--space-2) var(--space-3); flex-wrap: wrap; }
.search { width: 280px; max-width: 100%; }
.spacer { flex: 1; }
.unknown { display: flex; align-items: center; gap: var(--space-3); margin: 0; }
.next { display: flex; justify-content: flex-end; }
</style>

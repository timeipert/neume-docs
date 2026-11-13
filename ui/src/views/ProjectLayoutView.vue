<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { emptySection, isEmptyLayout, normalisePageLayout, sectionProblems } from '@monodi/core/page-layout';
import { useProjectsStore } from '../stores/projects';
import { useProjectContext } from '../composables/useProject';
import { useToast } from '../composables/useToast';
import { pageLayoutExport, pageLayoutFileName, pageLayoutMarkdown, readPageLayoutFile } from '../utils/pageLayout';
import Panel from '../components/ui/Panel.vue';
import LayoutSectionEditor from '../components/projects/layout/LayoutSectionEditor.vue';
import PageLayoutDisplay from '../components/projects/layout/PageLayoutDisplay.vue';

/**
 * The page layout of a project's manuscript (its folios, its hand): the division of the writing space, the text
 * lines and staves, the colourings and the clefs, as the notation documentation of the Corpus Monodicum describes
 * them. Recorded in a form, shown as a schematic page and staff and as text, and saved as a file for CM-hub's print
 * volumes. Design and vocabulary: docs/page-layout.md.
 *
 * The form edits a draft; every change is normalised and kept with the project at once.
 */
const store = useProjectsStore();
const toast = useToast();
const { project } = useProjectContext();

const draft = reactive(normalisePageLayout(null));
const current = ref(0);

function load(layout) {
    const l = normalisePageLayout(layout);
    draft.sections.splice(0, draft.sections.length, ...l.sections);
    if (current.value >= draft.sections.length) current.value = 0;
}

watch(() => project.value && project.value.id, () => { load(project.value && project.value.layout); current.value = 0; }, { immediate: true });
// Only a real change is stored: opening the tab does not mark the project as changed.
watch(draft, () => {
    const p = project.value;
    if (!p) return;
    const next = normalisePageLayout(JSON.parse(JSON.stringify(draft)));
    const stored = normalisePageLayout(p.layout);
    if (JSON.stringify(next) !== JSON.stringify(stored)) store.setLayout(p.id, next);
}, { deep: true });

const section = computed(() => draft.sections[current.value]);
const normalised = computed(() => normalisePageLayout(JSON.parse(JSON.stringify(draft))));
const shown = computed(() => normalised.value.sections[current.value]);
const problems = computed(() => sectionProblems(shown.value));
const empty = computed(() => isEmptyLayout(normalised.value));

function sectionLabel(s, i) {
    return [s.folios && `f. ${s.folios}`, s.hand].filter(Boolean).join(', ') || `Section ${i + 1}`;
}

function addSection() {
    draft.sections.push(emptySection());
    current.value = draft.sections.length - 1;
}

function removeSection() {
    if (draft.sections.length < 2) return;
    const i = current.value;
    const [gone] = draft.sections.splice(i, 1);
    current.value = Math.max(0, i - 1);
    toast.show('Section removed.', { action: { label: 'Undo', run: () => { draft.sections.splice(i, 0, gone); current.value = i; } } });
}

function clearAll() {
    const before = JSON.parse(JSON.stringify(draft));
    load(null);
    toast.show('Page layout cleared.', { action: { label: 'Undo', run: () => load(before) } });
}

const today = () => new Date().toISOString().slice(0, 10);

function save(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
}

function downloadJson() {
    save(pageLayoutFileName(project.value), JSON.stringify(pageLayoutExport(project.value, today()), null, 2), 'application/json');
}

function downloadMarkdown() {
    save(pageLayoutFileName(project.value).replace(/\.json$/, '.md'), pageLayoutMarkdown(project.value), 'text/markdown');
}

const fileInput = ref(null);
async function importFile(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const layout = readPageLayoutFile(await file.text());
    if (!layout) { toast.show(`“${file.name}” holds no page layout.`); return; }
    const before = JSON.parse(JSON.stringify(draft));
    load(layout);
    toast.show(`Page layout taken from “${file.name}”.`, { action: { label: 'Undo', run: () => load(before) } });
}
</script>

<template>
<div v-if="project" class="layout">
    <Panel title="Page layout" description="Writing space, text lines and staves, colourings and clefs of the manuscript in this project's folios, as the notation documentation describes them. Fields left empty count as not recorded.">
        <template #actions>
            <button class="ne-btn" @click="fileInput.click()">Import file…</button>
            <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="importFile" />
            <button class="ne-btn" :disabled="empty" @click="downloadMarkdown">Text (Markdown)</button>
            <button class="ne-btn ne-btn--primary" :disabled="empty" @click="downloadJson">Download file</button>
        </template>

        <nav class="sections" aria-label="Sections of the layout">
            <button v-for="(s, i) in draft.sections" :key="i" class="ne-btn ne-btn--sm" :class="{ 'ne-btn--primary': i === current }" @click="current = i">{{ sectionLabel(s, i) }}</button>
            <button class="ne-btn ne-btn--sm ne-btn--ghost" title="A folio range or notator with a layout of its own" @click="addSection">+ Section</button>
            <span class="grow"></span>
            <button v-if="draft.sections.length > 1" class="ne-btn ne-btn--sm ne-btn--danger" @click="removeSection">Remove section</button>
            <button class="ne-btn ne-btn--sm ne-btn--danger" :disabled="empty && draft.sections.length < 2" @click="clearAll">Clear</button>
        </nav>

        <div class="cols">
            <div class="form"><LayoutSectionEditor v-if="section" :section="section" :problems="problems" /></div>
            <aside class="preview"><PageLayoutDisplay v-if="shown" :section="shown" /></aside>
        </div>
    </Panel>
</div>
</template>

<style scoped>
.sections { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; margin-bottom: var(--space-4); }
.grow { flex: 1; }
.cols { display: grid; grid-template-columns: minmax(0, 3fr) minmax(280px, 2fr); gap: var(--space-5); align-items: start; }
.preview { position: sticky; top: var(--space-4); }
@media (max-width: 1000px) { .cols { grid-template-columns: 1fr; } .preview { position: static; } }
</style>

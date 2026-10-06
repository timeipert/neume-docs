<script setup>
/**
 * Pattern library — one page for the whole notation vocabulary.
 *
 * Patterns are collected from the transcription data, the equivalents tables,
 * the annotations and the project's code variants; shapes that exist only on a
 * local scan can be added by hand. Per pattern it shows the code, the Ref-ID
 * label, image examples from the annotations, and an MEI template editor.
 *
 * This page is also where the vocabulary is set up: the project's signs, the
 * variant buttons offered while annotating, and preferred IDs. They are stored in
 * the settings store but edited only here. Code variants are made per pattern, in
 * the list, through the same VariantEditorModal the polygon editor uses.
 */
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { usePatternLibraryStore } from '../stores/patternLibrary';
import { useSettingsStore } from '../stores/settings';
import { usePatternIndex } from '../composables/usePatternIndex';
import { usePatternCatalog } from '../composables/usePatternCatalog';
import { compareCodes } from '../utils/neumeTable';
import { parsePatternCode, getBaseCode } from '../utils/patternCode';
import { stripSignKeys } from '../utils/signs';

import PatternDisplay from '../components/PatternDisplay.vue';
import PatternCode from '../components/PatternCode.vue';
import VariantEditorModal from '../components/VariantEditorModal.vue';
import PatternHierarchyTree from '../components/patterns/PatternHierarchyTree.vue';
import PatternMeiEditor from '../components/patterns/PatternMeiEditor.vue';
import PatternExamples from '../components/patterns/PatternExamples.vue';
import StateWrapper from '../components/StateWrapper.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import Disclosure from '../components/ui/Disclosure.vue';
import SignVocabulary from '../components/patterns/SignVocabulary.vue';
import SnippetVariants from '../components/patterns/SnippetVariants.vue';
import PatternsTabs from '../components/patterns/PatternsTabs.vue';
import PreferredIds from '../components/patterns/PreferredIds.vue';
import { useToast } from '../composables/useToast';

const library = usePatternLibraryStore();
const settings = useSettingsStore();
const toast = useToast();
const route = useRoute();
// ?setup=signs|snippet-variants|ids opens that set-up panel (links from other pages).
const setupOpen = computed(() => String(route.query.setup || ''));
const {
    sources, loadAllSources, index, allCodes, getInfo, refIdFor, signKeys, glyphs, loading
} = usePatternIndex();

const { freq } = usePatternCatalog();
/** Inside a group: fewer tones first, then more frequent in the CM. */
const byTonesThenFrequency = (a, b) => compareCodes(a, b, freq.value);

onMounted(() => {
    loadAllSources();
});

const fmt = (n) => n.toLocaleString('en-US');

// --- Filtering ---
const search = ref('');
const onlyAnnotated = ref(false);

const filteredCodes = computed(() => {
    let codes = allCodes.value;

    if (onlyAnnotated.value) {
        codes = codes.filter(c => (getInfo(c)?.annotationCount || 0) > 0);
    }

    const q = search.value.trim().toLowerCase();
    if (q) {
        codes = codes.filter(c =>
            c.toLowerCase().includes(q) ||
            library.getLabel(c).toLowerCase().includes(q) ||
            String(refIdFor(c)).toLowerCase().includes(q)
        );
    }
    return codes;
});

const treeRef = ref(null);

// --- Detail expansion ---
const expanded = ref(new Set());
function toggleDetail(code) {
    const next = new Set(expanded.value);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    expanded.value = next;
}
function isExpanded(code) {
    return expanded.value.has(code);
}

function entryOf(code) {
    return library.getEntry(code) || { code, label: '', notes: '', mei: null, manual: false };
}

function onLabel(code, value) {
    library.updateEntry(code, { label: value });
}
function onNotes(code, value) {
    library.updateEntry(code, { notes: value });
}
function onMei(code, template) {
    library.setMeiTemplate(code, template, signKeys.value);
}

// --- Manual patterns (scan-only shapes) ---
const newCode = ref('');
const newLabel = ref('');
const addError = ref('');

function addManual() {
    const code = getBaseCode(newCode.value.trim());
    addError.value = '';
    if (!code) {
        addError.value = 'Please enter a pattern code.';
        return;
    }
    if (parsePatternCode(code, signKeys.value).isSpecial) {
        addError.value = 'The code must contain a "*", e.g. *u or [*ud].';
        return;
    }
    if (index.value.has(code)) {
        addError.value = `"${code}" already exists.`;
        return;
    }
    library.addManualPattern(code, { label: newLabel.value.trim() });
    expanded.value = new Set([...expanded.value, code]);
    newCode.value = '';
    newLabel.value = '';
}

function removeManual(code) {
    const entry = library.getEntry(code);
    library.removeEntry(code);
    const next = new Set(expanded.value);
    next.delete(code);
    expanded.value = next;
    toast.show(`Pattern ${code} removed.`, { action: { label: 'Undo', run: () => library.updateEntry(code, entry) } });
}

const newCodePreview = computed(() => {
    const code = getBaseCode(newCode.value.trim());
    if (!code) return null;
    const parsed = parsePatternCode(code, signKeys.value);
    return parsed.isSpecial ? null : parsed;
});

// --- Code variants (project-wide, owned by the settings store) ---
const showVariantEditor = ref(false);
const variantBaseCode = ref('');
const editingVariant = ref(null);

function createVariantFor(code) {
    // A variant is always derived from the unmodified base shape.
    variantBaseCode.value = stripSignKeys(code, signKeys.value) || code;
    editingVariant.value = null;
    showVariantEditor.value = true;
}

/** The code variant entry a code corresponds to, if it is one. */
function variantEntryFor(code) {
    for (const [base, list] of Object.entries(settings.codeVariants || {})) {
        const hit = (list || []).find(v => v.code === code);
        if (hit) return { base, variant: hit };
    }
    return null;
}

function editVariant(code) {
    const found = variantEntryFor(code);
    if (!found) return;
    variantBaseCode.value = found.base;
    editingVariant.value = found.variant;
    showVariantEditor.value = true;
}

function deleteVariant(code) {
    const found = variantEntryFor(code);
    if (!found) return;
    settings.removeCodeVariant(found.base, found.variant.id);
    toast.show(`Code variant ${code} removed.`, { action: { label: 'Undo', run: () => settings.addCodeVariant(found.base, found.variant) } });
}

const hasSigns = computed(() => settings.customSigns.length > 0);

const setupSummary = computed(() => ({
    signs: settings.customSigns.length
        ? `${settings.customSigns.length} sign${settings.customSigns.length === 1 ? '' : 's'}: ${settings.customSigns.map(s => s.key).join(' ')}`
        : 'No signs yet',
    snippetVariants: settings.hasSnippetVariantConfig()
        ? `${settings.snippetVariants.length} variant${settings.snippetVariants.length === 1 ? '' : 's'}`
        : 'Built-in a–g',
    ids: Object.keys(settings.globalDisplayIds).length
        ? `${Object.keys(settings.globalDisplayIds).length} set${settings.autoFillIds ? '' : ' (not filled in automatically)'}`
        : 'None yet'
}));

const stats = computed(() => ({
    total: allCodes.value.length,
    manual: library.manualCodes().length,
    variants: allCodes.value.filter(c => getInfo(c)?.isCodeVariant).length,
    withMei: allCodes.value.filter(c => library.hasMeiTemplate(c)).length
}));
</script>

<template>
<StateWrapper :loading="loading" loadingText="Loading pattern data...">
<div class="library-view">
    <PatternsTabs />
    <PageHeader title="Pattern library">
        <template #subtitle>
            <p>Every pattern the editor knows, and the signs, variants and IDs you give them. A shape that exists only on a scan can be added by hand.</p>
        </template>
        <template #actions>
            <div class="header-stats">
                <div class="stat"><strong>{{ stats.total }}</strong><span>patterns</span></div>
                <div class="stat"><strong>{{ stats.variants }}</strong><span>variants</span></div>
                <div class="stat"><strong>{{ stats.manual }}</strong><span>manual</span></div>
                <div class="stat"><strong>{{ stats.withMei }}</strong><span>with MEI</span></div>
            </div>
        </template>
    </PageHeader>

    <!-- Set-up: everything that defines the vocabulary is edited here, nowhere else. -->
    <Disclosure title="Signs" :summary="setupSummary.signs" :open="setupOpen === 'signs'">
        <SignVocabulary />
    </Disclosure>
    <Disclosure title="Snippet variants" :summary="setupSummary.snippetVariants" :open="setupOpen === 'snippet-variants'">
        <SnippetVariants />
    </Disclosure>
    <Disclosure title="Preferred IDs" :summary="setupSummary.ids" :open="setupOpen === 'ids'">
        <PreferredIds />
    </Disclosure>

    <!-- Add a scan-only pattern -->
    <section class="card">
        <div class="add-row">
            <div class="add-fields">
                <input v-model="newCode" class="add-input mono" placeholder="Pattern code, e.g. [*ud]" @keyup.enter="addManual" />
                <input v-model="newLabel" class="add-input" placeholder="Label (optional)" @keyup.enter="addManual" />
                <button type="button" class="btn-primary" @click="addManual">Add pattern</button>
            </div>
            <div class="add-preview" v-if="newCodePreview">
                <PatternDisplay :pattern="newCodePreview.code" :glyphs="glyphs" />
                <span class="preview-text">
                    {{ newCodePreview.noteCount }} note{{ newCodePreview.noteCount === 1 ? '' : 's' }},
                    {{ newCodePreview.ligature === 'connected' ? 'connected'
                        : newCodePreview.ligature === 'partial' ? 'partly connected' : 'open' }}
                </span>
            </div>
        </div>
        <div v-if="addError" class="add-error">{{ addError }}</div>
    </section>

    <!-- The hierarchy -->
    <section class="card list-card">
        <div class="list-controls">
            <input v-model="search" class="search-input" placeholder="Search by code, label or Ref ID..." />
            <label class="check">
                <input type="checkbox" v-model="onlyAnnotated" />
                Only with annotations
            </label>
            <span class="spacer"></span>
            <span class="shown-count">{{ filteredCodes.length }} of {{ stats.total }}</span>
            <button type="button" class="btn-sm" @click="treeRef?.expandAll()">Expand all</button>
            <button type="button" class="btn-sm" @click="treeRef?.collapseAll()">Collapse</button>
        </div>

        <PatternHierarchyTree
            ref="treeRef"
            :codes="filteredCodes"
            :forceOpen="!!search.trim()"
            :compare="byTonesThenFrequency"
            emptyText="No patterns found."
            v-slot="{ code }"
        >
            <div class="pattern-row" :class="{ open: isExpanded(code) }">
                <div class="row-main" @click="toggleDetail(code)">
                    <span class="row-caret" :class="{ open: isExpanded(code) }">▸</span>

                    <span class="row-glyph">
                        <PatternDisplay :pattern="code" :glyphs="glyphs" />
                    </span>

                    <span class="row-code"><PatternCode :pattern="code" /></span>

                    <span class="row-label" v-if="entryOf(code).label">{{ entryOf(code).label }}</span>

                    <PatternExamples :examples="getInfo(code)?.examples || []" :limit="4" :size="50" />

                    <span class="row-meta">
                        <span v-if="getInfo(code)?.isCodeVariant" class="variant-chip"
                              :title="`Code variant of ${getInfo(code).baseCode}`">Variant</span>
                        <span v-if="getInfo(code)?.manual" class="manual-chip"
                              title="Only in the library, not in the transcription data">Scan</span>
                        <span v-if="library.hasMeiTemplate(code)" class="mei-chip" title="MEI template configured">MEI</span>
                        <span v-if="refIdFor(code)" class="ref-chip" title="Ref ID (for the printed volume)">
                            Ref {{ refIdFor(code) }}
                        </span>
                        <span class="count-chip"
                              :title="`${fmt(getInfo(code)?.cmCount || 0)} occurrences in the Corpus Monodicum, ${fmt(getInfo(code)?.dataCount || 0)} in your loaded corpus`">
                            {{ fmt(getInfo(code)?.cmCount || getInfo(code)?.dataCount || 0) }}×
                        </span>
                        <span v-if="getInfo(code)?.annotationCount" class="count-chip count-chip--ann"
                              :title="`${getInfo(code).annotationCount} annotated snippets`">
                            {{ getInfo(code).annotationCount }} annotated
                        </span>
                    </span>
                </div>

                <div v-if="isExpanded(code)" class="row-detail">
                    <div class="detail-fields">
                        <label class="field">
                            <span class="field-label">Label</span>
                            <input
                                class="field-input"
                                :value="entryOf(code).label"
                                placeholder="your own name for this shape"
                                @input="onLabel(code, $event.target.value)"
                            />
                        </label>
                        <label class="field field-wide">
                            <span class="field-label">Notes</span>
                            <input
                                class="field-input"
                                :value="entryOf(code).notes"
                                placeholder="Observations on this shape..."
                                @input="onNotes(code, $event.target.value)"
                            />
                        </label>
                        <div class="detail-actions">
                            <button v-if="hasSigns && !getInfo(code)?.isCodeVariant"
                                    type="button" class="btn-sm" @click="createVariantFor(code)">+ Variant</button>
                            <template v-if="getInfo(code)?.isCodeVariant">
                                <button type="button" class="btn-sm" @click="editVariant(code)">Edit variant</button>
                                <button type="button" class="btn-sm danger" @click="deleteVariant(code)">Delete variant</button>
                            </template>
                            <button v-if="getInfo(code)?.manual"
                                    type="button" class="btn-sm danger" @click="removeManual(code)">Remove</button>
                        </div>
                    </div>

                    <div class="detail-sources" v-if="getInfo(code)?.sources?.size">
                        <span class="field-label">Manuscripts:</span>
                        <span v-for="s in Array.from(getInfo(code).sources)" :key="s" class="src-chip">{{ s }}</span>
                    </div>

                    <div class="detail-examples" v-if="(getInfo(code)?.examples || []).length">
                        <span class="field-label">Image examples:</span>
                        <PatternExamples :examples="getInfo(code).examples" :limit="8" :size="76" />
                    </div>

                    <PatternMeiEditor
                        :code="code"
                        :template="library.getMeiTemplate(code, signKeys)"
                        :label="entryOf(code).label"
                        :refId="refIdFor(code)"
                        :signKeys="signKeys"
                        @update:template="tpl => onMei(code, tpl)"
                    />
                </div>
            </div>
        </PatternHierarchyTree>
    </section>

    <VariantEditorModal
        :visible="showVariantEditor"
        :baseCode="variantBaseCode"
        :editing="editingVariant"
        :glyphs="glyphs"
        @close="showVariantEditor = false"
        @saved="showVariantEditor = false"
    />
</div>
</StateWrapper>
</template>

<style scoped>
.library-view {
    max-width: 1280px;
    margin: 0 auto;
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.header-stats { display: flex; gap: 10px; }
.stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 7px 14px;
    min-width: 62px;
}
.stat strong { font-size: 1.12rem; }
.stat span { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-muted); }

.card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
}

.add-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.add-fields { display: flex; gap: 8px; flex: 1; min-width: 320px; }
.add-input {
    padding: 7px 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 0.85rem;
    flex: 1;
    min-width: 0;
}
.mono { font-family: monospace; }
.btn-primary {
    background: var(--color-primary);
    color: #fff;
    border-color: var(--color-primary-hover);
    white-space: nowrap;
    font-size: 0.85rem;
}
.btn-primary:hover { background: var(--color-primary-hover); }
.add-preview { display: flex; align-items: center; gap: 10px; }
.preview-text { font-size: 0.78rem; color: var(--color-text-muted); }
.add-error { margin-top: 8px; font-size: 0.8rem; color: var(--color-danger); }

.list-card { padding-top: var(--space-3); }
.list-controls { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.search-input {
    flex: 1;
    min-width: 220px;
    padding: 7px 11px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 0.85rem;
}
.check { display: flex; align-items: center; gap: 5px; font-size: 0.8rem; color: var(--color-text-muted); white-space: nowrap; }
.spacer { flex: 1; }
.shown-count { font-size: 0.75rem; color: var(--color-text-muted); }
.btn-sm { padding: 4px 10px; font-size: 0.78rem; }
.btn-sm.danger { color: var(--color-danger); border-color: var(--color-danger-muted); }

/* Leaf rows */
.pattern-row {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
}
.pattern-row.open { border-color: var(--color-primary); box-shadow: var(--shadow-sm); }

.row-main { display: flex; align-items: center; gap: 11px; padding: 7px 11px; cursor: pointer; }
.row-main:hover { background: var(--color-surface-muted); }
.row-caret { font-size: 0.7em; opacity: 0.6; transition: transform 0.15s ease; }
.row-caret.open { transform: rotate(90deg); }

.row-glyph { min-width: 44px; display: flex; justify-content: center; }
.row-code :deep(.pattern-code) { font-size: 0.95rem; font-weight: 800; color: var(--color-text); }
.row-label { font-size: 0.85rem; color: var(--color-text-muted); }

.row-meta { margin-left: auto; display: flex; align-items: center; gap: 5px; white-space: nowrap; }
.ref-chip, .manual-chip, .mei-chip, .variant-chip, .count-chip {
    font-size: 0.66rem;
    font-weight: 700;
    border-radius: 10px;
    padding: 2px 8px;
    letter-spacing: 0.03em;
}
.ref-chip { background: var(--color-surface-muted); color: var(--color-text-muted); border: 1px solid var(--color-border); font-family: monospace; }
.manual-chip { background: var(--color-warning-light); color: var(--color-warning-dark); }
.mei-chip { background: var(--color-primary-light); color: var(--color-primary-dark); }
.variant-chip { background: var(--color-primary); color: #fff; }
.count-chip { color: var(--color-text-muted); font-family: monospace; font-weight: 600; }
.count-chip--ann { background: var(--color-primary-light); color: var(--color-primary-dark); font-family: inherit; }

.row-detail { padding: 12px 14px 14px; border-top: 1px solid var(--color-border); background: var(--color-bg); }
.detail-fields { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
.field { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 150px; }
.field-wide { flex: 2; min-width: 220px; }
.field-label { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text-light); font-weight: 700; }
.field-input {
    padding: 6px 9px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: 0.83rem;
    background: var(--color-surface);
}
.detail-actions { display: flex; gap: 6px; }

.detail-sources, .detail-examples { margin-top: 12px; display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.src-chip {
    font-size: 0.72rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 2px 9px;
    color: var(--color-text-muted);
}
</style>

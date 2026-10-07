<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useManagerWorkspace } from '../../composables/useManagerWorkspace';
import { useLineNeumes } from '../../composables/useLineNeumes';
import { useTranscriptionData } from '../../composables/useTranscriptionData';
import { useProjectLibrary } from '../../composables/useProject';
import { useUndoableDelete } from '../../composables/useUndoableDelete';
import { useAnnotationsStore } from '../../stores/annotations';
import { useSettingsStore } from '../../stores/settings';
import { useToast } from '../../composables/useToast';
import { getBaseCode } from '../../utils/patternCode';
import {
    describeSysId, freeNeumes, lineNameSuggestions, lineNumber, nextFree, pointsToRect, rectToPoints, sortLines
} from '../../utils/pageEditing';
import PageStage from './PageStage.vue';
import PatternPalette from './PatternPalette.vue';
import AnnotationCutout from '../AnnotationCutout.vue';
import PatternDisplay from '../PatternDisplay.vue';
import PatternCode from '../PatternCode.vue';
import VariantEditorModal from '../VariantEditorModal.vue';

/**
 * Marking a page: the lines on it, and the signs on a line. One picture, one panel, no pages to go
 * between.
 *
 *   the page   its lines are boxes on it; drag a box around a new one, click one to work in it
 *   a line     the picture is zoomed to it; choose a pattern, drag a box around each sign
 *   the page   (signs only) the same, without lines: the whole page is the place
 *
 * What was drawn is saved at once and can be taken back. The transcription helps — it proposes the
 * names of lines, lists the neumes of a line to draw along, and links a sign to its neume when that is
 * clear — but it does not decide where to go.
 */
const props = defineProps({
    source: { type: String, required: true },
    folio: { type: String, required: true },
    /** the line that is open: a line region's id, `legacy` for the whole page, or nothing for the page */
    line: { type: String, default: '' },
    /** the pattern the person came for: it is ready to draw */
    code: { type: String, default: '' },
    /** the patterns of the project's tables, in order, to choose from first */
    codes: { type: Array, default: () => [] }
});
const emit = defineEmits(['go', 'used']);

const toast = useToast();
const settings = useSettingsStore();
const annotations = useAnnotationsStore();
const { deleteOnPage } = useUndoableDelete();
const { catalog } = useTranscriptionData();
const library = useProjectLibrary();

// ---- what the page holds ---------------------------------------------------------------

const wsProps = reactive({
    source: computed(() => props.source),
    folio: computed(() => props.folio),
    initialRegionId: computed(() => props.line || null),
    highlightPattern: computed(() => props.code || null),
    returnId: null,
    returnTo: null
});
const { stdSource, stdFolio, resolvedSrcKey, regions, allLinesOnPage, activeRegion, activeRegionItems, pagePatterns, highlightHint, glyphs, getImageUrl } = useManagerWorkspace(wsProps);

const region = computed(() => regions.value.find(r => r.id === props.line) || null);
watch(region, (r) => { activeRegion.value = r; }, { immediate: true });

const mode = computed(() => (!region.value ? 'page' : region.value.isLegacy ? 'whole' : 'line'));
const lines = computed(() => sortLines(regions.value.filter(r => !r.isLegacy)));
const lineIndex = computed(() => lines.value.findIndex(r => r.id === props.line));
const items = computed(() => activeRegionItems.value);
const itemCount = (r) => annotations.getRegionItems(r.id).length;

const imageUrl = computed(() => getImageUrl(props.source, props.folio));

// ---- the transcription, as a help --------------------------------------------------------

const hasTranscription = computed(() => !!(catalog.value[props.source] || catalog.value[resolvedSrcKey.value]));
const { neumesFor, linesInRange, ready: neumesReady } = useLineNeumes(computed(() => resolvedSrcKey.value), hasTranscription);

const lineNo = computed(() => (mode.value === 'line' ? lineNumber(region.value.name) : null));

const withDetails = (list) => list.map(n => ({ ...n, base: getBaseCode(n.pattern), ...describeSysId(n.sysId) }));

/** The neumes of the open line, or of the whole page, in reading order. */
const neumes = computed(() => {
    if (!neumesReady.value) return [];
    if (mode.value === 'line' && lineNo.value !== null) {
        const found = neumesFor(props.folio, lineNo.value);
        return withDetails(found.length ? found : neumesFor(stdFolio.value, lineNo.value));
    }
    if (mode.value === 'whole') {
        return withDetails(linesInRange(props.folio, props.folio).flatMap(l => neumesFor(l.folio, l.line)));
    }
    return [];
});

/** The lines of the page the transcription has the wanted pattern on. */
const codeLines = computed(() => (highlightHint.value ? highlightHint.value.lines : []));

// ---- choosing a pattern -------------------------------------------------------------------

const active = ref(props.code || '');
const variant = ref('');
const followNeume = ref(''); // the sysId of the neume the next box is for, while drawing along the transcription
watch(() => props.code, (code) => { if (code) active.value = code; });

const variantChoices = computed(() => settings.getSnippetVariants(variant.value));

const groups = computed(() => {
    const out = [];
    if (props.codes.length) out.push({ key: 'project', label: 'This project', codes: props.codes });
    const page = pagePatterns.value.list.filter(c => !c.startsWith('('));
    if (page.length) out.push({ key: 'page', label: pagePatterns.value.isFallback ? 'In this manuscript' : 'On this page', codes: page });
    out.push({ key: 'all', label: 'All patterns', codes: library.value.categories.flatMap(c => c.columns.map(x => x.code)) });
    return out;
});

/** How many snippets of each pattern the open line (or page) has. */
const counts = computed(() => {
    const out = {};
    for (const i of items.value) { const c = getBaseCode(i.pattern); out[c] = (out[c] || 0) + 1; }
    return out;
});

function choose(code) {
    active.value = code;
    followNeume.value = '';
    if (pendingSign.value) {
        const box = pendingSign.value;
        pendingSign.value = null;
        saveSign(box);
    }
}

const variantFor = ref('');

// ---- the page: drawing a line --------------------------------------------------------------

const draftLine = ref(null);
const lineName = ref('');
const nameInput = ref(null);
const suggestions = computed(() => lineNameSuggestions(lines.value.map(r => r.name), allLinesOnPage.value));
const nameTaken = computed(() => !!lineName.value.trim() && lines.value.some(r => r.name.trim().toLowerCase() === lineName.value.trim().toLowerCase()));

watch(draftLine, async (box) => {
    if (!box) return;
    if (!lineName.value || lines.value.some(r => r.name === lineName.value)) lineName.value = suggestions.value[0] || 'Line 1';
    await nextTick();
    if (nameInput.value) { nameInput.value.focus(); nameInput.value.select(); }
});

function saveLine() {
    const name = lineName.value.trim();
    if (!draftLine.value || !name || nameTaken.value) return;
    const id = annotations.addRegion(stdSource.value, stdFolio.value, name, rectToPoints(draftLine.value));
    draftLine.value = null;
    lineName.value = '';
    emit('go', { line: id });
}

function cancelDraft() {
    draftLine.value = null;
    pendingSign.value = null;
    editingBox.value = false;
}

// ---- a line: drawing signs ---------------------------------------------------------------

const pendingSign = ref(null); // a box drawn before a pattern was chosen
const editingBox = ref(false);
const selectedId = ref('');
const lastSaved = ref(null); // { pattern, before } for a few seconds, so the last box can be taken back
let lastTimer = null;

/** The neume a new sign of this pattern is linked to: the one asked for, or the only one left. */
function linkFor(pattern) {
    const base = getBaseCode(pattern);
    const taken = items.value;
    const free = freeNeumes(neumes.value, taken);
    if (followNeume.value) {
        const wanted = free.find(n => n.sysId === followNeume.value);
        if (wanted && wanted.base === base) return { sysId: wanted.sysId };
    }
    const same = free.filter(n => n.base === base);
    return same.length === 1 ? { sysId: same[0].sysId } : null;
}

function saveSign(rect) {
    const pattern = active.value;
    if (!pattern) { pendingSign.value = rect; return; }
    const before = annotations.snapshotPage(stdSource.value, stdFolio.value);
    const points = rectToPoints(rect);
    const link = linkFor(pattern);
    const meta = { ...(variant.value ? { variant: variant.value } : {}), ...(link ? { linkData: link } : {}) };
    if (mode.value === 'whole') annotations.addAnnotation(stdSource.value, stdFolio.value, pattern, points, meta);
    else annotations.addItemToRegion(region.value.id, pattern, points, meta);
    emit('used', getBaseCode(pattern));
    pendingSign.value = null;

    // drawing along the transcription: on to the next neume
    if (followNeume.value) {
        const taken = [...items.value, { linkData: link || {} }];
        const next = nextFree(neumes.value, taken, followNeume.value);
        followNeume.value = next ? next.sysId : '';
        if (next) active.value = next.base;
    }
    lastSaved.value = { pattern, before };
    clearTimeout(lastTimer);
    lastTimer = setTimeout(() => { lastSaved.value = null; }, 9000);
}

function undoLast() {
    if (!lastSaved.value) return;
    annotations.restorePage(lastSaved.value.before);
    lastSaved.value = null;
}

function onDraw(rect) {
    if (mode.value === 'page') { draftLine.value = rect; return; }
    if (editingBox.value) {
        const before = annotations.snapshotPage(stdSource.value, stdFolio.value);
        annotations.updateRegion(stdSource.value, stdFolio.value, region.value.id, { points: rectToPoints(rect) });
        editingBox.value = false;
        toast.show(`The box of “${region.value.name}” is redrawn.`, { action: { label: 'Undo', run: () => annotations.restorePage(before) } });
        return;
    }
    saveSign(rect);
}

function onPick(id) {
    if (mode.value === 'page') { emit('go', { line: id }); return; }
    selectedId.value = String(id);
    tab.value = 'signs';
    editingBox.value = false;
}

// ---- the signs of the line ---------------------------------------------------------------

const tab = ref('patterns');
watch(() => props.line, () => { tab.value = 'patterns'; selectedId.value = ''; editingBox.value = false; cancelDraft(); });
watch(() => props.folio, () => { cancelDraft(); selectedId.value = ''; });

function removeItem(item) {
    deleteOnPage(stdSource.value, stdFolio.value, 'Snippet deleted.', () => {
        annotations.removeAnnotation(stdSource.value, stdFolio.value, item.pattern, item.id);
    });
}

function setVariant(item, value) {
    annotations.updateAnnotation(stdSource.value, stdFolio.value, item.pattern, item.id, { variant: value });
}

const linking = ref('');
const linkOptions = (item) => freeNeumes(neumes.value, items.value).filter(n => n.base === getBaseCode(item.pattern)).slice(0, 14);
function linkItem(item, sysId) {
    annotations.updateAnnotation(stdSource.value, stdFolio.value, item.pattern, item.id, { linkData: sysId ? { sysId } : {} });
    linking.value = '';
}
const syllableOf = (item) => describeSysId(item.linkData && item.linkData.sysId);

/** Draw along the transcription: this neume is next. */
function follow(neume) {
    followNeume.value = neume.sysId;
    active.value = neume.base;
    tab.value = 'patterns';
}

// ---- the line itself ---------------------------------------------------------------------

const renaming = ref('');
const renameInput = ref(null);
async function startRename() {
    renaming.value = region.value.name;
    await nextTick();
    if (renameInput.value) { renameInput.value.focus(); renameInput.value.select(); }
}
function finishRename(save) {
    const name = renaming.value.trim();
    if (save && name && name !== region.value.name && !lines.value.some(r => r.id !== region.value.id && r.name === name)) {
        const before = annotations.snapshotPage(stdSource.value, stdFolio.value);
        annotations.updateRegion(stdSource.value, stdFolio.value, region.value.id, { name });
        toast.show(`Renamed to “${name}”.`, { action: { label: 'Undo', run: () => annotations.restorePage(before) } });
    }
    renaming.value = '';
}

function removeLine(r) {
    deleteOnPage(stdSource.value, stdFolio.value, `“${r.name}” and its snippets deleted.`, () => {
        annotations.removeRegion(stdSource.value, stdFolio.value, r.id);
    });
    if (props.line === r.id) emit('go', { line: '' });
}

const go = (delta) => {
    const next = lines.value[lineIndex.value + delta];
    if (next) emit('go', { line: next.id });
};

// ---- what the stage shows -----------------------------------------------------------------

const pad = (rect) => (rect ? { x: Math.max(0, rect.x - 0.6), y: Math.max(0, rect.y - 0.8), w: Math.min(100, rect.w + 1.2), h: Math.min(100, rect.h + 1.6) } : null);
const focus = computed(() => (mode.value === 'line' ? pad(pointsToRect(region.value.points)) : null));

const boxes = computed(() => {
    if (mode.value === 'page') {
        return lines.value.map(r => ({ id: r.id, rect: pointsToRect(r.points), label: r.name, tone: 'line' })).filter(b => b.rect);
    }
    return items.value.map(i => ({
        id: String(i.id), rect: pointsToRect(i.points), label: i.displayId || i.pattern, tone: 'sign', active: String(i.id) === selectedId.value
    })).filter(b => b.rect);
});

const draft = computed(() => draftLine.value || pendingSign.value);

// ---- keys -------------------------------------------------------------------------------

function onKey(e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 'Escape') {
        if (draft.value || editingBox.value) cancelDraft();
        else if (mode.value !== 'page' && lines.value.length) emit('go', { line: '' });
    } else if (e.key === ']' && mode.value === 'line') go(1);
    else if (e.key === '[' && mode.value === 'line') go(-1);
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); clearTimeout(lastTimer); });

const title = computed(() => (mode.value === 'whole' ? 'The page as a whole' : region.value ? region.value.name : ''));
</script>

<template>
<div class="bench">
    <header class="toolbar">
        <template v-if="mode === 'page'">
            <strong>Lines on this page</strong>
            <span class="n">{{ lines.length }}</span>
            <span class="grow"></span>
            <button class="ne-btn ne-btn--sm ne-btn--ghost" title="Mark signs straight on the page, without drawing lines first" @click="emit('go', { line: 'legacy' })">Mark signs on the whole page</button>
        </template>
        <template v-else>
            <button v-if="lines.length" class="ne-btn ne-btn--sm" @click="emit('go', { line: '' })">&larr; All lines</button>
            <template v-if="mode === 'line'">
                <button class="ne-btn ne-btn--sm ne-btn--ghost" :disabled="lineIndex <= 0" aria-label="Previous line" title="Previous line ([)" @click="go(-1)">&lsaquo;</button>
                <input v-if="renaming" ref="renameInput" v-model="renaming" class="ne-input rename" aria-label="Name of the line" @keydown.enter.prevent="finishRename(true)" @keydown.esc.stop="finishRename(false)" @blur="finishRename(true)" />
                <strong v-else class="name">{{ title }}</strong>
                <button class="ne-btn ne-btn--sm ne-btn--ghost" :disabled="lineIndex >= lines.length - 1" aria-label="Next line" title="Next line (])" @click="go(1)">&rsaquo;</button>
            </template>
            <strong v-else class="name">{{ title }}</strong>
            <span class="grow"></span>
            <template v-if="mode === 'line'">
                <button class="ne-btn ne-btn--sm ne-btn--ghost" @click="startRename">Rename</button>
                <button class="ne-btn ne-btn--sm ne-btn--ghost" :class="{ on: editingBox }" title="Draw the box of this line again" @click="editingBox = !editingBox">Redraw the box</button>
                <button class="ne-btn ne-btn--sm ne-btn--ghost danger" @click="removeLine(region)">Delete line</button>
            </template>
        </template>
    </header>

    <div class="stagebox">
        <PageStage :image-url="imageUrl" :focus="focus" :shade="mode === 'line'" :boxes="boxes" :draft="draft" @draw="onDraw" @pick="onPick">
            <template #hint>
                <span class="pill" :class="{ ask: pendingSign || draftLine || editingBox }">
                    <template v-if="editingBox">Drag the new box for “{{ title }}” &middot; Esc cancels</template>
                    <template v-else-if="draftLine">Name the line on the right, then Save</template>
                    <template v-else-if="pendingSign">Now choose its pattern on the right</template>
                    <template v-else-if="mode === 'page'">Drag a box around a line &middot; click a line to work in it</template>
                    <template v-else-if="active">
                        Drawing <PatternCode :pattern="active" /> &middot; drag a box around each sign
                    </template>
                    <template v-else>Choose a pattern on the right, then drag a box around the sign</template>
                </span>
                <span v-if="lastSaved" class="pill saved">
                    <PatternCode :pattern="lastSaved.pattern" /> saved
                    <button type="button" class="undo" @click="undoLast">Undo</button>
                </span>
            </template>
        </PageStage>
    </div>

    <aside class="panel">
        <!-- the page: lines -->
        <template v-if="mode === 'page'">
            <form v-if="draftLine" class="name-card" @submit.prevent="saveLine">
                <h3>Name this line</h3>
                <div class="chips">
                    <button v-for="s in suggestions" :key="s" type="button" class="chip" :class="{ on: lineName === s }" @click="lineName = s">{{ s }}</button>
                </div>
                <input ref="nameInput" v-model="lineName" class="ne-input" aria-label="Name of the line" placeholder="Line 1" @keydown.esc.stop="cancelDraft" />
                <p v-if="nameTaken" class="problem">“{{ lineName }}” is drawn already. Choose another name, or open it.</p>
                <div class="row">
                    <button type="button" class="ne-btn" @click="cancelDraft">Cancel</button>
                    <button type="submit" class="ne-btn ne-btn--primary" :disabled="!lineName.trim() || nameTaken">Save the line</button>
                </div>
            </form>

            <div v-if="code && codeLines.length" class="helper">
                <PatternDisplay :pattern="code" :glyphs="glyphs" :scale="0.6" />
                <span><PatternCode :pattern="code" /> stands on line<template v-if="codeLines.length > 1">s</template></span>
                <button
                    v-for="n in codeLines"
                    :key="n"
                    type="button"
                    class="chip"
                    :class="{ on: lines.some(r => r.name === `Line ${n}`) }"
                    :title="lines.some(r => r.name === `Line ${n}`) ? `Open Line ${n}` : `Line ${n} is not drawn yet: drag a box around it`"
                    @click="lines.some(r => r.name === `Line ${n}`) ? emit('go', { line: lines.find(r => r.name === `Line ${n}`).id }) : (lineName = `Line ${n}`)"
                >{{ n }}</button>
            </div>

            <ul v-if="lines.length" class="lines">
                <li v-for="r in lines" :key="r.id">
                    <button class="line" @click="emit('go', { line: r.id })">
                        <span class="thumb"><AnnotationCutout :source="stdSource" :folio="stdFolio" :points="r.points" :width="300" :height="54" fit="contain" :hide-label="true" /></span>
                        <span class="nm">{{ r.name }}</span>
                        <span class="ct">{{ itemCount(r) }} sign{{ itemCount(r) === 1 ? '' : 's' }}</span>
                    </button>
                    <button class="x" :aria-label="`Delete ${r.name}`" title="Delete this line" @click="removeLine(r)">✕</button>
                </li>
            </ul>
            <div v-else-if="!draftLine" class="empty">
                <strong>No line yet.</strong>
                <p>Drag a box around a line of the page on the left. It is zoomed in afterwards, and the signs are marked on it.</p>
                <p v-if="allLinesOnPage.length" class="ne-muted">The transcription has {{ allLinesOnPage.length }} line{{ allLinesOnPage.length === 1 ? '' : 's' }} on this page: {{ allLinesOnPage.join(', ') }}.</p>
            </div>
        </template>

        <!-- a line, or the page as a whole: patterns and signs -->
        <template v-else>
            <div class="tabs" role="tablist">
                <button type="button" role="tab" class="tab" :class="{ on: tab === 'patterns' }" :aria-selected="tab === 'patterns'" @click="tab = 'patterns'">Patterns</button>
                <button type="button" role="tab" class="tab" :class="{ on: tab === 'signs' }" :aria-selected="tab === 'signs'" @click="tab = 'signs'">Signs <span class="n">{{ items.length }}</span></button>
                <button v-if="neumes.length" type="button" role="tab" class="tab" :class="{ on: tab === 'transcription' }" :aria-selected="tab === 'transcription'" @click="tab = 'transcription'">Transcription <span class="n">{{ neumes.length }}</span></button>
            </div>

            <div v-show="tab === 'patterns'" class="pane">
                <div v-if="active" class="current">
                    <PatternDisplay :pattern="active" :glyphs="glyphs" :scale="0.9" />
                    <div class="what">
                        <PatternCode :pattern="active" />
                        <span class="ne-muted">is drawn next</span>
                    </div>
                    <button type="button" class="link" @click="variantFor = active">+ code variant</button>
                </div>
                <div v-if="variantChoices.length > 1" class="variants" title="Same code, different look">
                    <span class="lab">Variant</span>
                    <button v-for="v in variantChoices" :key="v.key || '_base'" type="button" class="chip" :class="{ on: (variant || '') === v.key }" @click="variant = v.key">{{ v.label }}</button>
                </div>
                <PatternPalette :model-value="active" :groups="groups" :glyphs="glyphs" :counts="counts" @update:model-value="choose" />
            </div>

            <div v-show="tab === 'signs'" class="pane">
                <p v-if="!items.length" class="none">Nothing is marked here yet. Choose a pattern and drag a box around a sign.</p>
                <ul class="signs">
                    <li v-for="i in items" :key="i.id" :class="{ on: String(i.id) === selectedId }" @click="selectedId = String(i.id)">
                        <span class="pic"><AnnotationCutout :source="stdSource" :folio="stdFolio" :points="i.points" :width="84" :height="56" :hide-label="true" /></span>
                        <span class="info">
                            <span class="code"><PatternCode :pattern="i.pattern" /></span>
                            <select v-if="variantChoices.length > 1" class="vsel" :value="i.variant || ''" aria-label="Variant" @click.stop @change="setVariant(i, $event.target.value)">
                                <option v-for="v in settings.getSnippetVariants(i.variant || '')" :key="v.key || '_base'" :value="v.key">{{ v.label }}</option>
                            </select>
                            <span v-if="i.linkData && i.linkData.sysId" class="link-ok" title="Linked to the transcription">↔ “{{ syllableOf(i).syllable }}” <button type="button" class="unlink" title="Unlink" @click.stop="linkItem(i, '')">✕</button></span>
                            <span v-else-if="hasTranscription && linkOptions(i).length" class="linker">
                                <button type="button" class="link" @click.stop="linking = linking === String(i.id) ? '' : String(i.id)">Link to a neume…</button>
                                <span v-if="linking === String(i.id)" class="menu" @click.stop>
                                    <button v-for="n in linkOptions(i)" :key="n.sysId" type="button" @click="linkItem(i, n.sysId)">
                                        <span v-if="mode === 'whole'" class="ln">L{{ n.line }}</span> “{{ n.syllable || '—' }}” <span class="ne-muted">{{ n.notes }}</span>
                                    </button>
                                </span>
                            </span>
                        </span>
                        <button class="x" :aria-label="`Delete ${i.pattern}`" title="Delete this snippet" @click.stop="removeItem(i)">✕</button>
                    </li>
                </ul>
            </div>

            <div v-if="neumes.length" v-show="tab === 'transcription'" class="pane">
                <p class="none">The neumes the transcription has on {{ mode === 'line' ? `this line` : `this page` }}, in reading order. Pick one, drag a box around it: the sign is linked to it, and the next neume is ready.</p>
                <ul class="neumes">
                    <li v-for="n in neumes" :key="n.sysId">
                        <button type="button" :class="{ on: followNeume === n.sysId, done: items.some(i => i.linkData && i.linkData.sysId === n.sysId) }" @click="follow(n)">
                            <PatternDisplay :pattern="n.base" :glyphs="glyphs" :scale="0.6" />
                            <PatternCode :pattern="n.base" />
                            <span class="syl">{{ n.syllable || '—' }}</span>
                            <span v-if="mode === 'whole'" class="ln">L{{ n.line }}</span>
                            <span v-if="items.some(i => i.linkData && i.linkData.sysId === n.sysId)" class="tick" title="Has a sign">✓</span>
                        </button>
                    </li>
                </ul>
            </div>
        </template>
    </aside>

    <VariantEditorModal :visible="!!variantFor" :base-code="variantFor" :glyphs="glyphs" @close="variantFor = ''" @saved="active = $event.code; variantFor = ''" />
</div>
</template>

<style scoped>
.bench { display: grid; grid-template-columns: minmax(0, 1fr) 400px; grid-template-rows: auto minmax(0, 1fr); height: 100%; min-height: 0; background: var(--color-bg); }
.toolbar { grid-column: 1 / -1; display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; padding: 6px var(--space-4); background: var(--color-surface); border-bottom: 1px solid var(--color-border); min-height: 44px; }
.toolbar .grow { flex: 1; }
.toolbar .n { padding: 0 8px; font-size: 0.78rem; font-weight: 700; background: var(--color-surface-muted); border-radius: 999px; color: var(--color-text-muted); }
.toolbar .name { font-size: 1rem; }
.toolbar .rename { width: 12rem; padding: 0.25em 0.5em; }
.toolbar .on { background: var(--color-primary-light); border-color: var(--color-primary-muted); color: var(--color-primary-dark); }
.toolbar .danger { color: var(--color-danger); }

.stagebox { min-width: 0; min-height: 0; }
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; font-size: 0.84rem; font-weight: 600; color: #e2e8f0; background: rgba(15, 23, 42, 0.82); border-radius: 999px; }
.pill.ask { color: #1e293b; background: #fde68a; }
.pill.saved { margin-left: 8px; background: rgba(21, 128, 61, 0.92); }
.pill :deep(.pattern-code) { color: inherit; background: transparent; padding: 0; font-weight: 700; }
.pill :deep(.pattern-display) { background: #fff; border-radius: 4px; padding: 0 4px; }
.undo { margin-left: 4px; padding: 0 8px; font-size: 0.78rem; font-weight: 700; color: #fff; background: transparent; border: 1px solid rgba(255, 255, 255, 0.6); border-radius: 999px; pointer-events: auto; }
.undo:hover { background: rgba(255, 255, 255, 0.2); }

.panel { display: flex; flex-direction: column; min-height: 0; padding: var(--space-3); gap: var(--space-3); overflow-y: auto; background: var(--color-surface); border-left: 1px solid var(--color-border); }
.panel h3 { margin: 0 0 var(--space-2); font-size: 1rem; }

.name-card { padding: var(--space-3); background: var(--color-warning-light); border: 1px solid var(--color-warning-muted); border-radius: var(--radius-lg); display: flex; flex-direction: column; gap: var(--space-2); }
.name-card .row { display: flex; justify-content: flex-end; gap: var(--space-2); }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { padding: 2px 10px; font-size: 0.82rem; font-weight: 600; color: var(--color-text-muted); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 999px; }
.chip:hover { border-color: var(--color-primary-muted); color: var(--color-text); }
.chip.on { color: var(--color-primary-dark); background: var(--color-primary-light); border-color: var(--color-primary-muted); }
.problem { margin: 0; font-size: 0.82rem; font-weight: 600; color: var(--color-danger); }

.helper { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: var(--space-2) var(--space-3); font-size: 0.84rem; background: var(--color-warning-light); border: 1px solid var(--color-warning-muted); border-radius: var(--radius-md); }

.lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.lines li { position: relative; }
.line { width: 100%; display: grid; grid-template-columns: 1fr auto; grid-template-areas: 'thumb thumb' 'nm ct'; gap: 2px 8px; padding: var(--space-2); text-align: left; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.line:hover { border-color: var(--color-success); background: var(--color-surface); box-shadow: var(--shadow-sm); }
.thumb { grid-area: thumb; display: flex; align-items: center; justify-content: center; height: 54px; background: #f3f5f8; border-radius: var(--radius-sm); overflow: hidden; }
.nm { grid-area: nm; font-weight: 700; }
.ct { grid-area: ct; font-size: 0.8rem; color: var(--color-text-muted); align-self: center; }
.lines .x { position: absolute; top: 6px; right: 6px; width: 1.6rem; height: 1.6rem; padding: 0; line-height: 1; color: var(--color-text-light); background: rgba(255, 255, 255, 0.9); border: 1px solid var(--color-border); border-radius: var(--radius-sm); opacity: 0; }
.lines li:hover .x { opacity: 1; }
.lines .x:hover { color: var(--color-danger); }
.empty { padding: var(--space-3); font-size: 0.9rem; color: var(--color-text-muted); }
.empty strong { color: var(--color-text); }
.empty p { margin: 6px 0 0; }

.tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--color-border); flex: 0 0 auto; }
.tab { display: inline-flex; align-items: center; gap: 6px; padding: var(--space-2) var(--space-3); font-weight: 600; font-size: 0.9rem; color: var(--color-text-muted); background: transparent; border: none; border-bottom: 3px solid transparent; border-radius: 0; margin-bottom: -1px; }
.tab:hover { color: var(--color-text); background: var(--color-surface-muted); }
.tab.on { color: var(--color-primary-dark); border-bottom-color: var(--color-primary); }
.tab .n { padding: 0 6px; font-size: 0.72rem; background: var(--color-surface-muted); border-radius: 999px; }
.pane { display: flex; flex-direction: column; gap: var(--space-3); flex: 1; min-height: 0; }
.none { margin: 0; font-size: 0.86rem; color: var(--color-text-muted); }

.current { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); background: var(--color-primary-light); border: 1px solid var(--color-primary-muted); border-radius: var(--radius-md); flex: 0 0 auto; }
.current .what { display: flex; flex-direction: column; flex: 1; min-width: 0; font-size: 0.8rem; }
.current :deep(.pattern-code) { font-size: 1rem; font-weight: 700; }
.link { padding: 0; font-size: 0.8rem; color: var(--color-primary); background: none; border: none; }
.link:hover { background: none; text-decoration: underline; }
.variants { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; flex: 0 0 auto; }
.variants .lab { font-size: 0.76rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); margin-right: 4px; }

.signs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.signs li { position: relative; display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); cursor: pointer; }
.signs li:hover { border-color: var(--color-primary-muted); }
.signs li.on { border-color: var(--color-warning); background: var(--color-warning-light); }
.pic { flex: 0 0 auto; display: flex; width: 84px; height: 56px; overflow: hidden; background: #f3f5f8; border-radius: var(--radius-sm); }
.info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; font-size: 0.84rem; }
.code :deep(.pattern-code) { font-size: 0.95rem; font-weight: 700; }
.vsel { width: auto; max-width: 8rem; padding: 0 4px; font-size: 0.78rem; }
.link-ok { color: var(--color-success-dark); }
.unlink { padding: 0 4px; font-size: 0.72rem; color: var(--color-text-light); background: none; border: none; }
.linker { position: relative; }
.menu { position: absolute; left: 0; top: 100%; z-index: 20; min-width: 14rem; max-height: 14rem; overflow-y: auto; display: flex; flex-direction: column; padding: 4px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); }
.menu button { text-align: left; padding: 0.35em 0.6em; font-size: 0.82rem; background: transparent; border: none; border-radius: var(--radius-sm); }
.menu button:hover { background: var(--color-primary-light); }
.ln { font-size: 0.7rem; font-weight: 700; color: var(--color-text-muted); }
.signs .x { flex: 0 0 auto; width: 1.7rem; height: 1.7rem; padding: 0; line-height: 1; color: var(--color-text-light); background: transparent; border: 1px solid transparent; }
.signs .x:hover { color: var(--color-danger); background: var(--color-danger-light); }

.neumes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.neumes button { width: 100%; display: flex; align-items: center; gap: var(--space-2); padding: 4px var(--space-2); text-align: left; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.neumes button:hover { border-color: var(--color-primary-muted); background: var(--color-primary-light); }
.neumes button.on { border-color: var(--color-primary); box-shadow: 0 0 0 2px var(--color-primary); background: var(--color-primary-light); }
.neumes button.done { opacity: 0.6; }
.neumes .syl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-style: italic; color: var(--color-text-muted); }
.neumes :deep(.pattern-code) { font-weight: 700; font-size: 0.86rem; }
.tick { color: var(--color-success-dark); font-weight: 700; }

@media (max-width: 1000px) {
    .bench { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(320px, 1fr) minmax(0, 1fr); }
    .panel { border-left: none; border-top: 1px solid var(--color-border); }
}
</style>

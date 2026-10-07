<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PatternDisplay from '../PatternDisplay.vue';
import PatternCode from '../PatternCode.vue';
import SnippetThumb from './SnippetThumb.vue';
import IiifSetup from '../iiif/IiifSetup.vue';
import { useProjectContext } from '../../composables/useProject';
import { useDirectSnippetsStore } from '../../stores/directSnippets';
import { useAnnotationsStore } from '../../stores/annotations';
import { useSettingsStore } from '../../stores/settings';
import { useToast } from '../../composables/useToast';
import { categoryOf } from '../../utils/projectTable';
import { projectPageLocation } from '../../utils/projectChoices';
import { CLEF_CODE, CUSTOS_CODE } from '../../utils/neumeTable';
import { fileToSnippet, imageFromPaste, imagesFromDrop } from '../../utils/snippetImages';
import { findLine, lineLabel, signsOfLine, sortedLines } from '../../utils/lineSigns';
import { loneSignAttributes, validateAttribute, validateAttributes } from '../../utils/snippetAttributes';

/**
 * Where the snippets of one cell are seen, found and added. What it offers depends
 * on how the project works:
 *
 *   IIIF, with a transcription    the places where the transcription has this code, each
 *                                 opening the page in the page editor
 *   IIIF, without                 the folios of the project, to open and mark by hand
 *   screenshots of lines          the lines of the project, to mark a sign on, and the
 *                                 places of the transcription a line can be added for
 *   screenshots of signs          a place to paste, drop or choose an image, with where it is from
 *
 * The page editor and the line editor are the ones that mark things; they bring the person back here.
 */
const props = defineProps({
    code: { type: String, required: true },
    /** the codes of the table, in order, for the arrows */
    codes: { type: Array, default: () => [] }
});
const emit = defineEmits(['close', 'navigate', 'open-line']);

const router = useRouter();
const route = useRoute();
const toast = useToast();
const direct = useDirectSnippetsStore();
const annotations = useAnnotationsStore();
const settings = useSettingsStore();
const {
    project, glyphs, snippets, occurrences, hasTranscription, iiifAvailable, folios, collection, ensureCollection
} = useProjectContext();

const mine = computed(() => snippets.value.get(props.code) || []);
const occurrence = computed(() => occurrences.value.get(props.code) || null);
const category = computed(() => categoryOf(props.code));
const isPseudo = computed(() => props.code === CLEF_CODE || props.code === CUSTOS_CODE);
const inTable = computed(() => props.codes.includes(props.code));
const here = computed(() => props.codes.indexOf(props.code));

const shots = computed(() => project.value.images === 'screenshots');
const onLines = computed(() => shots.value && project.value.snippets === 'lines');
const fmt = (n) => n.toLocaleString('en-US');

function step(delta) {
    const i = here.value + delta;
    if (i >= 0 && i < props.codes.length) emit('navigate', props.codes[i]);
}

// ---- a snippet, and what it says --------------------------------------------

const chosenId = ref('');
const chosen = computed(() => mine.value.find(s => s.id === chosenId.value) || null);
watch(() => props.code, () => { chosenId.value = ''; });

/** A sign on a line (or on a page region) takes its place from there; a lone screenshot carries it itself. */
const detailDefs = computed(() => (chosen.value && chosen.value.kind === 'image' && !chosen.value.lineId
    ? loneSignAttributes(settings.snippetAttributes)
    : settings.getSnippetAttributes('sign')));
const fieldErrors = reactive({});

function saveAttr(snippet, def, value) {
    const result = validateAttribute(def, value);
    const key = `${snippet.id}:${def.key}`;
    if (!result.ok) { fieldErrors[key] = result.message; return; }
    fieldErrors[key] = '';
    const next = { ...(snippet.attrs || {}), [def.key]: result.value };
    if (!result.value) delete next[def.key];
    if (snippet.kind === 'image') direct.updateSnippet(collection.value.id, snippet.id, { attrs: next });
    else annotations.updateAnnotation(snippet.source, snippet.folio, snippet.pattern, snippet.id, { attrs: next });
}

function openPage(folio, region) {
    if (!folio) return;
    // A project that marks signs on the page as a whole opens the page that way; the editor brings the person back here.
    router.push(projectPageLocation(project.value.id, {
        folio,
        code: props.code,
        line: region || (project.value.snippets === 'signs' ? 'legacy' : ''),
        from: route.name === 'project_extended' ? 'extended' : 'standard'
    }));
}

function openSnippet(s) {
    if (s.kind === 'image') {
        if (s.lineId) emit('open-line', { lineId: s.lineId, focusSign: s.id, code: '' });
        return;
    }
    openPage(s.folio, s.regionId || (s.kind === 'sign' ? 'legacy' : undefined));
}

function removeShot(s) {
    const collectionNow = ensureCollection();
    if (!collectionNow) return;
    const saved = { ...s };
    delete saved.kind;
    delete saved.place;
    direct.removeSnippet(collectionNow.id, s.id);
    if (chosenId.value === s.id) chosenId.value = '';
    toast.show('Snippet deleted.', {
        action: {
            label: 'Undo',
            run: () => {
                const c = direct.getCollection(collectionNow.id);
                if (c) direct.updateCollection(c.id, { snippets: [...c.snippets, saved] });
            }
        }
    });
}

// ---- IIIF: finding places --------------------------------------------------

const LIMIT = 12;
const showAllPlaces = ref(false);

/** The places where the transcription has this code, by folio, with what is drawn there already. */
const places = computed(() => {
    const byFolio = new Map();
    for (const p of (occurrence.value && occurrence.value.places) || []) {
        if (!byFolio.has(p.folio)) byFolio.set(p.folio, { folio: p.folio, lines: new Set(), count: 0 });
        const entry = byFolio.get(p.folio);
        entry.lines.add(p.line);
        entry.count++;
    }
    const drawn = new Map();
    for (const s of mine.value) drawn.set(s.folio, (drawn.get(s.folio) || 0) + 1);
    return [...byFolio.values()].map(e => ({ ...e, lines: [...e.lines].sort((a, b) => a - b), drawn: drawn.get(e.folio) || 0 }));
});
const shownPlaces = computed(() => (showAllPlaces.value ? places.value : places.value.slice(0, LIMIT)));

const folioChoice = ref('');

// ---- screenshots of lines --------------------------------------------------

const projectLines = computed(() => sortedLines(collection.value).map(l => ({
    line: l,
    label: lineLabel(l),
    signs: signsOfLine(collection.value, l.id).length,
    hasCode: signsOfLine(collection.value, l.id).some(s => s.pattern === props.code)
})));

/** The places of the transcription for this code, one per line, and whether the line has its picture. */
const linePlaces = computed(() => {
    const byLine = new Map();
    for (const p of (occurrence.value && occurrence.value.places) || []) {
        const key = `${p.folio}|${p.line}`;
        if (!byLine.has(key)) byLine.set(key, { folio: p.folio, line: String(p.line), count: 0 });
        byLine.get(key).count++;
    }
    return [...byLine.values()].map(p => ({ ...p, existing: findLine(collection.value, p.folio, p.line) }));
});
const shownLinePlaces = computed(() => (showAllPlaces.value ? linePlaces.value : linePlaces.value.slice(0, LIMIT)));

// ---- screenshots of signs: adding ------------------------------------------

const pending = ref(null);
const attrs = reactive({});
const dragging = ref(false);
const reading = ref(false);
const loneDefs = computed(() => loneSignAttributes(settings.snippetAttributes));
const check = computed(() => validateAttributes(loneDefs.value, attrs));

async function take(file) {
    if (!file) return;
    reading.value = true;
    try { pending.value = await fileToSnippet(file); }
    catch (e) { toast.show(e.message || 'That image could not be read.', { tone: 'error' }); }
    finally { reading.value = false; }
}

function onPaste(e) {
    if (!shots.value || onLines.value) return;
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    const file = imageFromPaste(e);
    if (file) { e.preventDefault(); take(file); }
}
const onDrop = (e) => { dragging.value = false; take(imagesFromDrop(e)[0]); };
const onPick = (e) => { take(e.target.files && e.target.files[0]); e.target.value = ''; };

function addPending() {
    if (!pending.value || !check.value.ok) return;
    const c = ensureCollection();
    if (!c) return;
    direct.addPattern(c.id, props.code);
    direct.addSnippet(c.id, {
        pattern: props.code, image: pending.value.dataUrl, attrs: check.value.values,
        width: pending.value.width, height: pending.value.height
    });
    pending.value = null;
    for (const k of Object.keys(attrs)) delete attrs[k];
    toast.show(`Snippet added to ${props.code}.`, { tone: 'success' });
}

function onKey(e) {
    if (e.key === 'Escape' && !(e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) emit('close');
}
onMounted(() => {
    document.addEventListener('keydown', onKey);
    document.addEventListener('paste', onPaste);
});
onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('paste', onPaste);
});
</script>

<template>
<aside class="drawer" aria-label="Snippets of this cell">
    <header class="head">
        <div class="glyph" aria-hidden="true">
            <span v-if="isPseudo" class="pseudo">{{ code === CLEF_CODE ? 'Clef' : 'Custos' }}</span>
            <PatternDisplay v-else :pattern="code" :glyphs="glyphs" :scale="1.5" />
        </div>
        <div class="title">
            <h2><PatternCode v-if="!isPseudo" :pattern="code" /><template v-else>{{ code === CLEF_CODE ? 'Clef' : 'Custos' }}</template></h2>
            <p class="sub">
                {{ mine.length }} snippet{{ mine.length === 1 ? '' : 's' }}<template v-if="hasTranscription"> · {{ occurrence ? fmt(occurrence.count) : 'none' }} in the transcription</template>
            </p>
        </div>
        <div class="nav">
            <button class="ne-btn ne-btn--ghost ne-btn--sm" :disabled="here <= 0" aria-label="Previous column" title="Previous column" @click="step(-1)">&lsaquo;</button>
            <button class="ne-btn ne-btn--ghost ne-btn--sm" :disabled="here < 0 || here >= codes.length - 1" aria-label="Next column" title="Next column" @click="step(1)">&rsaquo;</button>
            <button class="ne-btn ne-btn--ghost ne-btn--sm" aria-label="Close" title="Close (Esc)" @click="emit('close')">✕</button>
        </div>
    </header>

    <div class="scroll">
        <p v-if="!inTable" class="ne-note ne-note--info">Not a column of this table.</p>

        <section>
            <h3>Snippets</h3>
            <p v-if="!mine.length" class="ne-muted none">None yet.</p>
            <ul v-else class="grid">
                <li v-for="s in mine" :key="s.id" :class="{ chosen: s.id === chosenId }">
                    <button class="snip" :title="s.place && s.place.label ? s.place.label : 'Snippet'" @click="chosenId = chosenId === s.id ? '' : s.id">
                        <span class="pic"><SnippetThumb :snippet="s" :width="92" :height="64" /></span>
                        <span class="cap">{{ s.kind === 'image' ? (s.place && s.place.label) || '—' : `f. ${s.folio}${s.lineName ? ' · ' + s.lineName : ''}` }}</span>
                    </button>
                </li>
            </ul>

            <div v-if="chosen" class="detail">
                <div class="detail-head">
                    <strong>{{ chosen.kind === 'image' ? (chosen.place && chosen.place.label) || 'Snippet' : `f. ${chosen.folio}${chosen.lineName ? ' · ' + chosen.lineName : ''}` }}</strong>
                    <span class="spacer"></span>
                    <button v-if="chosen.kind !== 'image' || chosen.lineId" class="ne-btn ne-btn--sm" @click="openSnippet(chosen)">{{ chosen.kind === 'image' ? 'Open the line →' : 'Open the page →' }}</button>
                    <button v-if="chosen.kind === 'image'" class="ne-btn ne-btn--danger ne-btn--sm" @click="removeShot(chosen)">Delete</button>
                </div>
                <div v-if="detailDefs.length" class="fields">
                    <div v-for="def in detailDefs" :key="def.key" class="ne-field">
                        <label :for="`cd-${chosen.id}-${def.key}`">{{ def.label }}</label>
                        <select v-if="def.type === 'choice'" :id="`cd-${chosen.id}-${def.key}`" :value="(chosen.attrs && chosen.attrs[def.key]) || ''" class="ne-input" @change="saveAttr(chosen, def, $event.target.value)">
                            <option value="">—</option>
                            <option v-for="o in def.options" :key="o" :value="o">{{ o }}</option>
                        </select>
                        <input v-else :id="`cd-${chosen.id}-${def.key}`" :value="(chosen.attrs && chosen.attrs[def.key]) || ''" class="ne-input" :class="{ bad: fieldErrors[`${chosen.id}:${def.key}`] }" :placeholder="def.hint" autocomplete="off" @change="saveAttr(chosen, def, $event.target.value)" />
                        <p v-if="fieldErrors[`${chosen.id}:${def.key}`]" class="error">{{ fieldErrors[`${chosen.id}:${def.key}`] }}</p>
                    </div>
                </div>
            </div>
        </section>

        <!-- screenshots of lines -->
        <template v-if="onLines">
            <section>
                <h3>Mark it on a line</h3>
                <ul v-if="projectLines.length" class="line-list">
                    <li v-for="l in projectLines" :key="l.line.id">
                        <img class="line-pic" :src="l.line.image" :alt="l.label" loading="lazy" />
                        <span class="where">{{ l.label }}</span>
                        <span class="ne-muted">{{ l.signs }} sign{{ l.signs === 1 ? '' : 's' }}</span>
                        <span v-if="l.hasCode" class="ne-chip drawn">has {{ code }}</span>
                        <button class="ne-btn ne-btn--sm" @click="emit('open-line', { lineId: l.line.id, code })">Mark →</button>
                    </li>
                </ul>
                <button class="ne-btn add-line" @click="emit('open-line', { lineId: '', code })">On a new line…</button>
            </section>

            <section v-if="hasTranscription && linePlaces.length">
                <h3>Where the transcription has it</h3>
                <ul class="places">
                    <li v-for="p in shownLinePlaces" :key="`${p.folio}|${p.line}`">
                        <span class="folio">f. {{ p.folio }} · l. {{ p.line }}</span>
                        <span class="where">{{ p.count }}×</span>
                        <button v-if="p.existing" class="ne-btn ne-btn--sm" @click="emit('open-line', { lineId: p.existing.id, code })">Open the line →</button>
                        <button v-else class="ne-btn ne-btn--sm" @click="emit('open-line', { lineId: '', code, draft: { attrs: { folio: p.folio, line: p.line } } })">Add the picture…</button>
                    </li>
                </ul>
                <button v-if="linePlaces.length > LIMIT" class="ne-btn ne-btn--ghost ne-btn--sm more" @click="showAllPlaces = !showAllPlaces">
                    {{ showAllPlaces ? 'Show fewer' : `Show all ${linePlaces.length} lines` }}
                </button>
            </section>
        </template>

        <!-- screenshots of single signs -->
        <section v-else-if="shots">
            <h3>Add a screenshot of the sign</h3>
            <div v-if="!pending" class="drop" :class="{ on: dragging, busy: reading }" tabindex="0"
                 @dragover.prevent="dragging = true" @dragleave.self="dragging = false" @drop.prevent="onDrop">
                <p>{{ reading ? 'Reading the image…' : 'Paste an image (Ctrl/⌘ V), drop it here, or' }}</p>
                <label class="ne-btn">
                    Choose an image…
                    <input type="file" accept="image/*" hidden @change="onPick" />
                </label>
            </div>
            <form v-else class="pending" @submit.prevent="addPending">
                <img :src="pending.dataUrl" alt="Preview of the new snippet" />
                <div class="fields">
                    <div v-for="def in loneDefs" :key="def.key" class="ne-field">
                        <label :for="`np-${def.key}`">{{ def.label }}</label>
                        <input :id="`np-${def.key}`" v-model="attrs[def.key]" class="ne-input" :class="{ bad: attrs[def.key] && check.errors[def.key] }" :placeholder="def.hint" autocomplete="off" />
                        <p v-if="attrs[def.key] && check.errors[def.key]" class="error">{{ check.errors[def.key] }}</p>
                    </div>
                </div>
                <div class="row">
                    <button type="button" class="ne-btn" @click="pending = null">Discard</button>
                    <button type="submit" class="ne-btn ne-btn--primary" :disabled="!check.ok">Add snippet</button>
                </div>
            </form>
        </section>

        <!-- IIIF: nothing to open without page images, so what is missing is said instead -->
        <template v-else>
            <IiifSetup v-if="!iiifAvailable" compact :source="project.source" purpose="mark this pattern on the pages">
                <template #alternative>Without page images, choose <strong>screenshots</strong> in the project's <em>Settings</em>.</template>
            </IiifSetup>

            <section v-if="hasTranscription">
                <h3>Where the transcription has it</h3>
                <p v-if="!places.length" class="ne-muted none">Not in the folios of this project.</p>
                <ul v-else class="places">
                    <li v-for="p in shownPlaces" :key="p.folio">
                        <span class="folio">f. {{ p.folio }}</span>
                        <span class="where">line{{ p.lines.length === 1 ? '' : 's' }} {{ p.lines.join(', ') }}<template v-if="p.count > p.lines.length"> · {{ p.count }}×</template></span>
                        <span v-if="p.drawn" class="ne-chip drawn" :title="`${p.drawn} snippet(s) drawn on this folio`">{{ p.drawn }} drawn</span>
                        <button v-if="iiifAvailable" class="ne-btn ne-btn--sm" @click="openPage(p.folio)">Open page &rarr;</button>
                    </li>
                </ul>
                <button v-if="places.length > LIMIT" class="ne-btn ne-btn--ghost ne-btn--sm more" @click="showAllPlaces = !showAllPlaces">
                    {{ showAllPlaces ? 'Show fewer' : `Show all ${places.length} folios` }}
                </button>
            </section>

            <section v-if="iiifAvailable">
                <h3>Open a folio</h3>
                <form class="open" @submit.prevent="openPage(folioChoice)">
                    <input v-model.trim="folioChoice" class="ne-input" list="cd-folios" placeholder="Folio, e.g. 12r" aria-label="Folio" autocomplete="off" />
                    <datalist id="cd-folios"><option v-for="f in folios" :key="f" :value="f" /></datalist>
                    <button class="ne-btn" type="submit" :disabled="!folioChoice">Open page &rarr;</button>
                </form>
            </section>
        </template>
    </div>
</aside>
</template>

<style scoped>
.drawer { display: flex; flex-direction: column; min-height: 0; max-height: calc(100vh - 140px); background: var(--color-surface); border: 1px solid var(--color-border-hover); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); overflow: hidden; }
.head { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--color-border); background: var(--color-surface-muted); }
.glyph { flex: 0 0 auto; min-width: 56px; display: flex; align-items: center; justify-content: center; padding: var(--space-2); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.pseudo { font-weight: 700; }
.title { flex: 1; min-width: 0; }
h2 { margin: 0; font-size: 1.25rem; overflow-wrap: anywhere; }
h2 :deep(.pattern-code), h2 :deep(code) { font-size: 1.45rem !important; font-weight: 700; }
.sub { margin: 2px 0 0; font-size: 0.8rem; color: var(--color-text-muted); }
.nav { display: flex; gap: 2px; }

.scroll { flex: 1; overflow-y: auto; padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-5); }
h3 { margin: 0 0 var(--space-2); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); }
h3 code { text-transform: none; letter-spacing: 0; font-size: 0.85rem; }
.none, .hint { margin: 0 0 var(--space-2); font-size: 0.88rem; }
.small { font-size: 0.8rem; margin: var(--space-2) 0 0; }
.error { margin: 2px 0 0; font-size: 0.78rem; font-weight: 600; color: var(--color-danger); }
.bad { border-color: var(--color-danger) !important; }

.grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: var(--space-2); }
.snip { width: 100%; display: flex; flex-direction: column; gap: 3px; padding: 4px; text-align: left; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.snip:hover { border-color: var(--color-primary); background: var(--color-primary-light); }
.grid li.chosen .snip { border-color: var(--color-primary); box-shadow: 0 0 0 1px var(--color-primary); background: var(--color-primary-light); }
.pic { display: flex; align-items: center; justify-content: center; min-height: 64px; background: #f8fafc; border-radius: var(--radius-sm); overflow: hidden; }
.pic :deep(img) { max-width: 100%; max-height: 90px; object-fit: contain; }
.cap { font-size: 0.72rem; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.detail { margin-top: var(--space-3); padding: var(--space-3); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.detail-head { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); flex-wrap: wrap; }
.spacer { flex: 1; }
.fields { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2) var(--space-3); }
.fields .ne-input { padding: 0.4em 0.6em; font-size: 0.9rem; }

.line-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.line-list li { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border); font-size: 0.88rem; }
.line-pic { flex: 0 0 auto; width: 84px; height: 30px; object-fit: contain; background: #f3f5f8; border: 1px solid var(--color-border); border-radius: 4px; }
.line-list .where { flex: 1; font-weight: 700; min-width: 0; }
.add-line { margin-top: var(--space-3); }

.drop { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); padding: var(--space-5) var(--space-3); border: 2px dashed var(--color-border-hover); border-radius: var(--radius-lg); background: var(--color-bg); text-align: center; }
.drop p { margin: 0; color: var(--color-text-muted); font-size: 0.9rem; }
.drop.on { border-color: var(--color-primary); background: var(--color-primary-light); }
.drop.busy { opacity: 0.7; }
.pending { display: flex; flex-direction: column; gap: var(--space-3); }
.pending img { max-width: 100%; max-height: 180px; object-fit: contain; align-self: center; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: #f8fafc; }
.row { display: flex; justify-content: flex-end; gap: var(--space-2); }

.places { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.places li { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border); font-size: 0.88rem; }
.places li:last-child { border-bottom: none; }
.folio { font-weight: 700; min-width: 4.2em; }
.where { flex: 1; color: var(--color-text-muted); }
.drawn { background: var(--color-success-light); color: var(--color-success-dark); }
.more { margin-top: var(--space-2); }

.open { display: flex; gap: var(--space-2); }
.open .ne-input { flex: 1; min-width: 0; }
</style>

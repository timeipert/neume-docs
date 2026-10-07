<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import ModalDialog from '../ui/ModalDialog.vue';
import PatternDisplay from '../PatternDisplay.vue';
import { useProjectContext } from '../../composables/useProject';
import { useLineNeumes } from '../../composables/useLineNeumes';
import { useDirectSnippetsStore } from '../../stores/directSnippets';
import { useSettingsStore } from '../../stores/settings';
import { useToast } from '../../composables/useToast';
import { checkCode } from '../../utils/projectTable';
import { tableCodes } from '../../utils/projectTable';
import { validateAttribute, validateAttributes } from '../../utils/snippetAttributes';
import {
    boxFromCorners, findLine, lineLabel, linesOf, moveBox, neumeForBox, resizeBox, signsOfLine, sortedLines
} from '../../utils/lineSigns';
import { LINE_OPTIONS, cropImage, fileToSnippet, imageFromPaste, imagesFromDrop } from '../../utils/snippetImages';

/**
 * A line of a screenshot project, and the signs on it.
 *
 * First the picture of the line and where it comes from (folio and line); then the
 * signs are marked on it, left to right, each with its pattern code and what the
 * settings ask of a sign (the syllable, say). A sign keeps its own cut-out picture,
 * so it shows in the table like any other snippet, and it stays tied to its line.
 * When the manuscript has a transcription, the neumes of that line are laid beside
 * the picture, and a new box gets the neume that stands at its place.
 */
const props = defineProps({
    open: { type: Boolean, default: false },
    /** the line to edit; empty to add one */
    lineId: { type: String, default: '' },
    /** a line to add: what is already known about it */
    draft: { type: Object, default: () => ({ attrs: {} }) },
    /** the cell this was opened from: the first new box is a sign of this code */
    code: { type: String, default: '' },
    /** a sign to select */
    focusSign: { type: String, default: '' }
});
const emit = defineEmits(['close', 'update:lineId']);

const toast = useToast();
const direct = useDirectSnippetsStore();
const settings = useSettingsStore();
const { project, glyphs, collection, hasTranscription, ensureCollection, ensureColumn } = useProjectContext();

const lineDefs = computed(() => settings.getSnippetAttributes('line'));
const signDefs = computed(() => settings.getSnippetAttributes('sign'));
const showVariant = computed(() => settings.hasSnippetVariantConfig());
const variantOptions = computed(() => settings.getSnippetVariants());

const line = computed(() => linesOf(collection.value).find(l => l.id === props.lineId) || null);
const signs = computed(() => (line.value ? signsOfLine(collection.value, line.value.id) : []));
const COLORS = ['#2563eb', '#db2777', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#4d7c0f'];
const colorOf = (i) => COLORS[i % COLORS.length];

// ---- a new line: the picture, and where it is from -------------------------

const selected = ref('');
const pendingCode = ref('');
const pending = ref(null); // { dataUrl, width, height }
const attrs = reactive({});
const attrErrors = reactive({});
const reading = ref(false);
const dragging = ref(false);

watch(() => [props.open, props.lineId], () => {
    if (!props.open) return;
    pending.value = null;
    for (const k of Object.keys(attrs)) delete attrs[k];
    for (const k of Object.keys(attrErrors)) delete attrErrors[k];
    Object.assign(attrs, line.value ? line.value.attrs : props.draft.attrs || {});
    selected.value = props.focusSign || '';
    pendingCode.value = props.code;
}, { immediate: true });

async function take(file) {
    if (!file) return;
    reading.value = true;
    try { pending.value = await fileToSnippet(file, LINE_OPTIONS); }
    catch (e) { toast.show(e.message || 'That image could not be read.', { tone: 'error' }); }
    finally { reading.value = false; }
}
function onPaste(e) {
    if (!props.open || line.value) return;
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    const file = imageFromPaste(e);
    if (file) { e.preventDefault(); take(file); }
}
const onDrop = (e) => { dragging.value = false; take(imagesFromDrop(e)[0]); };
const onPick = (e) => { take(e.target.files && e.target.files[0]); e.target.value = ''; };

const check = computed(() => validateAttributes(lineDefs.value, attrs));
const duplicate = computed(() => (check.value.values.folio && check.value.values.line
    ? findLine(collection.value, check.value.values.folio, check.value.values.line) : null));
const canCreate = computed(() => !!pending.value && check.value.ok && !duplicate.value);

function createLine() {
    if (!canCreate.value) return;
    const c = ensureCollection();
    const made = direct.addLine(c.id, { image: pending.value.dataUrl, width: pending.value.width, height: pending.value.height, attrs: check.value.values });
    if (made) emit('update:lineId', made.id);
}

// ---- the line's own attributes ---------------------------------------------

function saveLineAttr(def, value) {
    const result = validateAttribute(def, value);
    if (!result.ok) { attrErrors[def.key] = result.message; return; }
    attrErrors[def.key] = '';
    const next = { ...line.value.attrs, [def.key]: result.value };
    if (!result.value) delete next[def.key];
    const clash = next.folio && next.line ? findLine(collection.value, next.folio, next.line) : null;
    if (clash && clash.id !== line.value.id) { attrErrors[def.key] = 'Another line has this place.'; return; }
    attrs[def.key] = result.value;
    direct.updateLine(collection.value.id, line.value.id, { attrs: next });
}

// ---- the transcription of this line ----------------------------------------

const { neumesFor, ready: transcriptionReady } = useLineNeumes(computed(() => project.value.source), hasTranscription);
const neumes = computed(() => (line.value ? neumesFor(line.value.attrs.folio, line.value.attrs.line) : []));
const isLinked = (neume) => signs.value.some(s => s.link && s.link.sysId === neume.sysId);

// ---- the signs --------------------------------------------------------------

const stage = ref(null);
const zoom = ref(100);
const interaction = ref(null);
const errors = reactive({});

const selectedSign = computed(() => signs.value.find(s => s.id === selected.value) || null);

/** What the project has as columns: the codes offered while typing one. */
const offered = computed(() => {
    const codes = new Set(tableCodes(project.value, 'extended'));
    for (const n of neumes.value) codes.add(n.pattern);
    return [...codes];
});

function pointOf(e) {
    const r = stage.value.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
}

function start(type, e, sign = null, corner = '') {
    e.preventDefault();
    e.stopPropagation();
    const p = pointOf(e);
    interaction.value = { type, id: sign ? sign.id : '', corner, start: p, current: p, box0: sign ? { ...sign.box } : null };
    if (sign) selected.value = sign.id;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
}
const onStageDown = (e) => { if (e.button === 0) start('draw', e); };
const onBoxDown = (e, sign) => { if (e.button === 0) start('move', e, sign); };
const onHandleDown = (e, sign, corner) => { if (e.button === 0) start('resize', e, sign, corner); };

function onMove(e) {
    if (interaction.value) interaction.value = { ...interaction.value, current: pointOf(e) };
}

/** The box as it would be if the pointer were released now. */
const preview = computed(() => {
    const a = interaction.value;
    if (!a) return null;
    if (a.type === 'draw') return boxFromCorners(a.start, a.current);
    if (a.type === 'move') return moveBox(a.box0, a.current.x - a.start.x, a.current.y - a.start.y);
    return resizeBox(a.box0, a.corner, a.current);
});
const boxOf = (sign) => (interaction.value && interaction.value.id === sign.id && interaction.value.type !== 'draw' && preview.value ? preview.value : sign.box);

async function onUp() {
    window.removeEventListener('pointermove', onMove);
    const a = interaction.value;
    const box = preview.value;
    interaction.value = null;
    if (!a || !box) return;
    if (a.type === 'draw') await createSign(box);
    else if (JSON.stringify(box) !== JSON.stringify(a.box0)) await commitBox(a.id, box);
}

async function cut(box) {
    return cropImage(line.value.image, box);
}

async function createSign(box) {
    const c = collection.value;
    const wanted = pendingCode.value;
    // The neume at this place, unless a sign has taken it already (boxes drawn out of order).
    const suggested = neumeForBox(neumes.value, signs.value, box);
    const neume = suggested && !isLinked(suggested) ? suggested : null;
    // The cell this was opened from says what the first sign is; otherwise the transcription does.
    const code = wanted || (neume ? neume.pattern : '');
    const fromTranscription = neume && (!wanted || neume.pattern === wanted);
    pendingCode.value = '';
    const crop = await cut(box);
    if (code) { ensureColumn(code); direct.addPattern(c.id, code); }
    const sign = direct.addSnippet(c.id, {
        pattern: code, image: crop.dataUrl, width: crop.width, height: crop.height, lineId: line.value.id, box,
        attrs: fromTranscription && neume.syllable ? { syllable: neume.syllable } : {},
        link: fromTranscription ? { sysId: neume.sysId } : undefined
    });
    if (sign) {
        selected.value = sign.id;
        // A sign without a code is waiting for one: put the cursor there.
        if (!code) {
            await nextTick();
            const input = document.querySelector(`[data-sign="${sign.id}"] input.code`);
            if (input) input.focus();
        }
    }
}

async function commitBox(id, box) {
    const c = collection.value;
    direct.updateSnippet(c.id, id, { box });
    const crop = await cut(box);
    direct.updateSnippet(c.id, id, { image: crop.dataUrl, width: crop.width, height: crop.height });
}

function setCode(sign, text) {
    const raw = text.trim();
    const c = collection.value;
    if (!raw) { errors[sign.id] = ''; direct.updateSnippet(c.id, sign.id, { pattern: '' }); return; }
    const result = checkCode(raw);
    if (!result.ok) { errors[sign.id] = result.message; return; }
    errors[sign.id] = '';
    ensureColumn(result.code);
    direct.addPattern(c.id, result.code);
    direct.updateSnippet(c.id, sign.id, { pattern: result.code });
}

const fieldErrors = reactive({});
function setSignAttr(sign, def, value) {
    const result = validateAttribute(def, value);
    const key = `${sign.id}:${def.key}`;
    if (!result.ok) { fieldErrors[key] = result.message; return; }
    fieldErrors[key] = '';
    const next = { ...(sign.attrs || {}), [def.key]: result.value };
    if (!result.value) delete next[def.key];
    direct.updateSnippet(collection.value.id, sign.id, { attrs: next });
}

function setVariant(sign, value) {
    direct.updateSnippet(collection.value.id, sign.id, { variant: value });
}

/** Give a sign what the transcription says about a neume: its code, its syllable, and the link. */
function assign(sign, neume) {
    setCode(sign, neume.pattern);
    const syllable = signDefs.value.find(d => d.key === 'syllable');
    const next = { ...(sign.attrs || {}) };
    if (syllable) { const s = neume.sysId.split('|')[3] || ''; if (s) next.syllable = s; else delete next.syllable; }
    direct.updateSnippet(collection.value.id, sign.id, { attrs: next, link: { sysId: neume.sysId } });
}

function matchAll() {
    const before = signs.value.map(s => ({ id: s.id, pattern: s.pattern, attrs: { ...(s.attrs || {}) }, link: s.link }));
    signs.value.forEach((s, i) => { if (neumes.value[i]) assign(s, neumes.value[i]); });
    toast.show('The signs are matched with the neumes of the transcription, left to right.', {
        action: { label: 'Undo', run: () => before.forEach(b => direct.updateSnippet(collection.value.id, b.id, { pattern: b.pattern, attrs: b.attrs, link: b.link })) }
    });
}

function removeSign(sign) {
    const c = collection.value;
    const saved = { ...sign };
    direct.removeSnippet(c.id, sign.id);
    if (selected.value === sign.id) selected.value = '';
    toast.show('Sign deleted.', {
        action: { label: 'Undo', run: () => { const cc = direct.getCollection(c.id); if (cc) direct.updateCollection(cc.id, { snippets: [...cc.snippets, saved] }); } }
    });
}

function removeLine() {
    const c = collection.value;
    const removed = direct.removeLine(c.id, line.value.id);
    if (!removed) return;
    const n = removed.signs.length;
    emit('close');
    toast.show(`${lineLabel(removed.line)} deleted${n ? ` with ${n} sign${n === 1 ? '' : 's'}` : ''}.`, {
        action: { label: 'Undo', run: () => direct.restoreLine(c.id, removed) }
    });
}

function onKey(e) {
    if (!props.open || !selectedSign.value) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSign(selectedSign.value); }
}

onMounted(() => { document.addEventListener('paste', onPaste); document.addEventListener('keydown', onKey); });
onBeforeUnmount(() => {
    document.removeEventListener('paste', onPaste);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('pointermove', onMove);
});

/** The lines of the project in reading order, to move between them without closing. */
const order = computed(() => sortedLines(collection.value).map(l => l.id));
const position = computed(() => (line.value ? order.value.indexOf(line.value.id) : -1));
function goLine(delta) {
    const next = order.value[position.value + delta];
    if (next) emit('update:lineId', next);
}

const unassigned = computed(() => signs.value.filter(s => !s.pattern).length);
const title = computed(() => (line.value ? `Line ${lineLabel(line.value).replace('Line without a place', '')}`.trim() : 'Add a line'));
</script>

<template>
<ModalDialog :open="open" :title="title" width="82rem" @close="emit('close')">
    <!-- 1. the picture of a new line, and where it is from -->
    <div v-if="!line" class="new">
        <div class="pic">
            <div v-if="!pending" class="drop" :class="{ on: dragging, busy: reading }" tabindex="0"
                 @dragover.prevent="dragging = true" @dragleave.self="dragging = false" @drop.prevent="onDrop">
                <p class="big">{{ reading ? 'Reading the image…' : 'Paste a screenshot of the line' }}</p>
                <p class="ne-muted">Ctrl/⌘ V, drop an image here, or</p>
                <label class="ne-btn">Choose an image…<input type="file" accept="image/*" hidden @change="onPick" /></label>
            </div>
            <div v-else class="preview">
                <img :src="pending.dataUrl" alt="The line" />
                <button class="ne-btn ne-btn--ghost ne-btn--sm" @click="pending = null">Use another image</button>
            </div>
        </div>
        <form class="place" @submit.prevent="createLine">
            <h3>Where is this line?</h3>
            <div v-for="def in lineDefs" :key="def.key" class="ne-field">
                <label :for="`ln-${def.key}`">{{ def.label }}<span v-if="def.required" class="req"> *</span></label>
                <select v-if="def.type === 'choice'" :id="`ln-${def.key}`" v-model="attrs[def.key]" class="ne-input">
                    <option value="">—</option>
                    <option v-for="o in def.options" :key="o" :value="o">{{ o }}</option>
                </select>
                <input v-else :id="`ln-${def.key}`" v-model="attrs[def.key]" class="ne-input" :placeholder="def.hint" autocomplete="off" />
                <p v-if="attrs[def.key] && check.errors[def.key]" class="error">{{ check.errors[def.key] }}</p>
            </div>
            <p v-if="duplicate" class="error">This line is already in the project: <button type="button" class="link" @click="emit('update:lineId', duplicate.id)">open it</button>.</p>
            <button type="submit" class="ne-btn ne-btn--primary" :disabled="!canCreate">Mark the signs →</button>
            <p class="ne-muted small">The folio is a number and <code>r</code> or <code>v</code>, the line a number — change what is asked, and how strictly, in <a href="#/settings">Settings</a>.</p>
        </form>
    </div>

    <!-- 2. the signs on the line -->
    <div v-else class="work">
        <div class="left">
            <div class="bar">
                <div class="step">
                    <button class="ne-btn ne-btn--sm" :disabled="position <= 0" aria-label="Previous line" title="Previous line" @click="goLine(-1)">&lsaquo;</button>
                    <span class="ne-muted">{{ position + 1 }} / {{ order.length }}</span>
                    <button class="ne-btn ne-btn--sm" :disabled="position >= order.length - 1" aria-label="Next line" title="Next line" @click="goLine(1)">&rsaquo;</button>
                </div>
                <div class="attrs">
                    <div v-for="def in lineDefs" :key="def.key" class="ne-field attr">
                        <label :for="`la-${def.key}`">{{ def.label }}</label>
                        <input :id="`la-${def.key}`" :value="line.attrs[def.key] || ''" class="ne-input" :class="{ bad: attrErrors[def.key] }" :placeholder="def.hint" autocomplete="off" @change="saveLineAttr(def, $event.target.value)" />
                        <p v-if="attrErrors[def.key]" class="error">{{ attrErrors[def.key] }}</p>
                    </div>
                </div>
                <div class="zoom">
                    <label for="le-zoom" class="ne-muted">Zoom</label>
                    <select id="le-zoom" v-model.number="zoom" class="ne-input">
                        <option :value="100">Fit</option>
                        <option :value="150">150 %</option>
                        <option :value="200">200 %</option>
                        <option :value="300">300 %</option>
                    </select>
                </div>
            </div>

            <div class="scroller">
                <div ref="stage" class="stage" :style="{ width: zoom + '%' }" @pointerdown="onStageDown">
                    <img :src="line.image" alt="The line" draggable="false" />
                    <div
                        v-for="(s, i) in signs"
                        :key="s.id"
                        class="box"
                        :class="{ on: s.id === selected, empty: !s.pattern }"
                        :style="{ left: boxOf(s).x + '%', top: boxOf(s).y + '%', width: boxOf(s).w + '%', height: boxOf(s).h + '%', '--c': colorOf(i) }"
                        @pointerdown="onBoxDown($event, s)"
                    >
                        <span class="num">{{ i + 1 }}</span>
                        <template v-if="s.id === selected">
                            <span v-for="corner in ['nw', 'ne', 'sw', 'se']" :key="corner" class="handle" :class="corner" @pointerdown="onHandleDown($event, s, corner)"></span>
                        </template>
                    </div>
                    <div v-if="interaction && interaction.type === 'draw' && preview" class="box ghost"
                         :style="{ left: preview.x + '%', top: preview.y + '%', width: preview.w + '%', height: preview.h + '%' }"></div>
                </div>
            </div>
            <p class="howto ne-muted">Drag on the line to mark a sign. Click a box to select it; drag it to move, drag a corner to resize, <kbd>Delete</kbd> removes it.</p>

            <section v-if="hasTranscription" class="transcription">
                <h3>
                    Transcription of this line
                    <span v-if="transcriptionReady && neumes.length" class="ne-muted">· {{ neumes.length }} neumes, in reading order</span>
                </h3>
                <p v-if="!transcriptionReady" class="ne-muted small">Reading the transcription…<template> If this stays, load the manuscript on the Corpus page again: it was imported before the reading order was kept.</template></p>
                <p v-else-if="!neumes.length" class="ne-muted small">The transcription has no neumes on {{ lineLabel(line).toLowerCase() }}.</p>
                <template v-else>
                    <ol class="neumes">
                        <li v-for="(n, i) in neumes" :key="n.sysId + i">
                            <button class="neume" :class="{ linked: isLinked(n) }" :disabled="!selectedSign" :title="selectedSign ? `Use for sign ${signs.indexOf(selectedSign) + 1}` : 'Select a sign first'" @click="assign(selectedSign, n)">
                                <PatternDisplay :pattern="n.pattern" :glyphs="glyphs" :scale="0.7" />
                                <code>{{ n.pattern }}</code>
                                <span class="syl">{{ n.sysId.split('|')[3] || '·' }}</span>
                                <span v-if="isLinked(n)" class="ok" aria-label="linked">✓</span>
                            </button>
                        </li>
                    </ol>
                    <button class="ne-btn ne-btn--sm" :disabled="!signs.length" @click="matchAll">Match all signs with these neumes</button>
                </template>
            </section>
        </div>

        <aside class="right">
            <h3>Signs on this line <span class="count">{{ signs.length }}</span></h3>
            <p v-if="unassigned" class="ne-note ne-note--warn small">{{ unassigned }} sign{{ unassigned === 1 ? ' has' : 's have' }} no code yet: it shows in no cell until it has one.</p>
            <p v-if="!signs.length" class="ne-muted">No sign yet. Drag a box on the line around the first neume.</p>

            <ol class="signs">
                <li v-for="(s, i) in signs" :key="s.id" :data-sign="s.id" class="sign" :class="{ on: s.id === selected }" :style="{ '--c': colorOf(i) }" @click="selected = s.id">
                    <div class="top">
                        <span class="badge">{{ i + 1 }}</span>
                        <img class="cut" :src="s.image" alt="" />
                        <div class="codebox">
                            <input
                                :value="s.pattern"
                                class="ne-input code"
                                :class="{ bad: errors[s.id] }"
                                list="le-codes"
                                placeholder="Pattern code, e.g. *ud"
                                :aria-label="`Pattern code of sign ${i + 1}`"
                                autocomplete="off"
                                spellcheck="false"
                                @change="setCode(s, $event.target.value)"
                            />
                            <p v-if="errors[s.id]" class="error">{{ errors[s.id] }}</p>
                        </div>
                        <button class="ne-btn ne-btn--ghost ne-btn--sm del" :aria-label="`Delete sign ${i + 1}`" title="Delete this sign" @click.stop="removeSign(s)">✕</button>
                    </div>
                    <div v-if="s.pattern || signDefs.length" class="fields">
                        <div v-if="s.pattern" class="drawn"><PatternDisplay :pattern="s.pattern" :glyphs="glyphs" :scale="0.7" /></div>
                        <div v-for="def in signDefs" :key="def.key" class="ne-field attr">
                            <label :for="`sa-${s.id}-${def.key}`">{{ def.label }}</label>
                            <select v-if="def.type === 'choice'" :id="`sa-${s.id}-${def.key}`" :value="(s.attrs && s.attrs[def.key]) || ''" class="ne-input" @change="setSignAttr(s, def, $event.target.value)">
                                <option value="">—</option>
                                <option v-for="o in def.options" :key="o" :value="o">{{ o }}</option>
                            </select>
                            <input v-else :id="`sa-${s.id}-${def.key}`" :value="(s.attrs && s.attrs[def.key]) || ''" class="ne-input" :class="{ bad: fieldErrors[`${s.id}:${def.key}`] }" :placeholder="def.hint" autocomplete="off" @change="setSignAttr(s, def, $event.target.value)" />
                            <p v-if="fieldErrors[`${s.id}:${def.key}`]" class="error">{{ fieldErrors[`${s.id}:${def.key}`] }}</p>
                        </div>
                        <div v-if="showVariant" class="ne-field attr">
                            <label :for="`sv-${s.id}`">Variant</label>
                            <select :id="`sv-${s.id}`" :value="s.variant || ''" class="ne-input" @change="setVariant(s, $event.target.value)">
                                <option v-for="v in variantOptions" :key="v.key" :value="v.key">{{ v.label }}</option>
                            </select>
                        </div>
                    </div>
                </li>
            </ol>
            <datalist id="le-codes"><option v-for="c in offered" :key="c" :value="c" /></datalist>
        </aside>
    </div>

    <template #footer>
        <button v-if="line" class="ne-btn ne-btn--danger" @click="removeLine">Delete this line…</button>
        <span class="grow"></span>
        <button class="ne-btn ne-btn--primary" @click="emit('close')">Done</button>
    </template>
</ModalDialog>
</template>

<style scoped>
h3 { margin: 0 0 var(--space-2); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); }
.grow { flex: 1; }
.error { margin: 2px 0 0; font-size: 0.78rem; font-weight: 600; color: var(--color-danger); }
.small { font-size: 0.82rem; margin: 0; }
.req { color: var(--color-danger); }
.link { display: inline; padding: 0; border: none; background: transparent; color: var(--color-primary); font: inherit; cursor: pointer; text-decoration: underline; }
.link:hover { background: transparent; }
.bad { border-color: var(--color-danger) !important; }

/* adding a line */
.new { display: grid; grid-template-columns: minmax(0, 1fr) 20rem; gap: var(--space-5); align-items: start; }
.drop { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); padding: var(--space-6) var(--space-4); border: 2px dashed var(--color-border-hover); border-radius: var(--radius-lg); background: var(--color-bg); text-align: center; min-height: 12rem; justify-content: center; }
.drop.on { border-color: var(--color-primary); background: var(--color-primary-light); }
.drop.busy { opacity: 0.7; }
.drop p { margin: 0; }
.big { font-size: 1.1rem; font-weight: 700; }
.preview { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); }
.preview img { max-width: 100%; max-height: 50vh; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: #fff; }
.place { display: flex; flex-direction: column; gap: var(--space-3); }

/* marking signs */
.work { display: grid; grid-template-columns: minmax(0, 1fr) 24rem; gap: var(--space-5); align-items: start; }
.left { min-width: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.bar { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; }
.step { display: flex; align-items: center; gap: var(--space-2); font-size: 0.85rem; }
.attrs { display: flex; gap: var(--space-3); flex-wrap: wrap; flex: 1; }
.attr { min-width: 7rem; }
.attr .ne-input { padding: 0.4em 0.6em; font-size: 0.9rem; }
.zoom { display: flex; align-items: center; gap: var(--space-2); }
.zoom .ne-input { width: auto; padding: 0.35em 0.5em; }
.scroller { overflow-x: auto; border: 1px solid var(--color-border-hover); border-radius: var(--radius-md); background: #eef1f5; max-height: 52vh; overflow-y: auto; }
.stage { position: relative; min-width: 100%; touch-action: none; cursor: crosshair; user-select: none; line-height: 0; }
.stage img { display: block; width: 100%; height: auto; pointer-events: none; }
.box { position: absolute; border: 2px solid var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); border-radius: 3px; cursor: move; box-sizing: border-box; }
.box.on { background: color-mix(in srgb, var(--c) 26%, transparent); box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--c); z-index: 2; }
.box.empty { border-style: dashed; }
.box.ghost { border: 2px dashed #111; background: rgba(255, 255, 255, 0.25); pointer-events: none; }
.num { position: absolute; top: -1px; left: -1px; min-width: 18px; padding: 0 4px; line-height: 16px; font-size: 11px; font-weight: 700; color: #fff; background: var(--c); border-radius: 2px 0 4px 0; text-align: center; }
.handle { position: absolute; width: 11px; height: 11px; background: #fff; border: 2px solid var(--c); border-radius: 2px; }
.handle.nw { top: -6px; left: -6px; cursor: nwse-resize; } .handle.se { bottom: -6px; right: -6px; cursor: nwse-resize; }
.handle.ne { top: -6px; right: -6px; cursor: nesw-resize; } .handle.sw { bottom: -6px; left: -6px; cursor: nesw-resize; }
.howto { margin: 0; font-size: 0.82rem; }
kbd { padding: 0 5px; border: 1px solid var(--color-border-hover); border-bottom-width: 2px; border-radius: 4px; font-size: 0.75rem; background: var(--color-surface); }

.transcription { padding: var(--space-3) var(--space-4); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); display: flex; flex-direction: column; gap: var(--space-2); }
.neumes { list-style: none; margin: 0; padding: 0; display: flex; gap: var(--space-2); flex-wrap: wrap; }
.neume { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: var(--space-2) var(--space-3); min-width: 64px; background: var(--color-surface); border: 1px solid var(--color-border-hover); border-radius: var(--radius-md); }
.neume:hover:not(:disabled) { border-color: var(--color-primary); background: var(--color-primary-light); }
.neume:disabled { opacity: 1; cursor: default; }
.neume.linked { border-color: var(--color-success); background: var(--color-success-light); }
.neume code { font-size: 0.78rem; font-weight: 700; background: transparent; padding: 0; }
.syl { font-size: 0.78rem; color: var(--color-text-muted); max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ok { position: absolute; top: 1px; right: 5px; color: var(--color-success-dark); font-weight: 700; font-size: 0.78rem; }

/* the list of signs */
.right { display: flex; flex-direction: column; gap: var(--space-2); max-height: 74vh; overflow-y: auto; padding-right: 2px; }
.count { margin-left: 4px; padding: 0 7px; background: var(--color-surface-muted); border-radius: 999px; font-weight: 600; }
.signs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.sign { border: 1px solid var(--color-border); border-left: 4px solid var(--c); border-radius: var(--radius-md); background: var(--color-surface); padding: var(--space-2) var(--space-3); cursor: pointer; }
.sign.on { border-color: var(--c); box-shadow: 0 0 0 1px var(--c); background: color-mix(in srgb, var(--c) 6%, #fff); }
.top { display: flex; align-items: flex-start; gap: var(--space-2); }
.badge { flex: 0 0 auto; width: 22px; height: 22px; margin-top: 4px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--c); color: #fff; font-size: 0.75rem; font-weight: 700; }
.cut { flex: 0 0 auto; height: 32px; max-width: 56px; object-fit: contain; border: 1px solid var(--color-border); border-radius: 4px; background: #fff; }
.codebox { flex: 1; min-width: 0; }
.code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 700; padding: 0.35em 0.55em; width: 100%; }
.del { margin-top: 2px; }
.fields { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); margin-top: var(--space-2); align-items: start; }
.drawn { grid-column: 1 / -1; display: flex; justify-content: center; padding: 2px 0; }
.sign .ne-field label { font-size: 0.7rem; }

@media (max-width: 1000px) { .work, .new { grid-template-columns: 1fr; } .right { max-height: none; } }
</style>

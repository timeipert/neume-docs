<script setup>
import { computed, onBeforeUnmount, reactive, watch } from 'vue';
import ModalDialog from '../ui/ModalDialog.vue';
import SnippetThumb from './SnippetThumb.vue';
import PatternDisplay from '../PatternDisplay.vue';
import PatternCode from '../PatternCode.vue';
import PaleoPicker from '../PaleoPicker.vue';
import { useSettingsStore } from '../../stores/settings';
import { useSnippetEdit } from '../../composables/useSnippetEdit';
import { useSnippetRetag } from '../../composables/useSnippetRetag';
import { usePatternDraft } from '../../composables/usePatternDraft';
import { useTranscriptionData } from '../../composables/useTranscriptionData';
import { loneSignAttributes } from '../../utils/snippetAttributes';
import { snippetPlaceLabel } from '../../utils/projectData';
import { paleoOf } from '../../utils/paleo';

/**
 * One snippet, large, for going through many of them: its picture, what pattern it is filed
 * under (correctable in place — the main case is a missed virga), how it is written, and where
 * it comes from. Pairs with a grid or table that opens it; this dialog does the walking.
 */
const props = defineProps({
    open: { type: Boolean, default: false },
    snippet: { type: Object, default: null },
    position: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    /** a project's own collection (for snippets of kind 'image'), from `ensureCollection` */
    ensureCollection: { type: Function, default: () => null }
});
const emit = defineEmits(['close', 'prev', 'next', 'open-context']);

const settings = useSettingsStore();
const { glyphs } = useTranscriptionData();

const snippetRef = computed(() => props.snippet);
const { retag } = useSnippetRetag(props.ensureCollection);
const {
    draft: patternDraft, check: patternCheck, virgaCount: draftVirgaNotes, virgaOn: draftVirgaOn,
    changed: patternChanged, set: setPattern, toggleVirgaNote: toggleDraftVirga
} = usePatternDraft(snippetRef, retag);

const detailDefs = computed(() => (props.snippet && props.snippet.kind === 'image' && !props.snippet.lineId
    ? loneSignAttributes(settings.snippetAttributes)
    : settings.getSnippetAttributes('sign')));
const fieldErrors = reactive({});

const { saveAttr: saveSnippetAttr, savePaleo: savePaleoOf } = useSnippetEdit(props.ensureCollection);

function saveAttr(def, value) {
    const s = props.snippet;
    if (!s) return;
    const result = saveSnippetAttr(s, def, value);
    fieldErrors[`${s.id}:${def.key}`] = result.ok ? '' : result.message;
}
const savePaleo = (keys) => savePaleoOf(props.snippet, keys);

const place = computed(() => snippetPlaceLabel(props.snippet));
const canOpenContext = computed(() => props.snippet && (props.snippet.kind !== 'image' || props.snippet.lineId));

function onKey(e) {
    if (!props.open || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'ArrowRight') { e.preventDefault(); emit('next'); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); emit('prev'); }
}
watch(() => props.open, (open) => {
    if (open) document.addEventListener('keydown', onKey);
    else document.removeEventListener('keydown', onKey);
}, { immediate: true });
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
<ModalDialog :open="open && !!snippet" :title="snippet ? place : ''" width="56rem" @close="emit('close')">
    <div v-if="snippet" class="focus">
        <section class="look" aria-label="The snippet">
            <div class="big"><SnippetThumb :snippet="snippet" :width="420" :height="260" /></div>
            <button v-if="canOpenContext" type="button" class="ne-btn ne-btn--sm" @click="emit('open-context')">{{ snippet.kind === 'image' ? 'Open the line →' : 'Open the page →' }}</button>
        </section>

        <section class="decide" aria-label="What it is">
            <div class="badge">
                <PatternDisplay :pattern="snippet.pattern" :glyphs="glyphs" :scale="1.3" />
                <PatternCode :pattern="snippet.pattern" />
            </div>

            <div class="block">
                <h4>Pattern</h4>
                <form class="code-row" @submit.prevent="setPattern">
                    <input v-model.trim="patternDraft" class="ne-input mono" spellcheck="false" autocomplete="off" aria-label="Pattern code" />
                    <button type="submit" class="ne-btn ne-btn--primary" :disabled="!patternCheck.ok || !patternChanged">Set</button>
                </form>
                <p v-if="patternDraft && !patternCheck.ok" class="ne-note ne-note--warn small">{{ patternCheck.error }}</p>
                <div v-if="draftVirgaNotes" class="virga">
                    <span class="lab">Virga on note</span>
                    <button v-for="n in draftVirgaNotes" :key="n" type="button" class="vbtn" :class="{ on: draftVirgaOn.includes(n - 1) }" :aria-pressed="draftVirgaOn.includes(n - 1)" @click="toggleDraftVirga(n - 1)">{{ n }}</button>
                </div>
            </div>

            <div class="block">
                <h4>How it is written</h4>
                <PaleoPicker :model-value="paleoOf(snippet, settings.paleoKeys())" :code="snippet.pattern" @update:model-value="savePaleo" />
            </div>

            <div v-if="detailDefs.length" class="block">
                <h4>About this snippet</h4>
                <div class="fields">
                    <div v-for="def in detailDefs" :key="def.key" class="ne-field">
                        <label :for="`rf-${def.key}`">{{ def.label }}</label>
                        <select v-if="def.type === 'choice'" :id="`rf-${def.key}`" :value="(snippet.attrs && snippet.attrs[def.key]) || ''" class="ne-input" @change="saveAttr(def, $event.target.value)">
                            <option value="">—</option>
                            <option v-for="o in def.options" :key="o" :value="o">{{ o }}</option>
                        </select>
                        <input v-else :id="`rf-${def.key}`" :value="(snippet.attrs && snippet.attrs[def.key]) || ''" class="ne-input" :class="{ bad: fieldErrors[`${snippet.id}:${def.key}`] }" :placeholder="def.hint" autocomplete="off" @change="saveAttr(def, $event.target.value)" />
                        <p v-if="fieldErrors[`${snippet.id}:${def.key}`]" class="error">{{ fieldErrors[`${snippet.id}:${def.key}`] }}</p>
                    </div>
                </div>
            </div>
        </section>
    </div>

    <template #footer>
        <span class="pos">{{ position }} of {{ total }}</span>
        <button type="button" class="ne-btn" :disabled="position <= 1" @click="emit('prev')">‹ Previous <kbd>←</kbd></button>
        <button type="button" class="ne-btn" :disabled="position >= total" @click="emit('next')">Next › <kbd>→</kbd></button>
    </template>
</ModalDialog>
</template>

<style scoped>
.focus { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: var(--space-5); align-items: start; }
@media (max-width: 760px) { .focus { grid-template-columns: 1fr; } }
.look { display: flex; flex-direction: column; gap: var(--space-3); align-items: flex-start; min-width: 0; }
.big { width: 100%; min-height: 200px; display: flex; align-items: center; justify-content: center; background: #f8fafc; border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
.decide { display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }
.badge { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); background: var(--color-surface-muted); border-radius: var(--radius-md); }
.block h4 { margin: 0 0 var(--space-2); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); }
.code-row { display: flex; gap: var(--space-2); }
.code-row .ne-input { flex: 1; min-width: 0; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.small { margin: var(--space-2) 0 0; padding: var(--space-1) var(--space-2); font-size: 0.78rem; }
.virga { display: flex; align-items: center; gap: var(--space-1); margin-top: var(--space-2); flex-wrap: wrap; }
.lab { font-size: 0.78rem; color: var(--color-text-muted); margin-right: var(--space-1); }
.vbtn { min-width: 2rem; padding: 0.25em 0.5em; border: 1px solid var(--color-border-hover); border-radius: var(--radius-md); background: var(--color-surface); font-weight: 700; cursor: pointer; }
.vbtn.on { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
.fields { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2) var(--space-3); }
.fields .ne-input { padding: 0.4em 0.6em; font-size: 0.9rem; }
.error { margin: 2px 0 0; font-size: 0.78rem; font-weight: 600; color: var(--color-danger); }
.bad { border-color: var(--color-danger) !important; }
.pos { margin-right: auto; font-size: 0.85rem; color: var(--color-text-muted); }
kbd { font-family: inherit; font-size: 0.7rem; padding: 0 5px; border: 1px solid currentColor; border-radius: 3px; opacity: 0.7; }
</style>

<script setup>
import { computed, onBeforeUnmount, watch } from 'vue';
import ModalDialog from '../ui/ModalDialog.vue';
import CitePanel from './CitePanel.vue';
import DocPattern from './DocPattern.vue';
import DocSnippet from './DocSnippet.vue';
import { useDocs } from '../../composables/useDocsContext';
import { canPin } from '../../utils/documentationVersion';

/**
 * One snippet, larger: its picture, what the documentation says about it, and the link and
 * citation that lead back to exactly this snippet. With `siblings` (the snippets that were shown
 * beside it) the arrow keys, or the buttons, go to the one before and after. A snippet can be starred.
 */
const props = defineProps({
    snippet: { type: Object, default: null },
    /** the manuscript's entry in the index */
    entry: { type: Object, required: true },
    siblings: { type: Array, default: () => [] }
});
const emit = defineEmits(['close', 'step']);

const docs = useDocs();
const sub = computed(() => `/m/${encodeURIComponent(props.entry.id)}`);
const target = computed(() => (props.snippet ? {
    kind: 'snippet', source: props.entry.source, entryId: props.entry.id, holding: docs.holding(props.entry.id),
    folio: props.snippet.folio, line: props.snippet.line, pattern: props.snippet.pattern, refId: props.snippet.refId
} : null));
const url = computed(() => (props.snippet ? docs.permalink(sub.value, { snippet: props.snippet.id }) : ''));
const pinned = computed(() => (props.snippet && canPin(docs.state.value.endpoint) ? () => docs.pinned(sub.value, { snippet: props.snippet.id }) : null));

const index = computed(() => (props.snippet ? props.siblings.findIndex(s => s.id === props.snippet.id) : -1));
const steppable = computed(() => props.siblings.length > 1 && index.value >= 0);
const starred = computed(() => !!props.snippet && docs.stars.has(props.entry.id, props.snippet.id));

function step(delta) {
    if (steppable.value) emit('step', props.siblings[(index.value + delta + props.siblings.length) % props.siblings.length]);
}
function onKey(e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
}
watch(() => !!props.snippet, (open) => {
    if (open) document.addEventListener('keydown', onKey);
    else document.removeEventListener('keydown', onKey);
}, { immediate: true });
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
<ModalDialog :open="!!snippet" :title="snippet ? `${entry.source} · ${snippet.refId}` : ''" width="44rem" @close="emit('close')">
    <div v-if="snippet" class="lookup">
        <div class="big">
            <button v-if="steppable" type="button" class="step prev" aria-label="Previous snippet" title="Previous (←)" @click="step(-1)">‹</button>
            <DocSnippet :snippet="snippet" large />
            <button v-if="steppable" type="button" class="step next" aria-label="Next snippet" title="Next (→)" @click="step(1)">›</button>
            <button type="button" class="star" :class="{ on: starred }" :aria-pressed="starred" :title="starred ? 'Remove the star' : 'Star this snippet, to come back to it or cite it with others'" @click="docs.stars.toggle(entry.id, snippet.id)">{{ starred ? '★' : '☆' }}</button>
            <span v-if="steppable" class="where">{{ index + 1 }} of {{ siblings.length }}</span>
        </div>
        <div class="details">
            <DocPattern :pattern="snippet.pattern" :signs="docs.signs.value" :scale="1.4" />
            <dl>
                <div v-if="snippet.folio"><dt>Folio</dt><dd>{{ snippet.folio }}</dd></div>
                <div v-if="snippet.line"><dt>Line</dt><dd>{{ snippet.line }}</dd></div>
                <div v-if="snippet.syllable"><dt>Syllable</dt><dd>{{ snippet.syllable }}</dd></div>
                <div v-if="snippet.caption"><dt>Caption</dt><dd>{{ snippet.caption }}</dd></div>
                <div><dt>Ref ID</dt><dd>{{ snippet.refId }}</dd></div>
            </dl>
        </div>
        <CitePanel :info="docs.info.value" :generated="docs.generated.value" :target="target" :url="url" :pinned="pinned" />
    </div>
    <template #footer><button type="button" class="ne-btn" @click="emit('close')">Close</button></template>
</ModalDialog>
</template>

<style scoped>
.lookup { display: flex; flex-direction: column; gap: var(--space-4); }
.big { position: relative; display: flex; justify-content: center; align-items: center; min-height: 8rem; background: var(--color-surface-muted); border-radius: var(--radius-md); padding: var(--space-3) 3rem; }
.big :deep(.doc-snippet) { width: auto; height: auto; max-width: 100%; border: none; background: transparent; }
.big :deep(img) { width: auto; height: auto; min-width: 10rem; max-width: 100%; max-height: 22rem; }
.step { position: absolute; top: 50%; transform: translateY(-50%); width: 2.4rem; height: 3.2rem; border: none; border-radius: var(--radius-md); background: transparent; font-size: 2rem; line-height: 1; color: var(--color-text-muted); cursor: pointer; }
.step:hover { background: var(--color-surface); color: var(--color-text); }
.prev { left: 4px; }
.next { right: 4px; }
.star { position: absolute; top: 6px; right: 8px; border: none; background: none; font-size: 1.5rem; line-height: 1; cursor: pointer; color: var(--color-text-light); }
.star.on { color: #e0a100; }
.where { position: absolute; bottom: 6px; left: 50%; transform: translateX(-50%); font-size: 0.74rem; color: var(--color-text-muted); }
.details { display: flex; gap: var(--space-5); align-items: center; }
.details dl { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); margin: 0; }
.details dt { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); }
.details dd { margin: 0; }
</style>

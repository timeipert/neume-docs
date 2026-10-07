<script setup>
import { computed, ref, watch } from 'vue';
import ModalDialog from '../ui/ModalDialog.vue';
import SegmentedControl from '../ui/SegmentedControl.vue';
import DocSnippet from './DocSnippet.vue';
import { useDocs } from '../../composables/useDocsContext';
import { loadManuscript } from '../../composables/useDocumentations';
import { CITE_FILE, CITE_STYLES, citationList } from '../../utils/citation';
import { canPin } from '../../utils/documentationVersion';
import { useToast } from '../../composables/useToast';

/**
 * The snippets a reader has starred: to look at together, to take the links, or to cite as one list.
 * The stars stay in this browser.
 */
const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(['close', 'open-snippet']);

const docs = useDocs();
const toast = useToast();
const style = ref('short');
const items = ref([]); // [{ key, entry, snippet }] with what is known of them
const loading = ref(false);
const version = ref('');

async function gather() {
    loading.value = true;
    const out = [];
    for (const star of docs.stars.list.value) {
        const entry = docs.entry(star.entry);
        if (!entry) { out.push({ key: star.key, missing: true }); continue; }
        const slot = await loadManuscript(docs.state.value, entry);
        const snippet = slot.status === 'ready' ? slot.data.snippets.find(s => s.id === star.snippet) : null;
        out.push(snippet ? { key: star.key, entry, snippet } : { key: star.key, missing: true });
    }
    items.value = out;
    loading.value = false;
}

watch(() => [props.open, docs.stars.count.value], ([open]) => { if (open) gather(); }, { immediate: true });

// the version they were cited at, where there is one
watch(() => props.open, async (open) => {
    version.value = '';
    if (!open || !canPin(docs.state.value.endpoint)) return;
    const pin = await docs.pinned();
    version.value = pin ? pin.version : '';
});

const present = computed(() => items.value.filter(i => !i.missing));
const linkOf = (i) => docs.permalink(`/m/${encodeURIComponent(i.entry.id)}`, { snippet: i.snippet.id });

const text = computed(() => citationList(style.value, {
    info: docs.info.value, generated: docs.generated.value, accessed: new Date().toISOString().slice(0, 10), version: version.value,
    items: present.value.map(i => ({
        url: linkOf(i),
        target: { kind: 'snippet', source: i.entry.source, holding: docs.holding(i.entry.id), folio: i.snippet.folio, line: i.snippet.line, pattern: i.snippet.pattern, refId: i.snippet.refId }
    }))
}));

async function copy(value, message) {
    try { await navigator.clipboard.writeText(value); toast.show(message); }
    catch { toast.show('Copying was not allowed here.', { tone: 'error' }); }
}
const links = computed(() => present.value.map(i => `${i.entry.source}, f. ${i.snippet.folio || '–'}, ${i.snippet.pattern}: ${linkOf(i)}`).join('\n'));
const file = computed(() => CITE_FILE[style.value] || null);
function save() {
    const blob = new Blob([text.value], { type: `${file.value.type};charset=utf-8` });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `starred.${file.value.extension}`;
    a.click();
    URL.revokeObjectURL(a.href);
}
function dropMissing() { docs.stars.remove(items.value.filter(i => i.missing).map(i => i.key)); }
</script>

<template>
<ModalDialog :open="open" title="Your starred snippets" width="44rem" @close="emit('close')">
    <div class="starred">
        <p v-if="!docs.stars.count.value" class="empty">No snippet is starred yet. Open a snippet and press ☆ to keep it here. Stars stay in this browser.</p>
        <template v-else>
            <p v-if="loading" class="hint" role="status">Reading the snippets…</p>
            <ul class="list">
                <li v-for="i in items" :key="i.key" :class="{ gone: i.missing }">
                    <template v-if="!i.missing">
                        <button type="button" class="thumb" :aria-label="`Open the snippet ${i.snippet.refId}`" @click="emit('open-snippet', i)"><DocSnippet :snippet="i.snippet" :width="64" /></button>
                        <span class="what"><strong>{{ i.entry.source }}</strong> · {{ i.snippet.folio ? `f. ${i.snippet.folio}` : '' }}{{ i.snippet.line ? `, line ${i.snippet.line}` : '' }}<br /><code>{{ i.snippet.pattern }}</code> {{ i.snippet.refId }}</span>
                    </template>
                    <span v-else class="what">A snippet that is no longer in this documentation.</span>
                    <button type="button" class="x" aria-label="Remove the star" title="Remove the star" @click="docs.stars.remove([i.key])">×</button>
                </li>
            </ul>
            <button v-if="items.some(i => i.missing)" type="button" class="link" @click="dropMissing">Remove the ones that are gone</button>

            <div v-if="present.length" class="cite">
                <span class="label">Cite them together</span>
                <SegmentedControl v-model="style" :options="CITE_STYLES" label="Citation style" size="sm" />
                <textarea class="ne-input text" :value="text" readonly rows="7" spellcheck="false" aria-label="Citations" @focus="$event.target.select()"></textarea>
                <div class="row">
                    <button type="button" class="ne-btn ne-btn--sm ne-btn--primary" @click="copy(text, 'Citations copied.')">Copy citations</button>
                    <button v-if="file" type="button" class="ne-btn ne-btn--sm" @click="save">Download .{{ file.extension }}</button>
                    <button type="button" class="ne-btn ne-btn--sm" @click="copy(links, 'Links copied.')">Copy the links</button>
                    <button type="button" class="ne-btn ne-btn--sm ne-btn--ghost" @click="docs.stars.clear()">Remove all stars</button>
                </div>
                <p v-if="version" class="hint">Cited at version <code>{{ version }}</code>; the links open the latest.</p>
            </div>
        </template>
    </div>
    <template #footer><button type="button" class="ne-btn" @click="emit('close')">Close</button></template>
</ModalDialog>
</template>

<style scoped>
.starred { display: flex; flex-direction: column; gap: var(--space-3); }
.empty, .hint { margin: 0; font-size: 0.86rem; color: var(--color-text-muted); }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 16rem; overflow-y: auto; }
.list li { display: flex; align-items: center; gap: var(--space-3); padding: 4px; border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.list li.gone { color: var(--color-text-muted); font-style: italic; }
.thumb { border: none; background: none; padding: 0; cursor: zoom-in; }
.what { flex: 1; font-size: 0.86rem; }
.x { border: none; background: none; font-size: 1.2rem; color: var(--color-text-muted); cursor: pointer; }
.x:hover { color: var(--color-danger); }
.cite { display: flex; flex-direction: column; gap: var(--space-2); padding-top: var(--space-3); border-top: 1px solid var(--color-border); }
.label { font-size: 0.74rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); }
.text { font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.78rem; resize: vertical; }
.row { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.link { align-self: flex-start; border: none; background: none; padding: 0; color: var(--color-primary); cursor: pointer; font-size: 0.84rem; }
code { font-size: 0.82rem; }
</style>

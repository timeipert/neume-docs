<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useProjectContext } from '../../composables/useProject';
import { useDirectSnippetsStore } from '../../stores/directSnippets';
import { useToast } from '../../composables/useToast';
import { checkCode } from '../../utils/projectTable';
import { fileToSnippet, imageFromPaste, imagesFromDrop } from '../../utils/snippetImages';
import PatternCode from '../PatternCode.vue';

/**
 * Where screenshots of single signs come in before anyone knows what to call them: paste
 * or drop them here, and file each under its code when you do. A screenshot that is already
 * known is better added straight to its cell; this is the inbox for the rest.
 */
const props = defineProps({
    /** the codes of the table, offered when filing */
    codes: { type: Array, default: () => [] },
    /** a cell is open and takes pasted images itself */
    paused: { type: Boolean, default: false }
});
const emit = defineEmits(['filed']);

const direct = useDirectSnippetsStore();
const toast = useToast();
const { collection, ensureCollection, ensureColumn } = useProjectContext();

/** Pasted in, not yet filed under a code. A sign cut from a line has its place from the line. */
const inbox = computed(() => ((collection.value && collection.value.snippets) || []).filter(s => !s.pattern && !s.lineId));

const dragging = ref(false);
const reading = ref(false);

async function take(files) {
    if (!files.length) return;
    const c = ensureCollection();
    if (!c) return;
    reading.value = true;
    let added = 0;
    try {
        for (const file of files) {
            const { dataUrl, width, height } = await fileToSnippet(file);
            direct.addSnippet(c.id, { pattern: '', image: dataUrl, width, height });
            added++;
        }
    } catch (e) {
        toast.show(e.message || 'That image could not be read.', { tone: 'error' });
    } finally {
        reading.value = false;
    }
}

function onPaste(e) {
    if (props.paused) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const file = imageFromPaste(e);
    if (file) { e.preventDefault(); take([file]); }
}
const onDrop = (e) => { dragging.value = false; take(imagesFromDrop(e)); };
const onPick = (e) => { take(Array.from(e.target.files || [])); e.target.value = ''; };

onMounted(() => document.addEventListener('paste', onPaste));
onBeforeUnmount(() => document.removeEventListener('paste', onPaste));

// ---- filing ------------------------------------------------------------------

const drafts = reactive({});
const problems = computed(() => Object.fromEntries(inbox.value.map(s => {
    const text = (drafts[s.id] || '').trim();
    return [s.id, text ? checkCode(text).message : ''];
})));

function fileUnder(snippet) {
    const result = checkCode(drafts[snippet.id] || '');
    if (!result.ok) return;
    const c = collection.value;
    if (!c) return;
    ensureColumn(result.code);
    direct.addPattern(c.id, result.code);
    direct.updateSnippet(c.id, snippet.id, { pattern: result.code });
    delete drafts[snippet.id];
    toast.show(`Filed under ${result.code}.`, {
        tone: 'success',
        action: { label: 'Undo', run: () => direct.updateSnippet(c.id, snippet.id, { pattern: '' }) }
    });
    emit('filed', result.code);
}

function remove(snippet) {
    const c = collection.value;
    if (!c) return;
    const kept = { ...snippet };
    direct.removeSnippet(c.id, snippet.id);
    delete drafts[snippet.id];
    toast.show('Screenshot deleted.', {
        action: { label: 'Undo', run: () => { const now = direct.getCollection(c.id); if (now) direct.updateCollection(c.id, { snippets: [...now.snippets, kept] }); } }
    });
}
</script>

<template>
<section class="shots" :class="{ on: dragging, busy: reading }" aria-label="Screenshots of signs" @dragover.prevent="dragging = true" @dragleave.self="dragging = false" @drop.prevent="onDrop">
    <header>
        <h3>Screenshots <span v-if="inbox.length" class="count" :title="`${inbox.length} not filed under a code yet`">{{ inbox.length }} to file</span></h3>
        <p class="hint">{{ reading ? 'Reading the image…' : 'Paste (Ctrl/⌘ V) or drop them here, then file each under its code. To add one straight to a column, open its cell.' }}</p>
        <label class="ne-btn">
            Choose images…
            <input type="file" accept="image/*" multiple hidden @change="onPick" />
        </label>
    </header>

    <ul v-if="inbox.length" class="inbox">
        <li v-for="s in inbox" :key="s.id">
            <img :src="s.image" alt="A screenshot not yet filed" loading="lazy" />
            <form @submit.prevent="fileUnder(s)">
                <input v-model="drafts[s.id]" class="ne-input" :class="{ bad: problems[s.id] }" :list="'shots-codes'" placeholder="Its code, e.g. *ud" aria-label="Code of this screenshot" autocomplete="off" spellcheck="false" />
                <button type="submit" class="ne-btn ne-btn--sm ne-btn--primary" :disabled="!(drafts[s.id] || '').trim() || !!problems[s.id]">File</button>
                <button type="button" class="ne-btn ne-btn--sm ne-btn--ghost" aria-label="Delete this screenshot" title="Delete" @click="remove(s)">✕</button>
            </form>
            <p v-if="problems[s.id]" class="error">{{ problems[s.id] }}</p>
        </li>
    </ul>
    <datalist id="shots-codes"><option v-for="c in codes" :key="c" :value="c" /></datalist>
</section>
</template>

<style scoped>
.shots { padding: var(--space-3) var(--space-4); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); display: flex; flex-direction: column; gap: var(--space-3); }
.shots.on { border-color: var(--color-primary); border-style: dashed; background: var(--color-primary-light); }
.shots.busy { opacity: 0.75; }
header { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
h3 { margin: 0; font-size: 1rem; }
.count { margin-left: 4px; padding: 0 8px; background: var(--color-warning-light); color: var(--color-warning-dark); border-radius: 999px; font-size: 0.78rem; font-weight: 600; }
.hint { flex: 1; min-width: 14rem; margin: 0; font-size: 0.86rem; color: var(--color-text-muted); }
.inbox { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--space-3); }
.inbox li { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-2); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.inbox img { align-self: center; max-width: 100%; max-height: 90px; object-fit: contain; background: #f8fafc; border-radius: var(--radius-sm); }
.inbox form { display: flex; align-items: center; gap: var(--space-2); }
.inbox .ne-input { flex: 1; min-width: 0; padding: 0.35em 0.6em; font-size: 0.9rem; }
.bad { border-color: var(--color-danger) !important; }
.error { margin: 0; font-size: 0.78rem; font-weight: 600; color: var(--color-danger); }
</style>

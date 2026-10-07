<script setup>
import { computed, ref, watch } from 'vue';
import SegmentedControl from '../ui/SegmentedControl.vue';
import { CITE_FILE, CITE_STYLES, citation, describeTarget } from '../../utils/citation';
import { useToast } from '../../composables/useToast';

/**
 * The address that leads back to something, and suggestions for citing it in the usual styles.
 * Where the documentation has versions (it is on GitHub), the link and the citation can name the
 * version they were made from, so they keep leading to what was cited when the authors go on changing it.
 */
const props = defineProps({
    info: { type: Object, required: true },
    generated: { type: String, default: '' },
    /** what is cited: see describeTarget */
    target: { type: Object, default: null },
    url: { type: String, required: true },
    /** () => Promise<{ url, version } | null>: the same address at the current version; absent where there are no versions */
    pinned: { type: Function, default: null }
});

const toast = useToast();
const STYLE_KEY = 'neume-docs.cite-style';

const options = computed(() => [
    ...(props.info.preferredCitation ? [{ value: 'preferred', label: 'Authors’ wording', hint: 'The wording the authors ask for, with what you cite and where' }] : []),
    ...CITE_STYLES
]);

function remembered() {
    try { return localStorage.getItem(STYLE_KEY) || ''; } catch { return ''; }
}
const style = ref(remembered());
watch(options, (list) => { if (!list.some(o => o.value === style.value)) style.value = list[0].value; }, { immediate: true });
watch(style, (v) => { try { localStorage.setItem(STYLE_KEY, v); } catch { /* it is only a convenience */ } });

const accessed = new Date().toISOString().slice(0, 10);

// ---- the version ---------------------------------------------------------------------------------

const pin = ref(null);
const pinning = ref(false);
const usePin = ref(true);

watch(() => [props.url, props.pinned], async () => {
    pin.value = null;
    if (!props.pinned) return;
    pinning.value = true;
    try { pin.value = await props.pinned(); } finally { pinning.value = false; }
}, { immediate: true });

const link = computed(() => (usePin.value && pin.value ? pin.value.url : props.url));
const version = computed(() => (usePin.value && pin.value ? pin.value.version : ''));

// ---- the text -------------------------------------------------------------------------------------

const text = computed(() => citation(style.value, { info: props.info, generated: props.generated, target: props.target, url: link.value, accessed, version: version.value }));
const what = computed(() => describeTarget(props.target));
const file = computed(() => CITE_FILE[style.value] || null);
const rows = computed(() => (style.value === 'bibtex' || style.value === 'ris' ? 9 : 4));

async function copy(value, message) {
    try {
        await navigator.clipboard.writeText(value);
        toast.show(message);
    } catch {
        toast.show('Copying was not allowed here. Select the text and copy it.', { tone: 'error' });
    }
}

function save() {
    if (!file.value) return;
    const blob = new Blob([text.value], { type: `${file.value.type};charset=utf-8` });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `citation.${file.value.extension}`;
    a.click();
    URL.revokeObjectURL(a.href);
}
</script>

<template>
<div class="cite">
    <p v-if="what" class="what">{{ what }}</p>

    <div class="block">
        <span class="label">Link</span>
        <div class="row">
            <input class="ne-input url" :value="link" readonly aria-label="Link" @focus="$event.target.select()" />
            <button type="button" class="ne-btn ne-btn--sm" @click="copy(link, 'Link copied.')">Copy link</button>
        </div>
        <label v-if="pin" class="ne-check pin">
            <input v-model="usePin" type="checkbox" />
            Link to this exact version <code>{{ pin.version }}</code>
        </label>
        <p v-if="pin && usePin" class="hint">Opens what was cited as it is now, even after the authors change the documentation.</p>
        <p v-else-if="pin" class="hint">Opens the latest version, which may differ from what you looked at.</p>
        <p v-else-if="pinning" class="hint">Looking up the version…</p>
        <p v-else-if="pinned" class="hint">No version could be named (GitHub did not say). The link opens the latest.</p>
        <p v-else class="hint">Opens exactly this, highlighted.</p>
    </div>

    <div class="block">
        <span class="label">Cite as</span>
        <SegmentedControl v-model="style" :options="options" label="Citation style" size="sm" />
        <textarea class="ne-input text" :value="text" readonly :rows="rows" spellcheck="false" aria-label="Citation" @focus="$event.target.select()"></textarea>
        <div class="row">
            <button type="button" class="ne-btn ne-btn--sm ne-btn--primary" @click="copy(text, 'Citation copied.')">Copy citation</button>
            <button v-if="file" type="button" class="ne-btn ne-btn--sm" @click="save">Download .{{ file.extension }}</button>
            <span class="hint">The day you looked at it ({{ accessed }}) is part of it.</span>
        </div>
    </div>

    <p v-if="info.license" class="hint">Licence: {{ info.license }}</p>
</div>
</template>

<style scoped>
.cite { display: flex; flex-direction: column; gap: var(--space-4); }
.what { margin: 0; font-weight: 700; }
.block { display: flex; flex-direction: column; gap: var(--space-2); }
.label { font-size: 0.74rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); }
.row { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
.url { flex: 1; min-width: 12rem; font-size: 0.82rem; }
.text { font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 0.8rem; resize: vertical; }
.hint { margin: 0; font-size: 0.8rem; color: var(--color-text-muted); }
.pin { font-size: 0.86rem; }
.pin code { font-size: 0.8rem; background: var(--color-surface-muted); padding: 0 6px; border-radius: 4px; }
</style>

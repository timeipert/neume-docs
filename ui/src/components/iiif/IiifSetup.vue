<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useIiifStore } from '../../stores/iiif';
import { iiifStatus, isWebAddress } from '../../utils/iiifStatus';

/**
 * What stands in the place of anything that needs page images when there are none: what is
 * missing, why, and what to do — a manifest address can be pasted right here. Once the pages
 * are there it shows nothing, so whatever it stood in for can take its place.
 */
const props = defineProps({
    source: { type: String, required: true },
    /** what the images are needed for, finishing "Page images are needed to …" */
    purpose: { type: String, default: 'mark snippets on the pages' },
    /** a shorter form, for a side panel */
    compact: { type: Boolean, default: false }
});
const emit = defineEmits(['ready']);

const iiif = useIiifStore();
const status = computed(() => iiifStatus(iiif, props.source));

const url = ref('');
const busy = ref(false);
const touched = ref(false);

watch(() => status.value.link, (link) => { if (link && !url.value) url.value = link; }, { immediate: true });
watch(() => status.value.state, (state) => { if (state === 'ready') emit('ready'); });

// A manifest that is linked starts reading when it is first needed — here.
onMounted(() => {
    if (status.value.state === 'loading') iiif.ensureLoaded(props.source);
});

const problem = computed(() => (touched.value && url.value.trim() && !isWebAddress(url.value) ? 'That is not a web address. It starts with https://' : ''));
const canUse = computed(() => isWebAddress(url.value) && !busy.value);

async function use() {
    touched.value = true;
    if (!canUse.value) return;
    busy.value = true;
    try { await iiif.addManifest(props.source, url.value.trim()); }
    catch { /* the store keeps the reason; it is shown below */ }
    finally { busy.value = false; }
}

function retry() {
    iiif.refreshManifest(props.source);
}
</script>

<template>
<section v-if="status.state !== 'ready'" class="setup" :class="{ compact }" aria-label="Page images are missing">
    <template v-if="status.state === 'loading'">
        <h3>Reading the pages of {{ source }}…</h3>
        <p class="ne-muted">The manifest is being read. This takes a moment.</p>
    </template>

    <template v-else>
        <h3 v-if="status.state === 'error'">The pages of {{ source }} could not be read</h3>
        <h3 v-else>No page images for {{ source }} yet</h3>

        <p v-if="status.state === 'error'" class="reason">{{ status.error }} <span class="ne-muted">— the address may be wrong, or the library's server may not allow other sites to read it.</span></p>
        <p v-else>
            Page images are needed to {{ purpose }}. They come from a <strong>IIIF manifest</strong> — a web address that lists the pages of a manuscript,
            usually given next to a library's digitised copy.
        </p>

        <form class="form" @submit.prevent="use">
            <label :for="`iiif-${source}`">Manifest address</label>
            <div class="row">
                <input :id="`iiif-${source}`" v-model.trim="url" class="ne-input" type="url" placeholder="https://…/manifest.json" autocomplete="off" spellcheck="false" :class="{ bad: problem }" @blur="touched = true" />
                <button type="submit" class="ne-btn ne-btn--primary" :disabled="!canUse">{{ busy ? 'Reading…' : status.state === 'error' ? 'Try this address' : 'Use it' }}</button>
                <button v-if="status.state === 'error'" type="button" class="ne-btn" @click="retry">Try again</button>
            </div>
            <p v-if="problem" class="error">{{ problem }}</p>
        </form>

        <p class="ways">
            Looking for one? The table of <RouterLink :to="{ path: '/manuscripts/images', query: { q: source } }">manuscript images</RouterLink> suggests manifests from the MMMO catalogue.
            <template v-if="$slots.alternative"><slot name="alternative" /></template>
        </p>
    </template>
</section>
</template>

<style scoped>
.setup { padding: var(--space-4) var(--space-5); background: var(--color-warning-light); border: 1px solid var(--color-warning-muted); border-radius: var(--radius-lg); color: var(--color-warning-dark); }
.setup h3 { margin: 0 0 var(--space-2); font-size: 1.05rem; color: var(--color-text); }
.setup p { margin: 0 0 var(--space-3); max-width: 70ch; font-size: 0.92rem; color: var(--color-text); }
.reason { color: var(--color-danger) !important; font-weight: 600; }
.form { margin: var(--space-2) 0 var(--space-3); max-width: 46rem; }
.form label { display: block; margin-bottom: 4px; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); }
.row { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.row .ne-input { flex: 1 1 18rem; min-width: 0; background: #fff; }
.bad { border-color: var(--color-danger) !important; }
.error { margin: 4px 0 0 !important; font-size: 0.82rem !important; font-weight: 600; color: var(--color-danger) !important; }
.setup .ways { margin: 0; font-size: 0.86rem; color: var(--color-text-muted); }
.compact { padding: var(--space-3) var(--space-4); }
.compact h3 { font-size: 0.98rem; }
.compact .ways { font-size: 0.82rem; }
</style>

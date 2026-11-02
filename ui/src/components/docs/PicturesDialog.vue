<script setup>
import { computed, ref, watch } from 'vue';
import ModalDialog from '../ui/ModalDialog.vue';
import { useDocs } from '../../composables/useDocsContext';
import { loadAllManuscripts } from '../../composables/useDocumentations';
import JSZip from 'jszip';
import { bundlePictures } from '../../composables/usePictureBundle';
import { clearPictures, pictureStorage, savePictures, savedAmong, sizeText } from '../../utils/pictureCache';

/**
 * Keep the snippet pictures of this documentation in the browser, so they are not asked for from the
 * library's server every time: how many are kept, a button to keep the rest, the progress, and which could not be.
 * The cut-outs of single snippets are kept (not the larger pictures of whole lines).
 */
const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(['close']);

const docs = useDocs();

const phase = ref('idle'); // idle | reading | saving | zipping
const zipResult = ref(null); // { files, failed } after a ZIP
const urls = ref([]);       // every picture of the documentation that comes from a server
const have = ref(new Set()); // the addresses that are kept
const storage = ref({ count: 0, bytes: 0 });
const progress = ref({ done: 0, total: 0, saved: 0, skipped: 0, failed: 0 });
const failures = ref([]);
const showFailures = ref(false);
let controller = null;

const missing = computed(() => urls.value.filter(u => !have.value.has(u)));
const savedHere = computed(() => urls.value.length - missing.value.length);
const percent = computed(() => (progress.value.total ? Math.round((progress.value.done / progress.value.total) * 100) : 0));

/** A reason with the pictures it applies to, for the list of what failed. */
const failureGroups = computed(() => {
    const by = new Map();
    for (const f of failures.value) {
        let host = f.url;
        try { host = new URL(f.url).host; } catch { /* keep the address */ }
        const key = `${f.reason}|${host}`;
        if (!by.has(key)) by.set(key, { reason: f.reason, host, count: 0 });
        by.get(key).count++;
    }
    return [...by.values()];
});

async function refresh() {
    phase.value = 'reading';
    const state = docs.state.value;
    await loadAllManuscripts(state);
    const here = window.location.origin;
    const list = [];
    for (const e of docs.entries.value) {
        const slot = state.manuscripts[e.id];
        if (!slot || slot.status !== 'ready') continue;
        for (const s of slot.data.snippets) {
            const url = docs.asset(s.image);
            if (!url) continue;
            // pictures that come with the documentation itself, from this site, need no keeping
            try { if (new URL(url, here).origin === here) continue; } catch { continue; }
            list.push(url);
        }
    }
    urls.value = [...new Set(list)];
    have.value = await savedAmong(urls.value);
    storage.value = await pictureStorage();
    phase.value = 'idle';
}

watch(() => props.open, (open) => { if (open) { failures.value = []; showFailures.value = false; refresh(); } }, { immediate: true });

async function save() {
    if (phase.value === 'saving') return;
    phase.value = 'saving';
    failures.value = [];
    controller = new AbortController();
    const result = await savePictures(missing.value, {
        signal: controller.signal,
        onProgress: (p) => { progress.value = p; }
    });
    failures.value = result.failures;
    controller = null;
    have.value = await savedAmong(urls.value);
    storage.value = await pictureStorage();
    phase.value = 'idle';
}
const stop = () => { if (controller) controller.abort(); };

/**
 * The kept pictures as files, ready to put in the documentation's repository: `images/…` and the manuscripts'
 * files (`data/…`) with each snippet's `local` set. What is not kept yet is fetched first. Unzip it over the repository.
 */
async function makeZip() {
    if (phase.value !== 'idle') return;
    phase.value = 'zipping';
    zipResult.value = null;
    failures.value = [];
    controller = new AbortController();
    try {
        const state = docs.state.value;
        const items = docs.entries.value
            .filter(e => state.manuscripts[e.id] && state.manuscripts[e.id].status === 'ready')
            .map(e => ({ id: e.id, file: e.file, data: state.manuscripts[e.id].data }));
        const zip = new JSZip();
        const bundled = await bundlePictures(zip, items, { signal: controller.signal, onProgress: (p) => { progress.value = p; } });
        for (const item of bundled.items) zip.file(item.file, JSON.stringify(item.data, null, 2));
        zip.file('PICTURES.md', `# Pictures of the snippets\n\nThese files hold the cut-outs of the snippets, kept as files. Unzip this folder over the documentation's repository: \`images/\` is new, and the files in \`data/\` are the manuscripts with each snippet's \`local\` set to its picture. A snippet's \`image\` stays the address of the library's IIIF server it was cut from.\n\n${bundled.written} pictures. ${bundled.failures.length ? `${bundled.failures.length} could not be fetched and are not here; the viewer fetches them from the library as before.` : 'All could be fetched.'}\n`);
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 } });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `neumedocs-pictures-${new Date().toISOString().slice(0, 10)}.zip`;
        a.click();
        URL.revokeObjectURL(a.href);
        failures.value = bundled.failures;
        zipResult.value = { files: bundled.written, failed: bundled.failures.length };
    } finally {
        controller = null;
        have.value = await savedAmong(urls.value);
        storage.value = await pictureStorage();
        phase.value = 'idle';
    }
}

async function forget() {
    await clearPictures();
    have.value = new Set();
    storage.value = { count: 0, bytes: 0 };
    failures.value = [];
}
</script>

<template>
<ModalDialog :open="open" title="Keep the pictures in this browser" width="38rem" :dismissable="phase !== 'saving'" @close="emit('close')">
    <p class="lead">
        The snippets are cut out of the libraries' page pictures, and each is fetched from the library every time it is shown.
        Keeping them here means the next visit shows them at once, and a library that is busy cannot leave them empty.
    </p>

    <p v-if="phase === 'reading'" class="status" role="status">Counting the pictures…</p>
    <template v-else>
        <p v-if="!urls.length" class="status">This documentation has no pictures that come from a library.</p>
        <template v-else>
            <p class="count"><strong>{{ savedHere }}</strong> of <strong>{{ urls.length }}</strong> pictures are kept<template v-if="storage.bytes"> · {{ sizeText(storage.bytes) }} in this browser</template>.</p>

            <div v-if="phase === 'saving' || phase === 'zipping'" class="progress" role="status">
                <div class="bar" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100" role="progressbar"><span :style="{ width: percent + '%' }"></span></div>
                <p>{{ progress.done }} of {{ progress.total }} fetched · {{ progress.saved }} kept<template v-if="progress.skipped"> · {{ progress.skipped }} already kept</template><template v-if="progress.failed"> · <strong class="bad">{{ progress.failed }} could not be loaded</strong></template></p>
            </div>

            <div v-else-if="failures.length" class="ne-note ne-note--warn" role="status">
                <strong>{{ failures.length }} picture{{ failures.length === 1 ? '' : 's' }} could not be loaded.</strong>
                They are still fetched from the library when shown.
                <button type="button" class="link" @click="showFailures = !showFailures">{{ showFailures ? 'Hide why' : 'Why?' }}</button>
                <ul v-if="showFailures" class="why">
                    <li v-for="g in failureGroups" :key="g.reason + g.host">{{ g.count }} from {{ g.host }}: {{ g.reason }}</li>
                </ul>
            </div>
            <p v-else-if="zipResult" class="ne-note ne-note--success">The ZIP has {{ zipResult.files }} picture{{ zipResult.files === 1 ? '' : 's' }}. Unzip it over the repository of this documentation.</p>
            <p v-else-if="!missing.length" class="ne-note ne-note--success">All of them are kept.</p>
        </template>
    </template>

    <template #footer>
        <button v-if="storage.count && phase === 'idle'" type="button" class="ne-btn ne-btn--ghost clear" title="Remove every kept picture from this browser" @click="forget">Clear kept pictures</button>
        <span class="grow"></span>
        <button v-if="phase === 'saving' || phase === 'zipping'" type="button" class="ne-btn" @click="stop">Stop</button>
        <template v-else>
            <button type="button" class="ne-btn" @click="emit('close')">Close</button>
            <button v-if="urls.length && savedHere" type="button" class="ne-btn" title="The kept pictures as files, with the manuscripts' files updated, to put in this documentation's repository" @click="makeZip">Download as ZIP for the repository</button>
            <button v-if="urls.length && missing.length" type="button" class="ne-btn ne-btn--primary" @click="save">
                {{ failures.length ? 'Try the missing again' : `Keep the ${missing.length === urls.length ? '' : 'missing '}${missing.length} picture${missing.length === 1 ? '' : 's'}` }}
            </button>
        </template>
    </template>
</ModalDialog>
</template>

<style scoped>
.lead { margin: 0 0 var(--space-3); color: var(--color-text-muted); line-height: 1.55; }
.count { margin: 0 0 var(--space-3); font-size: 1.05rem; }
.status { color: var(--color-text-muted); }
.progress p { margin: var(--space-2) 0 0; font-size: 0.92rem; color: var(--color-text-muted); }
.bar { height: 6px; background: var(--color-surface-muted); border: 1px solid var(--color-border); }
.bar span { display: block; height: 100%; background: var(--color-primary); transition: width 0.2s; }
.bad { color: var(--color-danger, #b3261e); }
.link { border: none; background: none; padding: 0; color: var(--color-primary); cursor: pointer; font: inherit; text-decoration: underline; }
.why { margin: var(--space-2) 0 0; padding-left: 1.2rem; font-size: 0.9rem; }
.grow { flex: 1; }
.clear { margin-right: auto; }
</style>

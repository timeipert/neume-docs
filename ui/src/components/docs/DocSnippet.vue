<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import DocPattern from './DocPattern.vue';
import { useDocs } from '../../composables/useDocsContext';
import { useImageFallback } from '../../composables/useImageFallback';
import { waitTurn } from '../../utils/imageQueue';
import { withAlternatives } from '../../utils/iiifUrls';
import { savedPicture } from '../../utils/pictureCache';

/**
 * A snippet: the picture of a neume on its page. Without a picture (a manuscript that could not
 * be cropped, a server that is not reachable) the pattern stands in its place.
 */
const props = defineProps({
    snippet: { type: Object, required: true },
    width: { type: Number, default: 84 },
    /** the larger picture, if there is one */
    large: { type: Boolean, default: false }
});

const docs = useDocs();

// The picture asked for, and the other one if that is not there (a server may refuse the enlarged one, or the small one).
const candidates = computed(() => {
    // `local` is the cut-out kept as a file of the documentation; `image` and `zoom` say where it comes from
    const { zoom, image, local } = props.snippet;
    // and, last, the same cut-out asked for another way, for a server that refuses to enlarge a small part
    return withAlternatives((props.large ? [zoom, local, image] : [local, image, zoom]).filter(Boolean).map(path => docs.asset(path)));
});

// A picture is asked for when it is near the screen and its turn has come: a library does not take hundreds
// of requests at once (see utils/imageQueue), and a picture that fails is tried again after a pause.
const root = ref(null);
// A picture the reader has kept in this browser (Pictures → Keep) is shown from there, without asking the server.
const savedSrc = ref('');
const checked = ref(false);
watch(candidates, async (list) => {
    checked.value = false;
    savedSrc.value = '';
    for (const url of list) {
        const local = await savedPicture(url);
        if (local) { savedSrc.value = local; break; }
    }
    checked.value = true;
}, { immediate: true });
const near = ref(false);
const myTurn = ref(false);
let release = () => {};
let observer = null;
let gone = false;
const { url: src, status, loaded: imageLoaded, failed: onError } = useImageFallback(candidates, { enabled: myTurn, timeout: 20000, passes: 3, pause: 2500 });

onMounted(() => {
    if (typeof IntersectionObserver === 'undefined') { near.value = true; return; }
    observer = new IntersectionObserver((entries) => { if (entries.some(e => e.isIntersecting)) { near.value = true; observer.disconnect(); } }, { rootMargin: '400px' });
    observer.observe(root.value);
});
watch([near, candidates, checked, savedSrc], async ([isNear, list, isChecked, kept]) => {
    if (!isNear || !isChecked || kept || myTurn.value || !list.length) return;
    // a file of the documentation is no strain on a library: many may be asked for at once
    const done = await waitTurn(list[0], props.snippet.local ? { limit: 12 } : {});
    if (gone) { done(); return; }
    release = done;
    myTurn.value = true;
}, { immediate: true });
// the turn is given back when the picture is there, or given up
watch(status, (s) => { if (s === 'loaded' || s === 'error') release(); });
const loaded = (event) => { imageLoaded(event); release(); };
onBeforeUnmount(() => { gone = true; if (observer) observer.disconnect(); release(); });
</script>

<template>
<span ref="root" class="doc-snippet" :style="large ? null : { width: width + 'px', height: Math.round(width * 0.75) + 'px' }">
    <img v-if="(savedSrc || src) && status !== 'error'" :src="savedSrc || src" :alt="`${snippet.pattern}${snippet.folio ? `, f. ${snippet.folio}` : ''}`" referrerpolicy="no-referrer" @load="loaded" @error="onError" />
    <span v-else class="stand-in" :title="!candidates.length ? 'No picture' : status === 'error' ? 'The picture could not be loaded' : 'The picture is being loaded'"><DocPattern :pattern="snippet.pattern" :signs="docs.signs.value" :scale="0.7" :code="false" /></span>
</span>
</template>

<style scoped>
.doc-snippet { display: inline-flex; align-items: center; justify-content: center; overflow: hidden; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
.doc-snippet img { display: block; max-width: 100%; max-height: 100%; width: 100%; height: 100%; object-fit: contain; }
.stand-in { display: inline-flex; align-items: center; justify-content: center; width: 100%; height: 100%; background: var(--color-surface-muted); }
</style>

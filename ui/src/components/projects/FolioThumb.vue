<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useImageManifest } from '../../composables/useImageManifest';
import { useImageFallback } from '../../composables/useImageFallback';

/**
 * A small picture of one page of a manuscript, from its IIIF server. It is only asked for once it
 * comes into view (a manuscript has hundreds of pages), goes down the list of addresses like every
 * page picture, and leaves an empty frame where there is none.
 */
const props = defineProps({
    source: { type: String, required: true },
    folio: { type: String, required: true },
    width: { type: Number, default: 260 }
});

const { getPageUrls } = useImageManifest();
const frame = ref(null);
const visible = ref(false);
let observer = null;

onMounted(() => {
    if (typeof IntersectionObserver === 'undefined') { visible.value = true; return; }
    observer = new IntersectionObserver((entries) => {
        if (entries.some(e => e.isIntersecting)) { visible.value = true; observer.disconnect(); }
    }, { rootMargin: '200px' });
    observer.observe(frame.value);
});
onBeforeUnmount(() => observer && observer.disconnect());

const candidates = computed(() => getPageUrls(props.source, props.folio, { width: props.width }));
const { url, status, loaded, failed } = useImageFallback(candidates, { enabled: visible });
</script>

<template>
<span ref="frame" class="thumb" :class="{ empty: status === 'error' }">
    <img v-if="url && status !== 'error'" :src="url" alt="" loading="lazy" @load="loaded" @error="failed" />
</span>
</template>

<style scoped>
.thumb { display: block; aspect-ratio: 3 / 4; overflow: hidden; background: var(--color-surface-muted); border-radius: var(--radius-sm, 4px); }
.thumb img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
</style>

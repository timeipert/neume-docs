<script setup>
import { computed } from 'vue';
import DocPattern from './DocPattern.vue';
import { useDocs } from '../../composables/useDocsContext';
import { useImageFallback } from '../../composables/useImageFallback';

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
    const { zoom, image } = props.snippet;
    return (props.large ? [zoom, image] : [image, zoom]).filter(Boolean).map(path => docs.asset(path));
});
const { url: src, status, loaded, failed: onError } = useImageFallback(candidates, { timeout: 0, passes: 1 });
</script>

<template>
<span class="doc-snippet" :style="large ? null : { width: width + 'px', height: Math.round(width * 0.75) + 'px' }">
    <img v-if="src && status !== 'error'" :src="src" :alt="`${snippet.pattern}${snippet.folio ? `, f. ${snippet.folio}` : ''}`" loading="lazy" referrerpolicy="no-referrer" @load="loaded" @error="onError" />
    <span v-else class="stand-in" :title="candidates.length ? 'The picture could not be loaded' : 'No picture'"><DocPattern :pattern="snippet.pattern" :signs="docs.signs.value" :scale="0.7" :code="false" /></span>
</span>
</template>

<style scoped>
.doc-snippet { display: inline-flex; align-items: center; justify-content: center; overflow: hidden; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
.doc-snippet img { display: block; max-width: 100%; max-height: 100%; width: 100%; height: 100%; object-fit: contain; }
.stand-in { display: inline-flex; align-items: center; justify-content: center; width: 100%; height: 100%; background: var(--color-surface-muted); }
</style>

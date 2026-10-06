<script setup>
import { useImageManifest } from '../../composables/useImageManifest';
import AnnotationCutout from '../AnnotationCutout.vue';

/**
 * The picture of one snippet: cut from the page image (IIIF), or the image that
 * was pasted in (screenshots). `snippet` is one entry of `collectSnippets` /
 * `collectionSnippets`.
 */
defineProps({
    snippet: { type: Object, required: true },
    width: { type: Number, default: 56 },
    height: { type: Number, default: 42 }
});

const { hasImage } = useImageManifest();
</script>

<template>
<img v-if="snippet.kind === 'image'" class="shot" :src="snippet.image" :alt="snippet.caption || 'Snippet'" loading="lazy" />
<AnnotationCutout
    v-else-if="snippet.points && hasImage(snippet.source, snippet.folio)"
    :source="snippet.source"
    :folio="snippet.folio"
    :points="snippet.points"
    :width="width"
    :height="height"
    :padding="0.08"
    :hide-label="true"
/>
<span v-else class="none" title="The page image is not available">?</span>
</template>

<style scoped>
.shot { display: block; width: 100%; height: 100%; object-fit: contain; }
.none { display: inline-flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--color-text-light); font-weight: 700; }
</style>

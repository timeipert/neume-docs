<script setup>
import { computed } from 'vue';
import { GLYPHS } from '../../data/glyphs';
import { renderSvg } from '../../utils/svgRenderer';
import { splitCodeBySigns } from '../../utils/signs';

/**
 * A pattern drawn from its code, with the code beneath it (the signs of the documentation
 * picked out, since the difference between two codes can be one letter). Reads nothing but its
 * props: the glyphs of the signs come from the documentation, not from this browser's settings.
 */
const props = defineProps({
    pattern: { type: String, required: true },
    /** the glyphs of the documentation's own signs: { key: { viewBox, d } } */
    signs: { type: Object, default: () => ({}) },
    scale: { type: Number, default: 1 },
    code: { type: Boolean, default: true }
});

const rendered = computed(() => renderSvg(props.pattern, GLYPHS, false, props.signs));
const segments = computed(() => splitCodeBySigns(props.pattern, Object.keys(props.signs)));
</script>

<template>
<span class="doc-pattern">
    <svg class="glyph" :width="rendered.width * scale" :height="rendered.height * scale" :viewBox="rendered.viewBox" aria-hidden="true" v-html="rendered.content"></svg>
    <code v-if="code" class="code" :title="pattern"><span v-for="(seg, i) in segments" :key="i" :class="{ sign: seg.isSign }">{{ seg.text }}</span></code>
    <span v-else class="sr-only">{{ pattern }}</span>
</span>
</template>

<style scoped>
.doc-pattern { display: inline-flex; flex-direction: column; align-items: center; gap: 2px; }
.glyph { display: block; margin: 0 auto; }
.code { font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 11px; color: var(--color-text-muted); white-space: nowrap; letter-spacing: 0.02em; }
.sign { color: var(--color-primary-hover); font-weight: 800; background: var(--color-primary-light); border-radius: 2px; padding: 0 2px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>

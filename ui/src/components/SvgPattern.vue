<script setup>
import { computed } from 'vue';
import { renderSvg } from '../utils/svgRenderer';
import { resolveSignGlyphs } from '../utils/signs';
import { useSettingsStore } from '../stores/settings';

const settings = useSettingsStore();

const props = defineProps({
  pattern: { type: String, required: true },
  glyphs: { type: Object, required: true },
  isGroup: { type: Boolean, default: false },
  /** Draw larger or smaller than the natural size, keeping proportions. */
  scale: { type: Number, default: 1 }
});

const signGlyphs = computed(() => resolveSignGlyphs(settings.customSigns, props.glyphs));

const rendered = computed(() => {
    return renderSvg(props.pattern, props.glyphs, props.isGroup, signGlyphs.value);
});
</script>

<template>
  <svg 
    class="svg-pattern"
    :width="rendered.width * scale" 
    :height="rendered.height * scale" 
    :viewBox="rendered.viewBox"
    v-html="rendered.content"
  ></svg>
</template>

<style scoped>
.svg-pattern {
    display: block;
    margin: 0 auto;
}
</style>

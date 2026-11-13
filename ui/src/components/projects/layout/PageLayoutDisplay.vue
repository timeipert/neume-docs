<script setup>
import { computed } from 'vue';
import { describeSection, pageDiagramSvg, staffSampleSvg } from '@monodi/core/page-layout';

/**
 * What a section of a page layout looks like: the schematic verso page, one staff with its clefs and colours, and
 * the text in German (the wording of the CM source descriptions) and English. The drawings are SVG text made by
 * `@monodi/core/page-layout`, which escapes every text it writes, so they are put in as HTML.
 */
const props = defineProps({
    section: { type: Object, required: true }
});

const page = computed(() => pageDiagramSvg(props.section, { height: 300 }));
const staff = computed(() => staffSampleSvg(props.section));
const de = computed(() => describeSection(props.section, 'de'));
const en = computed(() => describeSection(props.section, 'en'));
</script>

<template>
<div class="show">
    <div class="pics">
        <figure class="page" aria-label="Schematic verso page"><div v-html="page"></div><figcaption>Verso page, schematic</figcaption></figure>
        <figure class="staff" aria-label="One staff"><div v-html="staff"></div><figcaption>One staff: lines, clefs, custos</figcaption></figure>
    </div>
    <div class="texts">
        <p class="lang">Deutsch</p>
        <p class="text" lang="de">{{ de || 'Noch nichts erfasst.' }}</p>
        <p class="lang">English</p>
        <p class="text" lang="en">{{ en || 'Nothing recorded yet.' }}</p>
    </div>
</div>
</template>

<style scoped>
.show { display: flex; flex-direction: column; gap: var(--space-4); }
.pics { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: flex-end; }
figure { margin: 0; display: flex; flex-direction: column; gap: var(--space-1); }
figure :deep(svg) { display: block; max-width: 100%; height: auto; }
.staff { flex: 1 1 260px; }
figcaption { font-size: 0.75rem; color: var(--color-text-muted); }
.lang { margin: 0; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-text-muted); }
.text { margin: 0 0 var(--space-2); line-height: 1.5; }
</style>

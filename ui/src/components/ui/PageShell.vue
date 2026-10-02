<script setup>
import { ref } from 'vue';
import PageHeader from './PageHeader.vue';
import PageToc from './PageToc.vue';

/**
 * The frame of a page made of panels: title block, an "On this page" index on
 * the left (hidden on narrow screens), and the panels in a readable column.
 * Settings, Workspace and the other panel pages share it, so they line up.
 */
defineProps({
    title: { type: String, required: true },
    eyebrow: { type: String, default: '' },
    // An "On this page" index suits long pages; a page of two panels does not need one.
    toc: { type: Boolean, default: true }
});

const column = ref(null);
</script>

<template>
<div class="shell" :class="{ 'shell--plain': !toc }">
    <aside v-if="toc" class="shell-toc"><PageToc v-if="column" :root="column" /></aside>
    <div class="shell-column" ref="column">
        <PageHeader :title="title" :eyebrow="eyebrow">
            <template v-if="$slots.subtitle" #subtitle><slot name="subtitle" /></template>
            <template v-if="$slots.actions" #actions><slot name="actions" /></template>
        </PageHeader>
        <slot />
    </div>
</div>
</template>

<style scoped>
.shell {
    display: grid; grid-template-columns: 190px minmax(0, 860px); gap: 36px; justify-content: center;
    padding: var(--space-5) var(--space-5) var(--space-6);
    align-items: start;
}
.shell--plain { display: block; }
.shell--plain .shell-column { max-width: 860px; margin: 0 auto; }
.shell-toc { position: sticky; top: var(--space-5); margin-top: 82px; }
.shell-column { min-width: 0; }
@media (max-width: 1100px) {
    .shell { display: block; }
    .shell-toc { display: none; }
    .shell-column { max-width: 860px; margin: 0 auto; }
}
</style>

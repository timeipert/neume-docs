<script setup>
import { RouterLink } from 'vue-router';

/** The two views of the manuscripts' metadata: the table of fields, and the table of IIIF sources. */
defineProps({
    // A number shown on the IIIF tab, e.g. how many manuscripts have a suggestion waiting.
    badge: { type: Number, default: 0 }
});
</script>

<template>
<nav class="tabs" aria-label="Metadata views">
    <RouterLink to="/metadata" class="tab" exact-active-class="on">Manuscripts</RouterLink>
    <RouterLink to="/metadata/iiif" class="tab" exact-active-class="on">
        IIIF sources<span v-if="badge" class="badge" :title="`${badge} manuscript${badge === 1 ? '' : 's'} with a suggestion`">{{ badge }}</span>
    </RouterLink>
</nav>
</template>

<style scoped>
.tabs { display: flex; gap: var(--space-1); border-bottom: 1px solid var(--color-border); margin-bottom: var(--space-3); }
.tab { display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-4); color: var(--color-text-muted); font-weight: 600; font-size: 0.92rem; border-bottom: 2px solid transparent; margin-bottom: -1px; text-decoration: none; }
.tab:hover { color: var(--color-text); }
.tab.on { color: var(--color-primary-dark); border-bottom-color: var(--color-primary); }
.badge { background: var(--color-primary); color: #fff; border-radius: 999px; font-size: 0.7rem; padding: 0 0.55em; line-height: 1.5; }
</style>

<script setup>
import { ref, watch } from 'vue';

/**
 * A panel that folds away: the title and a one-line summary stay visible, the
 * body opens on demand. For set-up that is needed once in a while (signs,
 * variants, preferred IDs) and should not push the page's main content down.
 */
const props = defineProps({
    title: { type: String, required: true },
    summary: { type: String, default: '' },
    open: { type: Boolean, default: false }
});

const isOpen = ref(props.open);
// A link can ask for the panel to be open (e.g. "define signs" from the variant editor).
watch(() => props.open, (value) => { if (value) isOpen.value = true; });
</script>

<template>
<section class="disclosure" :class="{ open: isOpen }">
    <button type="button" class="d-toggle" :aria-expanded="isOpen" @click="isOpen = !isOpen">
        <span class="d-caret" aria-hidden="true">▸</span>
        <span class="d-title">{{ title }}</span>
        <span v-if="summary" class="d-summary">{{ summary }}</span>
    </button>
    <div v-if="isOpen" class="d-body"><slot /></div>
</section>
</template>

<style scoped>
.disclosure { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
.d-toggle { width: 100%; display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; text-align: left; padding: var(--space-3) var(--space-4); border: none; background: transparent; border-radius: var(--radius-lg); }
.d-toggle:hover { background: var(--color-surface-muted); }
.d-caret { display: inline-block; transition: transform 0.15s ease; opacity: 0.55; font-size: 0.8em; }
.open .d-caret { transform: rotate(90deg); }
.d-title { font-weight: 700; font-size: 0.98rem; }
.d-summary { color: var(--color-text-muted); font-size: 0.85rem; font-weight: 400; }
.d-body { padding: var(--space-4); border-top: 1px solid var(--color-border); }
.d-body > :first-child { margin-top: 0; }
.d-body > :last-child { margin-bottom: 0; }
</style>

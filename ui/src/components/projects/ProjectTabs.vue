<script setup>
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

/**
 * The four steps of a project as tabs, always in view: choose the columns, fill
 * the standard table, extend it, compare all manuscripts. Any of them can be
 * entered at any time; the order only says what usually comes next.
 */
const props = defineProps({
    id: { type: String, required: true },
    project: { type: Object, required: true },
    /** from useProject */
    progress: { type: Object, required: true },
    projectCount: { type: Number, default: 1 }
});

const route = useRoute();

const tabs = computed(() => [
    { name: 'project_columns', label: 'Columns', count: props.project.columns.length || '' },
    { name: 'project_standard', label: 'Standard table', count: props.progress.columns ? `${props.progress.filled}/${props.progress.columns}` : '' },
    { name: 'project_extended', label: 'Extended table', count: props.progress.extended ? `+${props.progress.extended}` : '' },
    { name: 'project_all', label: 'All manuscripts', count: props.projectCount > 1 ? props.projectCount : '' }
]);
</script>

<template>
<nav class="tabs" aria-label="Steps of the project">
    <RouterLink
        v-for="t in tabs"
        :key="t.name"
        :to="{ name: t.name, params: { id } }"
        class="tab"
        :class="{ on: route.name === t.name }"
        :aria-current="route.name === t.name ? 'step' : undefined"
    >
        {{ t.label }}<span v-if="t.count !== ''" class="count">{{ t.count }}</span>
    </RouterLink>
</nav>
</template>

<style scoped>
.tabs { display: flex; gap: var(--space-1); border-bottom: 1px solid var(--color-border); overflow-x: auto; scrollbar-width: none; }
.tab { display: inline-flex; align-items: baseline; gap: var(--space-2); padding: var(--space-3) var(--space-4); border-bottom: 3px solid transparent; margin-bottom: -1px; color: var(--color-text-muted); font-weight: 600; font-size: 0.95rem; white-space: nowrap; text-decoration: none; }
.tab:hover { color: var(--color-text); background: var(--color-surface-muted); }
.tab.on { color: var(--color-primary-dark); border-bottom-color: var(--color-primary); }
.count { font-size: 0.78rem; font-weight: 600; color: var(--color-text-light); font-variant-numeric: tabular-nums; }
.tab.on .count { color: var(--color-primary); }
</style>

<script setup>
/**
 * One block of a page: a title, an optional explanation, optional actions at the
 * top right, and the content. Every settings-like page is a stack of these, so
 * they all look and behave alike. `id` makes the panel appear in the page's
 * "On this page" index.
 */
defineProps({
    id: { type: String, default: '' },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    tone: { type: String, default: 'default' } // 'default' | 'danger'
});
</script>

<template>
<section class="panel" :class="{ 'panel--danger': tone === 'danger' }" :id="id || undefined" :data-toc="id ? title : undefined">
    <header class="panel-head">
        <div class="panel-titles">
            <h2>{{ title }}</h2>
            <p v-if="description || $slots.description" class="panel-desc"><slot name="description">{{ description }}</slot></p>
        </div>
        <div v-if="$slots.actions" class="panel-actions"><slot name="actions" /></div>
    </header>
    <div class="panel-body"><slot /></div>
</section>
</template>

<style scoped>
.panel {
    margin-bottom: var(--space-5);
    padding: var(--space-5);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    scroll-margin-top: var(--space-4);
}
.panel--danger { border-color: var(--color-danger-muted); }
.panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-3) var(--space-4); flex-wrap: wrap; margin-bottom: var(--space-4); }
.panel-titles { min-width: 0; flex: 1 1 18rem; }
h2 { margin: 0; font-size: 1.1rem; line-height: 1.3; }
.panel--danger h2 { color: #991b1b; }
.panel-desc { margin: var(--space-1) 0 0; color: var(--color-text-muted); font-size: 0.9rem; max-width: 70ch; }
.panel-actions { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.panel-body > :first-child { margin-top: 0; }
.panel-body > :last-child { margin-bottom: 0; }
</style>

<script setup>
/** Title block shared by the neume table screens. */
defineProps({
    title: { type: String, required: true },
    eyebrow: { type: String, default: '' }
});
</script>

<template>
<header class="page-header">
    <div class="ph-text">
        <p v-if="eyebrow || $slots.eyebrow" class="ph-eyebrow"><slot name="eyebrow">{{ eyebrow }}</slot></p>
        <h1>{{ title }}<slot name="badge" /></h1>
        <div v-if="$slots.subtitle" class="ph-sub"><slot name="subtitle" /></div>
    </div>
    <div v-if="$slots.actions" class="ph-actions"><slot name="actions" /></div>
</header>
</template>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--space-4) var(--space-5); flex-wrap: wrap; margin-bottom: var(--space-5); }
.ph-eyebrow { margin: 0 0 var(--space-1); font-size: 0.74rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-primary); }
h1 { margin: 0; font-size: 1.75rem; line-height: 1.2; letter-spacing: -0.01em; }
.ph-sub { margin-top: var(--space-1); color: var(--color-text-muted); max-width: 70ch; }
.ph-sub :deep(p) { margin: 0; }
.ph-actions { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
</style>

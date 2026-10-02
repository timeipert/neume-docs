<script setup>
import { watch, onBeforeUnmount } from 'vue';

/**
 * The one dialog frame: dimmed backdrop, title, body, footer. Closes on Escape
 * and on a click on the backdrop. Content goes in the default slot, buttons in
 * `footer` — primary action last, on the right.
 */
const props = defineProps({
    open: { type: Boolean, default: false },
    title: { type: String, required: true },
    width: { type: String, default: '34rem' },
    // A dialog that is busy deleting something must not be dismissed by accident.
    dismissable: { type: Boolean, default: true }
});
const emit = defineEmits(['close']);

function onKey(e) {
    if (e.key === 'Escape' && props.dismissable) emit('close');
}

watch(() => props.open, (open) => {
    if (open) document.addEventListener('keydown', onKey);
    else document.removeEventListener('keydown', onKey);
}, { immediate: true });

onBeforeUnmount(() => document.removeEventListener('keydown', onKey));

function onBackdrop() {
    if (props.dismissable) emit('close');
}
</script>

<template>
<Teleport to="body">
    <div v-if="open" class="md-backdrop" @mousedown.self="onBackdrop">
        <div class="md-dialog" role="dialog" aria-modal="true" :aria-label="title" :style="{ width }">
            <header class="md-head">
                <h3>{{ title }}</h3>
                <button class="md-close" aria-label="Close" :disabled="!dismissable" @click="emit('close')">&times;</button>
            </header>
            <div class="md-body"><slot /></div>
            <footer v-if="$slots.footer" class="md-foot"><slot name="footer" /></footer>
        </div>
    </div>
</Teleport>
</template>

<style scoped>
.md-backdrop { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: var(--space-4); background: rgba(15, 23, 42, 0.55); }
.md-dialog { max-width: 100%; max-height: calc(100vh - 2rem); display: flex; flex-direction: column; background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); overflow: hidden; }
.md-head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--color-border); }
.md-head h3 { margin: 0; font-size: 1.05rem; }
.md-close { border: none; background: transparent; font-size: 1.5rem; line-height: 1; padding: 0 var(--space-1); color: var(--color-text-light); }
.md-close:hover { background: transparent; color: var(--color-text); }
.md-body { padding: var(--space-5); overflow-y: auto; flex: 1; }
.md-foot { display: flex; justify-content: flex-end; align-items: center; gap: var(--space-2); flex-wrap: wrap; padding: var(--space-3) var(--space-5); border-top: 1px solid var(--color-border); background: var(--color-bg); }
</style>

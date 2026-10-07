<script setup>
import { computed } from 'vue';
import { useToast } from '../../composables/useToast';

/**
 * Shows the messages from useToast, bottom centre. Mounted once, in App.vue.
 * Never more than three at once: a run of quick actions would otherwise hide the page under its messages.
 */
const { toasts, dismiss } = useToast();
const shown = computed(() => toasts.value.slice(-3));

function run(toast) {
    const action = toast.action;
    dismiss(toast.id);
    if (action && action.run) action.run();
}
</script>

<template>
<div class="toast-host" aria-live="polite">
    <div v-for="t in shown" :key="t.id" class="toast" :class="`toast--${t.tone}`" role="status">
        <span class="toast-msg">{{ t.message }}</span>
        <button v-if="t.action" class="toast-action" @click="run(t)">{{ t.action.label }}</button>
        <button class="toast-x" aria-label="Dismiss" @click="dismiss(t.id)">&times;</button>
    </div>
</div>
</template>

<style scoped>
.toast-host { position: fixed; left: 50%; bottom: var(--space-5); transform: translateX(-50%); z-index: 1100; display: flex; flex-direction: column; align-items: center; gap: var(--space-2); width: max-content; max-width: calc(100vw - 2rem); pointer-events: none; }
.toast { pointer-events: auto; display: flex; align-items: center; gap: var(--space-3); padding: 0.6em 0.6em 0.6em 1em; background: var(--color-nav-bg); color: #fff; border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); font-size: 0.92rem; }
.toast--success { background: #14532d; }
.toast--error { background: #7f1d1d; }
.toast-msg { min-width: 0; }
.toast-action { border: 1px solid rgba(255, 255, 255, 0.4); background: transparent; color: #fff; font-weight: 700; padding: 0.2em 0.8em; }
.toast-action:hover { background: rgba(255, 255, 255, 0.14); border-color: #fff; }
.toast-x { border: none; background: transparent; color: rgba(255, 255, 255, 0.7); font-size: 1.2rem; line-height: 1; padding: 0 var(--space-1); }
.toast-x:hover { background: transparent; color: #fff; }
</style>

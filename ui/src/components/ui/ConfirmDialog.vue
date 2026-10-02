<script setup>
import { ref, computed, watch } from 'vue';
import ModalDialog from './ModalDialog.vue';

/**
 * Asks before something is deleted or overwritten. The text says what will
 * happen (default slot) and whether it can be undone (`undo` slot or prop).
 *
 * For the large deletions, `requireText` makes the person type a word before the
 * button works: a deliberate step, not a click that lands by accident.
 */
const props = defineProps({
    open: { type: Boolean, default: false },
    title: { type: String, required: true },
    confirmLabel: { type: String, default: 'Delete' },
    tone: { type: String, default: 'danger' }, // 'danger' | 'primary'
    requireText: { type: String, default: '' },
    busy: { type: Boolean, default: false },
    error: { type: String, default: '' }
});
const emit = defineEmits(['confirm', 'cancel']);

const typed = ref('');
watch(() => props.open, (open) => { if (open) typed.value = ''; });

const allowed = computed(() => !props.requireText || typed.value.trim().toLowerCase() === props.requireText.toLowerCase());
</script>

<template>
<ModalDialog :open="open" :title="title" :dismissable="!busy" width="30rem" @close="emit('cancel')">
    <div class="cd-text"><slot /></div>
    <div v-if="requireText" class="ne-field cd-type">
        <label for="cd-confirm-input">Type <strong>{{ requireText }}</strong> to continue</label>
        <input id="cd-confirm-input" v-model="typed" class="ne-input" autocomplete="off" spellcheck="false" @keyup.enter="allowed && !busy && emit('confirm')" />
    </div>
    <p v-if="error" class="ne-note ne-note--error cd-error" role="alert">{{ error }}</p>
    <template #footer>
        <button class="ne-btn" :disabled="busy" @click="emit('cancel')">Cancel</button>
        <button class="ne-btn" :class="tone === 'danger' ? 'ne-btn--danger-solid' : 'ne-btn--primary'" :disabled="!allowed || busy" @click="emit('confirm')">
            {{ busy ? 'Working…' : confirmLabel }}
        </button>
    </template>
</ModalDialog>
</template>

<style scoped>
.cd-text { font-size: 0.95rem; line-height: 1.55; }
.cd-text :deep(p) { margin: 0 0 var(--space-3); }
.cd-text :deep(ul) { margin: 0 0 var(--space-3); padding-left: 1.2rem; }
.cd-type { margin-top: var(--space-4); }
.cd-error { margin: var(--space-3) 0 0; }
</style>

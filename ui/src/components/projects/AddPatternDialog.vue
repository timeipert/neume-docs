<script setup>
import { computed, ref, watch } from 'vue';
import ModalDialog from '../ui/ModalDialog.vue';
import PatternDisplay from '../PatternDisplay.vue';
import { usePatternLibraryStore } from '../../stores/patternLibrary';
import { useToast } from '../../composables/useToast';
import { checkCode } from '../../utils/projectTable';

/**
 * A code the pattern library does not have yet, added: typed in, checked against the
 * grammar of the transcription, shown, and put under the group it belongs to.
 */
const props = defineProps({
    open: { type: Boolean, default: false },
    glyphs: { type: Object, required: true },
    /** useProjectLibrary(): to see whether the code is there already */
    library: { type: Object, required: true },
    initial: { type: String, default: '' },
    /** where it is meant to go: standard columns only take the shapes of the brief */
    target: { type: String, default: 'extended' } // 'standard' | 'extended'
});
const emit = defineEmits(['close', 'added']);

const patterns = usePatternLibraryStore();
const toast = useToast();

const text = ref('');
watch(() => props.open, (open) => { if (open) text.value = props.initial; }, { immediate: true });

const check = computed(() => checkCode(text.value));
const known = computed(() => check.value.ok && props.library.byCode.has(check.value.code));
const standardOnly = computed(() => props.target === 'standard');
const wrongTable = computed(() => check.value.ok && standardOnly.value && !check.value.category.standard);
const canAdd = computed(() => check.value.ok && !wrongTable.value);

function add() {
    if (!canAdd.value) return;
    const code = check.value.code;
    if (!known.value) {
        patterns.addManualPattern(code);
        toast.show(`${code} added to the pattern library.`, { tone: 'success' });
    }
    emit('added', { code, wasThere: known.value });
    emit('close');
}
</script>

<template>
<ModalDialog :open="open" title="Add a code to the pattern library" width="30rem" @close="emit('close')">
    <form id="add-pattern" class="form" @submit.prevent="add">
        <div class="ne-field">
            <label for="ap-code">Pattern code</label>
            <input id="ap-code" v-model="text" class="ne-input code" autocomplete="off" spellcheck="false" placeholder="e.g. *udL or [*u]dd" autofocus />
            <p class="help">
                The first note is <code>*</code>, then <code>u</code> up, <code>d</code> down, <code>e</code> equal.
                <code>[ ]</code> joins notes into one group; an upper-case letter after a note is a sign (<code>L</code> liquescent, <code>O</code> oriscus, …).
            </p>
        </div>

        <p v-if="text.trim() && !check.ok" class="error" role="alert">{{ check.message }}</p>

        <div v-if="check.ok" class="preview">
            <div class="draw"><PatternDisplay :pattern="check.code" :glyphs="glyphs" :scale="1.6" /></div>
            <div>
                <p class="line"><strong>{{ check.code }}</strong></p>
                <p class="line ne-muted">
                    Goes under <code>{{ check.category.label }}</code><template v-if="check.category.title !== check.category.label"> — {{ check.category.title }}</template>.
                </p>
                <p v-if="known" class="line ok">The library has it already.</p>
                <p v-if="wrongTable" class="line warn">This is not a shape of the standard table. Add it to the extended table.</p>
            </div>
        </div>
    </form>
    <template #footer>
        <button type="button" class="ne-btn" @click="emit('close')">Cancel</button>
        <button type="submit" form="add-pattern" class="ne-btn ne-btn--primary" :disabled="!canAdd">{{ known ? 'Use it' : 'Add to the library' }}</button>
    </template>
</ModalDialog>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--space-4); }
.code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 1.1rem; }
.help { margin: var(--space-1) 0 0; font-size: 0.8rem; color: var(--color-text-muted); }
.error { margin: 0; font-weight: 600; color: var(--color-danger); font-size: 0.88rem; }
.preview { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-3) var(--space-4); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.draw { min-width: 80px; display: flex; justify-content: center; }
.line { margin: 0 0 2px; }
.ok { color: var(--color-success-dark); font-weight: 600; font-size: 0.86rem; }
.warn { color: var(--color-warning-dark); font-weight: 600; font-size: 0.86rem; }
</style>

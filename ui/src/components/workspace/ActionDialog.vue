<script setup>
import { ref, computed, watch } from 'vue';
import ConfirmDialog from '../ui/ConfirmDialog.vue';
import { useWorkspaceManagement, RestorePointError } from '../../composables/useWorkspaceManagement';
import { useToast } from '../../composables/useToast';

/**
 * The confirm step for anything that deletes workspace data. The page gives it a
 * `request`; this runs the action, reports the result as a toast with "Undo",
 * and deals with the one thing that can go wrong in the middle: a restore point
 * that could not be saved. In that case nothing has been deleted yet, and the
 * person may go on without one.
 *
 * request: {
 *   title, paragraphs: string[], confirmLabel, requireText?, tone?,
 *   option?: { key, label, default? }       an optional tick box, passed to run()
 *   run(options): Promise<point|null>       options = { force, [option.key] }
 *   success: string | (point) => string
 * }
 */
const props = defineProps({
    request: { type: Object, default: null }
});
const emit = defineEmits(['close']);

const mgmt = useWorkspaceManagement();
const toast = useToast();

const busy = ref(false);
const error = ref('');
const force = ref(false);
const optionValue = ref(false);

watch(() => props.request, (req) => {
    error.value = '';
    force.value = false;
    busy.value = false;
    optionValue.value = !!req?.option?.default;
});

const confirmLabel = computed(() => (force.value ? 'Continue without a restore point' : props.request?.confirmLabel || 'Delete'));

async function confirm() {
    const req = props.request;
    if (!req || busy.value) return;
    busy.value = true;
    error.value = '';
    try {
        const options = { force: force.value };
        if (req.option) options[req.option.key] = optionValue.value;
        const point = await req.run(options);
        const message = typeof req.success === 'function' ? req.success(point) : (req.success || 'Done.');
        toast.show(message, {
            tone: 'success',
            action: point ? {
                label: 'Undo',
                run: async () => {
                    try {
                        await mgmt.restore(point.id);
                        toast.show('Undone: your work is back as it was.', { tone: 'success' });
                    } catch (e) {
                        toast.show(`Could not undo: ${e.message}`, { tone: 'error' });
                    }
                }
            } : null
        });
        emit('close');
    } catch (e) {
        if (e instanceof RestorePointError) {
            force.value = true;
            error.value = `${e.message}. Nothing was deleted. You can export a backup first, or continue without a restore point.`;
        } else {
            error.value = e.message || String(e);
        }
    } finally {
        busy.value = false;
    }
}
</script>

<template>
<ConfirmDialog
    :open="!!request"
    :title="request?.title || ''"
    :confirm-label="confirmLabel"
    :tone="request?.tone || 'danger'"
    :require-text="request?.requireText || ''"
    :busy="busy"
    :error="error"
    @confirm="confirm"
    @cancel="emit('close')"
>
    <template v-if="request">
        <p v-for="(p, i) in request.paragraphs" :key="i">{{ p }}</p>
        <label v-if="request.option" class="ne-check ad-option">
            <input type="checkbox" v-model="optionValue" />
            {{ request.option.label }}
        </label>
    </template>
</ConfirmDialog>
</template>

<style scoped>
.ad-option { margin-top: var(--space-2); align-items: flex-start; }
.ad-option input { margin-top: 0.3em; }
</style>

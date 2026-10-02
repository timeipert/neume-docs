<script setup>
import { ref, onMounted } from 'vue';
import Panel from '../ui/Panel.vue';
import ActionDialog from './ActionDialog.vue';
import { useWorkspaceManagement } from '../../composables/useWorkspaceManagement';
import { useToast } from '../../composables/useToast';

/**
 * Copies of the workspace kept in this browser. Made automatically before
 * anything is deleted, overwritten or imported, and on demand here.
 */
const mgmt = useWorkspaceManagement();
const { points } = mgmt;
const toast = useToast();

const name = ref('');
const request = ref(null);
const saving = ref(false);

onMounted(() => mgmt.refreshPoints());

async function save() {
    if (saving.value) return;
    saving.value = true;
    try {
        await mgmt.createRestorePoint(name.value.trim() || 'Saved by hand');
        name.value = '';
        toast.show('Restore point saved.', { tone: 'success' });
    } catch (e) {
        toast.show(e.message, { tone: 'error' });
    } finally {
        saving.value = false;
    }
}

function askRestore(point) {
    request.value = {
        title: 'Restore this point?',
        paragraphs: [
            `Your work goes back to how it was on ${when(point)}: “${point.label}”.`,
            'What you have now is kept as a new restore point first, so you can come back to it.'
        ],
        confirmLabel: 'Restore',
        tone: 'primary',
        run: (options) => mgmt.restore(point.id, options),
        success: `Restored “${point.label}”.`
    };
}

async function remove(point) {
    await mgmt.removePoint(point.id);
}

function when(point) {
    return new Date(point.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function size(point) {
    const kb = point.bytes / 1024;
    return kb < 1024 ? `${Math.max(1, Math.round(kb))} KB` : `${(kb / 1024).toFixed(1)} MB`;
}
</script>

<template>
<Panel id="restore" title="Restore points" description="Copies of your work kept in this browser. One is made automatically before anything is deleted, overwritten or imported. They hold your own work, not the loaded corpus, which you can load again from your files.">
    <div class="save-row">
        <input v-model="name" class="ne-input" placeholder="Name (optional)" aria-label="Name of the restore point" @keyup.enter="save" />
        <button class="ne-btn" :disabled="saving" @click="save">Save a restore point now</button>
    </div>

    <div v-if="!points.length" class="ne-empty">No restore points yet.</div>
    <table v-else class="ne-table">
        <thead><tr><th>When</th><th>What</th><th class="num">Size</th><th></th></tr></thead>
        <tbody>
            <tr v-for="p in points" :key="p.id">
                <td class="when">{{ when(p) }}</td>
                <td>
                    <strong>{{ p.label }}</strong> <span v-if="p.auto" class="ne-chip">automatic</span>
                    <span v-if="p.summary" class="summary">{{ p.summary }}</span>
                    <span v-else class="summary">No work in it</span>
                </td>
                <td class="num">{{ size(p) }}</td>
                <td class="actions">
                    <span class="btns">
                        <button class="ne-btn ne-btn--sm" @click="askRestore(p)">Restore…</button>
                        <button class="ne-btn ne-btn--sm ne-btn--ghost" :aria-label="`Delete restore point ${p.label}`" title="Delete this restore point" @click="remove(p)">✕</button>
                    </span>
                </td>
            </tr>
        </tbody>
    </table>
    <ActionDialog :request="request" @close="request = null" />
</Panel>
</template>

<style scoped>
.save-row { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-bottom: var(--space-4); }
.save-row .ne-input { flex: 1 1 14rem; max-width: 22rem; }
.when { white-space: nowrap; color: var(--color-text-muted); }
.summary { display: block; font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px; }
.btns { display: inline-flex; gap: var(--space-1); }
</style>

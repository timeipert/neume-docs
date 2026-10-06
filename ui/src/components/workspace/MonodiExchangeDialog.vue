<script setup>
import { computed, ref } from 'vue';
import ModalDialog from '../ui/ModalDialog.vue';
import { useMonodiExchange } from '../../composables/useMonodiExchange';

/**
 * Shows what annotations from Monodi-Zero would add, per manuscript, before
 * anything changes. Mounted once, in App.vue; any page can put plans up for it
 * through useMonodiExchange().
 */
const ex = useMonodiExchange();
const busy = ref(false);

const open = computed(() => ex.pending.value.length > 0);
const addsSomething = computed(() => ex.pending.value.some(p => p.counts.regions || p.counts.items || p.counts.equivalents || p.iiifManifestUrl));

const noun = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function parts(plan) {
    const c = plan.counts;
    return [
        c.regions && noun(c.regions, 'line region'),
        c.items && noun(c.items, 'snippet'),
        c.equivalents && noun(c.equivalents, 'table row'),
        plan.iiifManifestUrl && 'the manifest address'
    ].filter(Boolean);
}

async function apply() {
    busy.value = true;
    try { await ex.apply(); } finally { busy.value = false; }
}
</script>

<template>
<ModalDialog :open="open" :title="ex.pendingTitle.value" width="38rem" :dismissable="!busy" @close="ex.dismiss()">
    <p class="intro">
        What your workspace does not have yet is added. What you already have is never changed.
        A restore point is kept first.
    </p>
    <ul class="plans">
        <li v-for="plan in ex.pending.value" :key="plan.source">
            <strong>{{ plan.source }}</strong>
            <span v-if="parts(plan).length"> — adds {{ parts(plan).join(', ') }}</span>
            <span v-else class="ne-muted"> — nothing new</span>
            <span v-if="plan.counts.alreadyHere" class="ne-muted"> ({{ noun(plan.counts.alreadyHere, 'line region') }} already here)</span>
            <ul v-if="plan.counts.unplaced.length" class="unplaced">
                <li v-for="u in plan.counts.unplaced.slice(0, 4)" :key="u.id">
                    <em>{{ u.name || u.id }}</em> was left out: {{ u.reason }}.
                </li>
                <li v-if="plan.counts.unplaced.length > 4">… and {{ plan.counts.unplaced.length - 4 }} more left out.</li>
            </ul>
        </li>
    </ul>
    <p v-if="ex.unmatched.value.length" class="ne-note ne-note--warn">
        Not in the loaded corpus, so skipped: {{ ex.unmatched.value.slice(0, 5).join(', ') }}{{ ex.unmatched.value.length > 5 ? ', …' : '' }}.
    </p>
    <template #footer>
        <button class="ne-btn" :disabled="busy" @click="ex.dismiss()">Cancel</button>
        <button class="ne-btn ne-btn--primary" :disabled="busy || !addsSomething" @click="apply">Add to my workspace</button>
    </template>
</ModalDialog>
</template>

<style scoped>
.intro { margin: 0 0 var(--space-3); font-size: 0.92rem; }
.plans { margin: 0; padding-left: var(--space-5); display: flex; flex-direction: column; gap: var(--space-2); font-size: 0.92rem; }
.unplaced { margin: var(--space-1) 0 0; padding-left: var(--space-4); font-size: 0.85rem; color: var(--color-text-muted); }
</style>

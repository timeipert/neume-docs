<script setup>
import { computed } from 'vue';
import { MMMO_NAME } from '../../composables/useMmmo';

/**
 * One catalogue entry offered for a manuscript: what it is, why it was suggested,
 * and (slot) what can be done with it.
 */
const props = defineProps({
    record: { type: Object, required: true },
    reasons: { type: Array, default: () => [] },
    confidence: { type: String, default: '' } // 'high' | 'likely' | 'possible'
});

const place = computed(() => [props.record.city, props.record.archive].filter(Boolean).join(', '));
const date = computed(() => props.record.years || (props.record.centuries || []).join(', '));
const kind = computed(() => (props.record.types || []).slice(0, 2).join(', '));
</script>

<template>
<div class="cand">
    <div class="cand-main">
        <strong class="siglum">{{ record.siglum }}</strong>
        <span v-if="confidence" class="conf" :class="confidence">{{ confidence }}</span>
        <span class="line">{{ [place, date, kind].filter(Boolean).join(' · ') }}</span>
        <span v-if="reasons.length" class="why">{{ reasons.join(', ') }}</span>
        <span class="addr">
            <template v-if="record.manifest"><a :href="record.manifest" target="_blank" rel="noopener" :title="record.manifest">manifest ↗</a></template>
            <span v-else class="none">no manifest in {{ MMMO_NAME }}</span>
            <a v-for="(l, i) in (record.links || []).slice(0, 2)" :key="l" :href="l" target="_blank" rel="noopener">{{ i === 0 ? 'digital copy' : 'more' }} ↗</a>
            <a :href="`https://musmed.eu/source/${record.id}`" target="_blank" rel="noopener">MMMO ↗</a>
        </span>
    </div>
    <div class="cand-actions"><slot /></div>
</div>
</template>

<style scoped>
.cand { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.cand-main { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px var(--space-3); min-width: 0; flex: 1 1 22rem; }
.siglum { font-size: 0.95rem; }
.line { color: var(--color-text-muted); font-size: 0.85rem; }
.why { flex-basis: 100%; font-size: 0.78rem; color: var(--color-text-muted); }
.addr { flex-basis: 100%; display: flex; gap: var(--space-3); font-size: 0.78rem; flex-wrap: wrap; }
.none { color: var(--color-text-light); }
.conf { font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; padding: 1px 7px; border-radius: 999px; }
.conf.high { background: var(--color-success-light); color: var(--color-success-dark); }
.conf.likely { background: var(--color-primary-light); color: var(--color-primary-dark); }
.conf.possible { background: var(--color-warning-light); color: var(--color-warning-dark); }
.cand-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
</style>

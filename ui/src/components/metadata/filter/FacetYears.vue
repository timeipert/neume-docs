<script setup>
import { computed } from 'vue';
import DateRangeTimeline from '../../DateRangeTimeline.vue';
import { centuryBuckets, yearInfo } from '../../../utils/manuscriptFilter';
import { centuryLabel } from '../../../utils/sourceMeta';

/**
 * A date range: every manuscript is drawn at its own dating, so the reader sees where the material
 * lies before choosing a window. A window keeps what overlaps it (or lies fully within it).
 */
const props = defineProps({
    rule: { type: Object, default: null },
    rows: { type: Array, required: true },
    textOf: { type: Function, required: true }
});
const emit = defineEmits(['change']);

const info = computed(() => yearInfo(props.rows, props.textOf));
const buckets = computed(() => centuryBuckets(info.value.points));

const from = computed(() => (props.rule && props.rule.from !== null ? props.rule.from : info.value.min));
const to = computed(() => (props.rule && props.rule.to !== null ? props.rule.to : info.value.max));

const base = () => ({ kind: 'years', from: info.value.min, to: info.value.max, within: false, undated: false, not: false, ...(props.rule || {}) });
const set = (patch) => emit('change', { ...base(), ...patch });

function setFrom(v) { set({ from: v, to: to.value }); }
function setTo(v) { set({ from: from.value, to: v }); }

function typed(which, event) {
    const raw = event.target.value.trim();
    const n = raw === '' ? null : parseInt(raw, 10);
    if (raw !== '' && !Number.isFinite(n)) return;
    const cur = props.rule || { from: null, to: null };
    const next = { from: which === 'from' ? n : cur.from, to: which === 'to' ? n : cur.to };
    if (next.from === null && next.to === null) emit('change', null);
    else emit('change', { ...base(), ...next });
}

const isCentury = (b) => props.rule && props.rule.from === b.from && props.rule.to === b.to;
function pickCentury(b) {
    if (isCentury(b)) emit('change', null);
    else set({ from: b.from, to: b.to });
}

const undatedCount = computed(() => info.value.empty + info.value.unreadableCount);
</script>

<template>
<div class="years">
    <p v-if="!info.known" class="none">None of the {{ rows.length }} values reads as a date<template v-if="info.unreadableCount">, for example “{{ info.unreadable[0] }}”</template>.</p>
    <template v-else>
        <DateRangeTimeline :from="from" :to="to" :min="info.min" :max="info.max" :points="info.points" @update:from="setFrom" @update:to="setTo" />

        <div v-if="buckets.length" class="centuries" role="group" aria-label="Centuries">
            <button v-for="b in buckets" :key="b.century" type="button" class="ne-chip" :class="{ on: isCentury(b) }" :aria-pressed="!!isCentury(b)" @click="pickCentury(b)">
                {{ centuryLabel(b.century) }} <span class="n">{{ b.count }}</span>
            </button>
        </div>

        <div class="typed">
            <label>from <input class="ne-input" inputmode="numeric" :value="rule && rule.from !== null ? rule.from : ''" placeholder="open" @change="typed('from', $event)" /></label>
            <label>to <input class="ne-input" inputmode="numeric" :value="rule && rule.to !== null ? rule.to : ''" placeholder="open" @change="typed('to', $event)" /></label>
        </div>

        <template v-if="rule">
            <label class="ne-check">
                <input type="checkbox" :checked="rule.within" @change="set({ within: $event.target.checked })" />
                Only datings fully inside the range
            </label>
            <label v-if="undatedCount" class="ne-check" :title="info.unreadable.slice(0, 8).join(' · ')">
                <input type="checkbox" :checked="rule.undated" @change="set({ undated: $event.target.checked })" />
                Include the {{ undatedCount }} without a dating that can be read
            </label>
            <label class="ne-check">
                <input type="checkbox" :checked="rule.not" @change="set({ not: $event.target.checked })" />
                Everything outside the range
            </label>
        </template>
        <p v-else-if="undatedCount" class="hint" :title="info.unreadable.slice(0, 8).join(' · ')">
            {{ undatedCount }} manuscript{{ undatedCount === 1 ? ' has' : 's have' }} no dating that can be read; they are left out once a range is set.
        </p>
    </template>
</div>
</template>

<style scoped>
.years { display: flex; flex-direction: column; gap: var(--space-2); }
.none, .hint { margin: 0; font-size: 0.82rem; color: var(--color-text-muted); }
.centuries { display: flex; flex-wrap: wrap; gap: 4px; }
.centuries .ne-chip { cursor: pointer; border: 1px solid var(--color-border); background: var(--color-surface); }
.centuries .ne-chip.on { background: var(--color-primary-light); border-color: var(--color-primary-muted); color: var(--color-primary-dark); font-weight: 700; }
.n { margin-left: 3px; color: var(--color-text-muted); font-variant-numeric: tabular-nums; }
.typed { display: flex; gap: var(--space-3); }
.typed label { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--color-text-muted); flex: 1; }
.typed .ne-input { width: 100%; min-width: 0; padding: 0.25em 0.5em; font-size: 0.84rem; }
.ne-check { font-size: 0.82rem; }
</style>

<script setup>
import { computed, ref } from 'vue';
import { fold, valueCounts } from '../../../utils/manuscriptFilter';

/**
 * Pick values: every value the column holds, with how many manuscripts have it, as it stands
 * with the other filters. Ticking several keeps manuscripts with any of them.
 */
const props = defineProps({
    rule: { type: Object, default: null },
    /** the manuscripts to count over */
    rows: { type: Array, required: true },
    /** the text of this column's cell for a manuscript */
    textOf: { type: Function, required: true }
});
const emit = defineEmits(['change']);

const LIMIT = 12;
const find = ref('');
const showAll = ref(false);

const counts = computed(() => valueCounts(props.rows, props.textOf));

const picked = computed(() => new Set(((props.rule && props.rule.values) || []).map(fold)));
const wantsEmpty = computed(() => !!(props.rule && props.rule.empty));

/** What is listed: the values in use, and any ticked value the other filters leave no manuscript for. */
const items = computed(() => {
    const list = counts.value.items.map(i => ({ ...i, picked: picked.value.has(i.key) }));
    const known = new Set(list.map(i => i.key));
    for (const v of (props.rule && props.rule.values) || []) if (!known.has(fold(v))) list.push({ key: fold(v), label: v, count: 0, picked: true });
    return list;
});

const shown = computed(() => {
    const q = fold(find.value);
    const matching = q ? items.value.filter(i => i.key.includes(q)) : items.value;
    // ticked values stay on top, so a long list does not hide what is chosen
    const sorted = [...matching.filter(i => i.picked), ...matching.filter(i => !i.picked)];
    return showAll.value || q ? sorted : sorted.slice(0, LIMIT);
});
const hidden = computed(() => (find.value ? 0 : items.value.length - shown.value.length));
const biggest = computed(() => Math.max(1, ...items.value.map(i => i.count), counts.value.empty));

function emitValues(values, empty) {
    emit('change', values.length || empty ? { kind: 'values', values, empty, not: !!(props.rule && props.rule.not) } : null);
}

function toggle(item) {
    const current = (props.rule && props.rule.values) || [];
    const values = item.picked ? current.filter(v => fold(v) !== item.key) : [...current, item.label];
    emitValues(values, wantsEmpty.value);
}

function toggleEmpty() {
    emitValues((props.rule && props.rule.values) || [], !wantsEmpty.value);
}

function invert(on) {
    if (props.rule) emit('change', { ...props.rule, not: on });
}
</script>

<template>
<div class="values">
    <input v-if="items.length > LIMIT" v-model="find" type="search" class="ne-input find" placeholder="Find a value…" aria-label="Find a value" />

    <ul class="list">
        <li v-for="item in shown" :key="item.key">
            <label class="row" :class="{ zero: !item.count }">
                <input type="checkbox" :checked="item.picked" @change="toggle(item)" />
                <span class="name">{{ item.label }}</span>
                <span class="bar" :style="{ width: (item.count / biggest * 100) + '%' }"></span>
                <span class="n">{{ item.count }}</span>
            </label>
        </li>
        <li v-if="counts.empty || wantsEmpty">
            <label class="row empty" :class="{ zero: !counts.empty }">
                <input type="checkbox" :checked="wantsEmpty" @change="toggleEmpty" />
                <span class="name">(empty)</span>
                <span class="bar" :style="{ width: (counts.empty / biggest * 100) + '%' }"></span>
                <span class="n">{{ counts.empty }}</span>
            </label>
        </li>
        <li v-if="!shown.length && !counts.empty" class="none">{{ find ? 'No value contains that.' : 'This column is empty.' }}</li>
    </ul>

    <button v-if="hidden > 0" type="button" class="more" @click="showAll = true">Show the other {{ hidden }}</button>
    <button v-else-if="showAll && items.length > LIMIT && !find" type="button" class="more" @click="showAll = false">Show fewer</button>

    <label v-if="rule" class="ne-check invert">
        <input type="checkbox" :checked="rule.not" @change="invert($event.target.checked)" />
        Everything except these
    </label>
</div>
</template>

<style scoped>
.values { display: flex; flex-direction: column; gap: var(--space-2); }
.find { font-size: 0.84rem; padding: 0.3em 0.6em; }
.list { list-style: none; margin: 0; padding: 0; max-height: 15rem; overflow-y: auto; }
.row { position: relative; display: flex; align-items: center; gap: var(--space-2); padding: 3px 4px; border-radius: var(--radius-sm); font-size: 0.84rem; cursor: pointer; overflow: hidden; }
.row:hover { background: var(--color-surface-muted); }
.row.zero { color: var(--color-text-light); }
.row.empty .name { font-style: italic; }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; z-index: 1; }
.bar { position: absolute; left: 0; top: 2px; bottom: 2px; background: var(--color-primary-light); opacity: 0.7; border-radius: 3px; z-index: 0; pointer-events: none; }
.n { z-index: 1; font-size: 0.76rem; font-variant-numeric: tabular-nums; color: var(--color-text-muted); min-width: 1.6em; text-align: right; }
.none { padding: 4px; font-size: 0.82rem; color: var(--color-text-muted); font-style: italic; }
.more { align-self: flex-start; border: none; background: none; padding: 0; color: var(--color-primary); font-size: 0.8rem; cursor: pointer; }
.more:hover { text-decoration: underline; }
.invert { font-size: 0.82rem; }
</style>

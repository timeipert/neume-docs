<script setup>
import { computed } from 'vue';

/**
 * The standard table as a row of segments, one per column, in the order of the
 * table: neume shapes, then the special signs, then clef and custos. Filled
 * segments are done. In its full size every segment is a button that jumps to
 * its column; in the mini size it is a quiet indicator for lists.
 */
const props = defineProps({
    /** from standardCellStates() */
    cells: { type: Array, required: true },
    size: { type: String, default: 'md' } // 'md' | 'mini'
});
const emit = defineEmits(['select']);

const sections = computed(() => {
    const out = [];
    for (const cell of props.cells) {
        const key = cell.group === 'direction' ? 'shapes' : (cell.slot ? 'signs' : 'pseudo');
        const last = out[out.length - 1];
        if (last && last.key === key) last.cells.push(cell);
        else out.push({ key, cells: [cell] });
    }
    return out;
});

const done = computed(() => props.cells.filter(c => c.filled).length);

function fill(cell) {
    return cell.slot ? `${Math.round((cell.n / cell.max) * 100)}%` : (cell.filled ? '100%' : '0%');
}

function title(cell) {
    if (cell.slot) return `${cell.header}: ${cell.n} of ${cell.max} constellations chosen`;
    return `${cell.header}: ${cell.filled ? 'chosen' : 'nothing chosen yet'}`;
}
</script>

<template>
<div class="progress" :class="`progress--${size}`" role="group" :aria-label="`Standard table: ${done} of ${cells.length} columns filled`">
    <div v-for="section in sections" :key="section.key" class="section">
        <component
            :is="size === 'md' ? 'button' : 'span'"
            v-for="cell in section.cells"
            :key="cell.key"
            class="seg"
            :class="{ filled: cell.filled, full: cell.filled && (!cell.slot || cell.n >= cell.max) }"
            :title="title(cell)"
            :type="size === 'md' ? 'button' : undefined"
            @click="size === 'md' && emit('select', cell.key)"
        >
            <span class="bar" :style="{ '--fill': fill(cell) }"></span>
            <span v-if="size === 'md'" class="label">{{ cell.header }}</span>
        </component>
    </div>
</div>
</template>

<style scoped>
.progress { display: flex; flex-wrap: wrap; gap: 6px 14px; }
.progress--md { max-width: 100%; }
@media (max-width: 720px) {
    .progress--md { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; }
    .progress--md .section { flex: 0 0 auto; }
}
.section { display: flex; gap: 4px; }

.seg { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 0; border: none; background: none; min-width: 0; }
.bar { position: relative; display: block; border-radius: 4px; background: var(--color-surface); box-shadow: inset 0 0 0 1px var(--color-border-hover); overflow: hidden; }
.bar::after { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: var(--fill); background: var(--color-primary-muted); transition: width 0.25s ease; }
.seg.filled .bar { box-shadow: inset 0 0 0 1px var(--color-primary-muted); }
.seg.full .bar::after { background: var(--color-primary); }

.progress--md .bar { width: 38px; height: 10px; }
.progress--md .label { font-family: ui-monospace, Menlo, monospace; font-size: 0.68rem; color: var(--color-text-muted); max-width: 38px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.progress--md .seg { cursor: pointer; border-radius: var(--radius-sm); padding: 2px 0; }
.progress--md .seg:hover .label { color: var(--color-primary-dark); }
.progress--md .seg:hover { background: var(--color-primary-light); }

.progress--mini { gap: 4px 8px; }
.progress--mini .section { gap: 2px; }
.progress--mini .bar { width: 9px; height: 9px; border-radius: 2px; }
</style>

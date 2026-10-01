<script setup>
import { computed } from 'vue';
import PatternDisplay from '../PatternDisplay.vue';
import PatternCode from '../PatternCode.vue';
import { CLEF_CODE, CUSTOS_CODE, signatureOf } from '../../utils/neumeTable';

/**
 * One column of the neume table, for one manuscript: what it is, which
 * patterns the manuscript has chosen for it, and a way to choose more.
 */
const props = defineProps({
    column: { type: Object, required: true },
    rows: { type: Array, default: () => [] },
    glyphs: { type: Object, required: true },
    /** frequency in the CM of the column's own pattern (direction / signature) */
    cmCount: { type: Number, default: 0 },
    /** how often each code occurs in this manuscript */
    counts: { type: Object, default: () => ({}) },
    max: { type: Number, default: 3 },
    /** a pattern added from the expanded documentation rather than the standard table */
    added: { type: Boolean, default: false }
});

const emit = defineEmits(['pick', 'remove', 'id', 'toggle-pseudo']);

const isPseudo = computed(() => props.column.group === 'clef' || props.column.group === 'custos');
const pseudoCode = computed(() => (props.column.group === 'clef' ? CLEF_CODE : CUSTOS_CODE));
const signatures = computed(() => new Set(props.rows.map(r => signatureOf(r.pattern))).size);

const fmt = (n) => n.toLocaleString('en-US');
</script>

<template>
<article class="col-card" :class="{ filled: rows.length > 0, added, pseudo: isPseudo }" :data-column="column.key">
    <header>
        <div class="glyph" aria-hidden="true">
            <PatternDisplay v-if="column.pattern" :pattern="column.pattern" :glyphs="glyphs" />
            <span v-else class="big-header">{{ column.header }}</span>
        </div>
        <div class="titles">
            <strong class="code">{{ column.header }}</strong>
            <span v-if="column.slot" class="sub">{{ column.label }} · {{ signatures }}/{{ max }}</span>
            <span v-else-if="column.pattern && cmCount" class="sub">{{ fmt(cmCount) }}× in the CM</span>
            <span v-else-if="isPseudo" class="sub">{{ column.label }}</span>
        </div>
    </header>

    <ul v-if="rows.length" class="chosen">
        <li v-for="row in rows" :key="row.pattern">
            <div class="chosen-glyph"><PatternDisplay :pattern="row.pattern" :glyphs="glyphs" /></div>
            <div class="chosen-body">
                <PatternCode v-if="!isPseudo" :pattern="row.pattern" />
                <span v-else class="pseudo-label">documented</span>
                <span v-if="counts[row.pattern]" class="occ" :title="`${counts[row.pattern]} occurrences in this manuscript`">{{ fmt(counts[row.pattern]) }}×</span>
                <input
                    class="ref-id"
                    :value="row.customId"
                    placeholder="Ref ID"
                    :aria-label="`Reference ID for ${row.pattern}`"
                    @change="emit('id', row.pattern, $event.target.value)"
                />
            </div>
            <button class="x" :aria-label="`Remove ${row.pattern} from the table`" title="Remove from the table" @click="emit('remove', row.pattern)">✕</button>
        </li>
    </ul>
    <p v-else class="none">{{ isPseudo ? 'Not documented' : 'Nothing chosen' }}</p>

    <footer>
        <button v-if="isPseudo" class="pick" @click="emit('toggle-pseudo', pseudoCode)">
            {{ rows.length ? 'Not in this manuscript' : `Document ${column.label.toLowerCase()}` }}
        </button>
        <button v-else-if="!added" class="pick" @click="emit('pick', column)">
            {{ rows.length ? 'Change…' : 'Choose from the library…' }}
        </button>
    </footer>
</article>
</template>

<style scoped>
.col-card {
    display: flex; flex-direction: column; gap: var(--space-2);
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius-lg); padding: var(--space-3); min-width: 0;
}
.col-card.filled { border-color: var(--color-primary-muted, #93c5fd); box-shadow: var(--shadow-sm); }
.col-card.added { border-style: dashed; border-color: var(--color-accent); }
header { display: flex; align-items: center; gap: var(--space-3); }
.glyph { flex: 0 0 56px; height: 44px; display: flex; align-items: center; justify-content: center; background: var(--color-surface-muted); border-radius: var(--radius-md); overflow: hidden; }
.big-header { font-weight: 700; color: var(--color-text-muted); font-size: 0.8rem; }
.titles { display: flex; flex-direction: column; min-width: 0; }
.code { font-family: ui-monospace, Menlo, monospace; font-size: 1.05rem; overflow-wrap: anywhere; }
.sub { color: var(--color-text-muted); font-size: 0.78rem; }

.chosen { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.chosen li { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2); background: var(--color-bg); border-radius: var(--radius-md); }
.chosen-glyph { flex: 0 0 44px; display: flex; justify-content: center; }
.chosen-body { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 2px var(--space-2); }
.pseudo-label { font-size: 0.8rem; color: var(--color-success); font-weight: 600; }
.occ { font-size: 0.72rem; color: var(--color-text-muted); background: var(--color-surface-muted); padding: 0 6px; border-radius: 999px; }
.ref-id { width: 100%; box-sizing: border-box; font-size: 0.78rem; padding: 2px 6px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); }
.x { padding: 0 6px; line-height: 1.4; border-color: transparent; background: transparent; color: var(--color-text-light); }
.x:hover { color: var(--color-danger); background: var(--color-danger-light); }

.none { margin: 0; color: var(--color-text-light); font-size: 0.85rem; font-style: italic; }
footer { margin-top: auto; }
.pick { width: 100%; font-size: 0.85rem; padding: 0.35em 0.6em; color: var(--color-primary-dark); }
.pick:hover { background: var(--color-primary-light); border-color: var(--color-primary); }
</style>

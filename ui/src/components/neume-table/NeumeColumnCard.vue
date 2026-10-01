<script setup>
import { computed, ref, nextTick } from 'vue';
import PatternDisplay from '../PatternDisplay.vue';
import PatternCode from '../PatternCode.vue';
import { CLEF_CODE, CUSTOS_CODE, signatureOf } from '../../utils/neumeTable';

/**
 * One cell of the neume table for one manuscript: the column it belongs to, the
 * patterns the manuscript has chosen for it, and a way to choose or change them.
 * The glyph area is the button — empty, it invites a choice; filled, it shows
 * what was chosen.
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
    added: { type: Boolean, default: false },
    /** the cell the page has just jumped to */
    highlighted: { type: Boolean, default: false }
});

const emit = defineEmits(['pick', 'remove', 'id', 'toggle-pseudo']);

const isPseudo = computed(() => props.column.group === 'clef' || props.column.group === 'custos');
/** Only a direction column or a special-sign column has a library to choose from. */
const canPick = computed(() => !props.added && (props.column.slot || props.column.group === 'direction'));
const pseudoCode = computed(() => (props.column.group === 'clef' ? CLEF_CODE : CUSTOS_CODE));
const signatures = computed(() => new Set(props.rows.map(r => signatureOf(r.pattern))).size);
const filled = computed(() => props.rows.length > 0);

const interactive = computed(() => canPick.value || isPseudo.value);

function activate() {
    if (isPseudo.value) emit('toggle-pseudo', pseudoCode.value);
    else if (canPick.value) emit('pick', props.column);
}

const actionLabel = computed(() => {
    if (isPseudo.value) return filled.value ? `Remove ${props.column.label.toLowerCase()}` : `Document ${props.column.label.toLowerCase()}`;
    return filled.value ? `Change ${props.column.header}` : `Choose for ${props.column.header}`;
});

/** 71765 -> "71.8k": the exact figure is in the tooltip and the library. */
function compact(n) {
    if (n < 1000) return String(n);
    if (n < 100000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    if (n < 1000000) return `${Math.round(n / 1000)}k`;
    return `${(n / 1000000).toFixed(1)}M`;
}
const fmt = (n) => n.toLocaleString('en-US');

// Inline editing of a Ref ID
const editing = ref('');
const editInput = ref(null);

async function startEdit(code) {
    editing.value = code;
    await nextTick();
    const el = Array.isArray(editInput.value) ? editInput.value[0] : editInput.value;
    if (el) el.focus();
}

function commit(code, value) {
    if (editing.value !== code) return;
    editing.value = '';
    emit('id', code, value);
}
</script>

<template>
<article
    class="cell"
    :class="{ filled, added, pseudo: isPseudo, highlighted, interactive }"
    :data-column="column.key"
>
    <header>
        <strong class="code" :title="column.label !== column.header ? column.label : undefined">{{ column.header }}</strong>
        <span v-if="column.slot" class="count" :class="{ full: signatures >= max }" :title="`${signatures} of ${max} constellations chosen`">{{ signatures }}/{{ max }}</span>
        <span v-else-if="cmCount" class="count" :title="`${fmt(cmCount)}× in the Corpus Monodicum`">{{ compact(cmCount) }}</span>
    </header>

    <component
        :is="interactive ? 'button' : 'div'"
        class="face"
        :type="interactive ? 'button' : undefined"
        :aria-label="interactive ? actionLabel : undefined"
        :title="interactive ? actionLabel : undefined"
        @click="interactive && activate()"
    >
        <template v-if="filled">
            <span v-for="row in rows" :key="row.pattern" class="glyph">
                <PatternDisplay :pattern="row.pattern" :glyphs="glyphs" :scale="rows.length > 1 ? 1.15 : 1.5" />
            </span>
            <span v-if="isPseudo" class="documented">✓ documented</span>
        </template>
        <template v-else>
            <span v-if="column.pattern" class="ghost" aria-hidden="true">
                <PatternDisplay :pattern="column.pattern" :glyphs="glyphs" :scale="1.3" />
            </span>
            <span v-else class="ghost ghost--letter" aria-hidden="true">{{ column.header }}</span>
            <span v-if="interactive" class="invite">{{ isPseudo ? 'Document' : 'Choose' }}</span>
            <span v-else class="invite invite--quiet">—</span>
        </template>
    </component>

    <ul v-if="filled && !isPseudo" class="items">
        <li v-for="row in rows" :key="row.pattern">
            <div class="line">
                <PatternCode :pattern="row.pattern" />
                <span v-if="counts[row.pattern]" class="occ" :title="`${fmt(counts[row.pattern])} occurrences in this manuscript`">{{ compact(counts[row.pattern]) }}×</span>
                <button class="x" :aria-label="`Remove ${row.pattern} from the table`" title="Remove from the table" @click="emit('remove', row.pattern)">✕</button>
            </div>
            <input
                v-if="editing === row.pattern"
                ref="editInput"
                class="id-input"
                :value="row.customId"
                placeholder="Ref ID"
                :aria-label="`Reference ID for ${row.pattern}`"
                @keydown.enter.prevent="commit(row.pattern, $event.target.value)"
                @keydown.esc.prevent="editing = ''"
                @blur="commit(row.pattern, $event.target.value)"
            />
            <button v-else class="id-chip" :class="{ set: row.customId }" :title="row.customId ? 'Edit the reference ID' : 'Add a reference ID'" @click="startEdit(row.pattern)">
                {{ row.customId ? `ID ${row.customId}` : '+ ID' }}
            </button>
        </li>
    </ul>
    <button v-else-if="filled && isPseudo" class="x x--solo" :aria-label="`Remove ${column.label}`" title="Remove" @click="emit('toggle-pseudo', pseudoCode)">✕</button>

    <footer v-if="column.slot && filled && signatures < max">
        <button class="add" @click="emit('pick', column)">+ Add a constellation</button>
    </footer>
</article>
</template>

<style scoped>
.cell {
    position: relative; display: flex; flex-direction: column; min-width: 0; padding-bottom: var(--space-3);
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius-lg); overflow: hidden;
    transition: border-color 0.15s, box-shadow 0.15s;
}
.cell.filled { border-color: var(--color-primary-muted); box-shadow: var(--shadow-sm); }
.cell.added { border-style: dashed; border-color: var(--color-accent); }
.cell.highlighted { animation: pulse 1.4s ease-out; }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.55); } 100% { box-shadow: 0 0 0 12px rgba(59, 130, 246, 0); } }

header { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-2); padding: var(--space-2) var(--space-3) 0; }
.code { font-family: ui-monospace, Menlo, monospace; font-size: 1.02rem; overflow-wrap: anywhere; }
.count { font-size: 0.72rem; color: var(--color-text-muted); background: var(--color-surface-muted); padding: 0 6px; border-radius: 999px; white-space: nowrap; }
.count.full { color: var(--color-success-dark); background: var(--color-success-light); }

.face {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: center; align-content: center;
    gap: var(--space-2) var(--space-3); min-height: 84px; margin: var(--space-2) var(--space-2) 0;
    padding: var(--space-2); border: none; border-radius: var(--radius-md);
    background: var(--color-surface-muted); color: inherit; font: inherit; text-align: center; position: relative;
}
button.face { cursor: pointer; }
button.face:hover { background: var(--color-primary-light); }
button.face:focus-visible { box-shadow: var(--ring); }
.cell.filled .face { background: #f8fafc; }
.cell.filled button.face:hover { background: var(--color-primary-light); }
.glyph { display: inline-flex; }
.ghost { display: inline-flex; opacity: 0.22; filter: grayscale(1); }
.ghost--letter { font-size: 1.9rem; font-weight: 700; opacity: 0.2; filter: none; }
.invite { position: absolute; left: 0; right: 0; bottom: 5px; font-size: 0.72rem; font-weight: 600; color: var(--color-primary); opacity: 0; transition: opacity 0.15s; }
button.face:hover .invite, button.face:focus-visible .invite { opacity: 1; }
.invite--quiet { color: var(--color-text-light); opacity: 1; }
.documented { width: 100%; font-size: 0.78rem; font-weight: 600; color: var(--color-success-dark); }

.items { list-style: none; margin: 0; padding: var(--space-2) var(--space-3) 0; display: flex; flex-direction: column; gap: var(--space-2); }
.items li { display: flex; flex-direction: column; gap: 3px; }
.line { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.line :deep(.pattern-code) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.occ { font-size: 0.7rem; color: var(--color-text-muted); }
.x { padding: 0 5px; line-height: 1.5; border-color: transparent; background: transparent; color: var(--color-text-light); font-size: 0.8rem; }
.x:hover { color: var(--color-danger); background: var(--color-danger-light); }
.x--solo { position: absolute; top: 6px; right: 6px; }

.id-chip { align-self: flex-start; opacity: 0; transition: opacity 0.12s; border: 1px dashed var(--color-border-hover); background: transparent; color: var(--color-text-light); font-size: 0.7rem; padding: 0 7px; border-radius: 999px; line-height: 1.6; }
.cell:hover .id-chip, .cell:focus-within .id-chip, .id-chip.set { opacity: 1; }
.id-chip.set { border-style: solid; border-color: var(--color-primary-muted); color: var(--color-primary-dark); background: var(--color-primary-light); font-weight: 600; }
.id-chip:hover { border-color: var(--color-primary); color: var(--color-primary-dark); }
.id-input { width: 100%; box-sizing: border-box; font-size: 0.78rem; padding: 2px 6px; border: 1px solid var(--color-primary); border-radius: var(--radius-sm); }

footer { padding: var(--space-2) var(--space-3) 0; }
.add { width: 100%; font-size: 0.78rem; padding: 0.25em 0.5em; border-style: dashed; color: var(--color-primary-dark); background: transparent; }
.add:hover { background: var(--color-primary-light); border-color: var(--color-primary); }
</style>

<script setup>
import { computed, nextTick, ref } from 'vue';
import { RouterLink } from 'vue-router';
import PatternDisplay from '../PatternDisplay.vue';
import PatternCode from '../PatternCode.vue';
import { CLEF_CODE, CUSTOS_CODE } from '../../utils/neumeTable';

/**
 * The table of a project: two rows of headers — the category (a movement or a
 * special sign) over the codes that belong to it — and under them what is known
 * about each code. One component for the three ways it is used:
 *
 *   select   choosing which codes are columns: a check box in every header, a way to
 *            add a variant, and the snippets that already exist, so nothing is chosen blind
 *   fill     the chosen columns: every cell is where a snippet is added or seen
 *   matrix   one row per project, for comparing manuscripts: every cell shows what that
 *            project has for the code, and opens it
 *
 * The code is what matters, so it is what the header says first. The table only
 * draws; choosing, opening a cell, adding a variant and removing a column are events.
 */
const props = defineProps({
    /** [{ key, label, title, group, columns: [{ code, variantOf?, variantLabel? }], total? }] */
    groups: { type: Array, required: true },
    mode: { type: String, default: 'fill' }, // 'select' | 'fill' | 'matrix'
    selected: { type: Object, default: () => new Set() },
    /** code -> snippets of this project */
    snippets: { type: Object, required: true },
    /** code -> { count }; null when there is no transcription to count in */
    occurrences: { type: Object, default: null },
    glyphs: { type: Object, required: true },
    /** codes added beyond the standard table: they can be taken out again */
    removable: { type: Object, default: () => new Set() },
    /** the cell whose workbench is open */
    active: { type: String, default: '' },
    /** categories drawn in full while choosing */
    expanded: { type: Object, default: () => new Set() },
    emptyText: { type: String, default: 'Nothing here yet.' },
    /** matrix: [{ id, name, sub, to, snippets: Map, has: Set<string>, active }] */
    rows: { type: Array, default: () => [] }
});

const emit = defineEmits(['toggle', 'open', 'remove', 'expand', 'variant', 'open-cell']);

const select = computed(() => props.mode === 'select');
const matrix = computed(() => props.mode === 'matrix');
const isPseudo = (code) => code === CLEF_CODE || code === CUSTOS_CODE;
const pseudoLabel = (code) => (code === CLEF_CODE ? 'Clef' : 'Custos');
const snippetsOf = (code) => props.snippets.get(code) || [];
const occurrencesOf = (code) => (props.occurrences && props.occurrences.get(code)) || null;

const columnCount = computed(() => props.groups.reduce((n, g) => n + g.columns.length, 0));
const mostInTranscription = computed(() => {
    let max = 0;
    if (props.occurrences) for (const o of props.occurrences.values()) if (o.count > max) max = o.count;
    return max;
});
const bar = (code) => {
    const o = occurrencesOf(code);
    return o && mostInTranscription.value ? `${Math.max(6, Math.round((o.count / mostInTranscription.value) * 100))}%` : '0%';
};

/** 71765 -> "71.8k": the exact figure is in the tooltip. */
function compact(n) {
    if (!n) return '–';
    if (n < 1000) return String(n);
    if (n < 100000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    return `${Math.round(n / 1000)}k`;
}
const fmt = (n) => n.toLocaleString('en-US');

const chosenIn = (group) => group.columns.filter(c => props.selected.has(c.code)).length;
const kindOf = (group) => (group.group === 'direction' ? 'shape' : 'other');

/**
 * A check box changes itself before anyone has said yes. When the choice is refused
 * (a fourth constellation) nothing the table is given changes, so it would stay
 * ticked: put it back to what the table was told once the answer is in.
 */
function onToggle(event, code) {
    const box = event.target;
    emit('toggle', code);
    nextTick(() => { box.checked = props.selected.has(code); });
}

// Scroll a column into view and flash it.
const root = ref(null);
const flash = ref('');
let flashTimer = null;

async function reveal(code) {
    await nextTick();
    const el = root.value && root.value.querySelector(`[data-code="${CSS.escape(code)}"]`);
    if (!el) return false;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    flash.value = code;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flash.value = ''; }, 1600);
    return true;
}
defineExpose({ reveal });
</script>

<template>
<div ref="root" class="pt-scroll">
    <table class="pt" :class="`pt--${mode}`">
        <caption class="sr-only">
            {{ select ? 'Choose the columns of the table' : matrix ? 'All projects side by side' : 'The table of the project' }}: {{ columnCount }} columns in {{ groups.length }} groups
        </caption>
        <thead>
            <tr class="l1">
                <th class="corner" rowspan="2" scope="col">
                    <span class="corner-title">{{ matrix ? 'Projects' : 'Shapes' }}</span>
                </th>
                <th v-for="g in groups" :key="g.key" class="cat" :class="`cat--${kindOf(g)}`" :colspan="g.columns.length" scope="colgroup" :data-cat="g.key">
                    <div class="cat-inner">
                        <span class="cat-name">
                            <code>{{ g.label }}</code>
                            <small v-if="g.title && g.title !== g.label">{{ g.title }}</small>
                        </span>
                        <span v-if="select && chosenIn(g)" class="cat-count some">{{ chosenIn(g) }} chosen</span>
                        <button
                            v-if="select && (g.total > g.columns.length || expanded.has(g.key))"
                            type="button"
                            class="cat-more"
                            @click="emit('expand', g.key)"
                        >{{ expanded.has(g.key) ? 'show fewer' : `+${g.total - g.columns.length} more` }}</button>
                    </div>
                </th>
            </tr>
            <tr class="l2">
                <template v-for="g in groups" :key="g.key">
                    <th
                        v-for="(c, i) in g.columns"
                        :key="c.code"
                        class="col"
                        :class="[`col--${kindOf(g)}`, { first: i === 0, on: selected.has(c.code), flash: flash === c.code, active: active === c.code, added: removable.has(c.code), variant: !!c.variantOf }]"
                        scope="col"
                        :data-code="c.code"
                    >
                        <component :is="select ? 'label' : 'div'" class="col-inner" :title="c.variantOf ? `${c.code} — variant of ${c.variantOf}${c.variantLabel ? ` (${c.variantLabel})` : ''}` : c.code">
                            <input
                                v-if="select"
                                type="checkbox"
                                class="tick"
                                :checked="selected.has(c.code)"
                                :aria-label="`Choose ${c.code}`"
                                @change="onToggle($event, c.code)"
                            />
                            <span v-if="isPseudo(c.code)" class="pseudo">{{ pseudoLabel(c.code) }}</span>
                            <template v-else>
                                <span class="glyph"><PatternDisplay :pattern="c.code" :glyphs="glyphs" :scale="0.85" /></span>
                                <PatternCode :pattern="c.code" class="code" />
                            </template>
                            <span v-if="c.variantOf" class="vtag" :title="`Variant of ${c.variantOf}`">variant{{ c.variantLabel ? ` · ${c.variantLabel}` : '' }}</span>
                            <button
                                v-if="select && !isPseudo(c.code)"
                                type="button"
                                class="vbtn"
                                :title="`Add a variant of ${c.variantOf || c.code}`"
                                :aria-label="`Add a variant of ${c.variantOf || c.code}`"
                                @click.prevent.stop="emit('variant', c.variantOf || c.code)"
                            >+ variant</button>
                            <button
                                v-if="removable.has(c.code)"
                                type="button"
                                class="x"
                                :aria-label="`Take ${c.code} out of the table`"
                                title="Take out of the table"
                                @click.stop="emit('remove', c.code)"
                            >✕</button>
                        </component>
                    </th>
                </template>
            </tr>
        </thead>
        <tbody>
            <template v-if="matrix">
                <tr v-for="r in rows" :key="r.id" class="r-row" :class="{ current: r.active }">
                    <th scope="row">
                        <RouterLink :to="r.to" class="row-link">{{ r.name }}</RouterLink>
                        <small>{{ r.sub }}</small>
                    </th>
                    <template v-for="g in groups" :key="g.key">
                        <td v-for="(c, i) in g.columns" :key="c.code" class="snip m" :class="{ first: i === 0, filled: (r.snippets.get(c.code) || []).length, off: !r.has.has(c.code) }">
                            <button
                                v-if="r.has.has(c.code)"
                                type="button"
                                class="cell"
                                :aria-label="`${r.name}, ${c.code}: ${(r.snippets.get(c.code) || []).length} snippets`"
                                @click="emit('open-cell', { row: r, code: c.code })"
                            >
                                <template v-if="(r.snippets.get(c.code) || []).length">
                                    <span class="thumbs">
                                        <span v-for="s in (r.snippets.get(c.code) || []).slice(0, 1)" :key="s.id" class="thumb"><slot name="thumb" :snippet="s" :code="c.code" /></span>
                                    </span>
                                    <span class="n">{{ (r.snippets.get(c.code) || []).length }}</span>
                                </template>
                                <span v-else class="add" aria-hidden="true">+</span>
                            </button>
                            <span v-else class="off-mark" aria-hidden="true" title="Not a column of this project">·</span>
                        </td>
                    </template>
                </tr>
            </template>
            <tr v-if="!matrix && occurrences" class="r-tr">
                <th scope="row">In transcription</th>
                <template v-for="g in groups" :key="g.key">
                    <td v-for="(c, i) in g.columns" :key="c.code" class="tr" :class="{ first: i === 0, none: !occurrencesOf(c.code) }" :title="occurrencesOf(c.code) ? `${fmt(occurrencesOf(c.code).count)}× in the folios of this project` : 'not in the folios of this project'">
                        <span class="tr-n">{{ occurrencesOf(c.code) ? compact(occurrencesOf(c.code).count) : '–' }}</span>
                        <span class="tr-bar" aria-hidden="true"><span :style="{ width: bar(c.code) }"></span></span>
                    </td>
                </template>
            </tr>
            <tr v-if="!matrix" class="r-snip">
                <th scope="row">Snippets</th>
                <template v-for="g in groups" :key="g.key">
                    <td v-for="(c, i) in g.columns" :key="c.code" class="snip" :class="{ first: i === 0, filled: snippetsOf(c.code).length, active: active === c.code }">
                        <span v-if="select" class="made" :class="{ some: snippetsOf(c.code).length }">{{ snippetsOf(c.code).length || '–' }}</span>
                        <button
                            v-else
                            type="button"
                            class="cell"
                            :aria-label="snippetsOf(c.code).length ? `${snippetsOf(c.code).length} snippets for ${c.code}: open` : `Add a snippet for ${c.code}`"
                            @click="emit('open', c.code)"
                        >
                            <template v-if="snippetsOf(c.code).length">
                                <span class="thumbs">
                                    <span v-for="s in snippetsOf(c.code).slice(0, 4)" :key="s.id" class="thumb"><slot name="thumb" :snippet="s" :code="c.code" /></span>
                                </span>
                                <span class="n">{{ snippetsOf(c.code).length }}</span>
                            </template>
                            <span v-else class="add" aria-hidden="true">+</span>
                        </button>
                    </td>
                </template>
            </tr>
        </tbody>
    </table>
    <p v-if="!groups.length" class="empty">{{ emptyText }}</p>
</div>
</template>

<style scoped>
.pt-scroll { overflow: auto; max-width: 100%; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); box-shadow: var(--shadow-sm); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.pt { border-collapse: separate; border-spacing: 0; font-size: 0.88rem; min-width: 100%; --line: #e6ebf1; --shape: #3b82f6; --sign: #8b5cf6; --other: #64748b; }
.pt th, .pt td { border-bottom: 1px solid var(--line); padding: 0; background: var(--color-surface); }
.pt tbody tr:last-child th, .pt tbody tr:last-child td { border-bottom: none; }
.pt .first { border-left: 3px solid var(--line); }

/* the left column and the header stay put while the table scrolls */
.corner, tbody th { position: sticky; left: 0; z-index: 3; min-width: 150px; max-width: 150px; text-align: left; padding: var(--space-3) var(--space-4); background: #f8fafc; border-right: 1px solid var(--color-border-hover); }
.corner { top: 0; z-index: 5; vertical-align: bottom; }
.corner-title { display: block; font-weight: 700; font-size: 0.95rem; }
.corner-sub { display: block; margin-top: 2px; font-size: 0.74rem; color: var(--color-text-muted); font-weight: 500; }
tbody th { font-size: 0.82rem; font-weight: 600; color: var(--color-text); }
tbody th small { display: block; margin-top: 1px; font-size: 0.72rem; font-weight: 500; color: var(--color-text-muted); }

/* level 1: the group, tinted by what kind of group it is */
.l1 th.cat { position: sticky; top: 0; z-index: 2; text-align: left; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--line); border-left: 3px solid var(--line); }
.cat--shape { background: #eef4ff !important; box-shadow: inset 0 3px 0 var(--shape); }
.cat--other { background: #f1f5f9 !important; box-shadow: inset 0 3px 0 var(--other); }
.cat-inner { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; position: sticky; left: 162px; width: max-content; max-width: 100%; }
.cat-name { display: inline-flex; align-items: baseline; gap: var(--space-2); }
.cat-name code { font-size: 1.15rem; font-weight: 800; background: transparent; padding: 0; }
.cat-name small { color: var(--color-text-muted); font-weight: 500; font-size: 0.8rem; }
.cat-count { font-size: 0.72rem; color: var(--color-text-muted); background: rgba(255,255,255,0.8); padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line); }
.cat-count.some { color: var(--color-primary-dark); background: var(--color-primary-light); border-color: var(--color-primary-muted); font-weight: 700; }
.cat-more { font-size: 0.72rem; padding: 1px 9px; line-height: 1.6; border-radius: 999px; background: #fff; color: var(--color-primary-dark); border: 1px dashed var(--color-primary-muted); }
.cat-more:hover { background: var(--color-primary-light); }

/* level 2: the code, with its drawing */
.l2 th.col { position: sticky; top: 0; min-width: 96px; vertical-align: top; text-align: center; background: var(--color-surface); }
.col-inner { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: var(--space-3) var(--space-2) var(--space-2); position: relative; min-height: 112px; }
label.col-inner { cursor: pointer; }
label.col-inner:hover { background: var(--color-primary-light); }
.tick { position: absolute; top: 8px; left: 8px; margin: 0; width: 17px; height: 17px; accent-color: var(--color-primary); cursor: pointer; }
.glyph { display: inline-flex; min-height: 34px; align-items: center; justify-content: center; margin-top: 4px; }
.col-inner :deep(.pattern-code) { font-size: 0.95rem; font-weight: 700; overflow-wrap: anywhere; letter-spacing: 0.01em; background: transparent; padding: 0; }
.pseudo { font-weight: 700; font-size: 0.95rem; padding: var(--space-4) 0 var(--space-3); }
.vtag { font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-accent-dark); background: var(--color-accent-light); padding: 0 6px; border-radius: 999px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vbtn { margin-top: auto; padding: 0 7px; font-size: 0.7rem; line-height: 1.7; font-weight: 600; color: var(--color-text-muted); background: transparent; border: 1px dashed var(--color-border-hover); border-radius: 999px; opacity: 0; transition: opacity 0.12s, color 0.12s, border-color 0.12s, background-color 0.12s; }
th.col:hover .vbtn, .vbtn:focus-visible { opacity: 1; }
.vbtn:hover { color: var(--color-accent-dark); border-color: var(--color-accent); background: var(--color-accent-light); }
th.col.on { background: #eaf2ff; box-shadow: inset 0 -3px 0 var(--color-primary); }
th.col.variant { background: #faf7ff; }
th.col.variant.on { background: #efe8ff; box-shadow: inset 0 -3px 0 var(--color-accent); }
th.col.added { background: var(--color-accent-light); }
th.col.active { box-shadow: inset 0 -3px 0 var(--color-primary); }
th.col.flash { animation: flash 1.4s ease-out; }
@keyframes flash { 0% { background: var(--color-warning-muted); } 100% { background: transparent; } }
.x { position: absolute; top: 2px; right: 2px; padding: 0 5px; line-height: 1.4; font-size: 0.72rem; border-color: transparent; background: transparent; color: var(--color-text-light); }
.x:hover { color: var(--color-danger); background: var(--color-danger-light); }

/* what the folios hold for a code */
td.tr { text-align: center; padding: var(--space-2); vertical-align: middle; height: 46px; }
.tr-n { display: block; font-size: 0.84rem; font-weight: 700; font-variant-numeric: tabular-nums; }
td.tr.none .tr-n { color: var(--color-text-light); font-weight: 500; }
.tr-bar { display: block; height: 3px; margin: 4px auto 0; width: 70%; background: var(--color-surface-muted); border-radius: 999px; overflow: hidden; }
.tr-bar span { display: block; height: 100%; background: var(--color-primary-muted); border-radius: 999px; }

td.snip { text-align: center; vertical-align: middle; height: 104px; }
.pt--select td.snip { height: 42px; }
td.snip.filled { background: #fafcff; }
td.snip.active { box-shadow: inset 0 -3px 0 var(--color-primary); }
.made { font-weight: 600; color: var(--color-text-light); }
.made.some { color: var(--color-accent-dark); }
.cell { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; width: 100%; height: 100%; min-height: 104px; padding: var(--space-2); border: none; border-radius: 0; background: transparent; color: var(--color-text-light); }
.cell:hover { background: var(--color-primary-light); color: var(--color-primary); }
.cell:focus-visible { box-shadow: inset var(--ring); }
.add { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 1.5px dashed var(--color-border-hover); border-radius: 50%; font-size: 1.3rem; line-height: 1; }
.cell:hover .add { border-color: var(--color-primary); border-style: solid; }
.thumbs { display: grid; grid-template-columns: repeat(2, auto); gap: 4px; justify-content: center; }
.thumb { display: inline-flex; width: 52px; height: 40px; overflow: hidden; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: var(--color-surface); }
.thumb :deep(img), .thumb :deep(canvas), .thumb :deep(svg) { max-width: 100%; max-height: 100%; object-fit: contain; }
.n { font-size: 0.72rem; font-weight: 700; color: var(--color-primary-dark); background: var(--color-primary-light); border-radius: 999px; padding: 0 8px; }

.empty { margin: 0; padding: var(--space-5); text-align: center; color: var(--color-text-muted); }

/* the matrix: a row per project */
.pt--matrix .corner, .pt--matrix tbody th { min-width: 200px; max-width: 200px; }
.pt--matrix .cat-inner { left: 212px; }
.r-row th { font-size: 0.88rem; }
.row-link { display: block; font-weight: 700; overflow-wrap: anywhere; }
.r-row.current th { background: var(--color-primary-light); }
td.snip.m { height: 66px; }
td.snip.m .cell { min-height: 66px; }
td.snip.m .thumbs { grid-template-columns: auto; }
td.snip.m .thumb { width: 64px; height: 48px; }
td.snip.off { background: repeating-linear-gradient(135deg, var(--color-surface) 0 6px, var(--color-surface-muted) 6px 12px); }
.off-mark { color: var(--color-text-light); }

/* a narrow screen gives the left column less */
@media (max-width: 720px) {
    .corner, tbody th { min-width: 96px; max-width: 96px; padding: var(--space-2); }
    .cat-inner { left: 104px; }
    .pt--matrix .corner, .pt--matrix tbody th { min-width: 130px; max-width: 130px; }
    .pt--matrix .cat-inner { left: 138px; }
}
</style>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import {
    normalizeRange, inRange, matrixOf, formatDelimited, parseDelimited,
    planPaste, planFill, planClear
} from '../../utils/gridOps';

/**
 * A spreadsheet-style grid of text cells.
 *
 * It looks after what happens in the grid — selecting, moving with the keys,
 * typing into a cell, copying and pasting blocks, filling — and reports every
 * change to the parent as a list `{ rowId, colKey, before, value }`. It never
 * changes data itself, which is what lets the parent apply the same changes
 * from anywhere (an import, a find and replace) and undo them as one step.
 */
const props = defineProps({
    /**
     * [{ key, label, group, band, tone, width, readonly, frozen, type, hint, suggest, choices }]
     * `band` (else `group`) is the band above the header the column stands under; `choices` is a
     * list the cell is edited from, as a drop-down — a value that is not in it can still be typed.
     */
    columns: { type: Array, required: true },
    /** the rows shown, in order */
    rowIds: { type: Array, required: true },
    get: { type: Function, required: true },
    isEdited: { type: Function, default: () => false },
    /** whether a cell is marked as not fitting; a text is shown on hover as the reason */
    isInvalid: { type: Function, default: () => false },
    isReadonly: { type: Function, default: () => false },
    suggest: { type: Function, default: () => [] },
    sort: { type: Object, default: () => ({ key: '', dir: '' }) },
    filters: { type: Object, default: () => ({}) },
    showFilters: { type: Boolean, default: false },
    groupLabels: { type: Object, default: () => ({}) },
    /** rows whose data is not in the corpus right now, for a quiet marker */
    quietRows: { type: Object, default: () => new Set() }
});

const emit = defineEmits(['commit', 'sort', 'filter', 'column-menu', 'resize', 'selection', 'undo', 'redo', 'notice']);

const ROW_NUMBER_WIDTH = 46;

// ---- selection ---------------------------------------------------------------

const active = ref({ r: 0, c: 0 });
const anchor = ref({ r: 0, c: 0 });
const editing = ref(null); // { r, c, text }
const dragging = ref(false);
const scroller = ref(null);
const editor = ref(null);

const rowCount = computed(() => props.rowIds.length);
const colCount = computed(() => props.columns.length);
const range = computed(() => normalizeRange(anchor.value, active.value));

const frozenLeft = computed(() => {
    // Offsets of the sticky columns: the row-number column, then the frozen ones.
    const out = {};
    let left = ROW_NUMBER_WIDTH;
    props.columns.forEach((col, c) => {
        if (col.frozen) { out[c] = left; left += col.width || 140; }
    });
    return out;
});

const getCell = (r, c) => {
    const id = props.rowIds[r];
    const col = props.columns[c];
    return id === undefined || !col ? '' : (props.get(id, col) ?? '');
};
const readonlyCell = (r, c) => {
    const id = props.rowIds[r];
    const col = props.columns[c];
    return !col || id === undefined || !!col.readonly || props.isReadonly(id, col);
};

function clampCell(r, c) {
    return {
        r: Math.max(0, Math.min(rowCount.value - 1, r)),
        c: Math.max(0, Math.min(colCount.value - 1, c))
    };
}

function select(r, c, extend = false) {
    const next = clampCell(r, c);
    active.value = next;
    if (!extend) anchor.value = next;
    nextTick(scrollActiveIntoView);
}

function selectRange(a, b) {
    anchor.value = clampCell(a.r, a.c);
    active.value = clampCell(b.r, b.c);
}

function scrollActiveIntoView() {
    const root = scroller.value;
    if (!root) return;
    const td = root.querySelector(`td[data-r="${active.value.r}"][data-c="${active.value.c}"]`);
    if (td) td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// Keep the selection inside the grid when rows or columns come and go.
watch([rowCount, colCount], () => {
    editing.value = null;
    select(active.value.r, active.value.c, false);
    anchor.value = clampCell(anchor.value.r, anchor.value.c);
});

function emitSelection() {
    const rg = range.value;
    const rowIds = [];
    for (let r = rg.r0; r <= rg.r1; r++) if (props.rowIds[r] !== undefined) rowIds.push(props.rowIds[r]);
    const colKeys = [];
    for (let c = rg.c0; c <= rg.c1; c++) if (props.columns[c]) colKeys.push(props.columns[c].key);
    emit('selection', {
        range: rg, rowIds, colKeys,
        activeRowId: props.rowIds[active.value.r],
        activeColKey: props.columns[active.value.c] && props.columns[active.value.c].key,
        activeText: getCell(active.value.r, active.value.c)
    });
}
watch([range, () => props.rowIds, () => props.columns], emitSelection, { immediate: true });

// ---- changes ---------------------------------------------------------------

function commit(changes) {
    if (!changes.length) return;
    emit('commit', changes.map(ch => ({
        rowId: props.rowIds[ch.r], colKey: props.columns[ch.c].key, before: ch.before, value: ch.value
    })));
}

const ctx = () => ({ rowCount: rowCount.value, colCount: colCount.value, get: getCell, isReadonly: readonlyCell });

function tell(text) { emit('notice', text); }

function skippedNote(done, skippedReadonly, skippedOutside = 0) {
    const parts = [`${done} cell${done === 1 ? '' : 's'} changed`];
    if (skippedReadonly) parts.push(`${skippedReadonly} read-only left alone`);
    if (skippedOutside) parts.push(`${skippedOutside} outside the table skipped`);
    return parts.join(', ');
}

// ---- editing -------------------------------------------------------------------

function startEdit(initial = null) {
    const { r, c } = active.value;
    if (readonlyCell(r, c)) {
        tell('This column is read-only.');
        return;
    }
    editing.value = {
        r, c, text: initial === null ? getCell(r, c) : initial, original: getCell(r, c),
        // a drop-down: which choice is highlighted, whether anything was typed yet, where it hangs
        pick: -1, touched: initial !== null, box: null
    };
    nextTick(() => {
        const input = editorInput();
        if (input) {
            input.focus();
            if (initial === null) input.select();
            else input.setSelectionRange(input.value.length, input.value.length);
            placeDropdown();
        }
    });
}

const editorInput = () => (Array.isArray(editor.value) ? editor.value[0] : editor.value);

// ---- a column with a list: its values as a drop-down ------------------------------------

const shownChoices = computed(() => {
    const e = editing.value;
    const col = e && props.columns[e.c];
    if (!col || !col.choices) return [];
    // All of them until something is typed, then those that contain it.
    const q = e.touched ? e.text.trim().toLowerCase() : '';
    return q ? col.choices.filter(o => o.toLowerCase().includes(q)) : col.choices;
});

/** The drop-down hangs under the cell being edited, outside the table so no cell clips it. */
function placeDropdown() {
    const e = editing.value;
    const input = editorInput();
    if (!e || !input) return;
    const box = input.getBoundingClientRect();
    e.box = { left: box.left, top: box.bottom, width: Math.max(box.width, 200) };
}

const dropdownStyle = computed(() => {
    const box = editing.value && editing.value.box;
    return box ? { left: `${box.left}px`, top: `${box.top}px`, minWidth: `${box.width}px` } : { display: 'none' };
});

function pickChoice(delta) {
    const e = editing.value;
    const n = shownChoices.value.length;
    if (!e || !n) return;
    e.pick = delta > 0 ? (e.pick + 1) % n : (e.pick <= 0 ? n - 1 : e.pick - 1);
    nextTick(() => {
        const item = document.querySelector('.choices li.pick');
        if (item) item.scrollIntoView({ block: 'nearest' });
    });
}

function choose(option) {
    if (!editing.value) return;
    editing.value.text = option;
    finishEdit(true);
}

function finishEdit(save, move = null) {
    const e = editing.value;
    if (!e) return;
    editing.value = null;
    if (save && e.text !== e.original) commit([{ r: e.r, c: e.c, before: e.original, value: e.text }]);
    nextTick(() => {
        if (scroller.value) scroller.value.focus({ preventScroll: true });
        if (move) select(active.value.r + move.dr, active.value.c + move.dc);
    });
}

function onEditKey(ev) {
    const e = editing.value;
    const choices = e && props.columns[e.c].choices;
    if (choices && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
        ev.preventDefault();
        pickChoice(ev.key === 'ArrowDown' ? 1 : -1);
        ev.stopPropagation();
        return;
    }
    // Enter or Tab on a highlighted choice takes it; with none highlighted, what was typed stands.
    if (choices && (ev.key === 'Enter' || ev.key === 'Tab') && e.pick >= 0 && shownChoices.value[e.pick] !== undefined) {
        e.text = shownChoices.value[e.pick];
    }
    if (ev.key === 'Enter') { ev.preventDefault(); finishEdit(true, { dr: ev.shiftKey ? -1 : 1, dc: 0 }); }
    else if (ev.key === 'Tab') { ev.preventDefault(); finishEdit(true, { dr: 0, dc: ev.shiftKey ? -1 : 1 }); }
    else if (ev.key === 'Escape') { ev.preventDefault(); finishEdit(false); }
    ev.stopPropagation();
}

// ---- the keyboard ---------------------------------------------------------------

function jump(dr, dc, ev) {
    const { r, c } = active.value;
    const mod = ev.ctrlKey || ev.metaKey;
    let nr = r + dr;
    let nc = c + dc;
    if (mod) {
        if (dr) nr = dr < 0 ? 0 : rowCount.value - 1;
        if (dc) nc = dc < 0 ? 0 : colCount.value - 1;
    }
    select(nr, nc, ev.shiftKey);
}

function onKeyDown(ev) {
    if (editing.value) return;
    const mod = ev.ctrlKey || ev.metaKey;
    const key = ev.key;

    const moves = {
        ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1]
    };
    if (moves[key]) { ev.preventDefault(); jump(moves[key][0], moves[key][1], ev); return; }

    if (key === 'Tab') { ev.preventDefault(); select(active.value.r, active.value.c + (ev.shiftKey ? -1 : 1)); return; }
    if (key === 'Enter') { ev.preventDefault(); if (ev.shiftKey) select(active.value.r - 1, active.value.c); else startEdit(); return; }
    if (key === 'F2') { ev.preventDefault(); startEdit(); return; }
    if (key === 'Home') { ev.preventDefault(); select(mod ? 0 : active.value.r, 0, ev.shiftKey); return; }
    if (key === 'End') { ev.preventDefault(); select(mod ? rowCount.value - 1 : active.value.r, colCount.value - 1, ev.shiftKey); return; }
    if (key === 'PageDown') { ev.preventDefault(); select(active.value.r + 15, active.value.c, ev.shiftKey); return; }
    if (key === 'PageUp') { ev.preventDefault(); select(active.value.r - 15, active.value.c, ev.shiftKey); return; }

    if (key === 'Delete' || key === 'Backspace') {
        ev.preventDefault();
        const plan = planClear({ range: range.value, get: getCell, isReadonly: readonlyCell });
        commit(plan.changes);
        if (plan.skippedReadonly && !plan.changes.length) tell('Those cells are read-only.');
        return;
    }

    if (mod) {
        const k = key.toLowerCase();
        if (k === 'a') { ev.preventDefault(); selectRange({ r: 0, c: 0 }, { r: rowCount.value - 1, c: colCount.value - 1 }); return; }
        if (k === 'd' || k === 'r') {
            ev.preventDefault();
            const plan = planFill({ range: range.value, direction: k === 'd' ? 'down' : 'right', get: getCell, isReadonly: readonlyCell });
            commit(plan.changes);
            tell(skippedNote(plan.changes.length, plan.skippedReadonly));
            return;
        }
        if (k === 'z') { ev.preventDefault(); emit(ev.shiftKey ? 'redo' : 'undo'); return; }
        if (k === 'y') { ev.preventDefault(); emit('redo'); return; }
        return; // copy, cut and paste arrive as clipboard events
    }

    // Typing starts editing and replaces what was there.
    if (key.length === 1 && !ev.altKey) { ev.preventDefault(); startEdit(key); }
}

// ---- the clipboard ---------------------------------------------------------------

function onCopy(ev) {
    if (editing.value) return;
    ev.preventDefault();
    const matrix = matrixOf(range.value, getCell);
    ev.clipboardData.setData('text/plain', formatDelimited(matrix, '\t'));
    const n = matrix.length * (matrix[0] || []).length;
    tell(`Copied ${n} cell${n === 1 ? '' : 's'}`);
}

function onCut(ev) {
    if (editing.value) return;
    onCopy(ev);
    const plan = planClear({ range: range.value, get: getCell, isReadonly: readonlyCell });
    commit(plan.changes);
}

function onPaste(ev) {
    if (editing.value) return;
    ev.preventDefault();
    const text = ev.clipboardData.getData('text/plain');
    if (!text) return;
    // A single value, which may well hold commas, stays one cell.
    const matrix = /[\t\r\n]/.test(text) ? parseDelimited(text, '\t') : [[text]];
    const plan = planPaste({ matrix, anchor: active.value, selection: range.value, ...ctx() });
    commit(plan.changes);
    tell(`Pasted — ${skippedNote(plan.changes.length, plan.skippedReadonly, plan.skippedOutside)}`);
}

// ---- the mouse ---------------------------------------------------------------------

function onCellDown(ev, r, c) {
    if (ev.button !== 0) return;
    if (editing.value) finishEdit(true);
    select(r, c, ev.shiftKey);
    dragging.value = true;
    scroller.value && scroller.value.focus({ preventScroll: true });
}

function onCellEnter(r, c) {
    if (dragging.value) { active.value = clampCell(r, c); }
}

function onUp() { dragging.value = false; }

function onHeaderDown(c, ev) {
    if (ev.target.closest('.col-menu, .resize, .sort-btn')) return;
    if (editing.value) finishEdit(true);
    selectRange({ r: 0, c }, { r: rowCount.value - 1, c });
    scroller.value && scroller.value.focus({ preventScroll: true });
}

function onRowDown(r) {
    if (editing.value) finishEdit(true);
    selectRange({ r, c: 0 }, { r, c: colCount.value - 1 });
    scroller.value && scroller.value.focus({ preventScroll: true });
}

function selectAll() {
    selectRange({ r: 0, c: 0 }, { r: rowCount.value - 1, c: colCount.value - 1 });
    scroller.value && scroller.value.focus({ preventScroll: true });
}

// ---- column resizing ---------------------------------------------------------------

let resizing = null;
function startResize(ev, col) {
    ev.preventDefault();
    ev.stopPropagation();
    resizing = { key: col.key, x: ev.clientX, width: col.width || 140 };
    window.addEventListener('mousemove', onResize);
    window.addEventListener('mouseup', endResize);
}
function onResize(ev) {
    if (!resizing) return;
    emit('resize', resizing.key, Math.max(60, resizing.width + ev.clientX - resizing.x), false);
}
function endResize(ev) {
    if (resizing) emit('resize', resizing.key, Math.max(60, resizing.width + ev.clientX - resizing.x), true);
    resizing = null;
    window.removeEventListener('mousemove', onResize);
    window.removeEventListener('mouseup', endResize);
}

onMounted(() => window.addEventListener('mouseup', onUp));
onBeforeUnmount(() => {
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('mousemove', onResize);
    window.removeEventListener('mouseup', endResize);
});

// ---- drawing -----------------------------------------------------------------------

/** The bands above the headers: one per run of columns under the same category. */
const bandOf = (col) => (col.band !== undefined ? col.band : col.group);
const bands = computed(() => {
    const out = [];
    props.columns.forEach((col, c) => {
        const last = out[out.length - 1];
        const group = bandOf(col);
        if (last && last.group === group) { last.span++; last.width += col.width || 140; }
        else out.push({ group, span: 1, first: c, width: col.width || 140, tone: col.tone });
    });
    return out;
});

/** Why a cell is marked, if it is (a check can say it). */
function reason(r, c) {
    const found = props.isInvalid(props.rowIds[r], props.columns[c], getCell(r, c));
    return typeof found === 'string' ? found : '';
}

/** What hovering a cell tells: why it is marked, else the whole text if it is cut short. */
function cellTitle(r, c) {
    const why = reason(r, c);
    if (why) return why;
    const text = getCell(r, c);
    return text.length > 28 ? text : null;
}

function cellClass(r, c) {
    const id = props.rowIds[r];
    const col = props.columns[c];
    const a = active.value;
    return {
        active: a.r === r && a.c === c,
        selected: inRange(range.value, r, c) && !(a.r === r && a.c === c && range.value.r0 === range.value.r1 && range.value.c0 === range.value.c1),
        readonly: !!col.readonly,
        edited: props.isEdited(id, col),
        invalid: props.isInvalid(id, col, getCell(r, c)),
        number: col.type === 'number',
        frozen: !!col.frozen
    };
}

const colWidth = (col) => `${col.width || 140}px`;
const tableWidth = computed(() => ROW_NUMBER_WIDTH + props.columns.reduce((n, c) => n + (c.width || 140), 0));

function sortMark(col) {
    if (props.sort.key !== col.key) return '';
    return props.sort.dir === 'asc' ? '▲' : '▼';
}

function isUrlValue(col, text) {
    return col.type === 'url' && /^https?:\/\/\S+$/i.test(String(text).trim());
}

defineExpose({
    focus: () => scroller.value && scroller.value.focus({ preventScroll: true }),
    selectAll,
    activeCell: () => ({ ...active.value })
});
</script>

<template>
<div
    ref="scroller"
    class="grid-scroller"
    tabindex="0"
    role="grid"
    :aria-rowcount="rowCount + 1"
    :aria-colcount="colCount"
    @keydown="onKeyDown"
    @copy="onCopy"
    @cut="onCut"
    @paste="onPaste"
    @scroll="placeDropdown"
>
    <table class="grid" :style="{ width: tableWidth + 'px' }">
        <colgroup>
            <col :style="{ width: ROW_NUMBER_WIDTH + 'px' }" />
            <col v-for="col in columns" :key="col.key" :style="{ width: colWidth(col) }" />
        </colgroup>
        <thead>
            <tr class="band-row">
                <th class="corner" :style="{ left: 0 }"></th>
                <th
                    v-for="b in bands"
                    :key="b.first"
                    :colspan="b.span"
                    class="band"
                    :class="[`band--${b.group}`, b.tone !== undefined ? `band--tone${b.tone}` : '', { frozen: columns[b.first].frozen }]"
                    :style="columns[b.first].frozen ? { left: frozenLeft[b.first] + 'px' } : null"
                >{{ groupLabels[b.group] || '' }}</th>
            </tr>
            <tr class="head-row">
                <th class="corner" title="Select everything" @mousedown.prevent="selectAll"></th>
                <th
                    v-for="(col, c) in columns"
                    :key="col.key"
                    class="head"
                    :class="{ frozen: col.frozen, 'in-selection': c >= range.c0 && c <= range.c1 && range.r0 === 0 && range.r1 === rowCount - 1 }"
                    :style="col.frozen ? { left: frozenLeft[c] + 'px' } : null"
                    :title="col.hint || col.label"
                    @mousedown="onHeaderDown(c, $event)"
                >
                    <button class="sort-btn" :title="`Sort by ${col.label}`" @click="emit('sort', col.key)">
                        <span class="label">{{ col.label }}</span>
                        <span class="mark">{{ sortMark(col) }}</span>
                    </button>
                    <button class="col-menu" :aria-label="`Options for ${col.label}`" @click.stop="emit('column-menu', { col, rect: $event.currentTarget.getBoundingClientRect() })">⋯</button>
                    <span class="resize" @mousedown="startResize($event, col)"></span>
                </th>
            </tr>
            <tr v-if="showFilters" class="filter-row">
                <th class="corner"></th>
                <th v-for="(col, c) in columns" :key="col.key" class="filter" :class="{ frozen: col.frozen }" :style="col.frozen ? { left: frozenLeft[c] + 'px' } : null">
                    <input
                        :value="filters[col.key] || ''"
                        :class="{ on: filters[col.key] }"
                        placeholder="filter"
                        :aria-label="`Filter ${col.label}`"
                        title="Contains the text. =text matches exactly, = alone matches empty, !text excludes, ! alone matches not empty."
                        @input="emit('filter', col.key, $event.target.value)"
                        @keydown.stop
                    />
                </th>
            </tr>
        </thead>
        <tbody>
            <tr v-for="(id, r) in rowIds" :key="id" :class="{ quiet: quietRows.has(id) }">
                <th class="rownum" :class="{ 'in-selection': r >= range.r0 && r <= range.r1 && range.c0 === 0 && range.c1 === colCount - 1 }" @mousedown.prevent="onRowDown(r)">{{ r + 1 }}</th>
                <td
                    v-for="(col, c) in columns"
                    :key="col.key"
                    :data-r="r"
                    :data-c="c"
                    :class="cellClass(r, c)"
                    :style="col.frozen ? { left: frozenLeft[c] + 'px' } : null"
                    :title="cellTitle(r, c)"
                    @mousedown="onCellDown($event, r, c)"
                    @mouseenter="onCellEnter(r, c)"
                    @dblclick="select(r, c); startEdit()"
                >
                    <template v-if="editing && editing.r === r && editing.c === c">
                        <input
                            ref="editor"
                            v-model="editing.text"
                            class="cell-input"
                            :list="col.suggest && !col.choices ? `dg-list-${col.key}` : null"
                            :role="col.choices ? 'combobox' : null"
                            :aria-expanded="col.choices ? shownChoices.length > 0 : null"
                            @input="editing.touched = true; editing.pick = -1"
                            @keydown="onEditKey"
                            @blur="finishEdit(true)"
                        />
                        <datalist v-if="col.suggest && !col.choices" :id="`dg-list-${col.key}`">
                            <option v-for="s in suggest(col)" :key="s" :value="s"></option>
                        </datalist>
                        <Teleport v-if="col.choices && shownChoices.length" to="body">
                            <ul class="choices" role="listbox" :style="dropdownStyle" @mousedown.prevent>
                                <li
                                    v-for="(o, i) in shownChoices"
                                    :key="o"
                                    role="option"
                                    :aria-selected="i === editing.pick"
                                    :class="{ pick: i === editing.pick, current: o === editing.original }"
                                    @mousedown.prevent="choose(o)"
                                >{{ o }}</li>
                            </ul>
                        </Teleport>
                    </template>
                    <template v-else>
                        <span class="text">{{ getCell(r, c) }}</span>
                        <a
                            v-if="isUrlValue(col, getCell(r, c))"
                            class="open"
                            :href="getCell(r, c).trim()"
                            target="_blank"
                            rel="noopener"
                            title="Open in a new tab"
                            @mousedown.stop
                            @click.stop
                        >↗</a>
                    </template>
                </td>
            </tr>
            <tr v-if="rowCount === 0" class="empty-row">
                <td :colspan="colCount + 1">No manuscript matches the filters.</td>
            </tr>
        </tbody>
    </table>
</div>
</template>

<style scoped>
.grid-scroller {
    position: relative; overflow: auto; height: 100%; background: var(--color-surface);
    border: 1px solid var(--color-border); border-radius: var(--radius-lg); outline: none;
    scroll-padding: 76px 220px 12px 240px;
}
.grid-scroller:focus-visible { box-shadow: var(--ring); }

.grid { border-collapse: separate; border-spacing: 0; table-layout: fixed; font-size: 0.84rem; }

th, td { box-sizing: border-box; padding: 0; height: 30px; overflow: hidden; white-space: nowrap; border-right: 1px solid var(--color-surface-muted); border-bottom: 1px solid var(--color-surface-muted); }

/* header rows */
thead th { position: sticky; z-index: 3; background: var(--color-surface-muted); }
.band-row th { top: 0; height: 22px; z-index: 4; font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: var(--color-text-muted); text-align: left; padding-left: 10px; border-bottom: 1px solid var(--color-border); }
.band--catalogue { background: #eef2ff; color: #3730a3; }
.band--iiif { background: #ecfeff; color: #155e75; }
.band--project { background: var(--color-accent-light); color: var(--color-accent-dark); }
.band--corpus { background: var(--color-surface-muted); }
/* categories of your own: four tints, so neighbouring bands can be told apart */
.band--tone0 { background: #fef3c7; color: #92400e; }
.band--tone1 { background: #fce7f3; color: #9d174d; }
.band--tone2 { background: #dcfce7; color: #166534; }
.band--tone3 { background: #ede9fe; color: #5b21b6; }
.head-row th { top: 22px; height: 34px; border-bottom: 1px solid var(--color-border-hover); }
.filter-row th { top: 56px; height: 30px; background: var(--color-surface); z-index: 3; }
thead th.frozen, thead th.corner { z-index: 6; }
.corner { left: 0; background: var(--color-surface-muted); cursor: pointer; }

.head { position: sticky; text-align: left; }
.head.in-selection { background: var(--color-primary-light); }
.sort-btn { display: flex; align-items: center; gap: 4px; width: calc(100% - 26px); height: 100%; padding: 0 0 0 10px; border: none; border-radius: 0; background: transparent; font-weight: 600; font-size: 0.8rem; color: var(--color-text); text-align: left; }
.sort-btn:hover { background: rgba(255, 255, 255, 0.6); }
.sort-btn .label { overflow: hidden; text-overflow: ellipsis; }
.sort-btn .mark { color: var(--color-primary); font-size: 0.6rem; }
.col-menu { position: absolute; right: 4px; top: 5px; width: 20px; height: 22px; padding: 0; border: none; background: transparent; color: var(--color-text-light); line-height: 1; }
.col-menu:hover { background: var(--color-border); color: var(--color-text); }
.resize { position: absolute; right: -3px; top: 0; bottom: 0; width: 7px; cursor: col-resize; z-index: 2; }
.resize:hover { background: var(--color-primary-muted); }

.filter input { width: 100%; height: 100%; box-sizing: border-box; border: none; padding: 0 8px; font-size: 0.78rem; background: transparent; outline: none; }
.filter input.on { background: var(--color-warning-light); font-weight: 600; }
.filter input:focus { box-shadow: inset 0 0 0 2px var(--color-primary-muted); }

/* row numbers */
.rownum { position: sticky; left: 0; z-index: 2; background: var(--color-surface-muted); color: var(--color-text-muted); font-size: 0.72rem; font-weight: 500; text-align: center; cursor: pointer; user-select: none; }
.rownum.in-selection { background: var(--color-primary-light); color: var(--color-primary-dark); }
tr.quiet .rownum { color: var(--color-text-light); font-style: italic; }

/* cells */
td { position: relative; padding: 0 9px; text-overflow: ellipsis; background: var(--color-surface); cursor: cell; user-select: none; color: var(--color-text); }
td.frozen { position: sticky; z-index: 1; font-weight: 600; border-right: 2px solid var(--color-border); }
td.readonly { background: #fafbfc; color: var(--color-text-muted); cursor: default; }
td.readonly.frozen { background: #f5f7fa; color: var(--color-text); }
td.number { text-align: right; font-variant-numeric: tabular-nums; }
td.selected { background: var(--color-primary-light); }
td.readonly.selected { background: #dbeafe; }
td.active { outline: 2px solid var(--color-primary); outline-offset: -2px; background: var(--color-surface); z-index: 2; }
td.edited { background: #fffbeb; }
td.edited.selected { background: #e0ecff; }
td.edited::after { content: ""; position: absolute; top: 0; right: 0; border-style: solid; border-width: 0 8px 8px 0; border-color: transparent var(--color-warning) transparent transparent; }
td.invalid { box-shadow: inset 0 0 0 1.5px var(--color-danger); background: var(--color-danger-light); }
tr.quiet td.frozen { font-style: italic; }
.text { display: block; overflow: hidden; text-overflow: ellipsis; line-height: 29px; }
td.number .text { text-align: right; }
.open { position: absolute; right: 3px; top: 50%; transform: translateY(-50%); padding: 0 4px; border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-primary); font-size: 0.8rem; text-decoration: none; opacity: 0.85; }
.open:hover { background: var(--color-primary-light); opacity: 1; }
td:has(.open) .text { padding-right: 20px; }

.cell-input { position: absolute; inset: 0; width: 100%; height: 100%; box-sizing: border-box; padding: 0 9px; border: 2px solid var(--color-primary); border-radius: 0; background: var(--color-surface); font: inherit; outline: none; z-index: 5; }

/* the drop-down of a column with a list; it is outside the table, so it needs its own look */
.choices { position: fixed; z-index: 1000; margin: 2px 0 0; padding: 4px; list-style: none; max-height: 240px; overflow-y: auto; background: var(--color-surface); border: 1px solid var(--color-border-hover); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); font-size: 0.84rem; }
.choices li { padding: 0.35em 0.7em; border-radius: var(--radius-sm); cursor: pointer; white-space: nowrap; }
.choices li:hover, .choices li.pick { background: var(--color-primary-light); }
.choices li.current { font-weight: 700; }

.empty-row td { padding: var(--space-5); text-align: center; color: var(--color-text-muted); font-style: italic; background: transparent; cursor: default; height: 80px; }
</style>

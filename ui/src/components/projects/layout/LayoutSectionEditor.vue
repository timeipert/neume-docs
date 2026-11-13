<script setup>
import { computed } from 'vue';
import {
    AREA_SOURCE, ARRANGEMENT, CLEF_CHANGE, CLEF_PLACEMENT, CLEF_SHAPE, COLOUR, COLOUR_HEX, CUSTOS, FREQUENCY, HEIGHTING,
    INITIAL_KIND, LINE_UNIT, PITCH_LETTERS, RUBRICATION, RULING, SIDE_COLUMN
} from '@monodi/core/page-layout';

/**
 * The form of one section of a page layout, in the four groups of the design (docs/page-layout.md): writing space,
 * text lines and staves, colourings, clefs. It edits the reactive `section` it is given in place; the view that owns
 * it normalises and stores the result. Every field may stay empty ("not recorded").
 */
const props = defineProps({
    section: { type: Object, required: true },
    problems: { type: Array, default: () => [] }
});

const s = computed(() => props.section);
const freqLabel = (t) => t.en || 'always';
const LINE_COUNTS = [0, 1, 2, 3, 4, 5, 6];

function toggle(list, key) {
    const i = list.indexOf(key);
    if (i >= 0) list.splice(i, 1); else list.push(key);
}

function move(list, i, delta) {
    const j = i + delta;
    if (j < 0 || j >= list.length) return;
    const [item] = list.splice(i, 1);
    list.splice(j, 0, item);
}

/** Clef letters typed as "F c" or "F, c": only letters of the gamut are kept. */
function lettersFrom(text) {
    return [...new Set(String(text).split(/[\s,;+]+/).filter(l => PITCH_LETTERS.includes(l)))];
}

function addColouredLine() { s.value.colourings.lines.push({ pitch: '', alternative: '', colour: 'red', frequency: 'always' }); }
function addClefUse() { s.value.clefs.uses.push({ letters: [], frequency: 'always' }); }
function addShape() { s.value.clefs.shapes.push({ letter: 'F', shape: 'dot' }); }
function addLineCount() { s.value.staves.otherLineCounts.push({ count: 5, frequency: 'rarely' }); }
</script>

<template>
<div class="sec">
    <div class="row">
        <div class="ne-field"><label>Folios</label><input v-model="s.folios" class="ne-input" placeholder="whole project, or e.g. 1–33v" /></div>
        <div class="ne-field"><label>Hand / notator</label><input v-model="s.hand" class="ne-input" placeholder="e.g. Notator A" /></div>
    </div>

    <ul v-if="problems.length" class="ne-note ne-note--warn problems">
        <li v-for="p in problems" :key="p">{{ p }}</li>
    </ul>

    <fieldset>
        <legend>1 · Writing space</legend>
        <div class="row">
            <div class="ne-field"><label>Leaf height (cm)</label><input v-model.number="s.writingSpace.leaf.height.min" type="number" step="0.1" min="0" class="ne-input" /></div>
            <div class="ne-field"><label>Leaf width (cm)</label><input v-model.number="s.writingSpace.leaf.width.min" type="number" step="0.1" min="0" class="ne-input" /></div>
        </div>
        <div class="row">
            <div class="ne-field"><label>Written area height (cm)</label>
                <span class="pair"><input v-model.number="s.writingSpace.area.height.min" type="number" step="0.1" min="0" class="ne-input" aria-label="from" /> – <input v-model.number="s.writingSpace.area.height.max" type="number" step="0.1" min="0" class="ne-input" aria-label="to (optional)" /></span></div>
            <div class="ne-field"><label>Written area width (cm)</label>
                <span class="pair"><input v-model.number="s.writingSpace.area.width.min" type="number" step="0.1" min="0" class="ne-input" aria-label="from" /> – <input v-model.number="s.writingSpace.area.width.max" type="number" step="0.1" min="0" class="ne-input" aria-label="to (optional)" /></span></div>
        </div>
        <div class="row">
            <div class="ne-field"><label>Size found by</label>
                <select v-model="s.writingSpace.areaSource" class="ne-input"><option value="">not recorded</option><option v-for="t in AREA_SOURCE" :key="t.key" :value="t.key">{{ t.en }}</option></select></div>
            <div v-if="s.writingSpace.areaSource === 'literature'" class="ne-field"><label>Reference</label><input v-model="s.writingSpace.areaReference" class="ne-input" placeholder="e.g. Husmann 1964" /></div>
        </div>
        <div class="row">
            <div class="ne-field"><label>Columns</label>
                <select v-model="s.writingSpace.columns" class="ne-input"><option :value="null">not recorded</option><option :value="1">one column</option><option :value="2">two columns</option></select></div>
            <div v-if="s.writingSpace.columns === 2" class="ne-field"><label>Column width (cm)</label><input v-model.number="s.writingSpace.columnWidth" type="number" step="0.1" min="0" class="ne-input" /></div>
            <div class="ne-field"><label>Side column</label>
                <select v-model="s.writingSpace.sideColumn" class="ne-input"><option value="">not recorded</option><option v-for="t in SIDE_COLUMN" :key="t.key" :value="t.key">{{ t.en }}</option></select></div>
            <div v-if="s.writingSpace.sideColumn === 'initials' || s.writingSpace.sideColumn === 'margin'" class="ne-field"><label>Its width (cm)</label><input v-model.number="s.writingSpace.sideColumnWidth" type="number" step="0.05" min="0" class="ne-input" /></div>
        </div>
        <div class="row">
            <div class="ne-field"><label>Lines per page{{ s.writingSpace.columns === 2 ? ' (per column)' : '' }}</label>
                <span class="pair"><input v-model.number="s.writingSpace.lines.count.min" type="number" min="0" class="ne-input" aria-label="from" /> – <input v-model.number="s.writingSpace.lines.count.max" type="number" min="0" class="ne-input" aria-label="to (optional)" /></span></div>
            <div class="ne-field"><label>Counted as</label>
                <select v-model="s.writingSpace.lines.unit" class="ne-input"><option value="">not recorded</option><option v-for="t in LINE_UNIT" :key="t.key" :value="t.key">{{ t.en }}</option></select></div>
            <label class="ne-check end"><input v-model="s.writingSpace.lines.variable" type="checkbox" /> varying number (the count is the maximum)</label>
        </div>
        <div class="checks"><span class="ne-label">Frame ruled</span>
            <label v-for="t in RULING" :key="t.key" class="ne-check"><input type="checkbox" :checked="s.writingSpace.ruling.includes(t.key)" @change="toggle(s.writingSpace.ruling, t.key)" /> {{ t.en }}</label></div>
        <details>
            <summary>Margins (for the diagram)</summary>
            <div class="row">
                <div v-for="side in ['top', 'bottom', 'outer', 'inner']" :key="side" class="ne-field"><label>{{ side }} (cm)</label><input v-model.number="s.writingSpace.margins[side]" type="number" step="0.1" min="0" class="ne-input" /></div>
            </div>
        </details>
    </fieldset>

    <fieldset>
        <legend>2 · Text lines and staves</legend>
        <div class="row">
            <div class="ne-field"><label>Text and music</label>
                <select v-model="s.staves.arrangement" class="ne-input"><option value="">not recorded</option><option v-for="t in ARRANGEMENT" :key="t.key" :value="t.key">{{ t.en }}</option></select></div>
            <div class="ne-field"><label>Neumes</label>
                <select v-model="s.staves.heighting" class="ne-input"><option value="">not recorded</option><option v-for="t in HEIGHTING" :key="t.key" :value="t.key">{{ t.en }}</option></select></div>
        </div>
        <div class="row">
            <div class="ne-field"><label>Staff lines</label>
                <select v-model="s.staves.lineCount" class="ne-input"><option :value="null">not recorded</option><option v-for="n in LINE_COUNTS" :key="n" :value="n">{{ n === 0 ? 'no line' : n }}</option></select></div>
            <div class="ne-field"><label>Colour of the plain lines</label>
                <select v-model="s.staves.lineColour" class="ne-input"><option value="">not recorded</option><option v-for="t in COLOUR" :key="t.key" :value="t.key">{{ t.en }}</option></select></div>
            <div class="ne-field"><label>Text line also a staff line</label>
                <select v-model="s.staves.textLineAsStaffLine" class="ne-input"><option value="">no / not recorded</option><option v-for="t in FREQUENCY" :key="t.key" :value="t.key">{{ freqLabel(t) }}</option></select></div>
        </div>
        <div class="checks"><span class="ne-label">Staff lines drawn</span>
            <label v-for="t in RULING" :key="t.key" class="ne-check"><input type="checkbox" :checked="s.staves.ruling.includes(t.key)" @change="toggle(s.staves.ruling, t.key)" /> {{ t.en }}</label></div>
        <div class="list">
            <span class="ne-label">Other numbers of lines that occur</span>
            <div v-for="(o, i) in s.staves.otherLineCounts" :key="i" class="item">
                <select v-model.number="o.count" class="ne-input" aria-label="number of lines"><option v-for="n in LINE_COUNTS" :key="n" :value="n">{{ n }}</option></select>
                <select v-model="o.frequency" class="ne-input" aria-label="how often"><option v-for="t in FREQUENCY" :key="t.key" :value="t.key">{{ freqLabel(t) }}</option></select>
                <button type="button" class="ne-btn ne-btn--sm ne-btn--ghost" title="Remove" @click="s.staves.otherLineCounts.splice(i, 1)">✕</button>
            </div>
            <button type="button" class="ne-btn ne-btn--sm" @click="addLineCount">+ Number of lines</button>
        </div>
    </fieldset>

    <fieldset>
        <legend>3 · Colourings</legend>
        <div class="list">
            <span class="ne-label">Coloured staff lines, most frequent first</span>
            <div v-for="(l, i) in s.colourings.lines" :key="i" class="item">
                <span class="swatch" :style="{ background: COLOUR_HEX[l.colour] || 'transparent' }"></span>
                <select v-model="l.colour" class="ne-input" aria-label="colour"><option value="">colour?</option><option v-for="t in COLOUR" :key="t.key" :value="t.key">{{ t.en }}</option></select>
                <select v-model="l.pitch" class="ne-input" aria-label="pitch"><option value="">pitch?</option><option v-for="p in PITCH_LETTERS" :key="p" :value="p">{{ p }} line</option></select>
                <select v-model="l.alternative" class="ne-input" aria-label="or (octave)"><option value="">(no alternative)</option><option v-for="p in PITCH_LETTERS" :key="p" :value="p">or {{ p }}</option></select>
                <select v-model="l.frequency" class="ne-input" aria-label="how often"><option v-for="t in FREQUENCY" :key="t.key" :value="t.key">{{ freqLabel(t) }}</option></select>
                <button type="button" class="ne-btn ne-btn--sm ne-btn--ghost" title="Up" @click="move(s.colourings.lines, i, -1)">↑</button>
                <button type="button" class="ne-btn ne-btn--sm ne-btn--ghost" title="Remove" @click="s.colourings.lines.splice(i, 1)">✕</button>
            </div>
            <button type="button" class="ne-btn ne-btn--sm" @click="addColouredLine">+ Coloured line</button>
        </div>
        <div class="row">
            <div class="ne-field"><label>Rubrics</label>
                <select v-model="s.colourings.rubrication" class="ne-input"><option value="">not recorded</option><option v-for="t in RUBRICATION" :key="t.key" :value="t.key">{{ t.en }}</option></select></div>
            <div class="ne-field"><label>Initials, lines high</label>
                <span class="pair"><input v-model.number="s.colourings.initials.size.min" type="number" min="0" class="ne-input" aria-label="from" /> – <input v-model.number="s.colourings.initials.size.max" type="number" min="0" class="ne-input" aria-label="to (optional)" /></span></div>
        </div>
        <div class="checks"><span class="ne-label">Initials</span>
            <label v-for="t in INITIAL_KIND" :key="t.key" class="ne-check"><input type="checkbox" :checked="s.colourings.initials.kinds.includes(t.key)" @change="toggle(s.colourings.initials.kinds, t.key)" /> {{ t.en }}</label></div>
        <div class="checks"><span class="ne-label">Colours of the initials</span>
            <label v-for="t in COLOUR" :key="t.key" class="ne-check"><input type="checkbox" :checked="s.colourings.initials.colours.includes(t.key)" @change="toggle(s.colourings.initials.colours, t.key)" /><span class="swatch" :style="{ background: COLOUR_HEX[t.key] }"></span>{{ t.en }}</label></div>
        <div class="checks"><span class="ne-label">Melisma bands</span>
            <label v-for="t in COLOUR" :key="t.key" class="ne-check"><input type="checkbox" :checked="s.colourings.melismaBands.includes(t.key)" @change="toggle(s.colourings.melismaBands, t.key)" /><span class="swatch" :style="{ background: COLOUR_HEX[t.key] }"></span>{{ t.en }}</label></div>
    </fieldset>

    <fieldset>
        <legend>4 · Clefs and custodes</legend>
        <div class="list">
            <span class="ne-label">Clefs, most frequent first. Letters written together in one entry ("F c" = F and c clef); alternatives as separate entries.</span>
            <div v-for="(u, i) in s.clefs.uses" :key="i" class="item">
                <input class="ne-input letters" :value="u.letters.join(' ')" placeholder="e.g. F c" aria-label="clef letters" @change="u.letters = lettersFrom($event.target.value); $event.target.value = u.letters.join(' ')" />
                <select v-model="u.frequency" class="ne-input" aria-label="how often"><option v-for="t in FREQUENCY" :key="t.key" :value="t.key">{{ freqLabel(t) }}</option></select>
                <button type="button" class="ne-btn ne-btn--sm ne-btn--ghost" title="Up" @click="move(s.clefs.uses, i, -1)">↑</button>
                <button type="button" class="ne-btn ne-btn--sm ne-btn--ghost" title="Remove" @click="s.clefs.uses.splice(i, 1)">✕</button>
            </div>
            <button type="button" class="ne-btn ne-btn--sm" @click="addClefUse">+ Clef</button>
            <span class="hint">Letters: {{ PITCH_LETTERS.join(' ') }}</span>
        </div>
        <div class="list">
            <span class="ne-label">Shape of a clef letter</span>
            <div v-for="(sh, i) in s.clefs.shapes" :key="i" class="item">
                <select v-model="sh.letter" class="ne-input" aria-label="letter"><option v-for="p in PITCH_LETTERS" :key="p" :value="p">{{ p }} clef</option></select>
                <select v-model="sh.shape" class="ne-input" aria-label="shape"><option v-for="t in CLEF_SHAPE" :key="t.key" :value="t.key">{{ t.en }}</option></select>
                <button type="button" class="ne-btn ne-btn--sm ne-btn--ghost" title="Remove" @click="s.clefs.shapes.splice(i, 1)">✕</button>
            </div>
            <button type="button" class="ne-btn ne-btn--sm" @click="addShape">+ Shape</button>
        </div>
        <div class="row">
            <div class="ne-field"><label>Placement</label>
                <select v-model="s.clefs.placement" class="ne-input"><option value="">not recorded</option><option v-for="t in CLEF_PLACEMENT" :key="t.key" :value="t.key">{{ t.en }}</option></select></div>
            <div class="ne-field"><label>Clef changes</label>
                <select v-model="s.clefs.changes" class="ne-input"><option value="">not recorded</option><option v-for="t in CLEF_CHANGE" :key="t.key" :value="t.key">{{ t.en }}</option></select></div>
            <div class="ne-field"><label>Custos</label>
                <select v-model="s.clefs.custos" class="ne-input"><option value="">not recorded</option><option v-for="t in CUSTOS" :key="t.key" :value="t.key">{{ t.en }}</option></select></div>
        </div>
    </fieldset>

    <fieldset>
        <legend>Note</legend>
        <div class="row">
            <div class="ne-field"><label>English</label><textarea v-model="s.note" class="ne-input" rows="2"></textarea></div>
            <div class="ne-field"><label>German original</label><textarea v-model="s.note_de" class="ne-input" rows="2"></textarea></div>
        </div>
    </fieldset>
</div>
</template>

<style scoped>
.sec { display: flex; flex-direction: column; gap: var(--space-3); }
fieldset { border: 1px solid var(--color-border); border-radius: var(--radius-md, 6px); padding: var(--space-3) var(--space-4) var(--space-4); margin: 0; display: flex; flex-direction: column; gap: var(--space-3); }
legend { font-weight: 700; font-size: 0.92rem; padding: 0 var(--space-2); }
.row { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: flex-end; }
.row > .ne-field { flex: 1 1 150px; }
.pair { display: flex; align-items: center; gap: var(--space-1); }
.pair .ne-input { width: 0; flex: 1; }
.checks { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); align-items: center; }
.checks .ne-label { flex-basis: 100%; }
.list { display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start; }
.item { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
.item .ne-input { width: auto; }
.letters { width: 8em !important; }
.swatch { display: inline-block; width: 12px; height: 12px; border-radius: 2px; border: 1px solid rgba(0, 0, 0, 0.2); }
.hint { font-size: 0.78rem; color: var(--color-text-muted); }
.end { padding-bottom: 0.45em; }
.problems { margin: 0; padding-left: 2em; }
details summary { cursor: pointer; font-size: 0.85rem; color: var(--color-text-muted); }
</style>

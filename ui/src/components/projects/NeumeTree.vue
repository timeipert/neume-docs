<script setup>
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import SnippetThumb from './SnippetThumb.vue';
import PatternCode from '../PatternCode.vue';
import { THUMB, ROOT_BOX } from '../../utils/neumeTree';

/**
 * The neume tree, drawn: a column for each number of notes, left to right, the root
 * at the left. Where everything goes is decided by `layoutNeumeTree`; this only draws it
 * (the same layout is what the PDF is made from).
 *
 * A box that is one of the project's patterns is a link to its cell. At every box two buttons
 * appear: go on from it (the boxes that grow out of it are made), and hide it (with all that
 * grows out of it). A box made by going on is not a pattern of the table, and is drawn lighter.
 * At the right end, a button goes on from every box of the last column at once.
 */
const props = defineProps({
    tree: { type: Object, required: true },
    layout: { type: Object, required: true },
    /** node -> { kind: 'shape'|'photo'|'missing', picture, snippet, content, fit } */
    entries: { type: Object, required: true },
    projectId: { type: String, required: true },
    /** code -> number of snippets */
    counts: { type: Object, default: () => new Map() },
    /** whether going on from the last column would make anything */
    canGrowColumn: { type: Boolean, default: true }
});

defineEmits(['grow', 'ungrow', 'hide', 'grow-column']);

/** The row of headings over the columns. */
const HEAD = 28;
/** Room at the right for the button that adds a column. */
const MORE = 132;

const hover = ref(null);
/** The way from the root to the node under the pointer. */
const path = computed(() => {
    const on = new Set();
    for (let at = hover.value; at; at = at.parent) on.add(at);
    return on;
});

const root = computed(() => props.layout.boxes.get(props.tree.root));
const placed = computed(() => props.tree.nodes.map(node => ({ node, box: props.layout.boxes.get(node), entry: props.entries.get(node) })).filter(p => p.box && p.entry));
const heading = (count) => (count === 0 ? '' : count === 1 ? '1 note' : `${count} notes`);
const last = computed(() => props.tree.columns[props.tree.columns.length - 1]);

function title(node) {
    const n = props.counts.get(node.code) || 0;
    const written = node.codes.length > 1 ? ` (also written ${node.codes.filter(c => c !== node.code).join(', ')})` : '';
    const where = node.chosen ? (n ? `${n} snippet${n === 1 ? '' : 's'}` : 'no snippet yet') : 'made by going on: not a pattern of the table';
    return `${node.code}${written} · as a tree ${node.text} · ${where}`;
}
const cell = (code) => ({ name: 'project_cell', params: { id: props.projectId }, query: { code } });
</script>

<template>
<div class="nt" :style="{ width: `${layout.width + MORE}px`, height: `${layout.height + HEAD}px` }">
    <span
        v-for="col in layout.columns"
        :key="col.count"
        class="head"
        :style="{ left: `${col.x}px`, width: `${col.w}px` }"
    >{{ heading(col.count) }}</span>

    <button
        v-if="last && canGrowColumn"
        type="button"
        class="more"
        :style="{ left: `${layout.width + 20}px` }"
        :title="`Go on: make the boxes that grow out of every box with ${last.count} notes`"
        @click="$emit('grow-column')"
    ><b>+</b> {{ last.count + 1 }} notes</button>

    <svg class="lines" :width="layout.width" :height="layout.height + HEAD" aria-hidden="true">
        <g :transform="`translate(0 ${HEAD})`">
            <path
                v-for="e in layout.edges"
                :key="e.to.id"
                :d="e.d"
                class="line"
                :class="{ on: path.has(e.to), made: !e.to.chosen }"
            />
        </g>
    </svg>

    <span
        class="root"
        title="The root: every single note starts here"
        :style="{ left: `${root.x + (root.w - ROOT_BOX.w) / 2}px`, top: `${root.y + HEAD}px`, width: `${ROOT_BOX.w}px`, height: `${ROOT_BOX.h}px` }"
    ></span>

    <div
        v-for="{ node, box, entry } in placed"
        :key="node.id"
        class="node"
        :class="[`node--${entry.kind}`, { on: path.has(node), made: !node.chosen }]"
        :style="{ left: `${box.x}px`, top: `${box.y + HEAD}px`, width: `${box.w}px`, height: `${box.h}px` }"
        @mouseenter="hover = node"
        @mouseleave="hover = null"
        @focusin="hover = node"
        @focusout="hover = null"
    >
        <component
            :is="node.chosen ? RouterLink : 'span'"
            :to="node.chosen ? cell(node.code) : undefined"
            class="face"
            :title="title(node)"
        >
            <span v-if="entry.kind === 'photo'" class="photo" :style="{ width: `${THUMB.w}px`, height: `${THUMB.h}px` }">
                <SnippetThumb :snippet="entry.snippet" :width="THUMB.w" :height="THUMB.h" />
            </span>
            <span v-else-if="entry.kind === 'missing'" class="photo none" :style="{ width: `${THUMB.w}px`, height: `${THUMB.h}px` }">
                <svg
                    class="shape"
                    :width="entry.picture.width * entry.fit"
                    :height="entry.picture.height * entry.fit"
                    :viewBox="entry.picture.viewBox"
                    v-html="entry.picture.inner"
                ></svg>
            </span>
            <svg
                v-else
                class="shape"
                :width="entry.picture.width"
                :height="entry.picture.height"
                :viewBox="entry.picture.viewBox"
                v-html="entry.picture.inner"
            ></svg>
            <PatternCode :pattern="node.code" class="code" />
        </component>

        <span class="tools">
            <button
                v-if="!node.grown && node.canGrow"
                type="button"
                class="tool"
                title="Go on from here: make the boxes that grow out of this one"
                :aria-label="`Go on from ${node.code}`"
                @click="$emit('grow', node)"
            >+</button>
            <button
                v-else-if="node.grown"
                type="button"
                class="tool"
                title="Take back the boxes that were made from here"
                :aria-label="`Take back the boxes made from ${node.code}`"
                @click="$emit('ungrow', node)"
            >&minus;</button>
            <button
                type="button"
                class="tool tool--hide"
                :title="`Hide this box${node.children.length ? ' and everything that grows out of it' : ''}${node.chosen ? '. The table keeps the pattern' : ''}`"
                :aria-label="`Hide ${node.code}`"
                @click="$emit('hide', node)"
            >&times;</button>
        </span>
    </div>
</div>
</template>

<style scoped>
.nt { position: relative; }
.head { position: absolute; top: 0; text-align: center; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--color-text-light); white-space: nowrap; }
.more { position: absolute; top: -4px; display: inline-flex; align-items: center; gap: 6px; padding: 0.25em 0.8em; border: 1px dashed var(--color-border-hover); border-radius: 999px; background: #fff; color: var(--color-text-muted); font-size: 0.78rem; font-weight: 700; white-space: nowrap; cursor: pointer; }
.more b { font-size: 1rem; line-height: 1; }
.more:hover { border-color: var(--color-primary); color: var(--color-primary-dark); background: var(--color-primary-light); }
.lines { position: absolute; left: 0; top: 0; pointer-events: none; overflow: visible; }
.line { fill: none; stroke: #555; stroke-width: 1; opacity: 0.55; transition: opacity 0.12s, stroke 0.12s; }
.line.made { stroke-dasharray: 4 3; opacity: 0.4; }
.line.on { stroke: var(--color-primary); stroke-width: 2; stroke-dasharray: none; opacity: 1; }
.root { position: absolute; border-radius: 50%; background: #222; transform: scale(0.7); }

.node { position: absolute; }
.face { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; height: 100%; text-decoration: none; color: var(--color-text); border-radius: var(--radius-md); }
a.face:hover, a.face:focus-visible { outline: none; background: var(--color-primary-light); }
.shape { display: block; flex: none; }
.code { height: 14px; line-height: 14px; font-size: 11px; }
.node.on .code { font-weight: 700; }
.node.made .shape, .node.made .photo { opacity: 0.55; }
.node.made .code { font-style: italic; }

.photo { display: inline-flex; align-items: center; justify-content: center; overflow: hidden; border-radius: var(--radius-md); border: 1px solid var(--color-border-hover); background: #fff; box-sizing: border-box; }
.photo :deep(img), .photo :deep(canvas), .photo :deep(svg) { max-width: 100%; max-height: 100%; object-fit: contain; }
.photo.none { border-style: dashed; background: transparent; }

/* the buttons of a box: there when the pointer or the keyboard is on it */
.tools { position: absolute; top: -9px; right: -9px; display: flex; gap: 3px; opacity: 0; pointer-events: none; transition: opacity 0.12s; z-index: 2; }
.node:hover .tools, .node:focus-within .tools { opacity: 1; pointer-events: auto; }
.tool { width: 20px; height: 20px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--color-border-hover); border-radius: 50%; background: #fff; color: var(--color-text-muted); font-size: 0.95rem; line-height: 1; font-weight: 700; cursor: pointer; box-shadow: var(--shadow-sm); }
.tool:hover { border-color: var(--color-primary); color: var(--color-primary-dark); background: var(--color-primary-light); }
.tool--hide:hover { border-color: var(--color-danger, #c0392b); color: var(--color-danger, #c0392b); background: #fff; }
</style>

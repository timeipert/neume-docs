<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
    fitView, pageSize, rectFromCorners, rectOnStage, stageToPage, zoomAt
} from '../../utils/pageEditing';

/**
 * The page image, big, with boxes on it: where a line or a sign is, and the box being drawn.
 *
 * It shows what it is given and says what the person did: a box was drawn (`draw`), a box was clicked
 * (`pick`). Zoom with the wheel, move with Alt or the middle button (or the left one while nothing
 * is being drawn), and the buttons at the corner fit the picture to the line or to the whole page.
 * Boxes are drawn in the pixels of the stage, so their outlines and labels keep their size however far
 * the page is zoomed.
 */
const props = defineProps({
    imageUrl: { type: String, required: true },
    /** the part to zoom to, in percent of the page: `{ x, y, w, h }`; null shows the whole page */
    focus: { type: Object, default: null },
    /** dim what is outside of the focus */
    shade: { type: Boolean, default: false },
    /** [{ id, rect, label, tone: 'line'|'sign', active?, faint? }] */
    boxes: { type: Array, default: () => [] },
    /** a box that is waiting for what to do with it */
    draft: { type: Object, default: null },
    /** a drag draws a box (otherwise it moves the page) */
    drawing: { type: Boolean, default: true }
});
const emit = defineEmits(['draw', 'pick']);

const viewport = ref(null);
const stage = reactive({ w: 0, h: 0 });
const aspect = ref(0);
const failed = ref(false);
const view = ref({ s: 1, tx: 0, ty: 0 });
const touched = ref(false); // the person has zoomed or moved: leave the view alone when the window changes

const base = computed(() => pageSize(stage, aspect.value));
const ready = computed(() => base.value.w > 0);

function fit(rect = props.focus) {
    view.value = fitView(stage, base.value, rect);
    touched.value = false;
}
defineExpose({ fit, fitPage: () => fit(null) });

watch([ready, () => props.imageUrl, () => JSON.stringify(props.focus)], () => { if (ready.value) fit(); });

let observer = null;
onMounted(() => {
    observer = new ResizeObserver(([entry]) => {
        stage.w = entry.contentRect.width;
        stage.h = entry.contentRect.height;
        if (ready.value && !touched.value) fit();
    });
    observer.observe(viewport.value);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
});
onBeforeUnmount(() => {
    if (observer) observer.disconnect();
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKey);
});

function onLoad(e) {
    failed.value = false;
    aspect.value = e.target.naturalWidth / e.target.naturalHeight || 0.7;
}
watch(() => props.imageUrl, () => { aspect.value = 0; failed.value = false; });

// ---- drawing, moving, clicking ------------------------------------------------------

const live = ref(null); // the box being dragged, in percent of the page
const space = ref(false);
let gesture = null;

function onKey(e) {
    if (e.code !== 'Space') return;
    if (e.type === 'keydown' && e.target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName)) return;
    space.value = e.type === 'keydown';
    if (space.value) e.preventDefault();
}

const point = (e) => {
    const r = viewport.value.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
};

function onDown(e) {
    if (e.button === 2 || !ready.value) return;
    const pan = e.button === 1 || e.altKey || space.value || !props.drawing;
    const at = point(e);
    gesture = { pan, at, view: { ...view.value }, moved: false };
    viewport.value.setPointerCapture(e.pointerId);
    if (pan) e.preventDefault();
}

function onMove(e) {
    if (!gesture) return;
    const at = point(e);
    const dx = at.x - gesture.at.x;
    const dy = at.y - gesture.at.y;
    if (!gesture.moved && Math.hypot(dx, dy) < 6) return;
    gesture.moved = true;
    if (gesture.pan) {
        touched.value = true;
        view.value = { ...gesture.view, tx: gesture.view.tx + dx, ty: gesture.view.ty + dy };
    } else {
        live.value = rectFromCorners(stageToPage(view.value, base.value, gesture.at), stageToPage(view.value, base.value, at));
    }
}

function onUp(e) {
    if (!gesture) return;
    const done = gesture;
    gesture = null;
    const box = live.value;
    live.value = null;
    if (viewport.value.hasPointerCapture(e.pointerId)) viewport.value.releasePointerCapture(e.pointerId);
    if (done.moved) {
        if (box && box.w > 0 && box.h > 0) emit('draw', box);
        return;
    }
    // no movement: a click on a box
    const hit = document.elementsFromPoint(e.clientX, e.clientY).find(el => el.dataset && el.dataset.box);
    if (hit) emit('pick', hit.dataset.box);
}

function onWheel(e) {
    if (!ready.value) return;
    touched.value = true;
    view.value = zoomAt(view.value, point(e), Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
}

function zoomBy(factor) {
    touched.value = true;
    view.value = zoomAt(view.value, { x: stage.w / 2, y: stage.h / 2 }, factor);
}

// ---- what is drawn on it -------------------------------------------------------------

const place = (rect) => rectOnStage(view.value, base.value, rect);
const px = (r) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });

const placed = computed(() => props.boxes.map(b => ({ ...b, at: place(b.rect) })).filter(b => b.at.width > 2 && b.at.height > 2));
const focusAt = computed(() => (props.shade && props.focus ? px(place(props.focus)) : null));
const draftAt = computed(() => {
    const rect = live.value || props.draft;
    return rect ? px(place(rect)) : null;
});
const imageStyle = computed(() => ({
    width: `${base.value.w}px`,
    height: `${base.value.h}px`,
    transform: `translate(${view.value.tx}px, ${view.value.ty}px) scale(${view.value.s})`
}));
const cursor = computed(() => (gesture && gesture.pan ? 'grabbing' : space.value || !props.drawing ? 'grab' : 'crosshair'));
</script>

<template>
<div
    ref="viewport"
    class="stage"
    :style="{ cursor }"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @wheel.prevent="onWheel"
    @contextmenu.prevent
>
    <img :src="imageUrl" class="page" :class="{ on: ready }" :style="imageStyle" alt="The page" draggable="false" @load="onLoad" @error="failed = true" />

    <template v-if="ready">
        <div v-if="focusAt" class="shade" :style="focusAt"></div>

        <div
            v-for="b in placed"
            :key="b.id"
            class="box"
            :class="[`box--${b.tone}`, { active: b.active, faint: b.faint }]"
            :style="px(b.at)"
            :data-box="b.id"
        >
            <span v-if="b.label" class="tag" :class="{ inside: b.at.top < 22 }">{{ b.label }}</span>
        </div>

        <div v-if="draftAt" class="box box--draft" :style="draftAt"></div>
    </template>

    <p v-if="!ready && !failed" class="note">Loading the page…</p>
    <p v-if="failed" class="note error">This page image could not be loaded.</p>

    <div class="hint"><slot name="hint" /></div>

    <div class="zoom" @pointerdown.stop @wheel.stop>
        <button type="button" title="Zoom out" aria-label="Zoom out" @click="zoomBy(1 / 1.4)">&minus;</button>
        <button type="button" title="Zoom in" aria-label="Zoom in" @click="zoomBy(1.4)">+</button>
        <button v-if="focus" type="button" class="wide" title="Fit the line to the stage" @click="fit()">Fit line</button>
        <button type="button" class="wide" title="Show the whole page" @click="fit(null)">Whole page</button>
    </div>
</div>
</template>

<style scoped>
.stage { position: relative; width: 100%; height: 100%; min-height: 0; overflow: hidden; background: #1b2434; touch-action: none; user-select: none; }
.page { position: absolute; left: 0; top: 0; max-width: none; transform-origin: 0 0; opacity: 0; pointer-events: none; box-shadow: 0 0 40px rgba(0, 0, 0, 0.5); }
.page.on { opacity: 1; }

.shade { position: absolute; pointer-events: none; box-shadow: 0 0 0 5000px rgba(15, 23, 42, 0.5); border: 1px dashed rgba(255, 255, 255, 0.55); box-sizing: border-box; }

.box { position: absolute; box-sizing: border-box; border: 2px solid var(--color-primary); background: rgba(59, 130, 246, 0.12); border-radius: 2px; }
.box--line { border-color: #22c55e; background: rgba(34, 197, 94, 0.1); }
.box--line:hover { background: rgba(34, 197, 94, 0.28); cursor: pointer; }
.box--sign { border-color: #f59e0b; background: rgba(245, 158, 11, 0.16); }
.box--sign:hover { background: rgba(245, 158, 11, 0.32); cursor: pointer; }
.box.active { border-width: 3px; background: rgba(245, 158, 11, 0.3); box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.7); }
.box.faint { opacity: 0.5; }
.box--draft { border-style: dashed; border-color: #fff; background: rgba(59, 130, 246, 0.28); pointer-events: none; }
.tag { position: absolute; left: -2px; top: -22px; padding: 1px 7px; font-size: 0.74rem; font-weight: 700; line-height: 1.5; white-space: nowrap; color: #fff; background: rgba(15, 23, 42, 0.88); border-radius: 4px; pointer-events: none; }
.tag.inside { top: 2px; left: 2px; }
.box--line .tag { background: #15803d; }
.box--sign .tag { background: #b45309; font-family: var(--font-mono, ui-monospace, Menlo, monospace); }

.note { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; margin: 0; color: #cbd5e1; font-size: 0.95rem; pointer-events: none; }
.note.error { color: #fca5a5; font-weight: 600; }

.hint { position: absolute; left: var(--space-3); bottom: var(--space-3); max-width: calc(100% - 16rem); pointer-events: none; display: flex; flex-wrap: wrap; gap: 6px; }
.hint :deep(*) { pointer-events: auto; }

.zoom { position: absolute; right: var(--space-3); bottom: var(--space-3); display: flex; gap: 4px; padding: 4px; background: rgba(15, 23, 42, 0.82); border-radius: var(--radius-md); }
.zoom button { min-width: 2rem; height: 2rem; padding: 0 8px; font-size: 1rem; line-height: 1; color: #e2e8f0; background: transparent; border: 1px solid rgba(255, 255, 255, 0.18); border-radius: var(--radius-sm); }
.zoom button.wide { font-size: 0.78rem; font-weight: 600; }
.zoom button:hover { background: rgba(255, 255, 255, 0.14); color: #fff; }
</style>

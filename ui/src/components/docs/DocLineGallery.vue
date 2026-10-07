<script setup>
import { computed, ref } from 'vue';
import DocPattern from './DocPattern.vue';
import { useDocs } from '../../composables/useDocsContext';

/**
 * The lines of a manuscript, each as one picture with the snippets drawn on it: hover a mark to see
 * which snippet it is, click it to open it. A mark is the polygon (or box) the authors drew, in percent
 * of the line's picture, so it needs no knowledge of the page it was cut from.
 */
const props = defineProps({
    entry: { type: Object, required: true },
    lines: { type: Array, required: true },
    /** the manuscript's snippets by id */
    snippets: { type: Object, required: true },
    /** the snippet an address points at */
    target: { type: String, default: '' }
});
const emit = defineEmits(['open', 'cite-line']);

const docs = useDocs();
const hover = ref('');

const cards = computed(() => props.lines.map(line => ({
    ...line,
    image: docs.asset(line.image),
    marks: line.items.map(it => {
        const s = props.snippets[it.id];
        const b = it.box;
        return {
            id: it.id, snippet: s,
            points: it.points || (b ? `${b.x},${b.y} ${b.x + b.w},${b.y} ${b.x + b.w},${b.y + b.h} ${b.x},${b.y + b.h}` : ''),
            x: b ? b.x : firstPoint(it.points).x, y: b ? b.y : firstPoint(it.points).y
        };
    }).filter(m => m.snippet && m.points),
    holdsTarget: !!props.target && line.items.some(it => it.id === props.target)
})));

function firstPoint(points) {
    const [x, y] = String(points || '').split(' ')[0].split(',').map(parseFloat);
    return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}

const starred = (id) => docs.stars.has(props.entry.id, id);
const failed = ref(new Set());
</script>

<template>
<div class="gallery">
    <article v-for="line in cards" :key="line.id" class="line" :class="{ 'is-target': line.holdsTarget }" :data-target="line.holdsTarget ? 'true' : null">
        <header>
            <h4><span class="fol">{{ line.folio || '–' }}</span><span class="div">/</span><span>{{ line.name || '–' }}</span></h4>
            <div class="tags">
                <button v-for="m in line.marks" :key="m.id" type="button" class="tag" :class="{ on: hover === m.id || target === m.id }" @mouseenter="hover = m.id" @mouseleave="hover = ''" @click="emit('open', m.snippet)">
                    {{ starred(m.id) ? '★ ' : '' }}{{ m.snippet.refId }}
                </button>
            </div>
        </header>
        <div class="picture" :class="{ blank: !line.image || failed.has(line.id) }">
            <img v-if="line.image && !failed.has(line.id)" :src="line.image" :alt="`Line ${line.name} of folio ${line.folio}`" loading="lazy" referrerpolicy="no-referrer" @error="failed = new Set([...failed, line.id])" />
            <p v-else class="no-picture">No picture of this line{{ line.image ? ' could be loaded' : '' }}. The marks show where the snippets are.</p>
            <svg class="marks" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <polygon v-for="m in line.marks" :key="m.id" :points="m.points" class="mark" :class="{ on: hover === m.id, target: target === m.id, star: starred(m.id) }" vector-effect="non-scaling-stroke" @mouseenter="hover = m.id" @mouseleave="hover = ''" @click="emit('open', m.snippet)">
                    <title>{{ m.snippet.refId }} · {{ m.snippet.pattern }}</title>
                </polygon>
            </svg>
            <span v-for="m in line.marks" :key="`l${m.id}`" class="label" :class="{ on: hover === m.id || target === m.id }" :style="{ left: m.x + '%', top: m.y + '%' }">{{ m.snippet.refId }}</span>
        </div>
    </article>
    <p v-if="!cards.length" class="none">No lines are drawn for this manuscript.</p>
</div>
</template>

<style scoped>
.gallery { display: flex; flex-direction: column; gap: var(--space-4); }
.line { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden; }
.line > header { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); flex-wrap: wrap; padding: var(--space-2) var(--space-3); background: var(--color-bg); border-bottom: 1px solid var(--color-border); }
h4 { margin: 0; font-size: 0.95rem; display: flex; gap: 8px; align-items: baseline; }
.fol { font-weight: 700; }
.div { color: var(--color-border-hover); }
.tags { display: flex; flex-wrap: wrap; gap: 4px; }
.tag { border: 1px solid var(--color-border); background: var(--color-surface-muted); border-radius: 4px; padding: 1px 7px; font-size: 0.74rem; font-weight: 700; font-family: var(--font-mono, ui-monospace, monospace); cursor: pointer; }
.tag:hover, .tag.on { background: var(--color-primary-light); border-color: var(--color-primary-muted); color: var(--color-primary-dark); }
.picture { position: relative; background: var(--color-surface-muted); }
.picture.blank { min-height: 7rem; background: repeating-linear-gradient(0deg, #f6efdd 0 18px, #efe5cc 18px 19px); }
.picture img { display: block; width: 100%; height: auto; }
.no-picture { position: absolute; left: 0; right: 0; top: 4px; margin: 0; text-align: center; font-size: 0.72rem; color: var(--color-text-muted); }
.marks { position: absolute; inset: 0; width: 100%; height: 100%; }
.mark { fill: rgba(34, 197, 94, 0.12); stroke: var(--color-success); stroke-width: 1; cursor: pointer; transition: fill 0.12s; }
.mark.on, .mark:hover { fill: rgba(59, 130, 246, 0.3); stroke: var(--color-primary); stroke-width: 2; }
.mark.star { stroke: #e0a100; }
.mark.target { fill: rgba(245, 158, 11, 0.4); stroke: var(--color-warning); stroke-width: 3; }
.label { position: absolute; transform: translate(-10%, -105%); padding: 0 4px; background: #fff; border: 1px solid #000; border-radius: 2px; font: 600 10px/1.3 var(--font-mono, ui-monospace, monospace); white-space: nowrap; pointer-events: none; opacity: 0.85; }
.label.on { opacity: 1; background: var(--color-primary-light); }
.none { margin: 0; padding: var(--space-4); text-align: center; color: var(--color-text-muted); }
.is-target { box-shadow: 0 0 0 2px var(--color-warning); }
</style>

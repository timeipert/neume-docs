<script setup>
import { computed, ref } from 'vue';
import { useProjectContext } from '../composables/useProject';
import { useProjectLines } from '../composables/useProjectLines';
import { groupSelected } from '../utils/projectTable';
import ProjectTable from '../components/projects/ProjectTable.vue';
import SegmentedControl from '../components/ui/SegmentedControl.vue';
import SnippetThumb from '../components/projects/SnippetThumb.vue';
import PatternCode from '../components/PatternCode.vue';
import AnnotationCutout from '../components/AnnotationCutout.vue';
import IiifSetup from '../components/iiif/IiifSetup.vue';

/**
 * Two things about the lines of this project: its patterns, as the standard table (or, chosen, the
 * extended one) — directly as columns, nothing to open first — and, under it, every line of the
 * manuscript with the signs marked on it by their pattern code. A pattern and its lines point at
 * each other: open one from the other.
 */
const context = useProjectContext();
const { project, library, glyphs, snippets, standardCodes, extendedCodes, iiifAvailable, needsIiif } = context;
const { onLines, lines } = useProjectLines(context);

const scope = ref('standard');
const SCOPES = [
    { value: 'standard', label: 'Standard table', title: 'The columns chosen for the standard table' },
    { value: 'extended', label: 'Extended table', title: 'The standard columns and whatever was added' }
];
const extended = computed(() => scope.value === 'extended');
const groups = computed(() => groupSelected(library.value, extended.value ? extendedCodes.value : standardCodes.value));

const table = ref(null);
const flashLines = ref(new Set());
let flashTimer = null;

/** A pattern was opened in the table: its lines, below, are scrolled to and flashed. */
function onPattern(code) {
    const matches = lines.value.filter(l => l.items.some(i => i.code === code));
    if (!matches.length) return;
    flashLines.value = new Set(matches.map(l => l.id));
    document.getElementById(`line-${matches[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flashLines.value = new Set(); }, 2000);
}

/** A sign was clicked on a line, below: its pattern, in the table above, is scrolled to and flashed. */
function onMark(code) { table.value && table.value.reveal(code); }

const boxPoints = (b) => `${b.x},${b.y} ${b.x + b.w},${b.y} ${b.x + b.w},${b.y + b.h} ${b.x},${b.y + b.h}`;
</script>

<template>
<div class="lines-view">
    <p v-if="!onLines" class="ne-note ne-note--info">
        This project marks signs on their own, not whole text lines, so there is nothing to show here. Line snippets can be chosen when a project is made, in its <em>Settings</em>.
    </p>

    <template v-else>
        <section class="patterns" aria-labelledby="patterns-h">
            <div class="head">
                <h3 id="patterns-h">Patterns</h3>
                <SegmentedControl v-model="scope" :options="SCOPES" label="Which columns" size="sm" />
            </div>
            <ProjectTable
                ref="table"
                mode="fill"
                :groups="groups"
                :snippets="snippets"
                :glyphs="glyphs"
                empty-text="No columns are chosen yet."
                @open="onPattern"
            >
                <template #thumb="{ snippet }"><SnippetThumb :snippet="snippet" :width="84" :height="60" /></template>
            </ProjectTable>
        </section>

        <IiifSetup v-if="needsIiif" :source="project.source" purpose="show the lines of the pages as pictures">
            <template #alternative>To work from screenshots instead, change the project in its <em>Settings</em>.</template>
        </IiifSetup>

        <section v-else class="gallery" aria-labelledby="lines-h">
            <div class="head">
                <h3 id="lines-h">Manuscript lines <span class="n">{{ lines.length }}</span></h3>
            </div>
            <p v-if="!lines.length" class="ne-empty">No lines are drawn for this project yet.</p>

            <div v-else class="lines">
                <article v-for="line in lines" :key="line.id" :id="`line-${line.id}`" class="line" :class="{ flash: flashLines.has(line.id) }">
                    <header>
                        <h4>{{ line.label || 'Line' }}</h4>
                        <div class="tags">
                            <button v-for="item in line.items" :key="item.id" type="button" class="tag" @click="onMark(item.code)">
                                <PatternCode :pattern="item.code" />
                            </button>
                            <span v-if="!line.items.length" class="none">no signs marked</span>
                        </div>
                    </header>

                    <div class="pic">
                        <AnnotationCutout
                            v-if="line.kind === 'iiif' && line.points && iiifAvailable"
                            :source="line.source"
                            :folio="line.folio"
                            :points="line.points"
                            :width="1100"
                            :height="190"
                            :padding="0.05"
                            hide-label
                            :overlays="line.items.map(i => ({ points: i.points, id: i.id, displayId: i.code }))"
                            @zoom-item="i => onMark(i.displayId)"
                        />
                        <template v-else-if="line.kind === 'collection'">
                            <img v-if="line.image" :src="line.image" :alt="line.label" loading="lazy" />
                            <p v-else class="no-pic">No picture of this line.</p>
                            <svg v-if="line.image" class="marks" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                                <polygon v-for="m in line.items.filter(i => i.box)" :key="m.id" :points="boxPoints(m.box)" class="mark" vector-effect="non-scaling-stroke" @click="onMark(m.code)">
                                    <title>{{ m.code }}</title>
                                </polygon>
                            </svg>
                            <button v-for="m in line.items.filter(i => i.box)" :key="`l${m.id}`" type="button" class="mark-label" :style="{ left: m.box.x + '%', top: m.box.y + '%' }" @click="onMark(m.code)"><PatternCode :pattern="m.code" /></button>
                        </template>
                    </div>
                </article>
            </div>
        </section>
    </template>
</div>
</template>

<style scoped>
.lines-view { display: flex; flex-direction: column; gap: var(--space-5); align-items: stretch; }
.head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-2); }
.head h3 { margin: 0; font-size: 1.05rem; }
.n { margin-left: 4px; padding: 0 8px; border-radius: 999px; background: var(--color-surface-muted); font-size: 0.8rem; font-weight: 600; color: var(--color-text-muted); }
.patterns :deep(.pt-scroll) { width: 100%; }
.ne-empty { margin: 0; padding: var(--space-5); text-align: center; color: var(--color-text-muted); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); }

.lines { display: flex; flex-direction: column; gap: var(--space-4); }
.line { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden; scroll-margin: var(--space-4); }
.line.flash { animation: flash-line 2s ease-out; }
@keyframes flash-line { 0% { box-shadow: 0 0 0 3px var(--color-warning); } 100% { box-shadow: 0 0 0 0 transparent; } }
.line > header { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); flex-wrap: wrap; padding: var(--space-2) var(--space-3); background: var(--color-bg); border-bottom: 1px solid var(--color-border); }
.line h4 { margin: 0; font-size: 0.92rem; }
.tags { display: flex; flex-wrap: wrap; gap: 4px; }
.tag { border: 1px solid var(--color-border); background: var(--color-surface-muted); border-radius: 4px; padding: 1px 7px; cursor: pointer; }
.tag:hover { background: var(--color-primary-light); border-color: var(--color-primary-muted); }
.none { font-size: 0.8rem; color: var(--color-text-light); }
.pic { position: relative; background: var(--color-surface-muted); }
.pic img { display: block; width: 100%; height: auto; }
.no-pic { margin: 0; padding: var(--space-4); text-align: center; font-size: 0.82rem; color: var(--color-text-muted); }
.marks { position: absolute; inset: 0; width: 100%; height: 100%; }
.mark { fill: rgba(34, 197, 94, 0.12); stroke: var(--color-success); stroke-width: 1; cursor: pointer; }
.mark:hover { fill: rgba(59, 130, 246, 0.3); stroke: var(--color-primary); stroke-width: 2; }
.mark-label { position: absolute; transform: translate(-10%, -105%); padding: 0 4px; border: 1px solid #000; border-radius: 2px; background: #fff; font-size: 10px; line-height: 1.3; white-space: nowrap; cursor: pointer; opacity: 0.85; }
.mark-label:hover { opacity: 1; background: var(--color-primary-light); }
</style>

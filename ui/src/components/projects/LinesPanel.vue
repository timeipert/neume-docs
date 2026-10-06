<script setup>
import { computed, ref } from 'vue';
import { useProjectContext } from '../../composables/useProject';
import { useLineNeumes } from '../../composables/useLineNeumes';
import { findLine, lineLabel, signsOfLine, sortedLines } from '../../utils/lineSigns';

/**
 * The lines of a screenshot project: the pictures of text lines the signs are cut
 * from. Each shows where it is from and how many signs are marked on it; with a
 * transcription, the lines the transcription has in these folios are listed too, so
 * a line can be added for the place it is meant for, with its folio and line filled in.
 */
const emit = defineEmits(['open', 'add']);

const { project, collection, hasTranscription } = useProjectContext();
const { linesInRange, ready } = useLineNeumes(computed(() => project.value.source), hasTranscription);

const lines = computed(() => sortedLines(collection.value).map(l => ({
    line: l,
    label: lineLabel(l),
    signs: signsOfLine(collection.value, l.id).length,
    unassigned: signsOfLine(collection.value, l.id).filter(s => !s.pattern).length
})));

const LIMIT = 8;
const showAll = ref(false);
/** The lines of the transcription that have no picture yet. */
const missing = computed(() => linesInRange(project.value.from, project.value.to).filter(l => !findLine(collection.value, l.folio, l.line)));
const shownMissing = computed(() => (showAll.value ? missing.value : missing.value.slice(0, LIMIT)));
</script>

<template>
<section class="lines" aria-label="Lines of this project">
    <header>
        <h3>Lines <span class="count">{{ lines.length }}</span></h3>
        <button class="ne-btn ne-btn--primary" @click="emit('add', {})">Add a line…</button>
    </header>

    <ul v-if="lines.length" class="cards">
        <li v-for="l in lines" :key="l.line.id">
            <button class="card" @click="emit('open', l.line.id)">
                <span class="pic"><img :src="l.line.image" :alt="l.label" loading="lazy" /></span>
                <span class="label">{{ l.label }}</span>
                <span class="meta">
                    <span>{{ l.signs }} sign{{ l.signs === 1 ? '' : 's' }}</span>
                    <span v-if="l.unassigned" class="warn" :title="`${l.unassigned} without a code`">{{ l.unassigned }} without code</span>
                </span>
            </button>
        </li>
    </ul>
    <p v-else class="none ne-muted">No line yet.</p>

    <details v-if="hasTranscription && ready && missing.length" class="missing">
        <summary>{{ missing.length }} line{{ missing.length === 1 ? '' : 's' }} of the transcription without a picture</summary>
        <ul>
            <li v-for="m in shownMissing" :key="`${m.folio}|${m.line}`">
                <span class="where">f. {{ m.folio }} · l. {{ m.line }}</span>
                <span class="ne-muted">{{ m.count }} neume{{ m.count === 1 ? '' : 's' }}</span>
                <button class="ne-btn ne-btn--sm" @click="emit('add', { folio: m.folio, line: m.line })">Add the picture…</button>
            </li>
        </ul>
        <button v-if="missing.length > LIMIT" class="ne-btn ne-btn--ghost ne-btn--sm" @click="showAll = !showAll">{{ showAll ? 'Show fewer' : `Show all ${missing.length}` }}</button>
    </details>
</section>
</template>

<style scoped>
.lines { padding: var(--space-4); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); display: flex; flex-direction: column; gap: var(--space-3); }
header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
h3 { margin: 0; font-size: 1rem; }
.count { margin-left: 4px; padding: 0 8px; background: var(--color-surface-muted); border-radius: 999px; font-size: 0.8rem; font-weight: 600; }
.cards { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-3); }
.card { width: 100%; display: flex; flex-direction: column; gap: 4px; padding: var(--space-2); text-align: left; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.card:hover { border-color: var(--color-primary); background: var(--color-surface); box-shadow: var(--shadow-sm); }
.pic { display: flex; align-items: center; justify-content: center; height: 56px; background: #f3f5f8; border-radius: var(--radius-sm); overflow: hidden; }
.pic img { max-width: 100%; max-height: 100%; object-fit: contain; }
.label { font-weight: 700; font-size: 0.9rem; }
.meta { display: flex; gap: var(--space-2); font-size: 0.78rem; color: var(--color-text-muted); }
.warn { color: var(--color-warning-dark); font-weight: 600; }
.none { margin: 0; font-size: 0.9rem; }
.missing summary { cursor: pointer; font-size: 0.88rem; font-weight: 600; color: var(--color-primary-dark); }
.missing ul { list-style: none; margin: var(--space-2) 0 0; padding: 0; display: flex; flex-direction: column; }
.missing li { display: flex; align-items: center; gap: var(--space-3); padding: 6px 0; border-bottom: 1px solid var(--color-border); font-size: 0.88rem; }
.where { font-weight: 700; min-width: 9rem; }
.missing li .ne-muted { flex: 1; }
</style>

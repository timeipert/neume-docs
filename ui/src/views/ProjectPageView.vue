<script setup>
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useProjectContext } from '../composables/useProject';
import { useAnnotationsStore } from '../stores/annotations';
import { projectCellLocation, projectPageLocation } from '../utils/projectChoices';
import { groupSelected } from '../utils/projectTable';
import { compareFolios } from '../utils/sorting';
import PageWorkbench from '../components/pages/PageWorkbench.vue';
import AlignmentReview from '../components/manager/AlignmentReview.vue';
import IiifSetup from '../components/iiif/IiifSetup.vue';
import PatternDisplay from '../components/PatternDisplay.vue';
import PatternCode from '../components/PatternCode.vue';

/**
 * The page editor, in the frame of the project: the same editor that marks line regions and signs on a
 * page image, with the project's tabs above it and the way back to the cell one click away. It knows
 * the project's folios, so it offers them (no list of every manuscript), and — when it was opened for
 * a code — the places where the transcription has it, one after the other.
 *
 * Without page images there is nothing to mark on: the page says so and what to do about it.
 */
const route = useRoute();
const router = useRouter();
const annotations = useAnnotationsStore();
const { project, library, glyphs, folios, occurrences, iiifInfo, iiifAvailable, extendedCodes, ensureColumn } = useProjectContext();

const folio = computed(() => String(route.query.folio || ''));
const code = computed(() => (route.query.highlight ? String(route.query.highlight) : ''));
// A project that marks signs straight on the page keeps to the page as a whole, folio after folio.
const wholePage = computed(() => project.value.snippets === 'signs');
const line = computed(() => {
    const asked = route.query.line || route.query.region;
    return asked ? String(asked) : (wholePage.value ? 'legacy' : '');
});
const from = computed(() => (route.query.from === 'extended' ? 'extended' : 'standard'));

/** Another folio or another line: the address says where, so the back button works. */
function go(target) {
    const next = { folio: folio.value, line: line.value, ...target };
    // a new folio starts on its page, not on the line of the one before
    if ('folio' in target && !('line' in target)) next.line = '';
    router.push(projectPageLocation(project.value.id, { folio: next.folio, line: next.line, code: code.value, from: from.value }));
}

/** The patterns of the project's tables, in the order of the table: the first to choose from. */
const tableCodes = computed(() => groupSelected(library.value, extendedCodes.value).flatMap(g => g.columns.map(c => c.code)));

// ---- the folios of the project ----------------------------------------------

/** What each folio holds: the neumes of the transcription, the line regions drawn on it. */
const cards = computed(() => {
    const neumes = new Map();
    for (const entry of occurrences.value.values()) for (const p of entry.places) neumes.set(p.folio, (neumes.get(p.folio) || 0) + 1);
    return folios.value.map(f => ({ folio: f, neumes: neumes.get(f) || 0, regions: annotations.getRegions(project.value.source, f).length }));
});

const index = computed(() => folios.value.indexOf(folio.value));
const neighbour = (delta) => folios.value[index.value + delta] || '';

const typed = ref('');
const openTyped = () => { if (typed.value.trim()) go({ folio: typed.value.trim() }); };

// ---- the places of the code ------------------------------------------------------

/** The folios where the transcription has the code, in reading order. */
const placeFolios = computed(() => {
    const entry = code.value && occurrences.value.get(code.value);
    if (!entry) return [];
    return [...new Set(entry.places.map(p => p.folio))].sort(compareFolios);
});
const placeIndex = computed(() => placeFolios.value.indexOf(folio.value));
const placeNeighbour = (delta) => placeFolios.value[placeIndex.value + delta] || '';

const aligning = ref(false);
const backLabel = computed(() => (code.value ? 'the cell' : 'the table'));
const back = () => router.push(projectCellLocation(project.value.id, { code: code.value, from: from.value }));
</script>

<template>
<div class="page-view">
    <IiifSetup v-if="!iiifAvailable" class="setup" :source="project.source" purpose="mark snippets on the pages of this manuscript">
        <template #alternative>
            To work without page images, change this project to <strong>screenshots</strong> in its <em>Settings</em>.
            <template v-if="iiifInfo.state === 'none'"> Snippets you have already marked stay where they are.</template>
        </template>
    </IiifSetup>

    <template v-else>
        <div class="bar">
            <button class="ne-btn ne-btn--sm" @click="back">&larr; Back to {{ backLabel }}</button>

            <span class="where" title="The folios of this project">
                <button class="ne-btn ne-btn--sm ne-btn--ghost" :disabled="!neighbour(-1)" aria-label="Previous folio" @click="go({ folio: neighbour(-1) })">&lsaquo;</button>
                <select v-if="folios.length" :value="folio" class="ne-input pick" aria-label="Folio" @change="go({ folio: $event.target.value })">
                    <option value="" disabled>Choose a folio…</option>
                    <option v-if="folio && index === -1" :value="folio">f. {{ folio }}</option>
                    <option v-for="c in cards" :key="c.folio" :value="c.folio">f. {{ c.folio }}{{ c.neumes ? ` · ${c.neumes} neumes` : '' }}{{ c.regions ? ` · ${c.regions} lines` : '' }}</option>
                </select>
                <strong v-else>f. {{ folio || '—' }}</strong>
                <button class="ne-btn ne-btn--sm ne-btn--ghost" :disabled="!neighbour(1)" aria-label="Next folio" @click="go({ folio: neighbour(1) })">&rsaquo;</button>
            </span>

            <span v-if="code" class="looking" :title="`Where the transcription has ${code} in the folios of this project`">
                <PatternDisplay :pattern="code" :glyphs="glyphs" :scale="0.6" />
                <PatternCode :pattern="code" />
                <template v-if="placeFolios.length">
                    <span class="ne-muted">{{ placeIndex >= 0 ? `folio ${placeIndex + 1} of ${placeFolios.length}` : `${placeFolios.length} folio${placeFolios.length === 1 ? '' : 's'}` }}</span>
                    <button class="ne-btn ne-btn--sm ne-btn--ghost" :disabled="placeIndex < 0 ? !placeFolios.length : !placeNeighbour(-1)" aria-label="Previous folio with this code" @click="go({ folio: placeIndex < 0 ? placeFolios[0] : placeNeighbour(-1) })">&lsaquo;</button>
                    <button class="ne-btn ne-btn--sm ne-btn--ghost" :disabled="!placeNeighbour(1)" aria-label="Next folio with this code" @click="go({ folio: placeNeighbour(1) })">&rsaquo;</button>
                </template>
                <span v-else class="ne-muted">not in the transcription</span>
            </span>

            <span class="grow"></span>
            <button class="ne-btn ne-btn--sm ne-btn--ghost" title="Check how the scans of this manuscript are matched with its folios" @click="aligning = true">⇄ Scans and folios</button>
        </div>

        <div v-if="!folio" class="choose">
            <h2>Which folio?</h2>
            <p class="ne-muted">The pages of {{ project.source }}<template v-if="folios.length"> in this project</template>. Pick one to mark line regions and signs on it.</p>
            <ul v-if="cards.length" class="cards">
                <li v-for="c in cards" :key="c.folio">
                    <button class="folio" @click="go({ folio: c.folio })">
                        <strong>f. {{ c.folio }}</strong>
                        <span class="ne-muted">
                            <template v-if="c.neumes">{{ c.neumes }} neume{{ c.neumes === 1 ? '' : 's' }}</template>
                            <template v-if="c.neumes && c.regions"> · </template>
                            <template v-if="c.regions">{{ c.regions }} line{{ c.regions === 1 ? '' : 's' }}</template>
                            <template v-if="!c.neumes && !c.regions">no work yet</template>
                        </span>
                    </button>
                </li>
            </ul>
            <form class="typed" @submit.prevent="openTyped">
                <input v-model.trim="typed" class="ne-input" placeholder="A folio, e.g. 12r" aria-label="Folio" autocomplete="off" />
                <button type="submit" class="ne-btn" :disabled="!typed">Open &rarr;</button>
            </form>
        </div>

        <PageWorkbench
            v-else
            class="workspace"
            :source="project.source"
            :folio="folio"
            :line="line"
            :code="code"
            :codes="tableCodes"
            @go="go"
            @used="ensureColumn"
        />

        <AlignmentReview v-if="aligning" :source="project.source" @close="aligning = false" />
    </template>
</div>
</template>

<style scoped>
.page-view { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.setup { margin: var(--space-4) var(--space-6); }
.bar { flex: 0 0 auto; display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; padding: var(--space-2) var(--space-6); background: var(--color-surface); border-bottom: 1px solid var(--color-border); }
.grow { flex: 1; }
.where { display: inline-flex; align-items: center; gap: 2px; }
.pick { width: auto; min-width: 12rem; padding: 0.25em 0.5em; font-size: 0.88rem; }
.looking { display: inline-flex; align-items: center; gap: var(--space-2); padding: 2px var(--space-3); background: var(--color-warning-light); border: 1px solid var(--color-warning-muted); border-radius: 999px; font-size: 0.86rem; }
.looking :deep(.pattern-code) { font-weight: 700; }
.workspace { flex: 1; min-height: 0; }

.choose { padding: var(--space-5) var(--space-6); overflow-y: auto; }
.choose h2 { margin: 0 0 var(--space-1); font-size: 1.2rem; }
.cards { list-style: none; margin: var(--space-4) 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: var(--space-2); }
.folio { width: 100%; display: flex; flex-direction: column; gap: 2px; padding: var(--space-2) var(--space-3); text-align: left; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.folio:hover { border-color: var(--color-primary); box-shadow: var(--shadow-sm); background: var(--color-surface); }
.folio .ne-muted { font-size: 0.78rem; }
.typed { display: flex; gap: var(--space-2); max-width: 24rem; }
.typed .ne-input { flex: 1; min-width: 0; }
@media (max-width: 720px) { .bar { padding: var(--space-2) var(--space-4); } .setup, .choose { margin-left: var(--space-4); margin-right: var(--space-4); padding-left: 0; padding-right: 0; } }
</style>

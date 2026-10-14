<script setup>
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useProjectsStore } from '../stores/projects';
import { useSettingsStore } from '../stores/settings';
import { useToast } from '../composables/useToast';
import { useImageManifest } from '../composables/useImageManifest';
import { useProjectContext } from '../composables/useProject';
import { resolveSignGlyphs } from '../utils/signs';
import { categoryOf } from '../utils/projectTable';
import { renderSvg } from '../utils/svgRenderer';
import { THUMB, ROOT_BOX, buildNeumeTree, layoutNeumeTree, nodeSize, treePicture } from '../utils/neumeTree';
import { exportNeumeTreePdf, snippetPhoto } from '../utils/neumeTreePdf';
import NeumeTree from '../components/projects/NeumeTree.vue';
import SegmentedControl from '../components/ui/SegmentedControl.vue';

/**
 * The neume tree of a project: the patterns it has chosen, arranged left to right by
 * how many notes they have, each one growing out of a shorter pattern it contains (see
 * utils/neumeTree.js) — shown as the shapes, or as the first snippet of each, and saved as a PDF.
 *
 * It can be gone on with: from any box, the boxes with one more note are made, so there can be more
 * columns than the table has; and any box can be hidden, with what grows out of it. Both are kept
 * with the project, and the PDF is made of what is shown.
 */
const route = useRoute();
const router = useRouter();
const store = useProjectsStore();
const settings = useSettingsStore();
const toast = useToast();
const manifest = useImageManifest();
const { project, glyphs, snippets, standardCodes, extendedCodes } = useProjectContext();

// ---- what is shown (kept in the address, so a link shows the same) ------------

const SCOPES = [
    { value: 'standard', label: 'Standard table', title: 'The columns chosen in the standard table' },
    { value: 'extended', label: 'Extended table', title: 'The standard columns and what the project added' }
];
const SHOWS = [
    { value: 'types', label: 'Neume types', title: 'The shapes, drawn from their codes' },
    { value: 'snippets', label: 'Scan snippets', title: 'The first snippet of each pattern, from the manuscript' }
];

function query(name, fallback, allowed) {
    return computed({
        get: () => (allowed.includes(route.query[name]) ? route.query[name] : fallback),
        set: (value) => router.replace({ query: { ...route.query, [name]: value === fallback ? undefined : value } })
    });
}
const scope = query('scope', 'standard', ['standard', 'extended']);
const show = query('show', 'types', ['types', 'snippets']);

// ---- the tree ----------------------------------------------------------------

const codes = computed(() => (scope.value === 'extended' ? extendedCodes.value : standardCodes.value));
const grown = computed(() => project.value.tree.grown);
const hidden = computed(() => project.value.tree.hidden);
/**
 * What going on may make. The standard table's tree stays within what the standard table can have
 * (the standard shapes, in every way of writing them); the extended table's has no limit.
 */
const allow = computed(() => (scope.value === 'standard' ? (code) => !!(categoryOf(code) && categoryOf(code).standard) : () => true));
const tree = computed(() => buildNeumeTree(codes.value, { grown: grown.value, hidden: hidden.value, allow: allow.value }));
/** Boxes that were made by going on (and are shown). */
const made = computed(() => tree.value.nodes.filter(n => !n.chosen).length);

const signGlyphs = computed(() => resolveSignGlyphs(settings.customSigns, glyphs.value));

/** The first snippet of a pattern (of any way it is written), as the cell of the table shows it. */
function snippetOf(node) {
    for (const code of node.codes) {
        const list = snippets.value.get(code);
        if (list && list.length) return list[0];
    }
    return null;
}

const withSnippets = computed(() => tree.value.nodes.filter(n => n.chosen && snippetOf(n)).length);
/** Snippets are offered when there are any to show; without, the shapes are all there is. */
const hasSnippets = computed(() => tree.value.nodes.some(n => snippetOf(n)));
const mode = computed(() => (hasSnippets.value ? show.value : 'types'));

/** What each node shows. The same entries make the screen and the PDF. */
const entries = computed(() => {
    const map = new Map();
    for (const node of tree.value.nodes) {
        const picture = treePicture(renderSvg(node.code, glyphs.value, false, signGlyphs.value), node.code);
        const snippet = mode.value === 'snippets' ? snippetOf(node) : null;
        const kind = mode.value === 'types' ? 'shape' : snippet ? 'photo' : 'missing';
        const content = kind === 'shape'
            ? { w: picture.width, h: picture.height, anchorY: picture.anchorY }
            : { w: THUMB.w, h: THUMB.h, anchorY: THUMB.h / 2 };
        const fit = kind === 'missing' ? Math.min(1, (THUMB.w - 16) / picture.width, (THUMB.h - 16) / picture.height) : 1;
        map.set(node, { kind, picture, snippet, content, fit, size: nodeSize(content, node.code) });
    }
    return map;
});

const layout = computed(() => layoutNeumeTree(tree.value, node => (node === tree.value.root ? ROOT_BOX : entries.value.get(node).size)));
const counts = computed(() => new Map([...snippets.value].map(([code, list]) => [code, list.length])));

// ---- going on, and hiding -----------------------------------------------------

/** A tree is a picture: past this many boxes it is no use, and the page would crawl. */
const MOST_BOXES = 400;

const save = (patch) => store.setTree(project.value.id, patch);
const without = (list, texts) => list.filter(t => !texts.has(t));
const below = (node) => [node, ...node.children.flatMap(below)];

function growNodes(nodes) {
    const next = [...new Set([...grown.value, ...nodes.map(n => n.text)])];
    const boxes = buildNeumeTree(codes.value, { grown: next, hidden: hidden.value, allow: allow.value }).nodes.length;
    if (boxes > MOST_BOXES) {
        toast.show(`That would make ${boxes} boxes. Hide some first, or go on from single boxes (the + at a box).`, { tone: 'error' });
        return;
    }
    const before = grown.value;
    const added = boxes - tree.value.nodes.length;
    save({ grown: next });
    toast.show(`Went on from ${nodes.length} box${nodes.length === 1 ? '' : 'es'}: ${added} new.`, {
        action: { label: 'Undo', run: () => save({ grown: before }) }
    });
}

function ungrow(node) {
    const before = grown.value;
    // what was made from here goes, and what was gone on from within it
    save({ grown: without(grown.value, new Set(below(node).filter(n => !n.chosen || n === node).map(n => n.text))) });
    toast.show('Took back the boxes made from here.', { action: { label: 'Undo', run: () => save({ grown: before }) } });
}

function growColumn() {
    const column = tree.value.columns[tree.value.columns.length - 1];
    if (column) growNodes(column.nodes.filter(n => n.canGrow && !n.grown));
}

function hide(node) {
    const before = hidden.value;
    const count = below(node).length;
    save({ hidden: [...hidden.value, node.text] });
    toast.show(count === 1 ? `${node.code} hidden.` : `${node.code} and ${count - 1} more hidden.`, {
        action: { label: 'Undo', run: () => save({ hidden: before }) }
    });
}

/** Whether the last column can be gone on from at all (not in the standard table's tree, once it has its longest shapes). */
const canGrowColumn = computed(() => { const c = tree.value.columns[tree.value.columns.length - 1]; return !!c && c.nodes.some(n => n.canGrow && !n.grown); });

const showHidden = ref(false);
const reveal = (node) => save({ hidden: hidden.value.filter(t => t !== node.text) });
const revealAll = () => { save({ hidden: [] }); showHidden.value = false; };
const clearMade = () => {
    const before = grown.value;
    save({ grown: [] });
    toast.show('Took back every box made by going on.', { action: { label: 'Undo', run: () => save({ grown: before }) } });
};

// ---- the PDF -----------------------------------------------------------------

const busy = ref(false);

async function exportPdf() {
    busy.value = true;
    try {
        const slug = project.value.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'project';
        const result = await exportNeumeTreePdf({
            tree: tree.value,
            layout: layout.value,
            entries: entries.value,
            photo: (snippet) => snippetPhoto(snippet, manifest),
            caption: `Neume tree: ${project.value.name}`,
            signKeys: settings.customSigns.map(sign => sign.key),
            filename: `neume-tree-${slug}.pdf`
        });
        toast.show(
            result.photosMissing
                ? `Neume tree saved as PDF. ${result.photosMissing} snippet picture${result.photosMissing === 1 ? '' : 's'} could not be read (the image server may not allow it), so the shapes are drawn there.`
                : 'Neume tree saved as PDF.',
            { tone: result.photosMissing ? 'info' : 'success', timeout: result.photosMissing ? 10000 : undefined }
        );
    } catch (error) {
        toast.show(`The PDF could not be made: ${error.message}`, { tone: 'error' });
    } finally {
        busy.value = false;
    }
}
</script>

<template>
<div class="tree-view">
    <div v-if="!tree.nodes.length && !codes.length" class="ne-empty empty">
        <p>No columns yet, so there is nothing to grow a tree from.</p>
        <RouterLink :to="{ name: 'project_standard', params: { id: project.id } }" class="ne-btn ne-btn--primary">Choose columns in the standard table &rarr;</RouterLink>
    </div>

    <template v-else>
        <div class="toolbar">
            <SegmentedControl v-model="scope" :options="SCOPES" label="Which columns" size="sm" />
            <SegmentedControl v-if="hasSnippets" v-model="show" :options="SHOWS" label="What the nodes show" size="sm" />
            <span class="spacer"></span>
            <span class="stat">
                {{ tree.nodes.length - made }} pattern{{ tree.nodes.length - made === 1 ? '' : 's' }}<template v-if="made"> + {{ made }} made</template><template v-if="hasSnippets"> · {{ withSnippets }} with a snippet</template>
            </span>
            <button v-if="made" class="ne-btn ne-btn--ghost" title="Take back every box made by going on" @click="clearMade">Remove made boxes</button>
            <button v-if="tree.hidden.length" class="ne-btn ne-btn--ghost" :aria-expanded="showHidden" @click="showHidden = !showHidden">Hidden · {{ tree.hidden.length }}</button>
            <button class="ne-btn" :disabled="busy || !tree.nodes.length" @click="exportPdf">{{ busy ? 'Making the PDF…' : 'Export as PDF' }}</button>
        </div>

        <div v-if="showHidden && tree.hidden.length" class="hidden-bar">
            <span>Hidden in this tree (the table keeps the patterns):</span>
            <button v-for="n in tree.hidden" :key="n.id" class="ne-chip" :title="`Show ${n.code} again`" @click="reveal(n)">{{ n.code }} &times;</button>
            <button class="ne-btn ne-btn--sm ne-btn--ghost" @click="revealAll">Show all</button>
        </div>

        <p class="ne-note ne-note--info how">
            Left to right, the patterns have more and more notes. Each one grows out of the longest shorter pattern it contains:
            <code>*u</code> branches into <code>*ud</code> and <code>*[ud]</code>. To compare them a bracket counts as a hyphen
            (<code>*[ud]</code> is <code>*u-d</code>, <code>[*u]</code> is <code>*-u</code>), and a virga (<code>V</code>) is told from a plain note.
            At a box, <b>+</b> goes on from it — the boxes with one more note are made, drawn lighter — and <b>&times;</b> hides it with all that grows out of it; <b>+ notes</b> at the right end goes on from the whole last column.
            <template v-if="scope === 'standard'">Here, going on makes only what the standard table can have; the extended table's tree has no limit.</template>
        </p>

        <p v-if="!hasSnippets" class="ne-note ne-note--info how">No snippets are drawn for these patterns yet, so the tree shows the shapes. With snippets you can switch to them here.</p>

        <div v-if="tree.nodes.length" class="scroll">
            <NeumeTree
                :tree="tree"
                :layout="layout"
                :entries="entries"
                :project-id="project.id"
                :counts="counts"
                @grow="growNodes([$event])"
                @ungrow="ungrow"
                @hide="hide"
                :can-grow-column="canGrowColumn"
                @grow-column="growColumn"
            />
        </div>
        <p v-else class="ne-empty">{{ tree.hidden.length ? 'Every box is hidden.' : 'None of these columns is a neume shape.' }}</p>

        <p v-if="tree.skipped.length" class="skipped">Not in the tree, as they are no neume shapes: {{ tree.skipped.join(', ') }}.</p>

        <footer class="next">
            <RouterLink :to="{ name: 'project_all', params: { id: project.id } }" class="ne-btn ne-btn--primary">All manuscripts &rarr;</RouterLink>
        </footer>
    </template>
</div>
</template>

<style scoped>
.tree-view { display: flex; flex-direction: column; gap: var(--space-3); }
.toolbar { display: flex; align-items: center; gap: var(--space-2) var(--space-3); flex-wrap: wrap; }
.spacer { flex: 1; }
.stat { color: var(--color-text-muted); font-size: 0.86rem; font-variant-numeric: tabular-nums; }
.how { margin: 0; }
.hidden-bar { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); font-size: 0.86rem; color: var(--color-text-muted); }
.hidden-bar .ne-chip { border: 1px solid var(--color-border); font-family: ui-monospace, Menlo, monospace; cursor: pointer; }
.hidden-bar .ne-chip:hover { border-color: var(--color-primary); color: var(--color-primary-dark); }
.scroll { overflow: auto; padding: var(--space-4) var(--space-5) var(--space-5); background: #fff; border: 1px solid var(--color-border); border-radius: var(--radius-lg); }
.skipped { margin: 0; color: var(--color-text-muted); font-size: 0.86rem; }
.empty { max-width: 560px; margin: var(--space-5) auto; }
.empty p { margin: 0 0 var(--space-3); }
.next { display: flex; justify-content: flex-start; }
</style>

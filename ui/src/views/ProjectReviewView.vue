<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useProjectContext } from '../composables/useProject';
import { compareFolios } from '../composables/useImageManifest';
import { projectPageLocation } from '../utils/projectChoices';
import { snippetPlaceLabel } from '../utils/projectData';
import PatternCode from '../components/PatternCode.vue';
import SnippetThumb from '../components/projects/SnippetThumb.vue';
import ReviewFocusDialog from '../components/projects/ReviewFocusDialog.vue';

/**
 * Every snippet of the project, one by one: its picture, and what pattern it is filed under —
 * corrected in place where it is wrong, without going back through the table. Useful right after
 * an import, when the patterns came from somewhere else and are worth a look; just as useful any
 * other time a manuscript's snippets need a second pass.
 */
const router = useRouter();
const { project, snippets, ensureCollection } = useProjectContext();

const all = computed(() => {
    const out = [];
    for (const list of snippets.value.values()) out.push(...list);
    out.sort((a, b) => compareFolios(a.folio, b.folio) || String(a.pattern).localeCompare(String(b.pattern)));
    return out;
});
const folioList = computed(() => [...new Set(all.value.map(s => s.folio))].sort(compareFolios));

const q = ref('');
const folio = ref('');
const filtered = computed(() => {
    const needle = q.value.trim().toLowerCase();
    return all.value.filter(s => {
        if (folio.value && s.folio !== folio.value) return false;
        if (needle && !String(s.pattern).toLowerCase().includes(needle)) return false;
        return true;
    });
});

// ---- the one-snippet dialog -------------------------------------------------

const openId = ref('');
const open = computed(() => filtered.value.find(s => s.id === openId.value) || null);
const openIndex = computed(() => filtered.value.findIndex(s => s.id === openId.value));

function openAt(s) { openId.value = s.id; }
function closeDialog() { openId.value = ''; }
function go(delta) {
    const i = openIndex.value + delta;
    if (i >= 0 && i < filtered.value.length) openId.value = filtered.value[i].id;
}

function openContext() {
    const s = open.value;
    if (!s || !project.value) return;
    if (s.kind === 'image') {
        // A line screenshot opens from its own editor, reached through the Lines tab, not a route of its own.
        if (s.lineId) router.push({ name: 'project_lines', params: { id: project.value.id } });
        return;
    }
    router.push(projectPageLocation(project.value.id, {
        folio: s.folio, code: s.pattern, line: s.regionId || (s.kind === 'sign' ? 'legacy' : ''), from: 'standard'
    }));
}
</script>

<template>
<div class="review-view">
    <p class="ne-note ne-note--info">
        {{ all.length.toLocaleString() }} snippet{{ all.length === 1 ? '' : 's' }} of this manuscript. Open one to see it large and correct its pattern — the main case is a missed virga.
    </p>

    <div class="filters">
        <input v-model.trim="q" class="ne-input" type="search" placeholder="Filter by pattern code" aria-label="Filter by pattern code" />
        <select v-model="folio" class="ne-input" aria-label="Folio">
            <option value="">All folios</option>
            <option v-for="f in folioList" :key="f" :value="f">f. {{ f }}</option>
        </select>
        <span class="count">{{ filtered.length.toLocaleString() }} shown</span>
    </div>

    <p v-if="!all.length" class="ne-empty">No snippets on this manuscript yet.</p>
    <p v-else-if="!filtered.length" class="ne-empty">No snippet matches. Change the filters above.</p>
    <div v-else class="grid">
        <button v-for="s in filtered" :key="s.id" type="button" class="card" @click="openAt(s)">
            <span class="pic"><SnippetThumb :snippet="s" :width="104" :height="72" /></span>
            <span class="code"><PatternCode :pattern="s.pattern" /></span>
            <span class="loc">{{ snippetPlaceLabel(s) }}</span>
        </button>
    </div>

    <ReviewFocusDialog
        :open="!!open" :snippet="open" :position="openIndex + 1" :total="filtered.length" :ensure-collection="ensureCollection"
        @close="closeDialog" @prev="go(-1)" @next="go(1)" @open-context="openContext"
    />
</div>
</template>

<style scoped>
.review-view { display: flex; flex-direction: column; gap: var(--space-4); }
.filters { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.filters .ne-input { max-width: 16rem; }
.count { font-size: 0.82rem; color: var(--color-text-muted); margin-left: auto; }
.ne-empty { margin: 0; padding: var(--space-5); text-align: center; color: var(--color-text-muted); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr)); gap: var(--space-3); }
.card { display: flex; flex-direction: column; gap: 4px; padding: var(--space-2); text-align: left; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); cursor: pointer; }
.card:hover { border-color: var(--color-primary); background: var(--color-primary-light); }
.pic { display: flex; align-items: center; justify-content: center; min-height: 72px; background: #f8fafc; border-radius: var(--radius-sm); overflow: hidden; }
.pic :deep(img) { max-width: 100%; max-height: 90px; object-fit: contain; }
.code { font-size: 0.85rem; }
.loc { font-size: 0.72rem; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>

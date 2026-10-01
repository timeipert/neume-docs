<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useTranscriptionData } from '../composables/useTranscriptionData';
import { usePatternCatalog } from '../composables/usePatternCatalog';
import { buildColumns, standardCellStates, tierOf } from '../utils/neumeTable';
import StateWrapper from '../components/StateWrapper.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import SegmentedControl from '../components/ui/SegmentedControl.vue';
import TableProgress from '../components/neume-table/TableProgress.vue';

const router = useRouter();
const tableStore = usePersonalTablesStore();
const { catalog, sourceNames, hasCorpus, loading, error } = useTranscriptionData();
const { freq } = usePatternCatalog();

const filter = ref('');
const show = ref('all');
const sort = ref('name');

const FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'started', label: 'Started' },
    { value: 'open', label: 'Not started' }
];

const standardColumns = computed(() => buildColumns('standard', [], freq.value));

const all = computed(() => {
    // The loaded corpus, plus any manuscript that already has a table from an
    // earlier session but whose data is not loaded right now.
    const names = new Set(sourceNames.value);
    for (const t of tableStore.tables) if (t.source && t.rows && t.rows.length) names.add(t.source);

    return [...names].map(name => {
        const rec = catalog.value[name];
        const m = (rec && rec.meta) || {};
        const rows = tableStore.rowsFor(name);
        const cells = standardCellStates(rows, standardColumns.value);
        const done = cells.filter(c => c.filled).length;
        const expanded = rows.filter(r => tierOf(r) === 'expanded').length;
        return {
            name,
            inCorpus: !!rec,
            place: [m.herkunftsort, m.datierung].filter(Boolean).join(' · '),
            neumes: rec ? Object.values(rec.counts || {}).reduce((a, b) => a + b, 0) : 0,
            cells,
            done,
            expanded,
            started: done + expanded > 0
        };
    });
});

const startedCount = computed(() => all.value.filter(m => m.started).length);

const manuscripts = computed(() => {
    const q = filter.value.trim().toLowerCase();
    const list = all.value.filter(m =>
        (!q || `${m.name} ${m.place}`.toLowerCase().includes(q))
        && (show.value === 'all' || (show.value === 'started') === m.started));

    const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
    if (sort.value === 'progress') return list.sort((a, b) => (b.done + b.expanded) - (a.done + a.expanded) || byName(a, b));
    if (sort.value === 'neumes') return list.sort((a, b) => b.neumes - a.neumes || byName(a, b));
    return list.sort(byName);
});

const fmt = (n) => n.toLocaleString('en-US');
const open = (name) => router.push(`/table/${encodeURIComponent(name)}`);
</script>

<template>
<div class="list-view">
    <div class="wrap">
        <PageHeader title="Neume Tables" eyebrow="One table per manuscript">
            <template #subtitle>
                <p>Fill in the standard table for each manuscript, then add whatever else it needs.
                    <template v-if="hasCorpus || all.length"><strong>{{ startedCount }}</strong> of {{ all.length }} started.</template>
                </p>
            </template>
        </PageHeader>

        <StateWrapper :loading="loading" :error="error" loadingText="Reading the loaded corpus…">
            <div v-if="!hasCorpus && all.length === 0" class="empty">
                <div class="empty-art" aria-hidden="true">
                    <svg viewBox="0 0 64 40" width="96"><ellipse cx="14" cy="12" rx="8" ry="6" transform="rotate(-18 14 12)"/><ellipse cx="32" cy="22" rx="8" ry="6" transform="rotate(-18 32 22)"/><ellipse cx="50" cy="30" rx="8" ry="6" transform="rotate(-18 50 30)"/></svg>
                </div>
                <h2>No manuscripts yet</h2>
                <p>The editor starts without data. Load a Monodi-Zero workspace or a Corpus Monodicum project, and its manuscripts appear here.</p>
                <button class="ne-btn ne-btn--primary" @click="router.push('/corpus')">Load data</button>
            </div>

            <template v-else>
                <div class="tools">
                    <input v-model="filter" type="search" class="search" placeholder="Find a manuscript or place…" aria-label="Find a manuscript" />
                    <SegmentedControl v-model="show" :options="FILTERS" label="Show" size="sm" />
                    <label class="sort">
                        Sort
                        <select v-model="sort">
                            <option value="name">Name</option>
                            <option value="progress">Most done</option>
                            <option value="neumes">Most neumes</option>
                        </select>
                    </label>
                    <span class="found">{{ manuscripts.length }} manuscript{{ manuscripts.length === 1 ? '' : 's' }}</span>
                </div>

                <div class="cards">
                    <button v-for="m in manuscripts" :key="m.name" class="ms" :class="{ started: m.started }" @click="open(m.name)">
                        <span class="ms-head">
                            <strong class="ms-name">{{ m.name }}</strong>
                            <span v-if="!m.inCorpus" class="badge" title="Its transcriptions are not loaded right now">not loaded</span>
                        </span>
                        <span class="ms-meta">{{ m.place || '—' }}<template v-if="m.neumes"> · {{ fmt(m.neumes) }} neumes</template></span>
                        <TableProgress :cells="m.cells" size="mini" />
                        <span class="ms-foot">
                            <span v-if="m.started"><strong>{{ m.done }}</strong>/{{ m.cells.length }} filled<template v-if="m.expanded"> · <span class="plus">+{{ m.expanded }}</span></template></span>
                            <span v-else class="dim">Not started</span>
                            <span class="go" aria-hidden="true">&rarr;</span>
                        </span>
                    </button>
                    <p v-if="manuscripts.length === 0" class="none">No manuscript matches.</p>
                </div>
            </template>
        </StateWrapper>
    </div>
</div>
</template>

<style scoped>
.list-view { height: 100%; overflow-y: auto; box-sizing: border-box; padding: var(--space-6); }
.wrap { max-width: 1300px; margin: 0 auto; }

.tools { display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap; margin-bottom: var(--space-4); }
.search { padding: 0.5em 0.9em; border: 1px solid var(--color-border-hover); border-radius: var(--radius-md); width: 280px; max-width: 100%; font-size: 0.92rem; background: var(--color-surface); }
.sort { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--color-text-muted); font-size: 0.85rem; }
.sort select { padding: 0.35em 0.6em; border: 1px solid var(--color-border-hover); border-radius: var(--radius-md); background: var(--color-surface); }
.found { margin-left: auto; color: var(--color-text-muted); font-size: 0.85rem; }

.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); gap: var(--space-3); }
.ms {
    display: flex; flex-direction: column; align-items: stretch; gap: var(--space-2); text-align: left;
    background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
    padding: var(--space-3) var(--space-4); transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}
.ms:hover { border-color: var(--color-primary); box-shadow: var(--shadow-md); transform: translateY(-1px); background: var(--color-surface); }
.ms.started { border-left: 4px solid var(--color-primary); padding-left: calc(var(--space-4) - 3px); }
.ms-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.ms-name { font-size: 1.05rem; }
.ms-meta { color: var(--color-text-muted); font-size: 0.83rem; min-height: 1.3em; }
.badge { background: var(--color-warning-light); color: var(--color-warning-dark); font-size: 0.7rem; padding: 0.1em 0.6em; border-radius: 999px; font-weight: 600; }
.ms-foot { display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem; color: var(--color-text-muted); margin-top: 2px; }
.ms-foot strong { color: var(--color-text); }
.plus { color: var(--color-accent-dark); font-weight: 600; }
.dim { color: var(--color-text-muted); }
.go { color: var(--color-text-light); transition: transform 0.15s, color 0.15s; }
.ms:hover .go { color: var(--color-primary); transform: translateX(3px); }
.none { grid-column: 1 / -1; text-align: center; color: var(--color-text-muted); font-style: italic; padding: var(--space-5); }

.empty { text-align: center; padding: var(--space-6) var(--space-4); max-width: 480px; margin: 0 auto; }
.empty-art svg { fill: var(--color-primary-muted); }
.empty h2 { margin: var(--space-3) 0 var(--space-1); }
.empty p { color: var(--color-text-muted); }

@media (max-width: 720px) { .list-view { padding: var(--space-4); } .found { margin-left: 0; } }
</style>

<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { usePersonalTablesStore } from '../stores/personalTables';
import { useTranscriptionData } from '../composables/useTranscriptionData';
import { STANDARD_DIRECTIONS, SPECIAL_COLUMNS, MAX_SPECIAL_SIGNATURES, tableProgress } from '../utils/neumeTable';
import StateWrapper from '../components/StateWrapper.vue';

const router = useRouter();
const tableStore = usePersonalTablesStore();
const { catalog, sourceNames, hasCorpus, loading, error } = useTranscriptionData();

const filter = ref('');
const onlyStarted = ref(false);

const manuscripts = computed(() => {
    // The loaded corpus, plus any manuscript that already has a table from an
    // earlier session but whose data is not loaded right now.
    const names = new Set(sourceNames.value);
    for (const t of tableStore.tables) if (t.source && t.rows && t.rows.length) names.add(t.source);

    const q = filter.value.trim().toLowerCase();
    return [...names]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map(name => {
            const rec = catalog.value[name];
            const m = (rec && rec.meta) || {};
            const progress = tableProgress(tableStore.rowsFor(name));
            const specials = Object.values(progress.specials).reduce((a, b) => a + b, 0);
            const started = progress.directions + specials + progress.expanded + (progress.clef ? 1 : 0) + (progress.custos ? 1 : 0) > 0;
            return {
                name,
                inCorpus: !!rec,
                place: [m.herkunftsort, m.datierung].filter(Boolean).join(' · '),
                neumes: rec ? Object.values(rec.counts || {}).reduce((a, b) => a + b, 0) : 0,
                progress,
                started
            };
        })
        .filter(r => (!q || `${r.name} ${r.place}`.toLowerCase().includes(q)) && (!onlyStarted.value || r.started));
});

const fmt = (n) => n.toLocaleString('en-US');
const open = (name) => router.push(`/table/${encodeURIComponent(name)}`);
</script>

<template>
<div class="list-view">
    <header class="head">
        <div>
            <h1>Neumentabellen</h1>
            <p class="subtitle">
                One table per manuscript: fill in the standard table, then add whatever else the manuscript needs.
            </p>
        </div>
        <div class="tools">
            <input v-model="filter" type="search" placeholder="Find a manuscript…" aria-label="Find a manuscript" />
            <label class="check"><input type="checkbox" v-model="onlyStarted" /> only started</label>
        </div>
    </header>

    <StateWrapper :loading="loading" :error="error" loadingText="Reading the loaded corpus…">
        <div v-if="!hasCorpus && manuscripts.length === 0" class="empty">
            <h2>No manuscripts yet</h2>
            <p>The editor starts without data. Load a Monodi-Zero workspace or a Corpus Monodicum project first.</p>
            <button class="primary" @click="router.push('/corpus')">Load data</button>
        </div>

        <div v-else class="cards">
            <article v-for="m in manuscripts" :key="m.name" class="ms" :class="{ started: m.started }" @click="open(m.name)">
                <div class="ms-head">
                    <strong class="ms-name">{{ m.name }}</strong>
                    <span v-if="!m.inCorpus" class="badge warn" title="Its transcriptions are not loaded right now">not loaded</span>
                </div>
                <div class="ms-meta">{{ m.place || '—' }}<template v-if="m.neumes"> · {{ fmt(m.neumes) }} neumes</template></div>

                <div class="chips" aria-label="Progress of the standard table">
                    <span class="chip" :class="{ done: m.progress.directions === STANDARD_DIRECTIONS.length, some: m.progress.directions > 0 }">
                        shapes {{ m.progress.directions }}/{{ STANDARD_DIRECTIONS.length }}
                    </span>
                    <span v-for="s in SPECIAL_COLUMNS" :key="s.key" class="chip" :class="{ some: m.progress.specials[s.key] > 0 }">
                        {{ s.header }} {{ m.progress.specials[s.key] }}/{{ MAX_SPECIAL_SIGNATURES }}
                    </span>
                    <span class="chip" :class="{ some: m.progress.clef }">clef</span>
                    <span class="chip" :class="{ some: m.progress.custos }">custos</span>
                    <span v-if="m.progress.expanded" class="chip extra">+{{ m.progress.expanded }}</span>
                </div>
            </article>
            <p v-if="manuscripts.length === 0" class="empty-inline">No manuscript matches.</p>
        </div>
    </StateWrapper>
</div>
</template>

<style scoped>
.list-view { padding: var(--space-6); max-width: 1300px; margin: 0 auto; overflow-y: auto; height: 100%; box-sizing: border-box; }
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--space-4); flex-wrap: wrap; margin-bottom: var(--space-5); }
.head h1 { margin: 0; }
.subtitle { color: var(--color-text-muted); margin: var(--space-1) 0 0; }
.tools { display: flex; align-items: center; gap: var(--space-3); }
.tools input[type="search"] { padding: 0.5em 0.8em; border: 1px solid var(--color-border); border-radius: var(--radius-md); width: 240px; }
.check { color: var(--color-text-muted); font-size: 0.9rem; display: flex; align-items: center; gap: var(--space-1); white-space: nowrap; }

.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--space-3); }
.ms { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-3) var(--space-4); cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s; }
.ms:hover { border-color: var(--color-primary); box-shadow: var(--shadow-md); }
.ms.started { border-left: 4px solid var(--color-primary); }
.ms-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.ms-name { font-size: 1.05rem; }
.ms-meta { color: var(--color-text-muted); font-size: 0.85rem; margin: 2px 0 var(--space-3); }
.badge.warn { background: var(--color-warning-light); color: var(--color-warning-dark); font-size: 0.72rem; padding: 0.1em 0.6em; border-radius: 999px; }

.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { background: var(--color-surface-muted); color: var(--color-text-light); border-radius: 999px; padding: 0.1em 0.6em; font-size: 0.74rem; }
.chip.some { background: var(--color-primary-light); color: var(--color-primary-dark); }
.chip.done { background: var(--color-success-light); color: #166534; }
.chip.extra { background: #ede9fe; color: #5b21b6; }

.empty { text-align: center; padding: var(--space-6); }
.empty-inline { grid-column: 1 / -1; text-align: center; color: var(--color-text-light); font-style: italic; }
.primary { background: var(--color-primary); border-color: var(--color-primary); color: #fff; font-weight: 600; padding: 0.55em 1.2em; }
.primary:hover { background: var(--color-primary-hover); }
</style>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useTranscriptionData } from '../composables/useTranscriptionData';
import { useCorpusImport } from '../composables/useCorpusImport';
import { collectFromFileList, collectFromDrop } from '../services/corpus/corpusImport';
import PageHeader from '../components/ui/PageHeader.vue';
import ActionDialog from '../components/workspace/ActionDialog.vue';
import { useEffectiveMeta } from '../composables/useEffectiveMeta';

const router = useRouter();
const { catalog, sourceNames, hasCorpus, corpusSummary, loading, removeSource, clearAll } = useTranscriptionData();
const {
    phase, importedNow, result, errorMessage, busy, percent, statusLine, start, cancel, reset
} = useCorpusImport();

const metaOf = useEffectiveMeta();
const dragging = ref(false);
const skipWorkingCopies = ref(true);
const filter = ref('');

const begin = (items) => start(items, { skipWorkingCopies: skipWorkingCopies.value });

async function onPick(event) {
    const items = collectFromFileList(event.target.files);
    event.target.value = '';
    await begin(items);
}

async function onDrop(event) {
    dragging.value = false;
    if (busy.value) return;
    const items = await collectFromDrop(event.dataTransfer);
    await begin(items);
}

const request = ref(null);

function askRemove(name) {
    request.value = {
        title: `Remove ${name}`,
        paragraphs: [
            `This removes “${name}” from the loaded corpus. Your tables, annotations and metadata edits for it are kept.`,
            'Loading the same files again brings it back.'
        ],
        confirmLabel: 'Remove',
        run: async () => { await removeSource(name); return null; },
        success: `${name} was removed from the corpus.`
    };
}

function askRemoveAll() {
    request.value = {
        title: 'Remove the whole loaded corpus',
        paragraphs: [
            'This removes every loaded source. Your tables, annotations and metadata edits are kept.',
            'Loading the files again on this page brings the corpus back.'
        ],
        confirmLabel: 'Remove all',
        run: async () => { await clearAll(); reset(); return null; },
        success: 'The corpus was removed.'
    };
}

const rows = computed(() => {
    const q = filter.value.trim().toLowerCase();
    return sourceNames.value
        .map(name => {
            const rec = catalog.value[name];
            const neumes = Object.values(rec.counts || {}).reduce((a, b) => a + b, 0);
            return {
                name,
                place: [metaOf(name, 'herkunftsort'), metaOf(name, 'herkunftsinstitution')].filter(Boolean).join(', '),
                library: [metaOf(name, 'bibliotheksort'), metaOf(name, 'bibliothek'), metaOf(name, 'bibliothekssignatur')].filter(Boolean).join(', '),
                date: metaOf(name, 'datierung'),
                documents: (rec.documents || []).length,
                neumes,
                patterns: Object.keys(rec.counts || {}).length,
                importedAt: rec.importedAt ? rec.importedAt.slice(0, 10) : ''
            };
        })
        .filter(r => !q || `${r.name} ${r.place} ${r.library} ${r.date}`.toLowerCase().includes(q));
});

const fmt = (n) => n.toLocaleString('en-US');
</script>

<template>
<div class="corpus-view" @dragover.prevent="dragging = true" @dragleave.self="dragging = false" @drop.prevent="onDrop">
    <PageHeader title="Corpus" eyebrow="Step 1 · Your data">
        <template #subtitle>
            <p>The editor starts empty. Load a Monodi-Zero workspace or a Corpus Monodicum project, and the neume tables are built from it.</p>
        </template>
        <template v-if="hasCorpus" #actions>
            <button class="ne-btn ne-btn--primary" @click="router.push('/table')">Open the neume tables &rarr;</button>
        </template>
    </PageHeader>

    <section class="drop-card" :class="{ dragging, busy }" aria-label="Load data">
        <template v-if="!busy">
            <div class="drop-icon" aria-hidden="true">⇩</div>
            <h2>{{ hasCorpus ? 'Add more data' : 'Load your data' }}</h2>
            <p class="drop-hint">Drop files or a folder here, or choose them:</p>

            <div class="pick-row">
                <label class="ne-btn ne-btn--primary pick">
                    Choose files…
                    <input type="file" multiple accept=".monodijson,.json,.zip" @change="onPick" hidden />
                </label>
                <label class="ne-btn pick">
                    Choose a project folder…
                    <input type="file" webkitdirectory multiple @change="onPick" hidden />
                </label>
            </div>

            <label class="option">
                <input type="checkbox" v-model="skipWorkingCopies" />
                Leave out working copies (document IDs ending in <code>TR</code> or <code>GS</code>)
            </label>
        </template>

        <template v-else>
            <div class="spinner" aria-hidden="true"></div>
            <h2>Importing…</h2>
            <p class="status">{{ statusLine }}</p>
            <div class="bar" role="progressbar" :aria-valuenow="percent ?? undefined" aria-valuemin="0" aria-valuemax="100">
                <div class="bar-fill" :class="{ indeterminate: percent === null }" :style="percent === null ? {} : { width: percent + '%' }"></div>
            </div>
            <p class="status small">{{ importedNow.length }} source{{ importedNow.length === 1 ? '' : 's' }} stored so far</p>
            <button class="ne-btn" @click="cancel">Stop after the current source</button>
        </template>
    </section>

    <section class="other-sources" aria-label="Other sources">
        <div>
            <strong>OMMR4all</strong>
            <span>Have a project from OMMR4all? Load its recognised neumes and staff lines, and link them to your manuscripts.</span>
        </div>
        <button class="ne-btn" @click="router.push('/ommr')">Open the OMMR4all import &rarr;</button>
    </section>

    <section v-if="phase === 'done' && result" class="note ok" role="status">
        <strong>
            {{ result.aborted ? 'Stopped.' : 'Done.' }}
            {{ result.sources }} source{{ result.sources === 1 ? '' : 's' }},
            {{ fmt(result.documents) }} document{{ result.documents === 1 ? '' : 's' }} loaded.
        </strong>
        <span v-if="result.skipped"> {{ fmt(result.skipped) }} working copies left out.</span>
        <span v-if="result.emptySources && result.emptySources.length">
            {{ result.emptySources.length }} source{{ result.emptySources.length === 1 ? '' : 's' }} had nothing but working copies
            ({{ result.emptySources.slice(0, 4).join(', ') }}{{ result.emptySources.length > 4 ? ', …' : '' }}) and {{ result.emptySources.length === 1 ? 'was' : 'were' }} not loaded.
        </span>
        <ul v-if="result.warnings.length" class="warnings">
            <li v-for="(w, i) in result.warnings.slice(0, 5)" :key="i">{{ w }}</li>
            <li v-if="result.warnings.length > 5">… and {{ result.warnings.length - 5 }} more.</li>
        </ul>
    </section>

    <section v-if="phase === 'error'" class="note bad" role="alert">
        <strong>That did not work.</strong> {{ errorMessage }}
    </section>

    <ol v-if="!hasCorpus && !loading" class="steps" aria-label="How it works">
        <li><span class="n">1</span><div><strong>Load your data</strong><p>A Monodi-Zero workspace or a Corpus Monodicum project.</p></div></li>
        <li><span class="n">2</span><div><strong>Fill in the standard table</strong><p>Per manuscript: choose how it writes each neume, ordered by tones and frequency.</p></div></li>
        <li><span class="n">3</span><div><strong>Add and compare</strong><p>Add what the manuscript needs, link neumes to the scans, compare manuscripts.</p></div></li>
    </ol>

    <section v-if="!hasCorpus && !loading" class="formats">
        <h2>What can I load?</h2>
        <div class="format-grid">
            <article>
                <h3>Monodi-Zero workspace</h3>
                <p>The <code>.monodijson</code> file from Monodi-Zero (Settings → Workspace → export). Sources, documents and transcriptions in one file.</p>
            </article>
            <article>
                <h3>Corpus Monodicum project</h3>
                <p>A folder — or a ZIP of it — laid out as <code>source/meta.json</code>, <code>source/document/meta.json</code> and <code>source/document/data.json</code>, as monodi+ exports it. The whole project, one source or one document all work.</p>
            </article>
        </div>
        <p class="privacy">Everything is read in your browser and kept in its local storage. Nothing is uploaded.</p>
    </section>

    <section v-if="hasCorpus" class="loaded">
        <div class="stats">
            <div><strong>{{ fmt(corpusSummary.sources) }}</strong><span>sources</span></div>
            <div><strong>{{ fmt(corpusSummary.documents) }}</strong><span>documents</span></div>
            <div><strong>{{ fmt(corpusSummary.neumes) }}</strong><span>neumes</span></div>
            <div><strong>{{ fmt(corpusSummary.patterns) }}</strong><span>distinct patterns</span></div>
        </div>

        <div class="list-head">
            <h2>Loaded sources</h2>
            <input v-model="filter" type="search" placeholder="Filter…" aria-label="Filter loaded sources" />
            <button class="ne-btn ne-btn--sm ne-btn--danger" @click="askRemoveAll">Remove all…</button>
        </div>

        <table class="sources">
            <thead>
                <tr>
                    <th>Source</th><th>Origin</th><th>Date</th>
                    <th class="num">Documents</th><th class="num">Neumes</th><th class="num">Patterns</th>
                    <th>Loaded</th><th></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="r in rows" :key="r.name">
                    <td>
                        <button class="link" :title="`Open the neume table of ${r.name}`" @click="router.push(`/table/${encodeURIComponent(r.name)}`)">{{ r.name }}</button>
                    </td>
                    <td :title="r.library">{{ r.place || '—' }}</td>
                    <td>{{ r.date || '—' }}</td>
                    <td class="num">{{ fmt(r.documents) }}</td>
                    <td class="num">{{ fmt(r.neumes) }}</td>
                    <td class="num">{{ fmt(r.patterns) }}</td>
                    <td>{{ r.importedAt }}</td>
                    <td class="actions"><button class="icon danger" :aria-label="`Remove ${r.name}`" title="Remove from the loaded corpus" @click="askRemove(r.name)">✕</button></td>
                </tr>
                <tr v-if="rows.length === 0"><td colspan="8" class="empty">No source matches “{{ filter }}”.</td></tr>
            </tbody>
        </table>
    </section>
    <ActionDialog :request="request" @close="request = null" />
</div>
</template>

<style scoped>
.corpus-view { padding: var(--space-6); max-width: 1100px; margin: 0 auto; overflow-y: auto; height: 100%; box-sizing: border-box; }


.drop-card {
    border: 2px dashed var(--color-border-hover); border-radius: var(--radius-lg);
    background: var(--color-surface); padding: var(--space-6); text-align: center;
    display: flex; flex-direction: column; align-items: center; gap: var(--space-2);
    transition: border-color 0.15s, background-color 0.15s;
}
.drop-card.dragging { border-color: var(--color-primary); background: var(--color-primary-light); }
.drop-card.busy { border-style: solid; }
.drop-card h2 { margin: 0; font-size: 1.25rem; }
.drop-icon { font-size: 2rem; color: var(--color-primary); line-height: 1; }
.drop-hint { color: var(--color-text-muted); margin: 0 0 var(--space-3); }
.pick-row { display: flex; gap: var(--space-3); flex-wrap: wrap; justify-content: center; }
.option { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-4); font-size: 0.9rem; color: var(--color-text-muted); }

.status { margin: 0; color: var(--color-text-muted); }
.status.small { font-size: 0.85rem; }
.bar { width: min(520px, 100%); height: 8px; background: var(--color-surface-muted); border-radius: 999px; overflow: hidden; }
.bar-fill { height: 100%; background: var(--color-primary); transition: width 0.2s; }
.bar-fill.indeterminate { width: 35%; animation: slide 1.1s ease-in-out infinite alternate; }
@keyframes slide { from { margin-left: 0; } to { margin-left: 65%; } }
.spinner { width: 28px; height: 28px; border: 3px solid var(--color-border); border-top-color: var(--color-primary); border-radius: 50%; animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.other-sources { margin-top: var(--space-3); display: flex; justify-content: space-between; align-items: center; gap: var(--space-4); flex-wrap: wrap; padding: var(--space-3) var(--space-4); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); }
.other-sources strong { display: block; }
.other-sources span { font-size: 0.88rem; color: var(--color-text-muted); }

.note { margin-top: var(--space-4); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); border: 1px solid; }
.note.ok { background: var(--color-success-light); border-color: var(--color-success-muted); }
.note.bad { background: var(--color-danger-light); border-color: var(--color-danger-muted); }
.warnings { margin: var(--space-2) 0 0; padding-left: 1.2em; font-size: 0.85rem; color: var(--color-text-muted); }

.steps { list-style: none; margin: var(--space-5) 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-3); }
.steps li { display: flex; gap: var(--space-3); align-items: flex-start; padding: var(--space-3) var(--space-4); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); }
.steps .n { flex: 0 0 auto; width: 26px; height: 26px; border-radius: 50%; background: var(--color-primary-light); color: var(--color-primary-dark); font-weight: 700; font-size: 0.85rem; display: inline-flex; align-items: center; justify-content: center; }
.steps p { margin: 2px 0 0; color: var(--color-text-muted); font-size: 0.86rem; }
.formats { margin-top: var(--space-6); }
.formats h2 { font-size: 1.1rem; }
.format-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-4); }
.format-grid article { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-4); }
.format-grid h3 { margin: 0 0 var(--space-2); font-size: 1rem; }
.format-grid p { margin: 0; color: var(--color-text-muted); font-size: 0.92rem; }
.privacy { color: var(--color-text-light); font-size: 0.88rem; }
code { background: var(--color-surface-muted); padding: 0.05em 0.35em; border-radius: var(--radius-sm); font-size: 0.9em; }

.loaded { margin-top: var(--space-6); }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--space-3); margin-bottom: var(--space-5); }
.stats div { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-3) var(--space-4); display: flex; flex-direction: column; }
.stats strong { font-size: 1.5rem; line-height: 1.2; }
.stats span { color: var(--color-text-muted); font-size: 0.85rem; }

.list-head { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); }
.list-head h2 { margin: 0; font-size: 1.1rem; flex: 1; }
.list-head input { padding: 0.4em 0.7em; border: 1px solid var(--color-border); border-radius: var(--radius-md); width: 200px; }
button.icon.danger { color: var(--color-danger); }
button.icon.danger:hover { background: var(--color-danger-light); border-color: var(--color-danger-muted); }

.sources { width: 100%; border-collapse: collapse; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden; font-size: 0.92rem; }
.sources th { text-align: left; padding: 0.55em 0.8em; background: var(--color-surface-muted); color: var(--color-text-muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; }
.sources td { padding: 0.5em 0.8em; border-top: 1px solid var(--color-surface-muted); }
.sources .num { text-align: right; font-variant-numeric: tabular-nums; }
.sources .actions { text-align: right; width: 40px; }
.sources .empty { text-align: center; color: var(--color-text-light); padding: var(--space-5); }
button.link { background: none; border: none; padding: 0; color: var(--color-primary); font-weight: 600; }
button.link:hover { background: none; text-decoration: underline; }
button.icon { padding: 0.15em 0.5em; border-color: transparent; background: transparent; opacity: 0.55; }
button.icon:hover { opacity: 1; }

@media (max-width: 720px) {
    .corpus-view { padding: var(--space-4); }
}
</style>

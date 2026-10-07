<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import Panel from '../ui/Panel.vue';
import Disclosure from '../ui/Disclosure.vue';
import { exportStaticSite } from '../../composables/useStaticExport';
import { downloadDocumentation } from '../../composables/useDocumentationExport';
import { useManuscriptTable } from '../../composables/useManuscriptTable';
import { useToast } from '../../composables/useToast';
import { usePersonalTablesStore } from '../../stores/personalTables';
import { useAnnotationsStore } from '../../stores/annotations';
import { useDirectSnippetsStore } from '../../stores/directSnippets';
import { useSettingsStore } from '../../stores/settings';
import { cleanPublication, parseAuthors, publicationGaps, publishedColumns } from '../../utils/publication';

/**
 * Making a documentation others can read: say who made it and under which licence, choose which
 * metadata readers are shown, look at it as readers will, and download it as the files that go in
 * a repository. The viewer reads those files and nothing else.
 */
const toast = useToast();
const settings = useSettingsStore();
const table = useManuscriptTable();
const tables = usePersonalTablesStore();
const annotations = useAnnotationsStore();
const direct = useDirectSnippetsStore();
direct.load();

// ---- what is said about it ------------------------------------------------------------------

const draft = reactive({ ...settings.publication });
const authorsText = ref(settings.publication.authors.join('\n'));
let saving = false;

watch([draft, authorsText], () => {
    saving = true;
    settings.setPublication({ ...draft, authors: parseAuthors(authorsText.value), columns: settings.publication.columns });
    saving = false;
}, { deep: true });

// a restore or a backup changes it from outside
watch(() => settings.publication, (p) => {
    if (saving) return;
    // What was typed is kept as typed (a space at the end is still being written); only a real change replaces it.
    for (const [key, value] of Object.entries(p)) {
        if (typeof value === 'string' && typeof draft[key] === 'string' && draft[key].trim() === value) continue;
        draft[key] = value;
    }
    if (parseAuthors(authorsText.value).join('\n') !== p.authors.join('\n')) authorsText.value = p.authors.join('\n');
});

const LICENSES = ['CC BY 4.0', 'CC BY-SA 4.0', 'CC BY-NC 4.0', 'CC0 1.0', 'ODbL 1.0'];

// ---- what readers are shown ---------------------------------------------------------------------

const candidates = computed(() => table.columns.value.filter(c => c.group === 'catalogue' || c.group === 'project'));
const shownKeys = computed(() => new Set(publishedColumns(table.columns.value, settings.publication).map(c => c.key)));

function toggleColumn(key) {
    const next = new Set(shownKeys.value);
    if (next.has(key)) next.delete(key); else next.add(key);
    settings.setPublication({ ...settings.publication, columns: [...next] });
}
const resetColumns = () => settings.setPublication({ ...settings.publication, columns: null });

// ---- what is published -----------------------------------------------------------------------------

const count = computed(() => {
    const iiif = tables.tables.filter(t => t.isPublished && Object.keys(annotations.regions).some(k => k.startsWith(`${t.source}_`) && annotations.regions[k].length > 0)).length;
    return iiif + direct.publishedCollections.length;
});
const gaps = computed(() => publicationGaps(cleanPublication({ ...draft, authors: parseAuthors(authorsText.value) }), count.value));

// ---- downloading -------------------------------------------------------------------------------------

const running = ref(false);
const result = ref(null); // { tone, text }

async function download() {
    if (running.value) return;
    running.value = true;
    result.value = null;
    try {
        const r = await downloadDocumentation();
        result.value = {
            tone: 'success',
            text: `${r.name}: ${r.manuscripts} manuscript${r.manuscripts === 1 ? '' : 's'}, ${r.snippets} snippet${r.snippets === 1 ? '' : 's'}${r.images ? `, ${r.images} picture${r.images === 1 ? '' : 's'} as files` : ''}. Unzip it into a public GitHub repository — the README in the ZIP says how readers then open it.`
        };
        toast.show('Documentation downloaded.', { tone: 'success' });
    } catch (e) {
        result.value = { tone: 'error', text: e?.message || 'The documentation could not be made.' };
    } finally {
        running.value = false;
    }
}

// ---- the older export: finished web pages ---------------------------------------------------------------

const pagesRunning = ref(false);
const pagesProgress = ref('');
const pagesResult = ref(null);

async function downloadPages() {
    if (pagesRunning.value) return;
    pagesRunning.value = true;
    pagesResult.value = null;
    pagesProgress.value = 'Starting…';
    try {
        const res = await exportStaticSite((p) => { pagesProgress.value = p.message; });
        pagesResult.value = {
            tone: res.failures ? 'warn' : 'success',
            text: `Exported ${res.sources} manuscript${res.sources === 1 ? '' : 's'} with ${res.snippets} snippet${res.snippets === 1 ? '' : 's'}`
                + (res.failures ? `. ${res.failures} snippet${res.failures === 1 ? '' : 's'} could not be fetched (IIIF/CORS).` : '.')
        };
        toast.show('Static site downloaded.', { tone: 'success' });
    } catch (e) {
        pagesResult.value = { tone: 'error', text: e?.message || 'The export failed.' };
    } finally {
        pagesRunning.value = false;
        pagesProgress.value = '';
    }
}
</script>

<template>
<Panel id="publish" title="Publish a documentation" description="Put your work where others can read it. You download a few plain files and put them in a public GitHub repository; the viewer (View documentations) reads them — it never changes them, and it never sees anything of your workspace that is not in those files.">
    <div class="pub">
        <div class="form">
            <label class="field wide">Title
                <input v-model="draft.title" class="ne-input" placeholder="e.g. Neumes of the Rhineland, 11th–12th century" />
            </label>
            <label class="field wide">Description <span class="opt">(optional)</span>
                <textarea v-model="draft.description" class="ne-input" rows="3" placeholder="What is documented, how, and by what rules."></textarea>
            </label>
            <label class="field">Authors <span class="opt">(one on each line — they are named in citations)</span>
                <textarea v-model="authorsText" class="ne-input" rows="3" placeholder="Surname, Given name"></textarea>
            </label>
            <div class="stack">
                <label class="field">Licence
                    <input v-model="draft.license" class="ne-input" list="pub-licenses" placeholder="e.g. CC BY 4.0" />
                    <datalist id="pub-licenses"><option v-for="l in LICENSES" :key="l" :value="l" /></datalist>
                </label>
                <label class="field">Year
                    <input v-model="draft.year" class="ne-input" inputmode="numeric" maxlength="4" placeholder="2026" />
                </label>
            </div>
            <div class="stack">
                <label class="field">Publisher / institution <span class="opt">(optional)</span>
                    <input v-model="draft.publisher" class="ne-input" />
                </label>
                <label class="field">DOI <span class="opt">(optional)</span>
                    <input v-model="draft.doi" class="ne-input" placeholder="10.1234/abcd" />
                </label>
            </div>
            <label class="field wide">Home page <span class="opt">(optional)</span>
                <input v-model="draft.url" class="ne-input" placeholder="https://…" />
            </label>
            <label class="field wide">How you would like to be cited <span class="opt">(optional — readers can choose it as one of the styles)</span>
                <textarea v-model="draft.preferredCitation" class="ne-input" rows="2" placeholder="Author, A. 2026. Title of the documentation. Publisher."></textarea>
            </label>
        </div>

        <Disclosure title="Metadata readers are shown" :summary="`${shownKeys.size} of ${candidates.length} columns`">
            <p class="hint">
                These columns of the <RouterLink to="/manuscripts">manuscripts table</RouterLink> go into the documentation, and readers can filter by the ones you offer as filters there.
                Your comment column and other working notes are left out unless you tick them.
            </p>
            <ul class="cols">
                <li v-for="c in candidates" :key="c.key">
                    <label class="ne-check"><input type="checkbox" :checked="shownKeys.has(c.key)" @change="toggleColumn(c.key)" /> {{ c.label }}</label>
                </li>
            </ul>
            <button v-if="settings.publication.columns" type="button" class="ne-btn ne-btn--sm" @click="resetColumns">Back to the usual columns</button>
        </Disclosure>

        <div v-if="gaps.length" class="ne-note ne-note--warn gaps">
            <strong>Before others read it:</strong>
            <ul><li v-for="g in gaps" :key="g">{{ g }}</li></ul>
        </div>

        <div class="actions">
            <RouterLink to="/docs/local" class="ne-btn">Preview as readers see it →</RouterLink>
            <button class="ne-btn ne-btn--primary" :disabled="running || !count" :title="count ? '' : 'Nothing is published yet'" @click="download">{{ running ? 'Making the files…' : 'Download documentation (ZIP)' }}</button>
            <span class="ne-muted">{{ count }} published manuscript{{ count === 1 ? '' : 's' }}</span>
        </div>
        <p v-if="result" class="ne-note result" :class="`ne-note--${result.tone}`">{{ result.text }}</p>

        <Disclosure title="Also: finished web pages" summary="one HTML and one Markdown page for each manuscript">
            <p class="hint">Download a self-contained copy as ready-made pages, with the cropped IIIF snippets saved as image files. Snippets are fetched live from the IIIF servers, so keep this tab open while it runs. These pages are fixed; the documentation above is what the viewer reads.</p>
            <button class="ne-btn" :disabled="pagesRunning" @click="downloadPages">{{ pagesRunning ? 'Exporting…' : 'Download static site' }}</button>
            <p v-if="pagesRunning" class="ne-muted">{{ pagesProgress }}</p>
            <p v-if="pagesResult" class="ne-note result" :class="`ne-note--${pagesResult.tone}`">{{ pagesResult.text }}</p>
        </Disclosure>
    </div>
</Panel>
</template>

<style scoped>
.pub { display: flex; flex-direction: column; gap: var(--space-4); }
.form { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3) var(--space-4); }
.wide { grid-column: 1 / -1; }
.stack { display: contents; }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 0.82rem; font-weight: 600; color: var(--color-text-muted); }
.field .ne-input { font-weight: 400; color: var(--color-text); }
.opt { font-weight: 400; color: var(--color-text-light); }
.hint { margin: 0 0 var(--space-3); font-size: 0.86rem; color: var(--color-text-muted); max-width: 70ch; }
.cols { list-style: none; margin: 0 0 var(--space-3); padding: 0; columns: 3 12rem; }
.gaps ul { margin: var(--space-1) 0 0; padding-left: 1.2em; }
.actions { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.result { margin: 0; }
@media (max-width: 720px) { .form { grid-template-columns: 1fr; } }
</style>

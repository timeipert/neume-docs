<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { useProjectsStore } from '../stores/projects';
import { useIiifStore } from '../stores/iiif';
import { useSettingsStore } from '../stores/settings';
import { folioProblem } from '../utils/snippetAttributes';
import { useTranscriptionData } from '../composables/useTranscriptionData';
import { useEffectiveMeta } from '../composables/useEffectiveMeta';
import { hasIiif } from '../composables/useProject';
import { describeRange, foliosInRange } from '../utils/projectData';
import { FOCUS_OPTIONS, IMAGE_OPTIONS, snippetOptions } from '../utils/projectChoices';
import { compareFolios } from '../utils/sorting';
import PageHeader from '../components/ui/PageHeader.vue';
import ChoiceCards from '../components/ui/ChoiceCards.vue';

const route = useRoute();
const router = useRouter();
const store = useProjectsStore();
const iiif = useIiifStore();
const settings = useSettingsStore();
const { catalog, sourceNames, hasCorpus, loading } = useTranscriptionData();
const metaOf = useEffectiveMeta();

const STEPS = [
    { key: 'focus', label: 'Starting point' },
    { key: 'where', label: 'Manuscript & folios' },
    { key: 'images', label: 'Images' },
    { key: 'snippets', label: 'Snippets' }
];

const draft = reactive({
    focus: '', source: String(route.query.source || ''), from: '', to: '', name: '',
    images: '', snippets: 'lines', manifest: ''
});
const nameTouched = ref(false);
const imagesTouched = ref(false);

// Starting from the transcription is the natural answer once there is one.
watch(loading, (isLoading) => {
    if (isLoading || draft.focus) return;
    draft.focus = hasCorpus.value ? 'transcription' : 'manuscript';
}, { immediate: true });

// ---- the manuscript --------------------------------------------------------

const record = computed(() => catalog.value[draft.source.trim()] || null);
const inCorpus = computed(() => !!record.value);

const sourceChoices = computed(() => {
    const names = new Set(sourceNames.value);
    if (draft.focus !== 'transcription') {
        for (const name of Object.keys(iiif.links)) names.add(name);
        for (const p of store.projects) if (p.source) names.add(p.source);
    }
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
});

function describeSource(name) {
    return [metaOf(name, 'herkunftsort'), metaOf(name, 'datierung')].filter(Boolean).join(' · ');
}

const manuscriptFolios = computed(() => {
    if (record.value && (record.value.folios || []).length) return [...record.value.folios].sort(compareFolios);
    const pages = iiif.parsedData[draft.source.trim()] || [];
    return [...new Set(pages.map(c => c.folio).filter(Boolean))].sort(compareFolios);
});
const rangeCount = computed(() => foliosInRange(manuscriptFolios.value, draft.from, draft.to).length);

// A folio is checked the way the settings say (by default: a number and r or v).
const fromProblem = computed(() => folioProblem(settings.snippetAttributes, draft.from));
const toProblem = computed(() => folioProblem(settings.snippetAttributes, draft.to));
const rangeError = computed(() => (
    !fromProblem.value && !toProblem.value && draft.from && draft.to && compareFolios(draft.from, draft.to) > 0
        ? 'The first folio comes after the last.' : ''
));
const sourceError = computed(() => {
    if (!draft.source.trim()) return '';
    if (draft.focus === 'transcription' && !inCorpus.value) return 'This manuscript is not in the loaded corpus.';
    return '';
});

const suggestedName = computed(() => [
    draft.source.trim(),
    draft.from || draft.to ? describeRange(draft.from, draft.to) : ''
].filter(Boolean).join(' · '));
const name = computed({
    get: () => (nameTouched.value ? draft.name : suggestedName.value),
    set: (value) => { nameTouched.value = true; draft.name = value; }
});

// ---- images ----------------------------------------------------------------

const iiifState = computed(() => {
    const source = draft.source.trim();
    if (!source) return 'none';
    if (iiif.links[source]) return 'manifest';
    if (hasIiif(iiif, source)) return 'pages';
    return 'none';
});

// Offer what the manuscript has, until the person says otherwise.
watch([iiifState, () => draft.source], () => {
    if (!imagesTouched.value) draft.images = iiifState.value === 'none' ? 'screenshots' : 'iiif';
}, { immediate: true });

const imageOptions = computed(() => IMAGE_OPTIONS.map(o => ({
    ...o,
    note: o.value === 'iiif'
        ? (iiifState.value === 'manifest' ? 'A manifest is linked for this manuscript.'
            : iiifState.value === 'pages' ? 'The transcription names the page images of this manuscript.'
            : 'No manifest is linked for this manuscript yet.')
        : ''
})));
const snippetChoices = computed(() => snippetOptions(draft.images));

// ---- the steps -------------------------------------------------------------

const valid = computed(() => ({
    focus: !!draft.focus && (draft.focus === 'manuscript' || hasCorpus.value),
    where: !!draft.source.trim() && !sourceError.value && !rangeError.value && !fromProblem.value && !toProblem.value,
    images: !!draft.images,
    snippets: !!draft.snippets
}));

/** The first step that cannot be skipped: nothing after it can be reached yet. */
const reachable = computed(() => {
    const blocked = STEPS.findIndex(s => !valid.value[s.key]);
    return blocked === -1 ? STEPS.length - 1 : blocked;
});

const stepKey = computed(() => {
    const asked = STEPS.findIndex(s => s.key === route.query.step);
    return STEPS[Math.min(asked === -1 ? 0 : asked, reachable.value)].key;
});
const stepIndex = computed(() => STEPS.findIndex(s => s.key === stepKey.value));

function go(key, { replace = false } = {}) {
    const query = { ...route.query, step: key === 'focus' ? undefined : key };
    (replace ? router.replace : router.push)({ query });
}
const next = () => go(STEPS[stepIndex.value + 1].key);

const summary = computed(() => ({ ...draft, name: name.value.trim() || draft.source.trim() }));

function create() {
    const source = draft.source.trim();
    if (draft.images === 'iiif' && draft.manifest.trim()) {
        iiif.setLink(source, draft.manifest.trim()).catch(() => {});
    }
    const project = store.create({ ...summary.value, source });
    store.markOpened(project.id);
    router.push({ name: 'project_columns', params: { id: project.id } });
}

function chooseImages(value) {
    imagesTouched.value = true;
    draft.images = value;
}
</script>

<template>
<div class="wizard-view">
    <div class="wrap">
        <PageHeader title="New project">
            <template #actions>
                <RouterLink to="/projects" class="ne-btn ne-btn--ghost">Cancel</RouterLink>
            </template>
        </PageHeader>

        <nav class="stepper" aria-label="Steps of the new project">
            <ol>
                <li v-for="(s, i) in STEPS" :key="s.key" :class="{ current: s.key === stepKey, done: i < stepIndex }">
                    <button type="button" :disabled="i > reachable" :aria-current="s.key === stepKey ? 'step' : undefined" @click="go(s.key)">
                        <span class="num">{{ i < stepIndex ? '✓' : i + 1 }}</span>
                        <span class="lbl">{{ s.label }}</span>
                    </button>
                </li>
            </ol>
        </nav>

        <section class="card" :aria-labelledby="`step-${stepKey}`">
            <!-- 1. focus -->
            <template v-if="stepKey === 'focus'">
                <h2 :id="`step-${stepKey}`">What do you start from?</h2>
                <ChoiceCards
                    v-model="draft.focus"
                    label="Starting point"
                    :options="FOCUS_OPTIONS.map(o => o.value === 'transcription' && !hasCorpus
                        ? { ...o, disabled: true, note: 'No corpus is loaded yet.' } : o)"
                />
                <p v-if="!hasCorpus && !loading" class="ne-note ne-note--info">
                    <RouterLink to="/manuscripts/corpus">Load a corpus</RouterLink> to start from its transcription.
                </p>
            </template>

            <!-- 2. manuscript and folios -->
            <template v-else-if="stepKey === 'where'">
                <h2 :id="`step-${stepKey}`">Which manuscript, and which folios?</h2>

                <div class="form">
                    <div class="ne-field wide">
                        <label for="w-source">Manuscript</label>
                        <input id="w-source" v-model="draft.source" class="ne-input" list="w-sources" autocomplete="off" placeholder="e.g. Aa 13" @keydown.enter.prevent="valid.where && next()" />
                        <datalist id="w-sources">
                            <option v-for="n in sourceChoices" :key="n" :value="n">{{ describeSource(n) }}</option>
                        </datalist>
                        <p v-if="sourceError" class="field-error">{{ sourceError }}</p>
                        <p v-else-if="record" class="hint">{{ describeSource(draft.source.trim()) || 'In the loaded corpus' }}<template v-if="manuscriptFolios.length"> · {{ manuscriptFolios.length }} folios</template></p>
                    </div>

                    <div class="ne-field">
                        <label for="w-from">First folio</label>
                        <input id="w-from" v-model.trim="draft.from" class="ne-input" :class="{ bad: fromProblem }" list="w-folios" autocomplete="off" placeholder="e.g. 12r" />
                        <p v-if="fromProblem" class="field-error">{{ fromProblem }}</p>
                    </div>
                    <div class="ne-field">
                        <label for="w-to">Last folio</label>
                        <input id="w-to" v-model.trim="draft.to" class="ne-input" :class="{ bad: toProblem }" list="w-folios" autocomplete="off" placeholder="e.g. 20v" />
                        <p v-if="toProblem" class="field-error">{{ toProblem }}</p>
                    </div>
                    <datalist id="w-folios"><option v-for="f in manuscriptFolios" :key="f" :value="f" /></datalist>
                    <p v-if="rangeError" class="field-error wide">{{ rangeError }}</p>
                    <p v-else-if="manuscriptFolios.length && (draft.from || draft.to)" class="hint wide">{{ rangeCount }} of {{ manuscriptFolios.length }} folios are in this range.</p>

                    <div class="ne-field wide">
                        <label for="w-name">Project name</label>
                        <input id="w-name" v-model="name" class="ne-input" :placeholder="suggestedName || 'Name'" />
                    </div>
                </div>
            </template>

            <!-- 3. images -->
            <template v-else-if="stepKey === 'images'">
                <h2 :id="`step-${stepKey}`">Where do the images come from?</h2>
                <ChoiceCards :model-value="draft.images" label="Images" :options="imageOptions" @update:model-value="chooseImages" />
                <div v-if="draft.images === 'iiif' && iiifState === 'none'" class="ne-note ne-note--warn manifest">
                    <p>There are no page images for <strong>{{ draft.source }}</strong> yet. They come from a <strong>IIIF manifest</strong>, a web address that lists the pages of the manuscript. Give it now, or later: until then the project says what is missing.</p>
                    <div class="ne-field">
                        <label for="w-manifest">IIIF manifest <span class="ne-muted">(optional; more under <RouterLink to="/manuscripts/images">Manuscripts → Images</RouterLink>)</span></label>
                        <input id="w-manifest" v-model.trim="draft.manifest" class="ne-input" type="url" placeholder="https://…/manifest.json" />
                    </div>
                </div>
            </template>

            <!-- 4. snippets -->
            <template v-else-if="stepKey === 'snippets'">
                <h2 :id="`step-${stepKey}`">What do you cut out?</h2>
                <ChoiceCards v-model="draft.snippets" label="Snippets" :options="snippetChoices" />
            </template>

            <footer class="nav">
                <button v-if="stepIndex > 0" class="ne-btn" @click="go(STEPS[stepIndex - 1].key)">Back</button>
                <span class="grow"></span>
                <button v-if="stepIndex < STEPS.length - 1" class="ne-btn ne-btn--primary" :disabled="!valid[stepKey]" @click="next">Next</button>
                <button v-else class="ne-btn ne-btn--primary" :disabled="!valid[stepKey]" @click="create">Create project &rarr;</button>
            </footer>
        </section>
    </div>
</div>
</template>

<style scoped>
.wizard-view { height: 100%; overflow-y: auto; box-sizing: border-box; padding: var(--space-6); }
.wrap { max-width: 880px; margin: 0 auto; }

.stepper ol { list-style: none; margin: 0 0 var(--space-4); padding: 0; display: flex; gap: var(--space-1); flex-wrap: wrap; }
.stepper li { flex: 1 1 0; min-width: 110px; }
.stepper button { width: 100%; display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); border: none; border-bottom: 3px solid var(--color-border); border-radius: var(--radius-md) var(--radius-md) 0 0; background: transparent; color: var(--color-text-muted); font-weight: 600; font-size: 0.88rem; text-align: left; }
.stepper button:hover:not(:disabled) { background: var(--color-surface-muted); color: var(--color-text); }
.stepper button:disabled { opacity: 0.5; cursor: not-allowed; }
.stepper li.done button { border-bottom-color: var(--color-primary-muted); color: var(--color-text); }
.stepper li.current button { border-bottom-color: var(--color-primary); color: var(--color-primary-dark); background: var(--color-primary-light); }
.num { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: var(--color-surface-muted); font-size: 0.78rem; }
.stepper li.current .num { background: var(--color-primary); color: #fff; }
.stepper li.done .num { background: var(--color-primary-muted); color: var(--color-primary-dark); }

.card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-5); box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: var(--space-4); }
.card h2 { margin: 0; font-size: 1.3rem; }

.form { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
.form .wide { grid-column: 1 / -1; }
.hint { margin: 0; font-size: 0.82rem; color: var(--color-text-muted); }
.bad { border-color: var(--color-danger) !important; }
.field-error { margin: 0; font-size: 0.84rem; font-weight: 600; color: var(--color-danger); }
.manifest p { margin: 0 0 var(--space-3); }


.nav { display: flex; align-items: center; gap: var(--space-2); padding-top: var(--space-3); border-top: 1px solid var(--color-border); }
.grow { flex: 1; }

@media (max-width: 720px) {
    .wizard-view { padding: var(--space-4); }
    .form { grid-template-columns: 1fr; }
    .stepper .lbl { display: none; }
    .stepper li { min-width: 0; }
    .stepper li.current .lbl { display: inline; }
}
</style>

<script setup>
import { computed, reactive, watch } from 'vue';
import ModalDialog from '../ui/ModalDialog.vue';
import SegmentedControl from '../ui/SegmentedControl.vue';
import { useProjectsStore } from '../../stores/projects';
import { useSettingsStore } from '../../stores/settings';
import { useIiifStore } from '../../stores/iiif';
import { iiifStatus } from '../../utils/iiifStatus';
import { useToast } from '../../composables/useToast';
import { folioProblem } from '../../utils/snippetAttributes';
import { compareFolios } from '../../utils/sorting';

/**
 * Everything about a project that can be changed after the fact: its name, hand and
 * folios, the three answers of the wizard, whether it is public — and deleting it.
 * The manuscript stays: another manuscript is another project.
 */
const props = defineProps({
    open: { type: Boolean, default: false },
    project: { type: Object, default: null },
    /** the folios the manuscript is known to have, for completing the range */
    folios: { type: Array, default: () => [] },
    hasTranscription: { type: Boolean, default: false }
});
const emit = defineEmits(['close', 'delete']);

const store = useProjectsStore();
const settings = useSettingsStore();
const iiif = useIiifStore();
const toast = useToast();

const draft = reactive({ name: '', scribe: '', from: '', to: '', focus: '', images: '', snippets: '', published: false });

watch(() => [props.open, props.project && props.project.id], () => {
    if (!props.open || !props.project) return;
    Object.assign(draft, {
        name: props.project.name, scribe: props.project.scribe, from: props.project.from, to: props.project.to,
        focus: props.project.focus, images: props.project.images, snippets: props.project.snippets, published: props.project.published
    });
}, { immediate: true });

const fromProblem = computed(() => folioProblem(settings.snippetAttributes, draft.from));
const toProblem = computed(() => folioProblem(settings.snippetAttributes, draft.to));
const rangeError = computed(() => (
    !fromProblem.value && !toProblem.value && draft.from && draft.to && compareFolios(draft.from, draft.to) > 0
        ? 'The first folio comes after the last.' : ''
));
const canSave = computed(() => !!draft.name.trim() && !rangeError.value && !fromProblem.value && !toProblem.value);

const FOCUS = computed(() => [
    { value: 'transcription', label: 'Transcription', title: 'The corpus says where the neumes are' },
    { value: 'manuscript', label: 'Manuscript', title: 'You look at the manuscript and mark what you find' }
]);
const IMAGES = [
    { value: 'iiif', label: 'IIIF', title: 'Page images from a manifest' },
    { value: 'screenshots', label: 'Screenshots', title: 'Images you paste in' }
];
/** The project is set to work on page images and the manuscript has none: say what that means. */
const noImages = computed(() => !!props.project && draft.images === 'iiif' && iiifStatus(iiif, props.project.source).state === 'none');

const SNIPPETS = computed(() => (draft.images === 'screenshots'
    ? [{ value: 'lines', label: 'Lines', title: 'Screenshots of whole lines, with the signs marked on them' }, { value: 'signs', label: 'Signs', title: 'One screenshot per sign' }]
    : [{ value: 'lines', label: 'Lines', title: 'Line regions first, then the signs on them' }, { value: 'signs', label: 'Signs', title: 'Signs marked directly on the page' }]));

function save() {
    if (!canSave.value) return;
    store.update(props.project.id, { ...draft, name: draft.name.trim() });
    toast.show('Project updated.', { tone: 'success' });
    emit('close');
}
</script>

<template>
<ModalDialog :open="open" title="Project settings" width="34rem" @close="emit('close')">
    <form v-if="project" id="project-settings" class="form" @submit.prevent="save">
        <div class="ne-field wide">
            <label for="ps-name">Name</label>
            <input id="ps-name" v-model="draft.name" class="ne-input" />
            <p class="hint">{{ project.source }} — another manuscript is another project.</p>
        </div>

        <div class="ne-field">
            <label for="ps-from">First folio</label>
            <input id="ps-from" v-model.trim="draft.from" class="ne-input" :class="{ bad: fromProblem }" list="ps-folios" autocomplete="off" placeholder="e.g. 12r" />
            <p v-if="fromProblem" class="error">{{ fromProblem }}</p>
        </div>
        <div class="ne-field">
            <label for="ps-to">Last folio</label>
            <input id="ps-to" v-model.trim="draft.to" class="ne-input" :class="{ bad: toProblem }" list="ps-folios" autocomplete="off" placeholder="e.g. 20v" />
            <p v-if="toProblem" class="error">{{ toProblem }}</p>
        </div>
        <datalist id="ps-folios"><option v-for="f in folios" :key="f" :value="f" /></datalist>
        <p v-if="rangeError" class="wide error">{{ rangeError }}</p>

        <div class="ne-field wide">
            <label for="ps-scribe">Hand <span class="ne-muted">(optional)</span></label>
            <input id="ps-scribe" v-model="draft.scribe" class="ne-input" placeholder="e.g. Hand A" />
        </div>

        <div class="choices wide">
            <div class="choice"><span class="label">Starts from</span><SegmentedControl v-model="draft.focus" :options="FOCUS.map(o => o.value === 'transcription' && !hasTranscription ? { ...o, title: 'This manuscript is not in the loaded corpus' } : o)" label="Starts from" size="sm" /></div>
            <div class="choice"><span class="label">Images</span><SegmentedControl v-model="draft.images" :options="IMAGES" label="Images" size="sm" /></div>
            <div class="choice"><span class="label">Snippets</span><SegmentedControl v-model="draft.snippets" :options="SNIPPETS" label="Snippets" size="sm" /></div>
            <p v-if="noImages" class="ne-note ne-note--warn">There are no page images for {{ project.source }} yet. The project asks for a manifest address when you open its table, or you can choose screenshots.</p>
            <p class="hint">Snippets already made are not touched: they stay with the manuscript and its folios.</p>
        </div>

        <label class="ne-check wide"><input v-model="draft.published" type="checkbox" /> Show this project in the public views</label>
    </form>
    <template #footer>
        <button type="button" class="ne-btn ne-btn--danger" @click="emit('delete')">Delete project</button>
        <span class="grow"></span>
        <button type="button" class="ne-btn" @click="emit('close')">Cancel</button>
        <button type="submit" form="project-settings" class="ne-btn ne-btn--primary" :disabled="!canSave">Save</button>
    </template>
</ModalDialog>
</template>

<style scoped>
.form { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
.wide { grid-column: 1 / -1; }
.hint { margin: 2px 0 0; font-size: 0.8rem; color: var(--color-text-muted); }
.choices { display: flex; flex-direction: column; gap: var(--space-2); }
.choice { display: flex; align-items: center; gap: var(--space-3); }
.label { flex: 0 0 6.5rem; font-size: 0.78rem; font-weight: 600; color: var(--color-text-muted); }
.bad { border-color: var(--color-danger) !important; }
.error { margin: 0; font-weight: 600; color: var(--color-danger); font-size: 0.84rem; }
.grow { flex: 1; }
@media (max-width: 600px) { .form { grid-template-columns: 1fr; } .choice { flex-direction: column; align-items: flex-start; } }
</style>

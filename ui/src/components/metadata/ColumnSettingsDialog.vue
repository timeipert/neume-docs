<script setup>
import { computed, reactive, ref, watch } from 'vue';
import ModalDialog from '../ui/ModalDialog.vue';
import ColumnCheckEditor from './ColumnCheckEditor.vue';
import { useManuscriptTable } from '../../composables/useManuscriptTable';
import { FILTER_KIND_OPTIONS, useManuscriptFilter } from '../../composables/useManuscriptFilter';
import { useSettingsStore } from '../../stores/settings';
import { useToast } from '../../composables/useToast';
import { META_TYPES, parseCentury } from '../../utils/sourceMeta';
import { fromDraft, placeColumn, setCheck, setFilterConfig, toDraft } from '../../utils/metadataSchema';

/**
 * Everything about one column of the manuscripts table: what it is called and means (for the
 * columns of your own), which category it stands under, and what its cells should look like.
 */
const props = defineProps({
    open: { type: Boolean, default: false },
    /** the key of the column in the table, e.g. `cat:herkunftsort` or `proj:ink` */
    columnKey: { type: String, default: '' }
});
const emit = defineEmits(['close']);

const table = useManuscriptTable();
const mf = useManuscriptFilter(table);
const settings = useSettingsStore();
const toast = useToast();

const col = computed(() => table.columnByKey.value.get(props.columnKey) || null);
/** a column of your own: its name, description and kind are yours to change */
const own = computed(() => !!col.value && col.value.group === 'project');
const field = computed(() => (own.value ? settings.sourceMetaFields.find(f => f.key === col.value.field) : null));
const checkable = computed(() => !!col.value && !col.value.readonly);

const draft = reactive({ label: '', description: '', type: 'text', category: '', check: toDraft(null), filterOn: false, filterKind: '' });
/** what the column was for filtering when the dialog opened: a change is only kept if it differs */
const filterNow = computed(() => (col.value && props.open ? mf.configFor(col.value) : null));
let offeredAtOpen = false;

watch(() => [props.open, props.columnKey], () => {
    if (!props.open || !col.value) return;
    Object.assign(draft, {
        label: col.value.label,
        description: field.value ? field.value.description || '' : '',
        type: field.value ? field.value.type || 'text' : 'text',
        category: col.value.band,
        check: toDraft(settings.metadataSchema.checks[props.columnKey]),
        filterOn: filterNow.value ? filterNow.value.offered : false,
        filterKind: filterNow.value ? filterNow.value.saidKind : ''
    });
    offeredAtOpen = draft.filterOn;
}, { immediate: true });

const values = computed(() => (col.value && props.open ? table.usedValues(col.value) : []));

// For a date column: how many values cannot be read as a date range (still shown, but outside the timeline filter).
const unparsed = computed(() => (own.value && draft.type === 'century' ? values.value.filter(v => parseCentury(v) === null).length : 0));

const canSave = computed(() => !!col.value && (!own.value || !!draft.label.trim()));

function save() {
    if (!canSave.value) return;
    if (own.value) {
        settings.updateSourceMetaField(field.value.key, { label: draft.label.trim(), description: draft.description.trim(), type: draft.type });
    }
    let next = placeColumn(settings.metadataSchema, props.columnKey, draft.category, col.value.group);
    if (checkable.value) next = setCheck(next, props.columnKey, fromDraft(draft.check));
    // What is not changed here stays as it was: a column nobody said anything about keeps following what it holds.
    const said = settings.metadataSchema.filters[props.columnKey] || {};
    next = setFilterConfig(next, props.columnKey, {
        on: draft.filterOn !== offeredAtOpen ? draft.filterOn : (typeof said.on === 'boolean' ? said.on : null),
        kind: draft.filterKind || null
    });
    settings.setMetadataSchema(next);
    toast.show(`Column “${draft.label.trim() || col.value.label}” saved.`, { tone: 'success' });
    emit('close');
}
</script>

<template>
<ModalDialog :open="open && !!col" :title="col ? `Column: ${col.label}` : 'Column'" width="36rem" @close="emit('close')">
    <form v-if="col" id="column-settings" class="form" @submit.prevent="save">
        <template v-if="own">
            <div class="ne-field">
                <label for="cs-name">Name</label>
                <input id="cs-name" v-model="draft.label" class="ne-input" />
            </div>
            <div class="ne-field">
                <label for="cs-desc">Description <span class="ne-muted">(optional)</span></label>
                <input id="cs-desc" v-model="draft.description" class="ne-input" placeholder="Shown when you point at the column heading" />
            </div>
            <div class="ne-field">
                <label for="cs-kind">Kind</label>
                <select id="cs-kind" v-model="draft.type" class="ne-input">
                    <option v-for="t in META_TYPES" :key="t.key" :value="t.key">{{ t.label }}</option>
                </select>
                <p class="hint">{{ (META_TYPES.find(t => t.key === draft.type) || {}).hint }}</p>
                <p v-if="unparsed" class="ne-note ne-note--warn">
                    {{ unparsed }} of the {{ values.length }} value{{ values.length === 1 ? '' : 's' }} cannot be read as a date or century.
                    They stay in the table but are left out of the timeline filter.
                </p>
            </div>
        </template>
        <p v-else class="origin">
            <template v-if="col.group === 'catalogue'">A field of the corpus catalogue. What you type here is kept as your own value; the corpus stays as it was.</template>
            <template v-else-if="col.group === 'iiif'">{{ col.hint }}</template>
            <template v-else>{{ col.hint || 'Calculated from the corpus; it cannot be edited.' }}</template>
        </p>

        <div class="ne-field">
            <label for="cs-category">Category</label>
            <select id="cs-category" v-model="draft.category" class="ne-input">
                <option v-for="c in table.categories.value" :key="c.key" :value="c.key">{{ c.label }}</option>
            </select>
            <p class="hint">The band above the heading. Categories are made and ordered in Settings → Manuscript metadata.</p>
        </div>

        <div class="ne-field">
            <span class="ne-label">Filter</span>
            <label class="ne-check"><input v-model="draft.filterOn" type="checkbox" /> Offer this column as a filter in the Filter panel</label>
            <select v-model="draft.filterKind" class="ne-input" aria-label="How the column is filtered" :disabled="!draft.filterOn">
                <option value="">Automatic — {{ filterNow ? (FILTER_KIND_OPTIONS.find(o => o.value === filterNow.auto) || {}).label : '' }}</option>
                <option v-for="o in FILTER_KIND_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
            <p class="hint">
                <strong>Pick values</strong> lists what the column holds with how many manuscripts have each; <strong>Date range</strong> reads the cells as datings
                (“s. XI/XII”, “c. 1100”) and draws them on a timeline; <strong>Number range</strong> takes a lowest and a highest; <strong>Text</strong> compares what you type.
                <template v-if="filterNow">The column holds {{ filterNow.distinct }} different value{{ filterNow.distinct === 1 ? '' : 's' }} in {{ filterNow.filled }} manuscript{{ filterNow.filled === 1 ? '' : 's' }}.</template>
            </p>
        </div>

        <div v-if="checkable" class="ne-field">
            <span class="ne-label">What the cells should look like</span>
            <ColumnCheckEditor :draft="draft.check" :values="values" />
        </div>
    </form>
    <template #footer>
        <button type="button" class="ne-btn" @click="emit('close')">Cancel</button>
        <button type="submit" form="column-settings" class="ne-btn ne-btn--primary" :disabled="!canSave">Save</button>
    </template>
</ModalDialog>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--space-4); }
.hint { margin: 2px 0 0; font-size: 0.8rem; color: var(--color-text-muted); }
.origin { margin: 0; font-size: 0.86rem; color: var(--color-text-muted); }
</style>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import ModalDialog from '../ui/ModalDialog.vue';
import ColumnCheckEditor from './ColumnCheckEditor.vue';
import { useManuscriptTable } from '../../composables/useManuscriptTable';
import { useSettingsStore } from '../../stores/settings';
import { useToast } from '../../composables/useToast';
import { META_TYPES, parseCentury } from '../../utils/sourceMeta';
import { fromDraft, placeColumn, setCheck, toDraft } from '../../utils/metadataSchema';

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
const settings = useSettingsStore();
const toast = useToast();

const col = computed(() => table.columnByKey.value.get(props.columnKey) || null);
/** a column of your own: its name, description and kind are yours to change */
const own = computed(() => !!col.value && col.value.group === 'project');
const field = computed(() => (own.value ? settings.sourceMetaFields.find(f => f.key === col.value.field) : null));
const checkable = computed(() => !!col.value && !col.value.readonly);

const draft = reactive({ label: '', description: '', type: 'text', category: '', check: toDraft(null) });

watch(() => [props.open, props.columnKey], () => {
    if (!props.open || !col.value) return;
    Object.assign(draft, {
        label: col.value.label,
        description: field.value ? field.value.description || '' : '',
        type: field.value ? field.value.type || 'text' : 'text',
        category: col.value.band,
        check: toDraft(settings.metadataSchema.checks[props.columnKey])
    });
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

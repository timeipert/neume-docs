<script setup>
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useManuscriptTable } from '../../composables/useManuscriptTable';
import { useManuscriptFilter } from '../../composables/useManuscriptFilter';
import { useSettingsStore } from '../../stores/settings';
import { useToast } from '../../composables/useToast';
import ColumnSettingsDialog from '../metadata/ColumnSettingsDialog.vue';
import {
    addCategory, defaultMetadataSchema, describeCheck, moveCategory, moveColumn,
    placeColumn, removeCategory, renameCategory, schemaChanges
} from '../../utils/metadataSchema';

/**
 * How the columns of the manuscripts table are arranged: in categories, the bands above the
 * headings (the corpus catalogue and IIIF are two; Notation, with Ink and Clef beneath it, could be
 * another), in the order you give them, and what the cells of each column should look like.
 */
const table = useManuscriptTable();
const mf = useManuscriptFilter(table);
const settings = useSettingsStore();
const toast = useToast();

const ORIGIN = { catalogue: 'Catalogue', iiif: 'IIIF', project: 'Yours', corpus: 'Calculated' };

const schema = computed(() => settings.metadataSchema);
const layout = computed(() => table.layout.value);
const allKeys = computed(() => layout.value.flatMap(cat => cat.columns.map(c => c.key)));
// saved filters are not undone by starting over, so they do not count as something to undo
const changed = computed(() => { const { views, ...rest } = schemaChanges(schema.value); return Object.values(rest).some(Boolean); });

const apply = (next) => settings.setMetadataSchema(next);

// ---- categories ---------------------------------------------------------------

const newCategory = ref('');

function createCategory() {
    const made = addCategory(schema.value, newCategory.value);
    if (!made) {
        if (newCategory.value.trim()) toast.show(`There is already a category called “${newCategory.value.trim()}”.`, { tone: 'error' });
        return;
    }
    apply(made.schema);
    newCategory.value = '';
}

function rename(cat, label) {
    const next = renameCategory(schema.value, cat.key, label);
    if (next === schema.value && label.trim() !== cat.label) toast.show('That name is empty or already taken.', { tone: 'error' });
    apply(next);
}

function removeCat(cat) {
    const before = schema.value;
    apply(removeCategory(before, cat.key));
    toast.show(`Category “${cat.label}” removed. Its columns went back where they came from.`, { action: { label: 'Undo', run: () => apply(before) } });
}

// ---- columns --------------------------------------------------------------------

/** Offer a column as a filter, or not. Back to what the column's contents suggest when it is set to that. */
function offer(col, on) {
    const c = mf.configFor(col);
    mf.configure(col.key, { on: on === c.defaultOffered ? null : on });
}

const moveCol = (cat, col, delta) => apply(moveColumn(schema.value, col.key, delta, cat.columns.map(c => c.key), allKeys.value));
const place = (col, categoryKey) => apply(placeColumn(schema.value, col.key, categoryKey, col.group));

const newColumn = ref({});

function createColumn(cat) {
    const label = (newColumn.value[cat.key] || '').trim();
    if (!label) return;
    const field = table.addProjectColumn(label, 'text', cat.key);
    if (!field) { toast.show(`There is already a column called “${label}”.`, { tone: 'error' }); return; }
    newColumn.value = { ...newColumn.value, [cat.key]: '' };
}

const settingsFor = ref('');

function reset() {
    const before = schema.value;
    apply({ ...defaultMetadataSchema(), views: before.views });
    toast.show('Categories, order, checks and filter choices are back to the start. Your columns, their values and your saved filters stay.', { action: { label: 'Undo', run: () => apply(before) } });
}
</script>

<template>
<div class="schema">
    <p class="intro">
        These are the columns of the <RouterLink to="/manuscripts">Manuscripts</RouterLink> table. A <strong>category</strong> is the
        band above its headings: make one — <em>Notation</em>, say — and put <em>Ink</em> and <em>Clef</em> beneath it.
        Any column can be moved, the columns of the corpus catalogue too. Each column can also say what its cells should look
        like, as a list of values or as a pattern; a cell that does not fit is marked, never refused, and a list becomes a drop-down.
        Tick <strong>Filter</strong> to offer a column in the table's Filter panel; the columns with few different values, dates and numbers are
        offered without being ticked.
    </p>

    <section v-for="(cat, i) in layout" :key="cat.key" class="cat">
        <header class="cat-head">
            <input class="name" :value="cat.label" :aria-label="`Name of the category ${cat.label}`" @change="rename(cat, $event.target.value)" />
            <span class="ne-muted count">{{ cat.columns.length }} column{{ cat.columns.length === 1 ? '' : 's' }}</span>
            <span class="grow"></span>
            <button class="icon" :disabled="i === 0" title="Move the category to the left" aria-label="Move the category to the left" @click="apply(moveCategory(schema, cat.key, -1))">←</button>
            <button class="icon" :disabled="i === layout.length - 1" title="Move the category to the right" aria-label="Move the category to the right" @click="apply(moveCategory(schema, cat.key, 1))">→</button>
            <button v-if="!cat.builtin" class="ne-btn ne-btn--sm ne-btn--ghost danger" @click="removeCat(cat)">Remove</button>
        </header>

        <ul class="cols">
            <li v-for="(col, j) in cat.columns" :key="col.key" class="col">
                <span class="label">{{ col.label }}</span>
                <span class="origin">{{ ORIGIN[col.group] }}</span>
                <span v-if="schema.checks[col.key]" class="badge" :title="`Cells that do not fit are marked`">{{ describeCheck(schema.checks[col.key]) }}</span>
                <span class="grow"></span>
                <label v-if="!col.frozen" class="offer" :title="`Offer ${col.label} as a filter in the table`">
                    <input type="checkbox" :checked="mf.configFor(col).offered" @change="offer(col, $event.target.checked)" /> Filter
                </label>
                <select class="where" :value="col.band" :aria-label="`Category of ${col.label}`" @change="place(col, $event.target.value)">
                    <option v-for="c in layout" :key="c.key" :value="c.key">{{ c.label }}</option>
                </select>
                <button class="icon" :disabled="j === 0" title="Move up" :aria-label="`Move ${col.label} up`" @click="moveCol(cat, col, -1)">↑</button>
                <button class="icon" :disabled="j === cat.columns.length - 1" title="Move down" :aria-label="`Move ${col.label} down`" @click="moveCol(cat, col, 1)">↓</button>
                <button class="ne-btn ne-btn--sm" @click="settingsFor = col.key">{{ col.readonly ? 'Details…' : 'Check…' }}</button>
            </li>
            <li v-if="!cat.columns.length" class="empty">No columns here yet. Add one below, or move one in.</li>
        </ul>

        <form class="add" @submit.prevent="createColumn(cat)">
            <input v-model="newColumn[cat.key]" class="ne-input" :placeholder="`A new column in ${cat.label}`" :aria-label="`New column in ${cat.label}`" />
            <button type="submit" class="ne-btn ne-btn--sm" :disabled="!(newColumn[cat.key] || '').trim()">Add column</button>
        </form>
    </section>

    <form class="add-cat" @submit.prevent="createCategory">
        <input v-model="newCategory" class="ne-input" placeholder="A new category, e.g. Notation" aria-label="New category" />
        <button type="submit" class="ne-btn" :disabled="!newCategory.trim()">Add category</button>
        <span class="grow"></span>
        <button type="button" class="ne-btn ne-btn--ghost" :disabled="!changed" title="Back to the four categories, no checks, the original order, the filters as the columns suggest them. Saved filters stay." @click="reset">Start over</button>
    </form>

    <p class="ne-muted note">Columns of the corpus catalogue appear here once a corpus is loaded; where you put them is kept.</p>

    <ColumnSettingsDialog :open="!!settingsFor" :column-key="settingsFor" @close="settingsFor = ''" />
</div>
</template>

<style scoped>
.schema { display: flex; flex-direction: column; gap: var(--space-4); }
.intro { margin: 0; max-width: 75ch; font-size: 0.9rem; color: var(--color-text-muted); }
.grow { flex: 1; }

.cat { border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); overflow: hidden; }
.cat-head { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); background: var(--color-surface-muted); border-bottom: 1px solid var(--color-border); }
.name { flex: 1 1 8rem; min-width: 0; max-width: 16rem; padding: 0.25em 0.5em; border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent; font: inherit; font-weight: 700; }
.name:hover { border-color: var(--color-border-hover); }
.name:focus { border-color: var(--color-primary); background: var(--color-surface); outline: none; }
.count { font-size: 0.8rem; }

.cols { list-style: none; margin: 0; padding: 0; }
.col { display: flex; align-items: center; gap: var(--space-2); padding: 4px var(--space-3); border-bottom: 1px solid var(--color-surface-muted); min-height: 38px; }
.col:last-child { border-bottom: none; }
.label { font-weight: 600; font-size: 0.9rem; }
.origin { font-size: 0.7rem; padding: 0 6px; border-radius: 999px; background: var(--color-surface-muted); color: var(--color-text-muted); }
.badge { font-size: 0.72rem; font-weight: 600; padding: 0 7px; border-radius: 999px; background: var(--color-primary-light); color: var(--color-primary-dark); }
.offer { display: inline-flex; align-items: center; gap: 4px; font-size: 0.8rem; color: var(--color-text-muted); cursor: pointer; }
.where { width: 10rem; padding: 0.25em 0.4em; border: 1px solid var(--color-border-hover); border-radius: var(--radius-sm); font-size: 0.8rem; background: var(--color-surface); }
.empty { padding: var(--space-3); font-size: 0.84rem; color: var(--color-text-muted); font-style: italic; }

.icon { width: 1.9rem; height: 1.9rem; padding: 0; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text-muted); line-height: 1; }
.icon:hover:not(:disabled) { background: var(--color-primary-light); color: var(--color-text); }
.icon:disabled { opacity: 0.35; cursor: default; }
.danger { color: var(--color-danger); }
.col .ne-btn { min-width: 5.5rem; }

.add { display: flex; gap: var(--space-2); padding: var(--space-2) var(--space-3); border-top: 1px solid var(--color-border); background: var(--color-bg); }
.add .ne-input { flex: 1; min-width: 0; }
.add-cat { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
.add-cat .ne-input { width: 20rem; max-width: 100%; }
.note { margin: 0; font-size: 0.82rem; }

@media (max-width: 720px) { .col { flex-wrap: wrap; } }
</style>

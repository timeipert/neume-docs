<script setup>
import { computed, ref, watch } from 'vue';
import SegmentedControl from '../ui/SegmentedControl.vue';
import FacetValues from './filter/FacetValues.vue';
import FacetYears from './filter/FacetYears.vue';
import FacetNumber from './filter/FacetNumber.vue';
import FacetText from './filter/FacetText.vue';
import { describeRule, ruleCount } from '../../utils/manuscriptFilter';
import { FILTER_KIND_OPTIONS } from '../../composables/useManuscriptFilter';
import { useToast } from '../../composables/useToast';

/**
 * Which manuscripts to show, by what their metadata says. Each column that is offered as a filter
 * is a facet: pick values (with how many manuscripts each has), draw a date range, give a number
 * range, or type. Facets narrow each other — "all" — or add up — "any" — and what is set can be
 * kept under a name.
 *
 * Which columns are offered is the user's to say: Settings → Manuscript metadata, or the column menu.
 */
const props = defineProps({
    /** the table's filter (see useManuscriptFilter) */
    f: { type: Object, required: true },
    shown: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    /** the siglums of the manuscripts shown, for copying */
    sigla: { type: Array, default: () => [] },
    /** the filters typed into the column headings are on */
    headings: { type: Boolean, default: false }
});
const emit = defineEmits(['close', 'update:headings', 'settings', 'share']);

const toast = useToast();
const COMPONENT = { values: FacetValues, years: FacetYears, number: FacetNumber, text: FacetText };

const MODES = [
    { value: 'all', label: 'Match all', title: 'A manuscript has to satisfy every filter' },
    { value: 'any', label: 'Match any', title: 'A manuscript has to satisfy at least one filter' }
];

const find = ref('');
const opened = ref(new Set());
function toggleOpen(key) {
    const next = new Set(opened.value);
    if (next.has(key)) next.delete(key); else next.add(key);
    opened.value = next;
}
const isOpen = (facet) => opened.value.has(facet.col.key);

// a rule set from elsewhere (a cell, a saved filter) is shown open
watch(() => Object.keys(props.f.filter.value.rules).join('|'), (now, before) => {
    const old = new Set((before || '').split('|'));
    const fresh = now.split('|').filter(k => k && !old.has(k));
    if (fresh.length) opened.value = new Set([...opened.value, ...fresh]);
}, { immediate: true });

/** Facets with a rule first, then the others as the table has them. */
const list = computed(() => {
    const q = find.value.trim().toLowerCase();
    const all = props.f.facets.value.filter(x => !q || x.col.label.toLowerCase().includes(q));
    return [...all.filter(x => x.rule), ...all.filter(x => !x.rule)];
});

const rules = computed(() => ruleCount(props.f.filter.value));
const mode = computed({ get: () => props.f.filter.value.mode, set: (m) => props.f.setMode(m) });

// ---- saved filters ----------------------------------------------------------------------

const naming = ref(false);
const viewName = ref('');

function saveView() {
    const name = viewName.value.trim();
    if (!name) return;
    if (props.f.saveCurrent(name)) {
        toast.show(`Filter “${name}” saved. Pick it from the list to set it again.`, { tone: 'success' });
        naming.value = false;
        viewName.value = '';
    }
}

function pickView(event) {
    const view = props.f.views.value.find(v => v.name === event.target.value);
    event.target.value = '';
    if (view) props.f.applyView(view);
}

function removeView(view) {
    props.f.deleteView(view.name);
    toast.show(`Filter “${view.name}” removed.`, { action: { label: 'Undo', run: () => props.f.keepView(view) } });
}

async function copySigla() {
    const text = props.sigla.join('\n');
    try {
        await navigator.clipboard.writeText(text);
        toast.show(`${props.sigla.length} siglum${props.sigla.length === 1 ? '' : 'a'} copied, one on each line.`);
    } catch {
        toast.show('Copying was not allowed here.', { tone: 'error' });
    }
}
</script>

<template>
<aside class="fp" aria-label="Filter the manuscripts">
    <header class="top">
        <strong>Filter</strong>
        <span class="result"><b>{{ shown }}</b> of {{ total }}</span>
        <span class="grow"></span>
        <button v-if="rules" type="button" class="ne-btn ne-btn--sm ne-btn--ghost" @click="f.clear()">Clear</button>
        <button type="button" class="x" aria-label="Close the filter panel" title="Close" @click="emit('close')">×</button>
    </header>

    <div class="bar">
        <SegmentedControl v-if="rules > 1" v-model="mode" :options="MODES" label="How the filters combine" size="sm" />
        <p v-else-if="!rules" class="lead">Pick a value, draw a date range, or set a number range. Every filter narrows the table at once.</p>
    </div>

    <div v-if="f.editable" class="views">
        <select v-if="f.views.value.length" class="ne-input" aria-label="Saved filters" @change="pickView">
            <option value="">Saved filters…</option>
            <option v-for="v in f.views.value" :key="v.name" :value="v.name">{{ v.name }}</option>
        </select>
        <template v-if="rules">
            <form v-if="naming" class="name" @submit.prevent="saveView">
                <input v-model="viewName" class="ne-input" placeholder="Name, e.g. Rhineland 11th c." aria-label="Name of the filter" autofocus />
                <button type="submit" class="ne-btn ne-btn--sm ne-btn--primary" :disabled="!viewName.trim()">Save</button>
                <button type="button" class="ne-btn ne-btn--sm" @click="naming = false">Cancel</button>
            </form>
            <button v-else type="button" class="ne-btn ne-btn--sm" title="Keep what is set now under a name" @click="naming = true">Save these filters…</button>
        </template>
        <ul v-if="f.views.value.length" class="kept">
            <li v-for="v in f.views.value" :key="v.name">
                <button type="button" class="kept-name" :title="Object.entries(v.filter.rules).map(([k, r]) => `${(f.filterable.value.find(c => c.key === k) || { label: k }).label}: ${describeRule(r)}`).join('\n')" @click="f.applyView(v)">{{ v.name }}</button>
                <button type="button" class="kept-x" :aria-label="`Remove the saved filter ${v.name}`" @click="removeView(v)">×</button>
            </li>
        </ul>
    </div>

    <input v-if="f.facets.value.length > 6" v-model="find" type="search" class="ne-input find" placeholder="Find a filter…" aria-label="Find a filter" />

    <div class="facets">
        <section v-for="facet in list" :key="facet.col.key" class="facet" :class="{ set: facet.rule }">
            <h3>
                <button type="button" class="head" :aria-expanded="isOpen(facet)" @click="toggleOpen(facet.col.key)">
                    <span class="caret" aria-hidden="true">{{ isOpen(facet) ? '▾' : '▸' }}</span>
                    <span class="label">{{ facet.col.label }}</span>
                    <span v-if="facet.rule" class="summary">{{ describeRule(facet.rule) }}</span>
                    <span v-else class="kind">{{ facet.kind === 'years' ? 'dates' : facet.kind === 'number' ? 'numbers' : facet.kind === 'text' ? 'text' : facet.distinct }}</span>
                </button>
                <button v-if="facet.rule" type="button" class="x" :aria-label="`Remove the filter on ${facet.col.label}`" title="Remove this filter" @click="f.setRule(facet.col.key, null)">×</button>
            </h3>
            <div v-if="isOpen(facet)" class="body">
                <component
                    :is="COMPONENT[facet.kind]"
                    :rule="facet.rule"
                    :rows="f.rowsFor(facet.col.key)"
                    :text-of="(id) => f.textOf(id, facet.col.key)"
                    @change="f.setRule(facet.col.key, $event)"
                />
                <div v-if="f.editable" class="how">
                    <label>Filter as
                        <select class="ne-input" :value="facet.kind" @change="f.configure(facet.col.key, { kind: $event.target.value === facet.auto ? null : $event.target.value, on: true }); f.setRule(facet.col.key, null)">
                            <option v-for="o in FILTER_KIND_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}{{ o.value === facet.auto ? ' (suggested)' : '' }}</option>
                        </select>
                    </label>
                    <button type="button" class="link" @click="f.configure(facet.col.key, { on: false }); f.setRule(facet.col.key, null)">Do not offer this column</button>
                </div>
            </div>
        </section>
        <p v-if="!list.length" class="none">{{ find ? 'No filter has that name.' : (f.editable ? 'No column is offered as a filter yet.' : 'The authors offer no filters for this documentation.') }}</p>
    </div>

    <footer class="foot">
        <label v-if="f.editable" class="ne-check" title="A text box in each column heading: type to keep the rows that contain it (= exact, ! without)">
            <input type="checkbox" :checked="headings" @change="emit('update:headings', $event.target.checked)" />
            Type filters into the column headings
        </label>
        <div class="foot-row">
            <button type="button" class="link" :disabled="!sigla.length" title="One siglum on each line, for pasting" @click="copySigla">Copy the {{ sigla.length }} sigla</button>
            <button v-if="f.editable" type="button" class="link right" @click="emit('settings')">Choose the columns…</button>
            <button v-else type="button" class="link right" :disabled="!rules" title="A link that opens this documentation with these filters set" @click="emit('share')">Link to this selection…</button>
        </div>
    </footer>
</aside>
</template>

<style scoped>
.fp { flex: 0 0 21rem; width: 21rem; min-height: 0; display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); overflow-y: auto; }
.top { display: flex; align-items: center; gap: var(--space-2); }
.top strong { font-size: 1rem; }
.result { font-size: 0.82rem; color: var(--color-text-muted); }
.result b { color: var(--color-text); }
.grow { flex: 1; }
.x { width: 1.7rem; height: 1.7rem; padding: 0; border: none; background: transparent; border-radius: var(--radius-sm); font-size: 1.15rem; line-height: 1; color: var(--color-text-muted); cursor: pointer; }
.x:hover { background: var(--color-surface-muted); color: var(--color-text); }
.lead { margin: 0; font-size: 0.82rem; color: var(--color-text-muted); }
.bar :deep(.seg) { width: 100%; }

.views { display: flex; flex-direction: column; gap: var(--space-2); }
.views .ne-input { font-size: 0.84rem; padding: 0.3em 0.6em; }
.name { display: flex; gap: var(--space-1); }
.name .ne-input { flex: 1; min-width: 0; }
.kept { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px; }
.kept li { display: inline-flex; align-items: center; border: 1px solid var(--color-border); border-radius: 999px; background: var(--color-surface-muted); }
.kept-name { border: none; background: none; padding: 1px 4px 1px 10px; font-size: 0.78rem; cursor: pointer; }
.kept-name:hover { text-decoration: underline; }
.kept-x { border: none; background: none; padding: 0 8px 0 2px; color: var(--color-text-muted); cursor: pointer; font-size: 0.9rem; }
.kept-x:hover { color: var(--color-danger); }

.find { font-size: 0.84rem; padding: 0.3em 0.6em; }

.fp > * { flex-shrink: 0; }
.facets { display: flex; flex-direction: column; gap: 2px; flex: 1 0 auto; }
.facet { border-radius: var(--radius-md); border: 1px solid transparent; }
.facet.set { border-color: var(--color-primary-muted); background: var(--color-primary-light); }
.facet h3 { margin: 0; display: flex; align-items: center; font-size: inherit; font-weight: inherit; }
.head { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 6px; padding: 6px 6px; border: none; background: none; text-align: left; cursor: pointer; border-radius: var(--radius-md); font-size: 0.88rem; }
.head:hover { background: var(--color-surface-muted); }
.facet.set .head:hover { background: transparent; }
.caret { width: 0.9rem; color: var(--color-text-muted); flex: none; }
.label { font-weight: 600; flex: none; max-width: 55%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.summary { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.8rem; color: var(--color-primary-dark); }
.kind { margin-left: auto; font-size: 0.74rem; color: var(--color-text-light); }
.body { padding: 2px 8px 10px 22px; display: flex; flex-direction: column; gap: var(--space-2); }
.how { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); padding-top: var(--space-1); border-top: 1px dashed var(--color-border); font-size: 0.76rem; color: var(--color-text-muted); }
.how label { display: flex; align-items: center; gap: 6px; }
.how .ne-input { font-size: 0.76rem; padding: 0.15em 0.3em; }
.none { margin: 0; padding: var(--space-2); font-size: 0.84rem; color: var(--color-text-muted); font-style: italic; }

.foot { position: sticky; bottom: calc(var(--space-3) * -1); margin: 0 calc(var(--space-3) * -1) calc(var(--space-3) * -1); padding: var(--space-2) var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); border-top: 1px solid var(--color-border); background: var(--color-surface); }
.foot .ne-check { font-size: 0.8rem; }
.foot-row { display: flex; gap: var(--space-3); }
.link { border: none; background: none; padding: 0; color: var(--color-primary); font-size: 0.8rem; cursor: pointer; }
.link:hover:not(:disabled) { text-decoration: underline; }
.link:disabled { color: var(--color-text-light); cursor: default; }
.link.right { margin-left: auto; }

@media (max-width: 900px) { .fp { flex-basis: 100%; width: 100%; max-height: 22rem; } }
</style>

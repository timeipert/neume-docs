<script setup>
import { computed, ref } from 'vue';
import SegmentedControl from '../ui/SegmentedControl.vue';
import { compileCheck, fromDraft, misfits, parseList } from '../../utils/metadataSchema';

/**
 * What the cells of a column should look like: one of a list, or a pattern. A cell that does
 * not fit is marked in the table, never refused; a list is also offered as a drop-down.
 * The draft is edited in place (see toDraft / fromDraft in utils/metadataSchema).
 */
const props = defineProps({
    draft: { type: Object, required: true },
    /** what the column holds now, for filling a list and for saying how many cells would be marked */
    values: { type: Array, default: () => [] }
});

const KINDS = [
    { value: 'none', label: 'Anything', title: 'No check' },
    { value: 'list', label: 'One of a list', title: 'Only values from a list; the list is offered as a drop-down' },
    { value: 'regex', label: 'A pattern', title: 'The whole value has to match a regular expression' }
];

const check = computed(() => fromDraft(props.draft));
const compiled = computed(() => (props.draft.kind === 'regex' ? compileCheck({ kind: 'regex', pattern: props.draft.pattern, ignoreCase: props.draft.ignoreCase }) : null));
const patternError = computed(() => (compiled.value && !compiled.value.ok ? compiled.value.error : ''));

const listCount = computed(() => parseList(props.draft.listText).length);
const wrong = computed(() => (check.value ? misfits(check.value, props.values) : []));

function useCurrentValues() {
    const merged = parseList([props.draft.listText, ...props.values].join('\n'));
    props.draft.listText = merged.join('\n');
}

// "Try it": one value against the pattern
const sample = ref('');
const sampleFits = computed(() => (compiled.value && compiled.value.ok && sample.value ? compiled.value.test(sample.value.trim()) : null));
</script>

<template>
<div class="check">
    <SegmentedControl v-model="draft.kind" :options="KINDS" label="What the column may hold" size="sm" />

    <template v-if="draft.kind === 'list'">
        <label class="field">
            The values, one on each line
            <textarea v-model="draft.listText" class="ne-input list" rows="6" spellcheck="false" placeholder="Ink&#10;Pen&#10;Stylus"></textarea>
        </label>
        <div class="row">
            <button v-if="values.length" type="button" class="ne-btn ne-btn--sm" title="Add the values the column holds now to the list" @click="useCurrentValues">
                Add the {{ values.length }} value{{ values.length === 1 ? '' : 's' }} in use
            </button>
            <span class="ne-muted">{{ listCount }} in the list — offered as a drop-down in the table</span>
        </div>
    </template>

    <template v-else-if="draft.kind === 'regex'">
        <label class="field">
            The pattern <span class="ne-muted">(the whole value has to match)</span>
            <input v-model="draft.pattern" class="ne-input mono" :class="{ bad: patternError }" spellcheck="false" placeholder="e.g. s\. (X|XI|XII)( in\.| med\.| ex\.)?" />
        </label>
        <p v-if="patternError" class="problem">{{ patternError }}</p>
        <label class="field">
            Try a value
            <span class="try">
                <input v-model="sample" class="ne-input" spellcheck="false" placeholder="Type a value to see whether it fits" />
                <span v-if="sampleFits !== null" class="verdict" :class="sampleFits ? 'ok' : 'no'">{{ sampleFits ? 'Fits' : 'Does not fit' }}</span>
            </span>
        </label>
    </template>

    <template v-if="draft.kind !== 'none'">
        <label class="ne-check"><input v-model="draft.ignoreCase" type="checkbox" /> Ignore upper and lower case</label>
        <label class="field">
            Message for a marked cell <span class="ne-muted">(optional)</span>
            <input v-model="draft.message" class="ne-input" placeholder="Shown when you point at a marked cell" />
        </label>

        <p v-if="check && values.length" class="result" :class="{ clean: !wrong.length }">
            <template v-if="!wrong.length">All {{ values.length }} value{{ values.length === 1 ? '' : 's' }} in the column fit.</template>
            <template v-else>
                {{ wrong.length }} of the {{ values.length }} value{{ values.length === 1 ? '' : 's' }} in the column would be marked:
                {{ wrong.slice(0, 6).join(', ') }}<template v-if="wrong.length > 6">, …</template>
            </template>
        </p>
        <p class="ne-muted note">A value that does not fit is only marked. You can still type it.</p>
    </template>
</div>
</template>

<style scoped>
.check { display: flex; flex-direction: column; gap: var(--space-3); }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 0.82rem; font-weight: 600; color: var(--color-text-muted); }
.field .ne-input { font-weight: 400; color: var(--color-text); }
.list { font-family: inherit; resize: vertical; min-height: 7rem; }
.mono { font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
.row { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; font-size: 0.82rem; }
.try { display: flex; align-items: center; gap: var(--space-3); }
.try .ne-input { flex: 1; min-width: 0; }
.verdict { font-size: 0.82rem; font-weight: 700; white-space: nowrap; }
.verdict.ok { color: var(--color-success-dark); }
.verdict.no { color: var(--color-danger); }
.bad { border-color: var(--color-danger) !important; }
.problem { margin: 0; font-size: 0.84rem; font-weight: 600; color: var(--color-danger); }
.result { margin: 0; padding: 0.5em 0.8em; border-radius: var(--radius-md); background: var(--color-warning-light); font-size: 0.84rem; }
.result.clean { background: var(--color-success-light, #ecfdf5); color: var(--color-success-dark); }
.note { margin: 0; font-size: 0.8rem; }
</style>

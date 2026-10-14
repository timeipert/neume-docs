<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import ModalDialog from '../ui/ModalDialog.vue';
import DocPattern from '../docs/DocPattern.vue';
import cmReference from '../../data/cmReference.json';
import { buildFrequency, searchLibrary, toneCount } from '../../utils/neumeTable';
import { checkCode, combinationCodes, quickChoices, stateOf, toggleVirga, virgaNotes } from '../../utils/neumaReview';

/**
 * One snippet, large, with everything needed to say what it is: the proposal and why, the other
 * things its column can be, the library to search, and a code field for anything else (with the virga
 * to put on any note). The choices on top decide at once; the code field decides with *Set*.
 */
const props = defineProps({
    open: { type: Boolean, default: false },
    snippet: { type: Object, default: null },
    decision: { type: Object, default: undefined },
    url: { type: String, default: '' },
    cell: { type: Object, default: null },
    source: { type: Object, default: null },
    column: { type: Object, default: null },
    signs: { type: Object, default: () => ({}) },
    position: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
});
const emit = defineEmits(['close', 'prev', 'next', 'decide', 'accept', 'later', 'discard', 'reopen']);

const codes = Object.keys(cmReference.patterns);
const freq = buildFrequency(cmReference.patterns);
const combos = combinationCodes(codes, freq);

const st = computed(() => (props.snippet ? stateOf(props.snippet, props.decision) : { state: 'undecided', code: '', decided: false }));
const proposal = computed(() => (props.snippet && props.snippet.suggestion) || {});
const choices = computed(() => (props.snippet ? quickChoices(props.snippet) : []));
const isCombination = computed(() => props.column && props.column.kind === 'combination');

const draft = ref('');
const query = ref('');
const draftCheck = computed(() => checkCode(draft.value));
const draftNotes = computed(() => (draftCheck.value.ok && !draft.value.startsWith('(') ? toneCount(draft.value) : 0));
const draftVirga = computed(() => virgaNotes(draft.value));

// what the library offers: a search, or for a combination — which has no name — the common long patterns
const results = computed(() => {
    if (query.value.trim()) return searchLibrary(codes, query.value, freq, { limit: 36 });
    return isCombination.value ? combos : [];
});

watch(() => [props.open, props.snippet && props.snippet.id], () => {
    draft.value = st.value.code || '';
    query.value = '';
}, { immediate: true });

const scale = computed(() => {
    const s = props.snippet;
    if (!s) return 1;
    return Math.max(1, Math.min(4, Math.floor(380 / Math.max(s.width, s.height * 1.2))));
});

const box = computed(() => {
    const s = props.snippet;
    const c = props.cell;
    if (!s || !c || !c.width) return null;
    return { left: `${(s.box.x / c.width) * 100}%`, top: `${(s.box.y / c.height) * 100}%`, width: `${(s.box.w / c.width) * 100}%`, height: `${(s.box.h / c.height) * 100}%` };
});

const facts = computed(() => {
    const s = props.source;
    if (!s) return [];
    return [['Type', s.type], ['Date', s.date], ['Notation', s.notation], ['Provenance', s.provenance], ['Collection', s.collection], ['Folios', s.numerus]].filter(([, v]) => v);
});

function setDraft() {
    if (draftCheck.value.ok) emit('decide', draft.value.trim());
}
function pickFromLibrary(code) { draft.value = code; }

function onKey(e) {
    if (!props.open || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'ArrowRight') { e.preventDefault(); emit('next'); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); emit('prev'); }
    else if (e.key === 'Enter' && proposal.value.code) { e.preventDefault(); emit('accept'); }
    else if (/^[1-9]$/.test(e.key) && choices.value[+e.key - 1]) { e.preventDefault(); emit('decide', choices.value[+e.key - 1]); }
    else if (e.key === 'l') emit('later');
    else if (e.key === 'x') emit('discard');
}
watch(() => props.open, (open) => {
    if (open) document.addEventListener('keydown', onKey);
    else document.removeEventListener('keydown', onKey);
}, { immediate: true });
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
<ModalDialog :open="open && !!snippet" :title="snippet ? `${snippet.id} · ${column ? column.name : ''}` : ''" width="64rem" @close="emit('close')">
    <div v-if="snippet" class="focus">
        <section class="look" aria-label="The snippet">
            <div class="big">
                <img :src="url" :alt="`Snippet ${snippet.id}`" :style="{ width: snippet.width * scale + 'px' }" />
            </div>
            <p class="dims">{{ snippet.width }} × {{ snippet.height }} px, shown ×{{ scale }} — cut from the catalogue's picture without any change</p>

            <div v-if="cell" class="cell" :title="`The catalogue's picture for ${column ? column.name : 'this cell'}; this snippet is marked`">
                <img :src="cell.url" alt="The catalogue's cell" />
                <span v-if="box" class="mark" :style="box"></span>
            </div>

            <dl v-if="source" class="facts">
                <div class="fact"><dt>Source</dt><dd><strong>{{ source.siglum }}</strong> <span class="muted">{{ source.description }}</span></dd></div>
                <div v-for="[k, v] in facts" :key="k" class="fact"><dt>{{ k }}</dt><dd>{{ v }}</dd></div>
            </dl>
        </section>

        <section class="decide" aria-label="What it is">
            <div v-if="proposal.code" class="proposal">
                <DocPattern :pattern="proposal.code" :signs="signs" :scale="0.9" />
                <div class="why">
                    <p class="what">Proposed <strong>{{ proposal.code }}</strong> <span class="conf" :class="`c-${proposal.confidence}`">{{ proposal.confidence }}</span></p>
                    <p class="reason">{{ proposal.reason }}</p>
                </div>
                <button type="button" class="ne-btn ne-btn--primary" @click="emit('accept')">Accept <kbd>⏎</kbd></button>
            </div>
            <p v-else class="ne-note ne-note--info">{{ proposal.reason || 'The catalogue does not name this snippet' }}. Choose what it is below.</p>

            <p v-if="st.decided && st.state !== 'later'" class="now">
                Now: <strong>{{ st.state }}</strong><template v-if="st.code"> as <DocPattern :pattern="st.code" :signs="signs" :scale="0.5" :code="false" /> <code>{{ st.code }}</code></template>
            </p>

            <div v-if="choices.length" class="block">
                <h4>It is…</h4>
                <div class="choices">
                    <button v-for="(c, i) in choices" :key="c" type="button" class="choice" :class="{ on: st.code === c && st.decided }" @click="emit('decide', c)">
                        <kbd v-if="i < 9">{{ i + 1 }}</kbd>
                        <DocPattern :pattern="c" :signs="signs" :scale="0.6" />
                    </button>
                </div>
            </div>

            <div class="block">
                <h4>Another pattern</h4>
                <input v-model="query" class="ne-input wide" type="search" placeholder="Search the library by code, for example *udd" aria-label="Search the pattern library" />
                <p v-if="isCombination && !query.trim()" class="hint">The common patterns of the library with three or more notes.</p>
                <div v-if="results.length" class="results">
                    <button v-for="c in results" :key="c" type="button" class="result" :class="{ on: draft === c }" @click="pickFromLibrary(c)">
                        <DocPattern :pattern="c" :signs="signs" :scale="0.5" />
                    </button>
                </div>
                <p v-else-if="query.trim()" class="hint">Nothing in the library has this in it. A code that is not in the library can still be written below.</p>
            </div>

            <div class="block">
                <h4>Code</h4>
                <form class="code-row" @submit.prevent="setDraft">
                    <input v-model="draft" class="ne-input mono" spellcheck="false" autocomplete="off" aria-label="Pattern code" />
                    <button type="submit" class="ne-btn ne-btn--primary" :disabled="!draftCheck.ok">Set</button>
                </form>
                <p v-if="draft && !draftCheck.ok" class="ne-note ne-note--warn small">{{ draftCheck.error }}</p>
                <div v-if="draftNotes" class="virga">
                    <span class="lab">Virga on note</span>
                    <button v-for="n in draftNotes" :key="n" type="button" class="vbtn" :class="{ on: draftVirga.includes(n - 1) }" :aria-pressed="draftVirga.includes(n - 1)" @click="draft = toggleVirga(draft, n - 1)">{{ n }}</button>
                </div>
                <div v-if="draftCheck.ok" class="preview"><DocPattern :pattern="draft" :signs="signs" :scale="0.8" /></div>
            </div>

            <div class="block more">
                <button type="button" class="ne-btn ne-btn--sm" :disabled="st.state === 'later'" @click="emit('later')">Set aside <kbd>L</kbd></button>
                <button type="button" class="ne-btn ne-btn--sm ne-btn--danger" :disabled="st.state === 'discarded'" title="Not a usable snippet: it is left out of the documentation" @click="emit('discard')">Discard <kbd>X</kbd></button>
                <button v-if="st.decided" type="button" class="ne-btn ne-btn--sm ne-btn--ghost" @click="emit('reopen')">Reopen</button>
            </div>
        </section>
    </div>

    <template #footer>
        <span class="pos">{{ position }} of {{ total }}</span>
        <button type="button" class="ne-btn" :disabled="position <= 1" @click="emit('prev')">‹ Previous <kbd>←</kbd></button>
        <button type="button" class="ne-btn" :disabled="position >= total" @click="emit('next')">Next › <kbd>→</kbd></button>
    </template>
</ModalDialog>
</template>

<style scoped>
.focus { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: var(--space-5); align-items: start; }
@media (max-width: 860px) { .focus { grid-template-columns: 1fr; } }
.look { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.big { display: flex; align-items: center; justify-content: center; min-height: 200px; padding: var(--space-3); background: #fff; border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: auto; }
.big img { display: block; max-width: none; image-rendering: auto; }
.dims { margin: 0; font-size: 0.74rem; color: var(--color-text-muted); }
.cell { position: relative; align-self: flex-start; max-width: 100%; border: 1px solid var(--color-border); background: #fff; }
.cell img { display: block; max-width: 100%; height: auto; }
.mark { position: absolute; border: 2px solid var(--color-primary); background: rgba(59, 130, 246, 0.12); pointer-events: none; }
.facts { margin: 0; display: grid; gap: 2px; font-size: 0.82rem; }
.fact { display: grid; grid-template-columns: 6.5rem minmax(0, 1fr); gap: var(--space-2); }
.fact dt { color: var(--color-text-muted); font-weight: 600; }
.fact dd { margin: 0; }
.muted { color: var(--color-text-muted); }
.decide { display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }
.proposal { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3); border: 1px dashed var(--color-primary-muted); background: var(--color-primary-light); border-radius: var(--radius-md); }
.why { flex: 1; min-width: 0; }
.why p { margin: 0; }
.what { font-size: 0.95rem; }
.reason { font-size: 0.78rem; color: var(--color-text-muted); }
.conf { margin-left: var(--space-1); font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
.c-high { color: var(--color-success-dark); }
.c-medium { color: var(--color-warning-dark); }
.c-low, .c-none { color: var(--color-danger); }
.now { margin: 0; display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.block h4 { margin: 0 0 var(--space-2); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); }
.choices, .results { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.results { margin-top: var(--space-2); max-height: 13rem; overflow-y: auto; padding: 2px; }
.choice, .result { position: relative; display: inline-flex; align-items: center; justify-content: center; min-width: 4.5rem; padding: var(--space-2) var(--space-3); background: var(--color-surface); border: 1px solid var(--color-border-hover); border-radius: var(--radius-md); cursor: pointer; }
.choice:hover, .result:hover { border-color: var(--color-primary); background: var(--color-primary-light); }
.choice.on, .result.on { border-color: var(--color-primary); background: var(--color-primary-light); box-shadow: var(--ring); }
.choice kbd { position: absolute; top: 2px; left: 4px; font-size: 0.62rem; }
kbd { font-family: inherit; font-size: 0.7rem; padding: 0 5px; border: 1px solid currentColor; border-radius: 3px; opacity: 0.7; }
.hint { margin: var(--space-2) 0 0; font-size: 0.78rem; color: var(--color-text-muted); }
.code-row { display: flex; gap: var(--space-2); }
.code-row .ne-input { flex: 1; }
.wide { width: 100%; }
.mono { font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
.small { margin: var(--space-2) 0 0; padding: var(--space-1) var(--space-2); font-size: 0.78rem; }
.virga { display: flex; align-items: center; gap: var(--space-1); margin-top: var(--space-2); flex-wrap: wrap; }
.lab { font-size: 0.78rem; color: var(--color-text-muted); margin-right: var(--space-1); }
.vbtn { min-width: 2rem; padding: 0.25em 0.5em; border: 1px solid var(--color-border-hover); border-radius: var(--radius-md); background: var(--color-surface); font-weight: 700; cursor: pointer; }
.vbtn.on { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
.preview { margin-top: var(--space-2); }
.more { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.pos { margin-right: auto; font-size: 0.85rem; color: var(--color-text-muted); }
</style>

<script setup>
import { computed, ref } from 'vue';
import ModalDialog from '../ui/ModalDialog.vue';
import { useLinkAssistant } from '../../composables/useLinkAssistant';

/**
 * Proposed links between snippets and the transcription, to review before they are
 * made. Mounted once, in App.vue; the Workspace page opens it.
 */
const la = useLinkAssistant();
const busy = ref(false);

const open = computed(() => !!la.review.value && la.review.value.proposals.length > 0);

const bySource = computed(() => {
    const groups = new Map();
    for (const p of la.review.value?.proposals || []) {
        if (!groups.has(p.source)) groups.set(p.source, []);
        groups.get(p.source).push(p);
    }
    return [...groups].map(([source, proposals]) => ({ source, proposals }));
});

const noun = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function describe(p) {
    if (p.basis === 'name') return 'by its name only: no snippets to check it against';
    const parts = [noun(p.links.length, 'snippet') + ' matched'];
    if (p.unmatched) parts.push(`${p.unmatched} did not fit`);
    parts.push(`${noun(p.neumes, 'neume')} in that line`);
    return parts.join(', ');
}

const CONFIDENCE = {
    high: 'Snippets and neumes agree in pattern, order and position.',
    medium: 'Every snippet matched a neume, but not where expected, or the line has more neumes.',
    low: 'Some snippets did not fit, or the line was guessed from its name. Check before ticking.'
};

async function apply() {
    busy.value = true;
    try { await la.apply(); } finally { busy.value = false; }
}
</script>

<template>
<ModalDialog :open="open" title="Link snippets to the transcription" width="44rem" :dismissable="!busy" @close="la.close()">
    <p class="intro">
        Monodi-Zero shows a sign in the manuscript only when its snippet is linked to the neume it depicts.
        These links were worked out by matching each line region's snippets, left to right, with the neumes of
        one transcription line. Untick any that look wrong. A restore point is kept first.
    </p>
    <section v-for="g in bySource" :key="g.source" class="group">
        <h3>{{ g.source }}</h3>
        <ul class="rows">
            <li v-for="p in g.proposals" :key="p.regionId">
                <label class="ne-check">
                    <input type="checkbox" v-model="p.selected" />
                    <span class="what">
                        <strong>{{ p.folio }} · {{ p.regionName }}</strong>
                        → line {{ p.line }} of the transcription
                        <span class="ne-chip" :class="`conf-${p.confidence}`" :title="CONFIDENCE[p.confidence]">{{ p.confidence }}</span>
                        <span class="detail ne-muted">{{ describe(p) }}</span>
                    </span>
                </label>
            </li>
        </ul>
    </section>
    <p v-if="la.review.value && la.review.value.unresolved.length" class="ne-note ne-note--info">
        {{ noun(la.review.value.unresolved.length, 'line region') }} could not be matched
        ({{ la.review.value.unresolved.slice(0, 3).map(u => `${u.source} ${u.folio} ${u.region}`).join('; ') }}{{ la.review.value.unresolved.length > 3 ? '; …' : '' }}).
        Link their snippets by hand when you make them.
    </p>
    <p v-if="la.review.value && la.review.value.notReady.length" class="ne-note ne-note--warn">
        {{ la.review.value.notReady.join(', ') }}: load again from Monodi-Zero first, so that the reading order of the neumes is known.
    </p>
    <template #footer>
        <button class="ne-btn" :disabled="busy" @click="la.close()">Cancel</button>
        <button class="ne-btn ne-btn--primary" :disabled="busy || !la.chosen.value.length" @click="apply">
            Link {{ noun(la.counts.value.snippets, 'snippet') }}<template v-if="la.counts.value.lines"> and {{ noun(la.counts.value.lines, 'line') }}</template>
        </button>
    </template>
</ModalDialog>
</template>

<style scoped>
.intro { margin: 0 0 var(--space-4); font-size: 0.92rem; }
.group + .group { margin-top: var(--space-4); }
h3 { margin: 0 0 var(--space-2); font-size: 0.98rem; }
.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.what { display: inline; font-size: 0.92rem; }
.detail { display: block; font-size: 0.84rem; margin-top: 2px; }
.conf-high { background: #dcfce7; color: #166534; }
.conf-medium { background: #fef9c3; color: #854d0e; }
.conf-low { background: #ffedd5; color: #9a3412; }
</style>

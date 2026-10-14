<script setup>
import { computed } from 'vue';
import DocPattern from '../docs/DocPattern.vue';
import { oddReason, stateOf } from '../../utils/neumaReview';

/**
 * One snippet of the Hungarian Neume Catalogue with what it is taken to be, and the two things most
 * people do with it: accept the proposal, or change it.
 */
const props = defineProps({
    snippet: { type: Object, required: true },
    decision: { type: Object, default: undefined },
    url: { type: String, required: true },
    signs: { type: Object, default: () => ({}) },
    column: { type: Object, default: null },
    active: { type: Boolean, default: false }
});
const emit = defineEmits(['accept', 'open', 'reopen']);

const st = computed(() => stateOf(props.snippet, props.decision));
const proposal = computed(() => props.snippet.suggestion || {});
const odd = computed(() => oddReason(props.snippet));
const LABEL = { undecided: 'Proposed', accepted: 'Accepted', corrected: 'Corrected', later: 'Set aside', discarded: 'Discarded' };
</script>

<template>
<article class="card" :class="[`is-${st.state}`, { active }]" :data-id="snippet.id">
    <button type="button" class="pic" :aria-label="`Open ${snippet.id}`" @click="emit('open')">
        <img :src="url" :alt="`Snippet ${snippet.id}`" loading="lazy" decoding="async" />
        <span v-if="odd" class="odd" :title="odd">cut?</span>
    </button>
    <div class="meta">
        <span class="id" :title="column ? `${column.name}, snippet ${snippet.index} of ${snippet.count}` : snippet.id">{{ snippet.id }}</span>
        <span class="state">{{ LABEL[st.state] }}</span>
    </div>
    <div class="pattern">
        <DocPattern v-if="st.code" :pattern="st.code" :signs="signs" :scale="0.8" />
        <span v-else class="none">{{ st.state === 'discarded' ? 'not used' : 'no proposal' }}</span>
    </div>
    <p v-if="st.state === 'undecided' && proposal.confidence" class="confidence" :class="`c-${proposal.confidence}`" :title="proposal.reason">{{ proposal.confidence === 'none' ? 'choose' : proposal.confidence }}</p>
    <div class="actions">
        <button v-if="(st.state === 'undecided' || st.state === 'later') && proposal.code" type="button" class="ne-btn ne-btn--sm ne-btn--primary" @click="emit('accept')">Accept</button>
        <button type="button" class="ne-btn ne-btn--sm" @click="emit('open')">{{ st.state === 'undecided' || st.state === 'later' ? 'Change…' : 'Edit…' }}</button>
        <button v-if="st.decided" type="button" class="ne-btn ne-btn--sm ne-btn--ghost" title="Back to undecided" @click="emit('reopen')">Reopen</button>
    </div>
</article>
</template>

<style scoped>
.card { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-2); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-sm); min-width: 0; }
.card.active { border-color: var(--color-primary); box-shadow: var(--ring); }
.card.is-undecided { border-style: dashed; border-color: var(--color-border-hover); }
.card.is-accepted { border-color: var(--color-success-muted); background: var(--color-success-light); }
.card.is-corrected { border-color: var(--color-primary-muted); background: var(--color-primary-light); }
.card.is-later { border-color: var(--color-warning-muted); background: var(--color-warning-light); }
.card.is-discarded { opacity: 0.55; }
.pic { position: relative; display: flex; align-items: center; justify-content: center; height: 132px; padding: 0; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: #fff; cursor: zoom-in; overflow: hidden; }
.pic:hover { background: #fff; border-color: var(--color-primary); }
.pic img { width: 100%; height: 100%; object-fit: contain; display: block; }
.odd { position: absolute; top: 2px; right: 2px; padding: 0 5px; border-radius: 999px; background: var(--color-warning); color: #fff; font-size: 0.66rem; font-weight: 800; }
.meta { display: flex; justify-content: space-between; gap: var(--space-2); font-size: 0.72rem; color: var(--color-text-muted); }
.id { font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
.state { font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; font-size: 0.66rem; }
.pattern { display: flex; align-items: center; justify-content: center; min-height: 3.6rem; }
.none { font-size: 0.8rem; color: var(--color-text-light); font-style: italic; }
.confidence { margin: -4px 0 0; text-align: center; font-size: 0.66rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
.c-high { color: var(--color-success-dark); }
.c-medium { color: var(--color-warning-dark); }
.c-low, .c-none { color: var(--color-danger); }
.actions { display: flex; flex-wrap: wrap; gap: var(--space-1); justify-content: center; }
</style>

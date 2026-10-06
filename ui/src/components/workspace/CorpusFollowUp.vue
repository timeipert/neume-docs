<script setup>
import { computed } from 'vue';
import { useTranscriptionData } from '../../composables/useTranscriptionData';
import { useCorpusImport } from '../../composables/useCorpusImport';
import { useMonodiExchange } from '../../composables/useMonodiExchange';

/**
 * What an update from Monodi-Zero leaves to look at: annotations that came in
 * the file, and pages whose folio the transcription changed. Shown on the Corpus
 * page under the result of an import.
 */
const data = useTranscriptionData();
const { importedNow } = useCorpusImport();
const ex = useMonodiExchange();

const withAnnotations = computed(() =>
    importedNow.value.filter(name => (data.catalog.value[name] || {}).monodiAnnotations));

const noun = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
</script>

<template>
<section v-if="withAnnotations.length" class="ne-note ne-note--info" role="status">
    <p>
        {{ noun(withAnnotations.length, 'manuscript') }} in this file came with line regions, snippets or table rows made in Monodi-Zero
        ({{ withAnnotations.slice(0, 3).join(', ') }}{{ withAnnotations.length > 3 ? ', …' : '' }}).
    </p>
    <button class="ne-btn" @click="ex.offerFoundIn(withAnnotations)">Review what they add…</button>
</section>

<section v-for="d in ex.drift.value" :key="d.source" class="ne-note ne-note--warn" role="alert">
    <p>
        <strong>{{ d.source }}</strong>: the transcription no longer has {{ d.entries.length === 1 ? 'a folio' : 'some folios' }}
        that you annotated. Those annotations are still there, but under a folio that is not in the transcription any more.
    </p>
    <ul>
        <li v-for="e in d.entries" :key="e.folio">
            {{ e.folio }} — {{ noun(e.regions, 'line region') }}, {{ noun(e.items, 'snippet') }}
            <button v-if="e.suggestion" class="ne-btn" @click="ex.rehome(d.source, e.folio, e.suggestion)">Move to {{ e.suggestion }}</button>
            <span v-else class="ne-muted"> — no folio shows the same image; move them by hand.</span>
        </li>
    </ul>
    <button class="ne-btn" @click="ex.dismissDrift()">Dismiss</button>
</section>
</template>

<style scoped>
section { margin-top: var(--space-4); }
p { margin: 0 0 var(--space-2); }
ul { margin: 0 0 var(--space-3); padding-left: var(--space-5); display: flex; flex-direction: column; gap: var(--space-1); }
li .ne-btn { margin-left: var(--space-2); }
</style>

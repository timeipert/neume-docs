<script setup>
import { computed } from 'vue';
import CitePanel from '../../components/docs/CitePanel.vue';
import { useDocs } from '../../composables/useDocsContext';
import { INDEX_FILE } from '../../utils/documentation';

/** Who made the documentation, under which licence, where it comes from, and how to cite it as a whole. */
const docs = useDocs();
const info = docs.info;
const state = docs.state;

const snippets = computed(() => docs.entries.value.reduce((n, e) => n + e.snippets, 0));
const indexUrl = computed(() => (state.value.source && state.value.source.base ? `${state.value.source.base}${INDEX_FILE}` : ''));
const webUrl = computed(() => (state.value.source && state.value.source.webUrl) || '');
</script>

<template>
<div class="about">
    <section>
        <h2>About this documentation</h2>
        <p v-if="info.description" class="description">{{ info.description }}</p>
        <dl>
            <div v-if="info.authors.length"><dt>{{ info.authors.length === 1 ? 'Author' : 'Authors' }}</dt><dd>{{ info.authors.join(', ') }}</dd></div>
            <div v-if="info.publisher"><dt>Publisher</dt><dd>{{ info.publisher }}</dd></div>
            <div v-if="info.year"><dt>Year</dt><dd>{{ info.year }}</dd></div>
            <div v-if="info.license"><dt>Licence</dt><dd>{{ info.license }}</dd></div>
            <div v-if="info.doi"><dt>DOI</dt><dd>{{ info.doi }}</dd></div>
            <div v-if="info.url"><dt>Home</dt><dd><a :href="info.url" target="_blank" rel="noopener noreferrer">{{ info.url }}</a></dd></div>
            <div><dt>Contents</dt><dd>{{ docs.entries.value.length }} manuscript{{ docs.entries.value.length === 1 ? '' : 's' }}, {{ snippets }} snippet{{ snippets === 1 ? '' : 's' }}</dd></div>
            <div v-if="docs.generated.value"><dt>Made</dt><dd>{{ docs.generated.value }}</dd></div>
            <div v-if="webUrl"><dt>Repository</dt><dd><a :href="webUrl" target="_blank" rel="noopener noreferrer">{{ webUrl }}</a></dd></div>
            <div v-if="indexUrl"><dt>Data</dt><dd><a :href="indexUrl" target="_blank" rel="noopener noreferrer">{{ INDEX_FILE }}</a> — everything shown here is read from plain files like this one.</dd></div>
        </dl>
        <p v-if="!info.authors.length || !info.license" class="ne-note ne-note--warn">
            <template v-if="!info.authors.length">No author is named, so a citation has nobody to name. </template>
            <template v-if="!info.license">No licence is given, so it is not said what may be done with this documentation.</template>
        </p>
    </section>

    <section>
        <h2>Cite this documentation</h2>
        <CitePanel :info="info" :generated="docs.generated.value" :target="{ kind: 'documentation' }" :url="docs.permalink()" />
        <p class="hint">A manuscript, a pattern of a manuscript, a cell of the neume table and a single snippet each have a link and a citation of their own: look for the <span aria-hidden="true">⛓</span> button.</p>
    </section>
</div>
</template>

<style scoped>
.about { display: grid; grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr)); gap: var(--space-6); max-width: 70rem; }
h2 { margin: 0 0 var(--space-3); font-size: 1.15rem; }
.description { max-width: 65ch; margin: 0 0 var(--space-3); }
dl { display: grid; grid-template-columns: max-content 1fr; gap: var(--space-2) var(--space-4); margin: 0; }
dl div { display: contents; }
dt { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); padding-top: 2px; }
dd { margin: 0; overflow-wrap: anywhere; }
.hint { font-size: 0.84rem; color: var(--color-text-muted); }
</style>

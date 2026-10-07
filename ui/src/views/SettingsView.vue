<script setup>
import { nextTick, onMounted } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import PageShell from '../components/ui/PageShell.vue';
import Panel from '../components/ui/Panel.vue';
import SegmentedControl from '../components/ui/SegmentedControl.vue';
import SnippetAttributes from '../components/settings/SnippetAttributes.vue';
import MetadataSchema from '../components/settings/MetadataSchema.vue';
import { useSettingsStore } from '../stores/settings';
import { CM_REFERENCE_INFO } from '../composables/usePatternCatalog';

/**
 * Preferences that apply across the whole editor. Anything that belongs to one
 * place is set in that place: signs and preferred IDs in the pattern library,
 * your own metadata columns and their values in the manuscripts table, folio
 * alignment next to the page images, backups and storage on the Workspace page.
 * How those columns are arranged and checked is here, and the table links to it.
 */
const settings = useSettingsStore();
const route = useRoute();

// Other pages link to a panel with ?section=<its id>.
onMounted(async () => {
    const id = typeof route.query.section === 'string' ? route.query.section : '';
    if (!id) return;
    await nextTick();
    const panel = document.getElementById(id);
    if (panel) panel.scrollIntoView({ block: 'start' });
});

const fmt = (n) => n.toLocaleString('en-US');

const patternViews = [
    { value: 'svg', label: 'Graphic' },
    { value: 'arrow', label: 'Arrows' },
    { value: 'text', label: 'Text' }
];
const bases = [
    { value: 'corpus', label: 'The corpus I loaded' },
    { value: 'snapshot', label: 'Built-in snapshot of the CM' }
];
</script>

<template>
<PageShell title="Settings" eyebrow="Preferences">
    <template #subtitle>
        <p>How the editor looks and orders things. Your work and its backups are on the <RouterLink to="/workspace">Workspace</RouterLink> page.</p>
    </template>

    <Panel id="pattern-view" title="How patterns are shown" description="The standard way a pattern code is drawn wherever it appears.">
        <SegmentedControl v-model="settings.displayMode" :options="patternViews" label="Pattern view" />
        <p class="hint">
            <strong>Graphic</strong> draws the neumes. <strong>Arrows</strong> shows each step as ↗ ↘ →.
            <strong>Text</strong> shows the code letters (u, d, e).
        </p>
    </Panel>

    <Panel id="ordering" title="Order of the columns" description="The neume tables order their columns by the number of notes, then by how often each pattern occurs. Choose where the count comes from.">
        <SegmentedControl v-model="settings.frequencyBasis" :options="bases" label="Frequency basis" />
        <p class="hint" v-if="settings.frequencyBasis === 'corpus'">
            Counts the corpus you loaded on the <RouterLink to="/manuscripts/corpus">Corpus</RouterLink> page. A pattern it has
            seen more often always comes first; the built-in snapshot only orders the patterns your corpus counts equally
            or has never seen. Without a corpus, the snapshot alone orders the columns.
        </p>
        <p class="hint" v-else>
            Only the snapshot built into the editor ({{ CM_REFERENCE_INFO.sources }} sources, {{ fmt(CM_REFERENCE_INFO.documents) }} documents,
            {{ fmt(CM_REFERENCE_INFO.neumes) }} neumes, {{ CM_REFERENCE_INFO.generatedAt }}). The order does not change with
            what you have loaded.
        </p>
    </Panel>

    <Panel id="manuscript-metadata" title="Manuscript metadata">
        <MetadataSchema />
    </Panel>

    <Panel id="snippet-attributes" title="What a snippet says about itself" description="The attributes of a line snippet (its place) and of a sign snippet (its syllable). Extend them, require them, and decide what is checked.">
        <SnippetAttributes />
    </Panel>
</PageShell>
</template>

<style scoped>
.hint { margin: var(--space-3) 0 0; color: var(--color-text-muted); font-size: 0.88rem; max-width: 70ch; }
</style>

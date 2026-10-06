<script setup>
import { RouterLink } from 'vue-router';
import PageShell from '../components/ui/PageShell.vue';
import Panel from '../components/ui/Panel.vue';
import SegmentedControl from '../components/ui/SegmentedControl.vue';
import SnippetAttributes from '../components/settings/SnippetAttributes.vue';
import { useSettingsStore } from '../stores/settings';
import { CM_REFERENCE_INFO } from '../composables/usePatternCatalog';

/**
 * Preferences that apply across the whole editor. Anything that belongs to one
 * place is set in that place: signs and preferred IDs in the pattern library,
 * your own metadata columns in the metadata table, folio alignment next to the
 * page images, backups and storage on the Workspace page.
 */
const settings = useSettingsStore();

const fmt = (n) => n.toLocaleString('en-US');

const patternViews = [
    { value: 'svg', label: 'Graphic' },
    { value: 'arrow', label: 'Arrows' },
    { value: 'text', label: 'Text' }
];
const bases = [
    { value: 'cm', label: 'Whole Corpus Monodicum' },
    { value: 'loaded', label: 'The corpus I loaded' }
];
</script>

<template>
<PageShell title="Settings" eyebrow="Preferences" :toc="false">
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

    <Panel id="ordering" title="Ordering of the neume table" description="The table orders its columns by the number of tones, then by how often each pattern occurs in the Corpus Monodicum. Choose what “the CM” means for that count.">
        <SegmentedControl v-model="settings.frequencyBasis" :options="bases" label="Frequency basis" />
        <p class="hint" v-if="settings.frequencyBasis === 'cm'">
            A built-in snapshot of the whole Corpus Monodicum ({{ CM_REFERENCE_INFO.generatedAt }}):
            {{ CM_REFERENCE_INFO.sources }} sources, {{ fmt(CM_REFERENCE_INFO.documents) }} documents,
            {{ fmt(CM_REFERENCE_INFO.neumes) }} neumes. The order of the columns does not change with what you have loaded.
            Recommended.
        </p>
        <p class="hint" v-else>
            Counts only what is loaded on the <RouterLink to="/corpus">Corpus</RouterLink> page. Useful for material outside
            the CM. Patterns the loaded data has never seen fall back to the CM snapshot.
        </p>
    </Panel>

    <Panel id="snippet-attributes" title="What a snippet says about itself" description="The attributes of a line snippet (its place) and of a sign snippet (its syllable). Extend them, require them, and decide what is checked.">
        <SnippetAttributes />
    </Panel>
</PageShell>
</template>

<style scoped>
.hint { margin: var(--space-3) 0 0; color: var(--color-text-muted); font-size: 0.88rem; max-width: 70ch; }
</style>

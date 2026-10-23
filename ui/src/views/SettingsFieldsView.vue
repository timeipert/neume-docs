<script setup>
import { RouterLink } from 'vue-router';
import PageShell from '../components/ui/PageShell.vue';
import Panel from '../components/ui/Panel.vue';
import SettingsTabs from '../components/settings/SettingsTabs.vue';
import SnippetAttributes from '../components/settings/SnippetAttributes.vue';
import MetadataSchema from '../components/settings/MetadataSchema.vue';

/**
 * The fields your data has, set up once and then left alone: how the manuscripts
 * table's columns are grouped and checked, and what a snippet says about itself.
 * The columns themselves, and their values, are edited in the manuscripts table.
 */
</script>

<template>
<PageShell title="Settings" eyebrow="Preferences" :toc="false">
    <template #subtitle>
        <p>The fields your data has, set up once. Add the columns themselves in the <RouterLink to="/manuscripts">manuscripts table</RouterLink>.</p>
    </template>
    <template #tabs><SettingsTabs /></template>

    <Panel id="manuscript-metadata" title="Manuscript metadata" description="Group the table's columns into categories, and decide what each column may hold.">
        <MetadataSchema />
    </Panel>

    <Panel id="snippet-attributes" title="What a snippet says about itself" description="The attributes of a line snippet (its place) and of a sign snippet (its syllable). Extend them, require them, and decide what is checked.">
        <SnippetAttributes />
    </Panel>
</PageShell>
</template>

<script setup>
import PageShell from '../components/ui/PageShell.vue';
import WorkspaceTabs from '../components/workspace/WorkspaceTabs.vue';
import BackupPanel from '../components/workspace/BackupPanel.vue';
import ManuscriptsPanel from '../components/workspace/ManuscriptsPanel.vue';
</script>

<template>
<PageShell title="Workspace" eyebrow="Your work" :toc="false">
    <template #subtitle>
        <p>Take your work out of the editor as a file, or bring a file in.</p>
    </template>
    <template #tabs><WorkspaceTabs /></template>
    <BackupPanel />
    <ManuscriptsPanel />
</PageShell>
</template>

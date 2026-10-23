<script setup>
import PageShell from '../components/ui/PageShell.vue';
import WorkspaceTabs from '../components/workspace/WorkspaceTabs.vue';
import StoragePanel from '../components/workspace/StoragePanel.vue';
import RestorePointsPanel from '../components/workspace/RestorePointsPanel.vue';
</script>

<template>
<PageShell title="Workspace" eyebrow="Your work" :toc="false">
    <template #subtitle>
        <p>Where your work is kept, and the earlier copies you can go back to.</p>
    </template>
    <template #tabs><WorkspaceTabs /></template>
    <StoragePanel />
    <RestorePointsPanel />
</PageShell>
</template>

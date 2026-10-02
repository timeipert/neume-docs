<script setup>
import PageShell from '../components/ui/PageShell.vue';
import ContentsPanel from '../components/workspace/ContentsPanel.vue';
import ManuscriptsPanel from '../components/workspace/ManuscriptsPanel.vue';
import StoragePanel from '../components/workspace/StoragePanel.vue';
import BackupPanel from '../components/workspace/BackupPanel.vue';
import RestorePointsPanel from '../components/workspace/RestorePointsPanel.vue';
import PublishPanel from '../components/workspace/PublishPanel.vue';
import ResetPanel from '../components/workspace/ResetPanel.vue';
</script>

<template>
<PageShell title="Workspace" eyebrow="Your work">
    <template #subtitle>
        <p>Everything you have made in the editor: what is in it, where it is kept, how to back it up, and how to clear it.</p>
    </template>
    <ContentsPanel />
    <ManuscriptsPanel />
    <StoragePanel />
    <BackupPanel />
    <RestorePointsPanel />
    <PublishPanel />
    <ResetPanel />
</PageShell>
</template>

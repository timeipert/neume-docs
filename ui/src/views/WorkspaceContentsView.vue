<script setup>
import PageShell from '../components/ui/PageShell.vue';
import WorkspaceTabs from '../components/workspace/WorkspaceTabs.vue';
import ContentsPanel from '../components/workspace/ContentsPanel.vue';
import ResetPanel from '../components/workspace/ResetPanel.vue';
</script>

<template>
<PageShell title="Workspace" eyebrow="Your work" :toc="false">
    <template #subtitle>
        <p>What the workspace holds, and how to clear all or part of it.</p>
    </template>
    <template #tabs><WorkspaceTabs /></template>
    <ContentsPanel />
    <ResetPanel />
</PageShell>
</template>

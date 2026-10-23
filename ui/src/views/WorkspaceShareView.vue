<script setup>
import PageShell from '../components/ui/PageShell.vue';
import WorkspaceTabs from '../components/workspace/WorkspaceTabs.vue';
import MonodiExchangePanel from '../components/workspace/MonodiExchangePanel.vue';
import PublishPanel from '../components/workspace/PublishPanel.vue';
import GithubPanel from '../components/workspace/GithubPanel.vue';
</script>

<template>
<PageShell title="Workspace" eyebrow="Your work" :toc="false">
    <template #subtitle>
        <p>Hand your work on: to Monodi-Zero, as a documentation others can read, or to a GitHub repository.</p>
    </template>
    <template #tabs><WorkspaceTabs /></template>
    <MonodiExchangePanel />
    <PublishPanel />
    <GithubPanel />
</PageShell>
</template>

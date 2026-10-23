<script setup>
import PageTabs from '../ui/PageTabs.vue';

/** The workspace, by what you are doing: moving work in and out, handing it on, keeping it safe, looking at what is there. */
const tabs = [
    { to: '/workspace', label: 'Import & export', title: 'Back up your work as a file, or open one' },
    { to: '/workspace/share', label: 'Share & publish', title: 'Monodi-Zero, published documentations, GitHub' },
    { to: '/workspace/storage', label: 'Storage & restore', title: 'Where your work is kept, and earlier copies of it' },
    { to: '/workspace/contents', label: 'Contents & reset', title: 'What the workspace holds, and clearing it' }
];
</script>

<template><PageTabs :tabs="tabs" label="Workspace" /></template>

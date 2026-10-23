<script setup>
import PageTabs from '../ui/PageTabs.vue';

/** What you see (changed often) and the fields your data has (set up once). */
const tabs = [
    { to: '/settings', label: 'Display', title: 'How patterns, signs and tables look' },
    { to: '/settings/fields', label: 'Data fields', title: 'Manuscript metadata columns and snippet attributes' }
];
</script>

<template><PageTabs :tabs="tabs" label="Settings" /></template>

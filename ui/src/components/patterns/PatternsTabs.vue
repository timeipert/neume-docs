<script setup>
import PageTabs from '../ui/PageTabs.vue';

/** The two views of the patterns: the library (the vocabulary), and what the loaded corpus makes of it. */
const tabs = [
    { to: '/patterns', label: 'Library', title: 'Signs, code variants, preferred IDs, snippet variants' },
    { to: '/patterns/corpus', label: 'In the corpus', title: 'Where each pattern occurs in the loaded corpus' }
];
</script>

<template><PageTabs :tabs="tabs" label="Patterns" /></template>

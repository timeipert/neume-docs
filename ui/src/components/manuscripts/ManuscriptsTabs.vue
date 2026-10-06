<script setup>
import { computed } from 'vue';
import PageTabs from '../ui/PageTabs.vue';

/** The three views of the manuscripts: the catalogue, their images, and the corpus they come from. */
const props = defineProps({
    // How many manuscripts have an image source waiting to be taken (a suggestion).
    badge: { type: Number, default: 0 }
});

const tabs = computed(() => [
    { to: '/manuscripts', label: 'Catalogue', title: 'Every manuscript as a table: catalogue data and your own columns' },
    { to: '/manuscripts/images', label: 'Images', badge: props.badge, title: 'Which IIIF manifest belongs to which manuscript' },
    { to: '/manuscripts/corpus', label: 'Corpus', title: 'Load a corpus, remove sources' }
]);
</script>

<template><PageTabs :tabs="tabs" label="Manuscripts" /></template>

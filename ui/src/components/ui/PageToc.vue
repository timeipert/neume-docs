<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';

/**
 * "On this page": an index of the panels (elements with `data-toc` and an id)
 * inside `root`, with the one being read highlighted. Built from the page itself,
 * so a panel added or removed needs no change here.
 */
const props = defineProps({
    root: { type: Object, default: null } // the element holding the panels
});

const items = ref([]);
const active = ref('');
let observer = null;

onMounted(async () => {
    await nextTick();
    const scope = props.root || document;
    const panels = [...scope.querySelectorAll('[data-toc][id]')];
    items.value = panels.map(el => ({ id: el.id, text: el.dataset.toc }));
    if (typeof IntersectionObserver === 'undefined' || !panels.length) return;
    observer = new IntersectionObserver((entries) => {
        const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) active.value = visible[0].target.id;
    }, { rootMargin: '0px 0px -70% 0px' });
    panels.forEach(p => observer.observe(p));
});

onBeforeUnmount(() => { if (observer) observer.disconnect(); });

function jump(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    active.value = id;
}
</script>

<template>
<nav v-if="items.length" class="toc" aria-label="Sections of this page">
    <p class="toc-title">On this page</p>
    <button v-for="t in items" :key="t.id" class="toc-link" :class="{ active: active === t.id }" @click="jump(t.id)">{{ t.text }}</button>
</nav>
</template>

<style scoped>
.toc { display: flex; flex-direction: column; gap: 2px; }
.toc-title { margin: 0 0 6px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text-muted); }
.toc-link { text-align: left; border: none; background: transparent; border-left: 2px solid var(--color-border); border-radius: 0; padding: 5px 10px; font-size: 0.84rem; color: var(--color-text-muted); font-weight: 500; }
.toc-link:hover { background: transparent; color: var(--color-text); border-left-color: var(--color-border-hover); }
.toc-link.active { color: var(--color-primary-dark); border-left-color: var(--color-primary); font-weight: 600; }
</style>

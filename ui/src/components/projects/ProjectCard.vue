<script setup>
import { useRouter } from 'vue-router';
import { useProject } from '../../composables/useProject';
import { describeRange } from '../../utils/projectData';

/** One project in the list: what it covers and how far it is. The card is the way in. */
const props = defineProps({ id: { type: String, required: true } });

const router = useRouter();
const { project, progress, hasTranscription } = useProject(props.id);
</script>

<template>
<button v-if="project" class="card" @click="router.push({ name: 'project', params: { id } })">
    <span class="head">
        <strong class="name">{{ project.name }}</strong>
        <span v-if="project.published" class="tag" title="Shown in the public views">Public</span>
        <span v-if="!hasTranscription && project.focus === 'transcription'" class="tag warn" title="Its transcription is not loaded right now">not loaded</span>
    </span>
    <span class="meta">{{ project.source }} · {{ describeRange(project.from, project.to) }}</span>
    <span class="foot">
        <template v-if="project.columns.length"><strong>{{ progress.filled }}</strong>&nbsp;of {{ progress.columns }} columns filled<template v-if="progress.extended"> · +{{ progress.extended }}</template></template>
        <template v-else>Columns not chosen yet</template>
    </span>
</button>
</template>

<style scoped>
.card { display: flex; flex-direction: column; align-items: stretch; gap: var(--space-1); text-align: left; padding: var(--space-4); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); color: inherit; transition: border-color 0.15s, box-shadow 0.15s; }
.card:hover { border-color: var(--color-primary); background: var(--color-surface); box-shadow: var(--shadow-md); }
.head { display: flex; align-items: center; gap: var(--space-2); }
.name { font-size: 1.05rem; overflow-wrap: anywhere; }
.tag { font-size: 0.7rem; font-weight: 700; padding: 0 8px; border-radius: 999px; background: var(--color-success-light); color: var(--color-success-dark); white-space: nowrap; }
.tag.warn { background: var(--color-warning-light); color: var(--color-warning-dark); }
.meta { color: var(--color-text-muted); font-size: 0.86rem; }
.foot { margin-top: var(--space-1); font-size: 0.84rem; color: var(--color-text-muted); }
.foot strong { color: var(--color-text); }
</style>

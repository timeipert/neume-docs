<script setup>
import { ref } from 'vue';
import Panel from '../ui/Panel.vue';
import { exportStaticSite } from '../../composables/useStaticExport';
import { useToast } from '../../composables/useToast';

const toast = useToast();
const running = ref(false);
const progress = ref('');
const result = ref(null); // { tone, text }

async function run() {
    if (running.value) return;
    running.value = true;
    result.value = null;
    progress.value = 'Starting…';
    try {
        const res = await exportStaticSite((p) => { progress.value = p.message; });
        result.value = {
            tone: res.failures ? 'warn' : 'success',
            text: `Exported ${res.sources} manuscript${res.sources === 1 ? '' : 's'} with ${res.snippets} snippet${res.snippets === 1 ? '' : 's'}`
                + (res.failures ? `. ${res.failures} snippet${res.failures === 1 ? '' : 's'} could not be fetched (IIIF/CORS).` : '.')
        };
        toast.show('Static site downloaded.', { tone: 'success' });
    } catch (e) {
        result.value = { tone: 'error', text: e?.message || 'The export failed.' };
    } finally {
        running.value = false;
        progress.value = '';
    }
}
</script>

<template>
<Panel id="publish" title="Publish" description="Download a self-contained copy of what you have published: one HTML and one Markdown page per published manuscript, with the cropped IIIF snippets saved as image files. Snippets are fetched live from the IIIF servers, so keep this tab open while it runs.">
    <button class="ne-btn ne-btn--primary" :disabled="running" @click="run">{{ running ? 'Exporting…' : 'Download static site' }}</button>
    <p v-if="running" class="ne-muted progress">{{ progress }}</p>
    <p v-if="result" class="ne-note result" :class="`ne-note--${result.tone}`">{{ result.text }}</p>
</Panel>
</template>

<style scoped>
.progress { margin: var(--space-3) 0 0; font-size: 0.88rem; }
.result { margin: var(--space-3) 0 0; }
</style>

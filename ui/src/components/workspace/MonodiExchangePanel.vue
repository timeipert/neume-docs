<script setup>
import { ref } from 'vue';
import Panel from '../ui/Panel.vue';
import { useMonodiExchange } from '../../composables/useMonodiExchange';
import { useLinkAssistant } from '../../composables/useLinkAssistant';
import { useToast } from '../../composables/useToast';

/**
 * The two ways a file travels between this editor and Monodi-Zero: the
 * annotations made here go to Monodi-Zero, which links them to the transcription;
 * annotations that were made or linked there come back. The transcription itself
 * comes in on the Corpus page.
 */
const ex = useMonodiExchange();
const links = useLinkAssistant();
const toast = useToast();
const input = ref(null);
const busy = ref(false);

async function send() {
    busy.value = true;
    try { await ex.send(); } catch (e) { toast.show(`Could not prepare the file: ${e.message}`, { tone: 'error' }); } finally { busy.value = false; }
}

async function findLinks() {
    busy.value = true;
    try { await links.find(); } catch (e) { toast.show(`Could not work out links: ${e.message}`, { tone: 'error' }); } finally { busy.value = false; }
}

async function onPicked(event) {
    const files = event.target.files;
    if (!files || !files.length) return;
    busy.value = true;
    try {
        await ex.readFile(files[0]);
    } catch (e) {
        toast.show(`Could not read ${files[0].name}: ${e.message}`, { tone: 'error' });
    } finally {
        busy.value = false;
        event.target.value = null;
    }
}
</script>

<template>
<Panel id="monodi" title="Exchange with Monodi-Zero" description="Line regions, snippets and neume table rows go to Monodi-Zero as a file, which attaches them to the transcription. What was made or linked there comes back the same way.">
    <div class="block">
        <div class="row">
            <div class="grow">
                <h3>Send annotations</h3>
                <p class="ne-muted">
                    One file with the line regions, snippets and neume table rows of
                    <template v-if="ex.sendable.value.length">{{ ex.sendable.value.length }} manuscript{{ ex.sendable.value.length === 1 ? '' : 's' }}</template>
                    <template v-else>the manuscripts you work on</template>.
                    Snippets you linked to a neume in the transcription keep that link, so Monodi-Zero can show the sign in the manuscript.
                    Catalogue data is not sent: Monodi-Zero owns it.
                </p>
            </div>
            <div class="controls">
                <button class="ne-btn ne-btn--primary" :disabled="busy || !ex.sendable.value.length" @click="send">Download file for Monodi-Zero</button>
            </div>
        </div>
    </div>
    <div class="block">
        <div class="row">
            <div class="grow">
                <h3>Link snippets to the transcription</h3>
                <p class="ne-muted">
                    Monodi-Zero can show a sign in the manuscript only if its snippet is linked to the neume it depicts.
                    This works the links out by matching each line region's snippets with the neumes of a transcription line,
                    and you review them before anything is changed. Do it before sending.
                </p>
            </div>
            <div class="controls">
                <button class="ne-btn" :disabled="busy || !links.candidates.value.length" @click="findLinks">Find links…</button>
            </div>
        </div>
    </div>
    <div class="block">
        <div class="row">
            <div class="grow">
                <h3>Take annotations back</h3>
                <p class="ne-muted">Open a file written by this editor or exported from Monodi-Zero. You see what it would add first; what you already have is not changed.</p>
            </div>
            <div class="controls">
                <input ref="input" type="file" accept=".json" hidden @change="onPicked" />
                <button class="ne-btn" :disabled="busy" @click="input.click()">Open a file…</button>
            </div>
        </div>
    </div>
</Panel>
</template>

<style scoped>
.block { padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg); }
.block + .block { margin-top: var(--space-3); }
.row { display: flex; gap: var(--space-4) var(--space-5); align-items: flex-start; flex-wrap: wrap; }
.grow { flex: 1 1 16rem; min-width: 0; }
h3 { margin: 0 0 var(--space-1); font-size: 0.98rem; }
p { margin: 0; font-size: 0.88rem; }
.controls { display: flex; flex-direction: column; gap: var(--space-3); align-items: flex-start; flex: 0 1 20rem; }
</style>

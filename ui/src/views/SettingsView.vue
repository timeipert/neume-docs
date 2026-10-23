<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import PageShell from '../components/ui/PageShell.vue';
import Panel from '../components/ui/Panel.vue';
import SegmentedControl from '../components/ui/SegmentedControl.vue';
import SettingsTabs from '../components/settings/SettingsTabs.vue';
import { useSettingsStore } from '../stores/settings';
import { CM_REFERENCE_INFO } from '../composables/usePatternCatalog';

/**
 * How the editor looks. Anything that belongs to one place is set in that place:
 * signs and preferred IDs in the pattern library, your own metadata columns and
 * their values in the manuscripts table, folio alignment next to the page images,
 * backups and storage on the Workspace page. The fields your data has are on the
 * second tab. Each choice here takes effect at once; there is nothing to save.
 */
const settings = useSettingsStore();

const fmt = (n) => n.toLocaleString('en-US');

const patternViews = [
    { value: 'svg', label: 'Graphic' },
    { value: 'arrow', label: 'Arrows' },
    { value: 'text', label: 'Text' }
];
const patternViewHints = {
    svg: 'The neumes are drawn.',
    arrow: 'Each step is an arrow: ↗ ↘ →.',
    text: 'The code letters: u, d, e.'
};
const bases = [
    { value: 'corpus', label: 'The corpus I loaded' },
    { value: 'snapshot', label: 'Built-in snapshot' }
];
const scaleModes = [
    { value: 'uniform', label: 'Same size for every sign' },
    { value: 'fit', label: 'Fit to the drawn box' }
];
const scaleMode = computed({
    get: () => (settings.snippetUniformScale ? 'uniform' : 'fit'),
    set: (v) => { settings.snippetUniformScale = v === 'uniform'; }
});
const contextStyles = [
    { value: 'plain', label: 'Plain' },
    { value: 'dim', label: 'Dimmed' },
    { value: 'blur', label: 'Blurred' }
];
</script>

<template>
<PageShell title="Settings" eyebrow="Preferences" :toc="false">
    <template #subtitle>
        <p>How patterns, signs and tables look. Changes apply at once. Your work and its backups are on the <RouterLink to="/workspace">Workspace</RouterLink> page.</p>
    </template>
    <template #tabs><SettingsTabs /></template>

    <Panel id="pattern-view" title="How patterns are shown" description="The usual way a pattern code is drawn, wherever it appears.">
        <SegmentedControl v-model="settings.displayMode" :options="patternViews" label="Pattern view" />
        <p class="hint">{{ patternViewHints[settings.displayMode] }}</p>
    </Panel>

    <Panel id="snippet-display" title="How a sign is shown" description="A single sign on its own: in a table cell, the pattern tree or a gallery. Not a whole line.">
        <SegmentedControl v-model="scaleMode" :options="scaleModes" label="Size" />
        <p class="hint" v-if="settings.snippetUniformScale">
            One steady zoom level, so two occurrences of a pattern look the same size side by side. A small sign gets more of the page around it instead of being magnified.
        </p>
        <p class="hint" v-else>
            Each crop is scaled to fill its own frame, so differences in size between occurrences are really differences in zoom.
        </p>
        <template v-if="settings.snippetUniformScale">
            <div class="field">
                <span class="field-label">Zoom level</span>
                <label class="range-row">
                    <input type="range" min="1" max="6" step="0.2" v-model.number="settings.snippetReferenceSpan" aria-label="Zoom level" />
                    <span class="val">{{ settings.snippetReferenceSpan.toFixed(1) }}</span>
                </label>
                <p class="hint">Lower shows more of the page around a typical sign; higher zooms in.</p>
            </div>
            <div class="field">
                <span class="field-label">Page added around a sign</span>
                <SegmentedControl v-model="settings.snippetContextStyle" :options="contextStyles" label="Context" size="sm" />
                <p class="hint">Left as it is, washed with the page background, or blurred. Only seen where context was added to hold the zoom level.</p>
            </div>
        </template>
    </Panel>

    <Panel id="ordering" title="Order of the table columns" description="Neume tables order their columns by the number of notes, then by how often a pattern occurs. Where should the count come from?">
        <SegmentedControl v-model="settings.frequencyBasis" :options="bases" label="Frequency basis" />
        <p class="hint" v-if="settings.frequencyBasis === 'corpus'">
            Counted in the corpus you loaded on the <RouterLink to="/manuscripts/corpus">Corpus</RouterLink> page. The built-in snapshot only orders patterns your corpus counts equally or has never seen. Without a corpus, the snapshot alone orders the columns.
        </p>
        <p class="hint" v-else>
            Only the snapshot built into the editor ({{ CM_REFERENCE_INFO.sources }} sources, {{ fmt(CM_REFERENCE_INFO.documents) }} documents, {{ fmt(CM_REFERENCE_INFO.neumes) }} neumes, {{ CM_REFERENCE_INFO.generatedAt }}). The order does not change with what you have loaded.
        </p>
    </Panel>
</PageShell>
</template>

<style scoped>
.hint { margin: var(--space-3) 0 0; color: var(--color-text-muted); font-size: 0.88rem; max-width: 70ch; }
.field { margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--color-border); }
.field-label { display: block; margin-bottom: var(--space-2); font-size: 0.82rem; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.field .hint { margin-top: var(--space-2); }
.range-row { display: flex; align-items: center; gap: var(--space-3); font-size: 0.9rem; }
.range-row input[type="range"] { flex: 1; max-width: 20rem; }
.range-row .val { min-width: 2.2em; font-weight: 600; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
</style>

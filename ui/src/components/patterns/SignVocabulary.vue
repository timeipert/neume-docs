<script setup>
import { ref, computed } from 'vue';
import SvgPattern from '../SvgPattern.vue';
import { useSettingsStore } from '../../stores/settings';
import { useTranscriptionData } from '../../composables/useTranscriptionData';
import { useToast } from '../../composables/useToast';
import { validateSignKey } from '../../utils/signs';

/**
 * The project's own signs: single uppercase letters that mark one note of a
 * pattern (like the built-in O, Q, S, L), which is what makes a code variant
 * such as *uuVdd. Variants themselves are made per pattern, in the list below.
 */
const settings = useSettingsStore();
const { glyphs } = useTranscriptionData();
const toast = useToast();

const glyphOptions = computed(() => Object.keys(glyphs.value || {}));
const blank = () => ({ key: '', label: '', abbrev: '', description: '', glyph: 'note', glyphSvg: '' });
const draft = ref(blank());
const error = ref('');

function add() {
    const key = draft.value.key.trim().toUpperCase();
    const problem = validateSignKey(key, settings.customSigns.map(s => s.key));
    if (problem) { error.value = problem; return; }
    if (!draft.value.label.trim()) { error.value = 'A label is required.'; return; }
    settings.addCustomSign({
        key,
        label: draft.value.label.trim(),
        abbrev: draft.value.abbrev.trim() || key,
        description: draft.value.description.trim(),
        glyph: draft.value.glyph || '',
        glyphSvg: draft.value.glyphSvg.trim()
    });
    draft.value = blank();
    error.value = '';
}

function remove(sign) {
    settings.removeCustomSign(sign.key);
    toast.show(`Sign ${sign.key} (${sign.label}) removed.`, {
        action: { label: 'Undo', run: () => settings.addCustomSign(sign) }
    });
}

async function onSvgFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    draft.value.glyphSvg = await file.text();
    e.target.value = null;
}
</script>

<template>
<div class="signs">
    <p class="ne-muted intro">
        A sign marks a single note, like the built-in O, Q, S and L. Add one here (for example
        <span class="ne-code">V</span> for a virga), then open a pattern in the list below and press <strong>+ Variant</strong>
        to make <span class="ne-code">*uudd</span> into <span class="ne-code">*uuVdd</span>.
    </p>

    <div class="form">
        <div class="form-row">
            <div class="ne-field"><label for="sign-key">Key (A–Z)</label><input id="sign-key" v-model="draft.key" class="ne-input key" maxlength="1" placeholder="V" /></div>
            <div class="ne-field grow"><label for="sign-label">Label</label><input id="sign-label" v-model="draft.label" class="ne-input" placeholder="Virga" @keyup.enter="add" /></div>
            <div class="ne-field"><label for="sign-abbrev">Abbreviation</label><input id="sign-abbrev" v-model="draft.abbrev" class="ne-input abbrev" maxlength="3" placeholder="v" /></div>
            <div class="ne-field">
                <label for="sign-glyph">Built-in glyph</label>
                <select id="sign-glyph" v-model="draft.glyph" class="ne-input">
                    <option value="">(none)</option>
                    <option v-for="g in glyphOptions" :key="g" :value="g">{{ g }}</option>
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="ne-field grow"><label for="sign-desc">Description</label><input id="sign-desc" v-model="draft.description" class="ne-input" placeholder="Shown as a vertical stroke instead of a punctum" @keyup.enter="add" /></div>
        </div>
        <div class="form-row">
            <div class="ne-field grow">
                <label for="sign-svg">Own glyph as SVG (optional, replaces the built-in glyph)</label>
                <textarea id="sign-svg" v-model="draft.glyphSvg" class="ne-input" rows="2" placeholder="Paste &lt;svg&gt;…&lt;/svg&gt; here, or choose a file"></textarea>
                <input type="file" accept=".svg,image/svg+xml" class="file" @change="onSvgFile" />
            </div>
            <div v-if="draft.key" class="ne-field preview">
                <label>Preview</label>
                <div class="preview-box"><SvgPattern :pattern="'*u' + draft.key.toUpperCase() + 'd'" :glyphs="glyphs" /></div>
            </div>
        </div>
        <div class="form-actions">
            <span v-if="error" class="ne-note ne-note--error" role="alert">{{ error }}</span>
            <button class="ne-btn ne-btn--primary" :disabled="!draft.key || !draft.label" @click="add">Add sign</button>
        </div>
    </div>

    <table v-if="settings.customSigns.length" class="ne-table signs-table">
        <thead><tr><th>Key</th><th>Label</th><th>Description</th><th>Glyph</th><th>Sample</th><th></th></tr></thead>
        <tbody>
            <tr v-for="s in settings.customSigns" :key="s.key">
                <td class="ne-code"><strong>{{ s.key }}</strong></td>
                <td>{{ s.label }}</td>
                <td class="ne-muted">{{ s.description }}</td>
                <td>{{ s.glyphSvg ? 'own SVG' : (s.glyph || '—') }}</td>
                <td><SvgPattern :pattern="'*u' + s.key + 'd'" :glyphs="glyphs" /></td>
                <td class="actions"><button class="ne-btn ne-btn--sm ne-btn--danger" @click="remove(s)">Remove</button></td>
            </tr>
        </tbody>
    </table>
    <div v-else class="ne-empty">No signs yet.</div>

    <label class="ne-check discriminate">
        <input type="checkbox" v-model="settings.discriminateSigns" />
        <span>Tell code variants apart in overviews and IDs <span class="ne-muted">(off: every variant counts towards its base pattern)</span></span>
    </label>
</div>
</template>

<style scoped>
.intro { margin: 0 0 var(--space-4); font-size: 0.88rem; max-width: 70ch; }
.form { padding: var(--space-4); margin-bottom: var(--space-4); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); display: flex; flex-direction: column; gap: var(--space-3); }
.form-row { display: flex; gap: var(--space-3); flex-wrap: wrap; align-items: flex-end; }
.grow { flex: 1 1 14rem; }
.key { width: 4rem; text-align: center; text-transform: uppercase; font-weight: 700; }
.abbrev { width: 5rem; }
.file { margin-top: var(--space-1); font-size: 0.78rem; }
.preview-box { background: #fff; border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-1) var(--space-3); min-width: 4rem; display: flex; justify-content: center; }
.form-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-3); }
.form-actions .ne-note { padding: 0.3em 0.7em; margin-right: auto; }
.signs-table { margin-bottom: var(--space-3); }
.discriminate { margin-top: var(--space-3); align-items: flex-start; font-size: 0.88rem; }
.discriminate input { margin-top: 0.3em; }
</style>

<script setup>
import { ref, computed, watch } from 'vue';
import ModalDialog from '../ui/ModalDialog.vue';
import MmmoCandidate from './MmmoCandidate.vue';
import { useMmmo, MMMO_NAME } from '../../composables/useMmmo';
import { metadataFrom } from '../../services/mmmo/matching';
import { useManuscriptMetaStore } from '../../stores/manuscriptMeta';
import { useIiifRegistryStore } from '../../stores/iiifRegistry';
import { useIiifStore } from '../../stores/iiif';
import { useTranscriptionData } from '../../composables/useTranscriptionData';
import { usePersonalTablesStore } from '../../stores/personalTables';
import { useToast } from '../../composables/useToast';

/**
 * Add a manuscript that is not in the corpus. As the siglum and details are typed,
 * matching entries of the MMMO catalogue are suggested; taking one fills in the
 * catalogue data and the IIIF manifest. The manuscript then shows up as a row of
 * the metadata table.
 */
const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(['close', 'added']);

const meta = useManuscriptMetaStore();
const registry = useIiifRegistryStore();
const iiif = useIiifStore();
const tables = usePersonalTablesStore();
const { catalog } = useTranscriptionData();
const mmmo = useMmmo();
const toast = useToast();

const blank = () => ({ siglum: '', city: '', library: '', shelfmark: '', date: '', origin: '' });
const form = ref(blank());
const chosen = ref(null); // the catalogue record taken
const error = ref('');

watch(() => props.open, (open) => {
    if (!open) return;
    form.value = blank();
    chosen.value = null;
    error.value = '';
    mmmo.load();
});

const known = computed(() => {
    const names = new Set(Object.keys(catalog.value));
    for (const t of tables.tables) if (t.source) names.add(t.source);
    for (const s of Object.keys(meta.overrides)) names.add(s);
    return names;
});

const exists = computed(() => known.value.has(form.value.siglum.trim()));

const query = computed(() => ({
    siglum: form.value.siglum.trim(),
    city: form.value.city.trim(),
    library: form.value.library.trim(),
    shelfmark: form.value.shelfmark.trim(),
    origin: form.value.origin.trim(),
    date: form.value.date.trim()
}));

const suggestions = computed(() => {
    if (!mmmo.ready.value) return [];
    const q = query.value;
    if (!q.siglum && !q.shelfmark) return [];
    const matched = mmmo.suggest(q, { limit: 5 });
    if (matched.length) return matched;
    // Nothing fits the details: fall back to the words typed.
    return mmmo.search(`${q.siglum} ${q.city}`.trim(), { limit: 5 }).map(record => ({ record, reasons: ['words match'], confidence: '' }));
});

// What taking a record fills in: only fields still empty, never what was typed.
const FIELD_OF = { bibliotheksort: 'city', bibliothek: 'library', bibliothekssignatur: 'shelfmark', herkunftsort: 'origin', datierung: 'date' };

function take(record) {
    chosen.value = record;
    for (const [field, value] of Object.entries(metadataFrom(record))) {
        const key = FIELD_OF[field];
        if (key && !form.value[key].trim()) form.value[key] = value;
    }
    if (!form.value.siglum.trim()) form.value.siglum = record.siglum;
}

function add() {
    const siglum = form.value.siglum.trim();
    error.value = '';
    if (!siglum) { error.value = 'Give the manuscript a siglum.'; return; }
    if (exists.value) { error.value = `“${siglum}” is already in the table.`; return; }

    const fields = {
        cantus_siglum: chosen.value && chosen.value.rism && chosen.value.shelfmark ? `${chosen.value.rism} ${chosen.value.shelfmark}` : '',
        bibliotheksort: form.value.city.trim(),
        bibliothek: form.value.library.trim(),
        bibliothekssignatur: form.value.shelfmark.trim(),
        herkunftsort: form.value.origin.trim(),
        datierung: form.value.date.trim()
    };
    let wrote = 0;
    for (const [field, value] of Object.entries(fields)) {
        if (value) { meta.set(siglum, field, value, ''); wrote++; }
    }
    // A manuscript with no data at all would not appear in the table: give it its siglum as a field.
    if (!wrote) meta.set(siglum, 'quellensigle', siglum, '');

    if (chosen.value && chosen.value.manifest) {
        registry.add({ siglum, url: chosen.value.manifest, kind: 'manifest', label: `${MMMO_NAME}: ${chosen.value.siglum}`, origin: 'mmmo', mmmoId: chosen.value.id });
        iiif.setLink(siglum, chosen.value.manifest);
    }
    toast.show(`“${siglum}” was added${chosen.value && chosen.value.manifest ? ' with its IIIF manifest' : ''}.`, { tone: 'success' });
    emit('added', siglum);
    emit('close');
}
</script>

<template>
<ModalDialog :open="open" title="Add a manuscript" width="44rem" @close="emit('close')">
    <p class="intro ne-muted">For a manuscript that is not in your corpus. Type what you know; matching entries of the {{ MMMO_NAME }} are suggested and can fill in the rest.</p>

    <div class="grid">
        <div class="ne-field wide"><label for="am-siglum">Siglum</label><input id="am-siglum" v-model="form.siglum" class="ne-input" placeholder="e.g. D-Eu 84 or Eichstätt 84" @keydown.enter="add" /></div>
        <div class="ne-field"><label for="am-city">Library city</label><input id="am-city" v-model="form.city" class="ne-input" placeholder="e.g. Eichstätt" /></div>
        <div class="ne-field"><label for="am-shelf">Shelfmark</label><input id="am-shelf" v-model="form.shelfmark" class="ne-input" placeholder="e.g. 84 or VI G 5" /></div>
        <div class="ne-field"><label for="am-lib">Library</label><input id="am-lib" v-model="form.library" class="ne-input" placeholder="e.g. Universitätsbibliothek" /></div>
        <div class="ne-field"><label for="am-date">Date</label><input id="am-date" v-model="form.date" class="ne-input" placeholder="e.g. 15th c. or 1070-1080" /></div>
        <div class="ne-field wide"><label for="am-origin">Place of origin</label><input id="am-origin" v-model="form.origin" class="ne-input" /></div>
    </div>

    <section class="sugg" aria-label="Suggestions">
        <h4>Suggestions</h4>
        <p v-if="mmmo.status.value === 'loading'" class="ne-muted small">Reading the catalogue…</p>
        <p v-else-if="mmmo.status.value === 'missing' || mmmo.status.value === 'error'" class="ne-note ne-note--info">
            The {{ MMMO_NAME }} has not been collected on this installation, so there is nothing to suggest. See “IIIF sources” for how to collect it.
        </p>
        <p v-else-if="!suggestions.length" class="ne-muted small">{{ query.siglum || query.shelfmark ? 'Nothing in the catalogue fits yet.' : 'Suggestions appear as you type.' }}</p>
        <ul v-else class="list">
            <li v-for="s in suggestions" :key="s.record.id" :class="{ taken: chosen && chosen.id === s.record.id }">
                <MmmoCandidate :record="s.record" :reasons="s.reasons" :confidence="s.confidence">
                    <button class="ne-btn ne-btn--sm" :class="{ 'ne-btn--primary': !(chosen && chosen.id === s.record.id) }" @click="take(s.record)">{{ chosen && chosen.id === s.record.id ? '✓ Taken' : 'Take this' }}</button>
                </MmmoCandidate>
            </li>
        </ul>
        <p v-if="chosen" class="ne-muted small">Taking an entry fills in empty fields only{{ chosen.manifest ? ' and links its IIIF manifest' : '' }}. What you typed stays.</p>
    </section>

    <p v-if="error || exists" class="ne-note ne-note--error" role="alert">{{ error || `“${form.siglum.trim()}” is already in the table.` }}</p>

    <template #footer>
        <button class="ne-btn" @click="emit('close')">Cancel</button>
        <button class="ne-btn ne-btn--primary" :disabled="!form.siglum.trim() || exists" @click="add">Add manuscript</button>
    </template>
</ModalDialog>
</template>

<style scoped>
.intro { margin: 0 0 var(--space-4); font-size: 0.9rem; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
.wide { grid-column: 1 / -1; }
.sugg { margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--color-border); }
.sugg h4 { margin: 0 0 var(--space-2); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); }
.small { font-size: 0.82rem; margin: var(--space-2) 0 0; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.list li { padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg); }
.list li.taken { border-color: var(--color-primary-muted); background: var(--color-primary-light); }
.ne-note { margin: var(--space-3) 0 0; }
@media (max-width: 560px) { .grid { grid-template-columns: 1fr; } }
</style>

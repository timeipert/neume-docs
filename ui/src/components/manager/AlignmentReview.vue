<script setup>
import { computed, ref, onMounted } from 'vue';
import { useImageManifest } from '../../composables/useImageManifest';
import { useSettingsStore } from '../../stores/settings';
import { useIiifStore } from '../../stores/iiif';
import ModalDialog from '../ui/ModalDialog.vue';

const props = defineProps({ source: { type: String, required: true } });
const emit = defineEmits(['close']);

const settings = useSettingsStore();
const iiifStore = useIiifStore();
const { getAlignmentReport, resolveIiifSource, hasTranscriptionData } = useImageManifest();

const reloadKey = ref(0);
const showUnmatchedOnly = ref(false);

const iiifKey = computed(() => resolveIiifSource(props.source) || props.source);

onMounted(() => {
    if (!iiifStore.parsedData[iiifKey.value]) iiifStore.ensureLoaded(iiifKey.value);
});

const report = computed(() => {
    reloadKey.value; // re-evaluate after each edit
    return getAlignmentReport(props.source);
});

const dataType = computed(() => settings.alignmentFor(iiifKey.value)?.dataType || report.value?.dataType || 'foliated');
const pinCount = computed(() => Object.keys(settings.alignmentFor(iiifKey.value)?.pins || {}).length);

const rows = computed(() => {
    const entries = report.value?.entries || [];
    if (!showUnmatchedOnly.value) return entries;
    return entries.filter(e => !e.resolvedFolio && !e.isDivider);
});

const viaLabel = { pinned: 'manual', label: 'by label', position: 'counted', skipped: 'skipped', divider: 'section marker', none: 'unresolved' };

function thumb(canvas) {
    if (!canvas) return null;
    if (canvas.serviceUrl) return `${canvas.serviceUrl}/full/100,/0/default.jpg`;
    return canvas.imgUrl || null;
}

function touch() {
    reloadKey.value++;
}

function setDataType(type) {
    settings.setSourceAlignment(iiifKey.value, { ...(settings.alignmentFor(iiifKey.value) || {}), dataType: type });
    touch();
}

// Free text rather than a dropdown: a pin should be able to target any real
// folio, not just one that already has transcription rows (the datalist below
// offers those as convenient suggestions, but typing anything else works too).
// Typing a folio pins this page to it — and every page after it counts on
// from there. Clearing the field removes the pin, handing the page back to
// automatic detection.
function onEditFolio(entry, value) {
    const trimmed = value.trim();
    if (!trimmed) settings.removeAlignmentPin(iiifKey.value, entry.canvasIndex);
    else settings.setAlignmentPin(iiifKey.value, entry.canvasIndex, trimmed);
    touch();
}

// Pulls a stray page (a color chart, a ruler shot) out of the count entirely,
// the same way a structural divider is — toggling again restores automatic
// detection.
function toggleSkip(entry) {
    if (entry.via === 'skipped') settings.removeAlignmentPin(iiifKey.value, entry.canvasIndex);
    else settings.setAlignmentPin(iiifKey.value, entry.canvasIndex, '');
    touch();
}

function resetAll() {
    settings.removeSourceAlignment(iiifKey.value);
    touch();
}

// Older workspaces may hold an offset and "jump" rules for this manuscript. They are
// still applied, so they are shown here, where a surprising page can be explained.
const legacy = computed(() => {
    const a = settings.alignmentFor(iiifKey.value);
    return a && (a.offset || (a.adjustments && a.adjustments.length))
        ? { offset: a.offset || 0, jumps: (a.adjustments || []).length }
        : null;
});

function removeLegacy() {
    settings.mergeAlignment(iiifKey.value, { offset: 0, adjustments: [] });
    touch();
}
</script>

<template>
<ModalDialog :open="true" :title="`Align pages: ${iiifKey}`" width="56rem" @close="emit('close')">
    <div class="align-modal">
        <div class="align-head">
            <div>
                <p v-if="report" class="align-sub">
                    Resolved {{ report.matched }} of {{ report.total - report.dividerCount }} pages
                    ({{ report.withDataCount }} carry transcription data)
                    <span v-if="report.dividerCount"> · {{ report.dividerCount }} skipped</span>.
                    Pages count up automatically from whatever the last confirmed page was —
                    correcting one page fixes every page after it.
                </p>
                <p v-else class="align-sub">No IIIF manifest is loaded for this source yet.</p>
            </div>
        </div>

        <div v-if="report" class="align-controls">
            <div class="control-group">
                <span class="control-label">Data folios are</span>
                <label class="radio-inline"><input type="radio" value="foliated" :checked="dataType === 'foliated'" @change="setDataType('foliated')"> foliated</label>
                <label class="radio-inline"><input type="radio" value="paginated" :checked="dataType === 'paginated'" @change="setDataType('paginated')"> paginated</label>
            </div>
            <label class="control-check"><input type="checkbox" v-model="showUnmatchedOnly"> Only unmatched</label>
            <div class="control-spacer"></div>
            <span v-if="legacy" class="pill" :title="`An older rule shifts the pages by ${legacy.offset} and has ${legacy.jumps} jump(s)`">older offset rule</span>
            <button v-if="legacy" class="ne-btn ne-btn--sm" @click="removeLegacy">Remove it</button>
            <span v-if="pinCount" class="pill">{{ pinCount }} manually set</span>
            <button class="ne-btn ne-btn--sm" @click="resetAll" :disabled="!pinCount && !legacy">Reset all</button>
        </div>

        <div v-if="report" class="align-body">
            <table class="align-table">
                <thead>
                    <tr>
                        <th></th>
                        <th>Original scan label</th>
                        <th></th>
                        <th>Data folio</th>
                        <th>Match</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="entry in rows" :key="entry.canvasIndex"
                        :class="{ unresolved: !entry.resolvedFolio && !entry.isDivider, divider: entry.isDivider }">
                        <td class="thumb-cell">
                            <img v-if="thumb(entry.canvas)" :src="thumb(entry.canvas)" loading="lazy" alt="">
                        </td>
                        <td class="label-cell code-font">
                            <span v-if="entry.via === 'divider'" class="divider-tag">section marker</span>
                            {{ entry.originalLabel }}
                        </td>
                        <td class="arrow-cell">→</td>
                        <td class="folio-cell">
                            <input
                                class="folio-input"
                                list="folio-suggestions"
                                :value="entry.resolvedFolio || ''"
                                :placeholder="entry.isDivider ? 'not a page' : '—'"
                                @change="onEditFolio(entry, $event.target.value)"
                            >
                            <button
                                class="skip-btn"
                                :class="{ active: entry.via === 'skipped' }"
                                :title="entry.via === 'skipped' ? 'Restore automatic detection' : 'Mark as not a page (exclude from the count)'"
                                @click="toggleSkip(entry)"
                            >⦸</button>
                            <span v-if="entry.resolvedFolio && hasTranscriptionData(source, entry.resolvedFolio)" class="data-dot" title="Has transcription data">●</span>
                        </td>
                        <td class="via-cell">
                            <span class="via" :class="entry.via">{{ viaLabel[entry.via] }}</span>
                            <span v-if="entry.via === 'label' || entry.via === 'position'" class="conf">{{ Math.round(entry.confidence * 100) }}%</span>
                        </td>
                    </tr>
                </tbody>
            </table>
            <datalist id="folio-suggestions">
                <option v-for="f in report.dataFolios" :key="f" :value="f" />
            </datalist>
        </div>
    </div>
</ModalDialog>
</template>

<style scoped>
.align-head { margin-bottom: var(--space-3); }
.align-sub { margin: 0; font-size: 0.88rem; color: var(--color-text-muted); max-width: 70ch; }
.align-controls {
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    padding: 0 0 var(--space-3); border-bottom: 1px solid var(--color-border);
}
.control-group { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; }
.control-label { color: var(--color-text-muted, #666); }
.radio-inline { display: inline-flex; align-items: center; gap: 3px; font-size: 0.85rem; }
.control-check { display: inline-flex; align-items: center; gap: 4px; font-size: 0.85rem; }
.control-spacer { flex: 1; }
.pill { font-size: 0.78rem; background: var(--color-border, #eee); border-radius: 10px; padding: 2px 8px; }
.align-body { overflow: auto; }
.align-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.align-table th { text-align: left; padding: 8px 6px; position: sticky; top: 0; background: var(--color-bg, #fff); border-bottom: 1px solid var(--color-border, #ddd); z-index: 1; }
.align-table td { padding: 6px; border-bottom: 1px solid var(--color-border, #f0f0f0); vertical-align: middle; }
.align-table tr.unresolved { background: rgba(220, 100, 60, 0.06); }
.align-table tr.divider { background: var(--color-surface-muted, #f4f4f5); }
.divider-tag {
    display: inline-block; font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
    background: var(--color-border, #ddd); color: var(--color-text-muted, #666); border-radius: 4px;
    padding: 1px 6px; margin-right: 8px;
}
.thumb-cell img { width: 46px; height: 46px; object-fit: cover; border-radius: 4px; display: block; background: #eee; }
.label-cell { word-break: break-all; }
.arrow-cell { color: var(--color-text-muted, #999); }
.folio-cell { display: flex; align-items: center; gap: 4px; }
.folio-input { width: 84px; padding: 3px 6px; border: 1px solid var(--color-border, #ccc); border-radius: 4px; font-family: monospace; }
.skip-btn {
    background: none; border: 1px solid var(--color-border, #ddd); border-radius: 4px; cursor: pointer;
    color: var(--color-text-muted, #999); font-size: 0.85rem; line-height: 1; padding: 3px 5px;
}
.skip-btn.active { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
.data-dot { color: #16a34a; margin-left: 2px; }
.via { font-size: 0.75rem; padding: 1px 7px; border-radius: 10px; background: var(--color-border, #eee); }
.via.pinned { background: #dbeafe; color: #1e40af; }
.via.label { background: #dcfce7; color: #166534; }
.via.position { background: #fef9c3; color: #854d0e; }
.via.skipped, .via.divider { background: transparent; color: var(--color-text-muted, #999); }
.via.none { background: #fee2e2; color: #991b1b; }
.conf { font-size: 0.72rem; color: var(--color-text-muted, #888); margin-left: 6px; }
.code-font { font-family: monospace; }
</style>

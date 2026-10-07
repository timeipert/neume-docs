<script setup>
import ModalDialog from '../ui/ModalDialog.vue';
import CitePanel from './CitePanel.vue';

/** The citation panel in a dialog: one for the whole documentation, opened from wherever a reference button is. */
defineProps({
    open: { type: Boolean, default: false },
    info: { type: Object, required: true },
    generated: { type: String, default: '' },
    target: { type: Object, default: null },
    url: { type: String, default: '' },
    pinned: { type: Function, default: null }
});
const emit = defineEmits(['close']);
</script>

<template>
<ModalDialog :open="open" title="Link and cite" width="40rem" @close="emit('close')">
    <CitePanel v-if="open" :info="info" :generated="generated" :target="target" :url="url" :pinned="pinned" />
    <template #footer>
        <button type="button" class="ne-btn" @click="emit('close')">Close</button>
    </template>
</ModalDialog>
</template>

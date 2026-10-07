import { nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';

/**
 * What an address points at is shown softly highlighted and brought into view. The pages mark
 * the thing with `data-target` (the class `is-target` is theirs to style); this finds the first one
 * once the page has what it needs (`ready`) and again whenever the address changes.
 *
 * @param {import('vue').Ref<boolean>} ready
 */
export function useHighlight(ready) {
    const route = useRoute();

    async function reveal() {
        await nextTick();
        // The table and the cards are drawn a moment after the data arrives.
        await new Promise(r => requestAnimationFrame(() => r()));
        const el = document.querySelector('[data-target="true"]');
        if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    }

    watch([ready, () => route.fullPath], ([isReady]) => { if (isReady) reveal(); }, { immediate: true });
}

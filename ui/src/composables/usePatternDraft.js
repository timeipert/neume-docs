import { computed, ref, watch } from 'vue';
import { checkCode, toggleVirga, virgaNotes, withoutVirga } from '../utils/neumaReview';
import { toneCount } from '../utils/neumeTable';

/**
 * The pattern-code field and virga toggles shared by every "change this snippet's pattern"
 * control: a draft that follows the snippet, validated as it is typed, with one-click virga
 * toggles that commit at once (the main case: "*" to "*V").
 *
 * @param {import('vue').Ref<object|null>} snippetRef the snippet currently open
 * @param {(snippet: object, code: string) => boolean} retag from `useSnippetRetag`
 */
export function usePatternDraft(snippetRef, retag) {
    const draft = ref('');
    watch(snippetRef, (s) => { draft.value = s ? s.pattern : ''; }, { immediate: true });

    const check = computed(() => checkCode(draft.value));
    const virgaCount = computed(() => (check.value.ok ? toneCount(withoutVirga(draft.value)) : 0));
    const virgaOn = computed(() => virgaNotes(draft.value));
    const changed = computed(() => !!snippetRef.value && draft.value.trim() !== snippetRef.value.pattern);

    function set() {
        if (snippetRef.value) retag(snippetRef.value, draft.value);
    }

    /** One click fixes the main case (a missed virga) at once, without going through Set. */
    function toggleVirgaNote(note) {
        if (!snippetRef.value) return;
        draft.value = toggleVirga(draft.value, note);
        retag(snippetRef.value, draft.value);
    }

    return { draft, check, virgaCount, virgaOn, changed, set, toggleVirgaNote };
}

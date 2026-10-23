import { useAnnotationsStore } from '../stores/annotations';
import { useDirectSnippetsStore } from '../stores/directSnippets';
import { validateAttribute } from '../utils/snippetAttributes';

/**
 * Changing what a snippet says about itself, wherever it lives: a screenshot (`kind: 'image'`)
 * is kept in its project's collection, a sign on a line or a page in the annotations store.
 * The one place that knows the difference, so a drawer, a review dialog or anything else that
 * edits a snippet does not have to.
 *
 * @param {() => object|null} ensureCollection a screenshot project's collection
 */
export function useSnippetEdit(ensureCollection) {
    const annotations = useAnnotationsStore();
    const direct = useDirectSnippetsStore();

    /** Merge `patch` into the snippet. @returns {boolean} whether it was saved */
    function update(snippet, patch) {
        if (!snippet) return false;
        if (snippet.kind === 'image') {
            const c = ensureCollection && ensureCollection();
            if (!c) return false;
            direct.updateSnippet(c.id, snippet.id, patch);
            return true;
        }
        annotations.updateAnnotation(snippet.source, snippet.folio, snippet.pattern, snippet.id, patch);
        return true;
    }

    /** One attribute (`def` is from the project's configuration), validated. @returns {{ ok: boolean, message?: string }} */
    function saveAttr(snippet, def, value) {
        const result = validateAttribute(def, value);
        if (!result.ok) return { ok: false, message: result.message };
        const attrs = { ...(snippet.attrs || {}), [def.key]: result.value };
        if (!result.value) delete attrs[def.key];
        update(snippet, { attrs });
        return { ok: true };
    }

    const savePaleo = (snippet, keys) => update(snippet, { paleo: keys });
    const saveFavorite = (snippet, value) => update(snippet, { favorite: value });

    return { update, saveAttr, savePaleo, saveFavorite };
}

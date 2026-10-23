import { useAnnotationsStore } from '../stores/annotations';
import { useDirectSnippetsStore } from '../stores/directSnippets';
import { useSnippetEdit } from './useSnippetEdit';
import { useToast } from './useToast';
import { checkCode } from '../utils/neumaReview';

/**
 * Re-files a snippet under a different pattern code, in place: the shared action behind every
 * "change the pattern" control, wherever a snippet is shown (a cell's drawer, the review grid).
 * The main case is a missed virga ("*" corrected to "*V"), but any code the library accepts
 * works. Shows a toast with Undo.
 *
 * @param {() => object|null} ensureCollection a screenshot project's collection (for snippets of kind 'image')
 */
export function useSnippetRetag(ensureCollection) {
    const annotations = useAnnotationsStore();
    const direct = useDirectSnippetsStore();
    const toast = useToast();
    const { update } = useSnippetEdit(ensureCollection);

    /** Moves the snippet to `code`, reading its current pattern off `snippet.pattern`. */
    function move(snippet, code) {
        if (snippet.kind === 'image') {
            const c = ensureCollection && ensureCollection();
            if (!c) return false;
            direct.addPattern(c.id, code);
            return update(snippet, { pattern: code });
        }
        return annotations.changeAnnotationPattern(snippet.source, snippet.folio, snippet.pattern, snippet.id, code);
    }

    /**
     * @param {object} snippet one entry of a project's `snippets` map (has `.pattern`, `.kind`, `.id`, …)
     * @param {string} nextCode
     * @returns {boolean} whether it applied
     */
    function retag(snippet, nextCode) {
        const next = String(nextCode || '').trim();
        if (!snippet || !checkCode(next).ok || next === snippet.pattern) return false;
        const prev = snippet.pattern;
        if (!move(snippet, next)) return false;
        toast.show(`Changed to ${next}.`, {
            tone: 'success',
            action: { label: 'Undo', run: () => move({ ...snippet, pattern: next }, prev) }
        });
        return true;
    }

    return { retag };
}

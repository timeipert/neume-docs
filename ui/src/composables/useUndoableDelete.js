import { useAnnotationsStore } from '../stores/annotations';
import { useToast } from './useToast';

/**
 * Deleting something on a manuscript page (a snippet, a line region, a manual
 * line) happens at once and can be taken back from the toast that follows. This
 * replaces asking "are you sure?" first: the question is easy to click through,
 * Undo is not.
 */
export function useUndoableDelete() {
    const annotations = useAnnotationsStore();
    const toast = useToast();

    /** Run `action`, which deletes something on this page, and offer Undo. */
    function deleteOnPage(source, folio, message, action) {
        const snapshot = annotations.snapshotPage(source, folio);
        action();
        toast.show(message, { action: { label: 'Undo', run: () => annotations.restorePage(snapshot) } });
    }

    return { deleteOnPage };
}

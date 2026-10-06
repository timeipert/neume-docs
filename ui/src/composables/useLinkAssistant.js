import { ref, computed } from 'vue';
import { useAnnotationsStore } from '../stores/annotations';
import { useTranscriptionData } from './useTranscriptionData';
import { useWorkspaceManagement } from './useWorkspaceManagement';
import { useToast } from './useToast';
import { loadOccurrences, loadNoteUuids, loadNoteOrder } from '../services/corpus/corpusStore';
import { buildLineIndex, proposeLinks, applyProposals } from '../services/exchange/linkAssistant';
import { parsePageKey } from '../services/exchange/annotationExchange';

/**
 * Linking snippets to the transcription, with the person's OK.
 *
 * The rules are in services/exchange/linkAssistant.js and are pure. This holds the
 * stores: it gathers what each manuscript needs, puts the proposals up for review,
 * and applies the ones that were ticked, after a restore point.
 */

/** The review that is open, or null: { proposals: [{ ...proposal, selected }], unresolved, notReady, totals }. */
const review = ref(null);

export function useLinkAssistant() {
    const annotations = useAnnotationsStore();
    const data = useTranscriptionData();
    const mgmt = useWorkspaceManagement();
    const toast = useToast();

    /** Manuscripts that have line regions with snippets in them. */
    const candidates = computed(() => {
        const names = new Set();
        for (const [key, list] of Object.entries(annotations.regions)) {
            const where = parsePageKey(key);
            if (!where || !data.catalog.value[where.source]) continue;
            if ((list || []).some(r => (annotations.regionItems[r.id] || []).length)) names.add(where.source);
        }
        return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    });

    /** Work out the proposals for every candidate manuscript and open the review. */
    async function find() {
        const proposals = [];
        const unresolved = [];
        const notReady = [];
        let snippets = 0;
        let linked = 0;

        for (const name of candidates.value) {
            const [occurrences, noteUuids, noteOrder] = await Promise.all([
                loadOccurrences(name), loadNoteUuids(name), loadNoteOrder(name)
            ]);
            const index = buildLineIndex(occurrences, noteUuids, noteOrder);
            if (!index.ready) { notReady.push(name); continue; }
            const record = data.catalog.value[name] || {};
            const found = proposeLinks(
                { name, lineUuids: record.lineUuids || {} },
                index,
                { regions: annotations.regions, regionItems: annotations.regionItems }
            );
            proposals.push(...found.proposals);
            unresolved.push(...found.unresolved.map(u => ({ ...u, source: name })));
            snippets += found.snippets;
            linked += found.linked;
        }

        review.value = {
            proposals: proposals.map(p => ({ ...p, selected: p.confidence !== 'low' })),
            unresolved,
            notReady,
            totals: { snippets, linked }
        };
        if (!proposals.length) {
            toast.show(notReady.length
                ? `Load ${notReady.slice(0, 3).join(', ')} from Monodi-Zero again, so that the neumes' reading order is known.`
                : (snippets && snippets === linked ? 'Every snippet is already linked.' : 'No links could be worked out.'),
                { tone: 'info' });
        }
        return review.value;
    }

    const chosen = computed(() => (review.value ? review.value.proposals.filter(p => p.selected) : []));
    const counts = computed(() => ({
        snippets: chosen.value.reduce((n, p) => n + p.links.length, 0),
        lines: chosen.value.filter(p => p.lineUuid).length
    }));

    function close() { review.value = null; }

    async function apply() {
        const picked = chosen.value;
        if (!picked.length) { close(); return false; }
        let point = null;
        try {
            point = await mgmt.createRestorePoint('Before linking snippets to the transcription', { auto: true });
        } catch (e) {
            toast.show(`${e.message}. Nothing was linked.`, { tone: 'error' });
            return false;
        }
        const out = applyProposals(picked, { regions: annotations.regions, regionItems: annotations.regionItems });
        annotations.regions = out.regions;
        annotations.regionItems = out.regionItems;
        close();
        toast.show(`Linked ${out.linkedSnippets} snippet${out.linkedSnippets === 1 ? '' : 's'} and ${out.linkedLines} line${out.linkedLines === 1 ? '' : 's'} to the transcription.`, {
            tone: 'success',
            action: {
                label: 'Undo',
                run: async () => {
                    try { await mgmt.restore(point.id); toast.show('Links undone.', { tone: 'success' }); }
                    catch (e) { toast.show(`Could not undo: ${e.message}`, { tone: 'error' }); }
                }
            }
        });
        return true;
    }

    return { review, candidates, chosen, counts, find, apply, close };
}

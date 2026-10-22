import { computed, nextTick, ref, watch } from 'vue';
import { useProjectsStore } from '../stores/projects';
import { useToast } from './useToast';
import { STANDARD_VIRGA_SET } from '../utils/neumeTable';
import { categoryOf, checkCode, columnsToShow, deselectColumn, selectColumn, suggestColumns } from '../utils/projectTable';

/**
 * Choosing the columns of the standard table, inside the table itself. The whole
 * pattern library is offered — the shapes, the codes under them with their variants,
 * a group for each special sign, clef and custos — and what the project's folios
 * already hold is shown in it. The person ticks columns, or just fills a cell: a cell
 * of a column that is not chosen yet chooses it.
 *
 * @param {ReturnType<typeof import('./useProject').useProject>} context the project
 * @param {{
 *   table: import('vue').Ref<{ reveal: (code: string) => Promise<boolean> }|null>,
 *   active: () => boolean
 * }} refs `active`: whether the standard table is the one in view (the view is reused by the extended table)
 */
export function useColumnChoice(context, { table, active }) {
    const store = useProjectsStore();
    const toast = useToast();
    const { project, library, annotatedCounts, occurringCounts, hasTranscription } = context;

    const selected = computed(() => new Set(project.value.columns));
    const expanded = ref(new Set());
    const query = ref('');

    // ---- what is shown -------------------------------------------------------

    // Every possibility is shown, whatever the project has chosen so far; the chosen ones are a view of their own.
    const view = ref('all');
    const VIEWS = computed(() => [
        { value: 'all', label: 'All', title: 'Every code of the pattern library that can be in the standard table' },
        { value: 'chosen', label: `Chosen ${project.value.columns.length}`, title: 'Only the columns of this project' },
        { value: 'snippets', label: `With snippets ${annotatedCounts.value.size}`, title: 'Codes that already have a snippet in these folios' },
        ...(hasTranscription.value ? [{ value: 'transcription', label: `In the transcription ${occurringCounts.value.size}`, title: 'Codes the transcription has in these folios' }] : [])
    ]);
    watch(VIEWS, (list) => { if (!list.some(v => v.value === view.value)) view.value = 'all'; });

    const bare = (code) => code.replace(/[[\]{}]/g, '');
    const searching = computed(() => query.value.trim().length > 0);
    const matchesQuery = (code) => {
        const q = query.value.trim();
        return !q || (/[[\]{}]/.test(q) ? code.includes(q) : bare(code).includes(q));
    };
    const matchesView = (code) => {
        if (view.value === 'chosen') return selected.value.has(code);
        if (view.value === 'snippets') return annotatedCounts.value.has(code);
        if (view.value === 'transcription') return occurringCounts.value.has(code);
        return true;
    };

    /** The groups of the standard table, each with the columns to draw. */
    const groups = computed(() => {
        // What is chosen or has snippets, and the virga variants every standard table offers.
        const keep = new Set([...project.value.columns, ...annotatedCounts.value.keys(), ...STANDARD_VIRGA_SET]);
        const out = [];
        for (const cat of library.value.categories) {
            const all = cat.columns.filter(c => c.standard);
            if (!all.length) continue;
            if (view.value !== 'all' || searching.value) {
                const columns = all.filter(c => matchesView(c.code) && matchesQuery(c.code));
                if (columns.length) out.push({ ...cat, total: columns.length, columns });
            } else {
                out.push({ ...cat, total: all.length, columns: columnsToShow({ columns: all }, { keep, expanded: expanded.value.has(cat.key), top: 5 }) });
            }
        }
        return out;
    });

    const emptyText = computed(() => {
        if (searching.value) return `No column matches “${query.value.trim()}”.`;
        return {
            chosen: 'No column is chosen yet. Choose some from All, or fill a cell.',
            snippets: 'No snippet has been drawn in these folios yet.',
            transcription: 'The transcription has nothing in these folios.'
        }[view.value] || 'Nothing here yet.';
    });

    function toggleExpanded(key) {
        const next = new Set(expanded.value);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        expanded.value = next;
    }

    // ---- choosing -------------------------------------------------------------

    /** Make a code a column, if the rules allow; says why not if they do not. */
    function choose(code) {
        const p = project.value;
        if (p.columns.includes(code)) return true;
        const result = selectColumn(p.columns, code, undefined, library.value.variantOf);
        if (!result.ok) {
            toast.show(result.reason, { tone: 'error' });
            return false;
        }
        store.setColumns(p.id, result.columns);
        return true;
    }

    function toggle(code) {
        const p = project.value;
        if (selected.value.has(code)) store.setColumns(p.id, deselectColumn(p.columns, code));
        else choose(code);
    }

    const suggestion = computed(() => suggestColumns(library.value, {
        annotated: annotatedCounts.value,
        occurring: occurringCounts.value,
        current: project.value.columns
    }));
    const suggested = computed(() => [...suggestion.value.fromAnnotations, ...suggestion.value.fromTranscription]);

    function addSuggested() {
        const p = project.value;
        const before = [...p.columns];
        const codes = suggested.value;
        store.setColumns(p.id, [...p.columns, ...codes]);
        toast.show(`${codes.length} column${codes.length === 1 ? '' : 's'} added.`, {
            action: { label: 'Undo', run: () => store.setColumns(p.id, before) }
        });
    }

    function clearColumns() {
        const p = project.value;
        if (!p.columns.length) return;
        const before = [...p.columns];
        store.setColumns(p.id, []);
        toast.show('All columns taken out.', { action: { label: 'Undo', run: () => store.setColumns(p.id, before) } });
    }

    // A project that is new starts from what its folios already hold.
    let started = false;
    watch([() => project.value && project.value.id, annotatedCounts, active], () => {
        const p = project.value;
        if (started || !p || !active()) return;
        started = true;
        if (p.columnsChosen || p.columns.length) return;
        const { fromAnnotations } = suggestColumns(library.value, { annotated: annotatedCounts.value });
        if (!fromAnnotations.length) return;
        store.update(p.id, { columns: fromAnnotations });
        toast.show(`${fromAnnotations.length} column${fromAnnotations.length === 1 ? '' : 's'} with snippets in these folios chosen to start with.`, {
            action: { label: 'Undo', run: () => store.update(p.id, { columns: [] }) }
        });
    }, { immediate: true });

    // ---- a code that is not there, a variant of one that is ---------------------

    /** What was typed is a good code the library does not have yet. */
    const unknown = computed(() => {
        const check = checkCode(query.value);
        return check.ok && !library.value.byCode.has(check.code) ? check : null;
    });

    const adding = ref(false);
    const addInitial = ref('');
    function addCode(initial = '') {
        addInitial.value = initial;
        adding.value = true;
    }

    /** A code or variant that was just made is chosen for the table, if the rules allow, and shown. */
    async function chooseNew(code) {
        await nextTick();
        if (!choose(code)) return;
        query.value = '';
        view.value = 'all';
        const cat = categoryOf(library.value.variantOf(code) || code);
        if (cat) {
            const next = new Set(expanded.value);
            next.add(cat.key);
            expanded.value = next;
        }
        await nextTick();
        table.value && table.value.reveal(code);
    }

    /** The code whose variant is being made (the variant editor is open while this is set). */
    const variantFor = ref('');

    return {
        selected, view, VIEWS, query, searching, groups, emptyText, expanded, toggleExpanded,
        choose, toggle, suggested, addSuggested, clearColumns,
        unknown, adding, addInitial, addCode, chooseNew, variantFor
    };
}

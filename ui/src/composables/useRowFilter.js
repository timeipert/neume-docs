import { computed } from 'vue';
import {
    describeRule, filterRows, ruleCount, ruleProblem, rowsForFacet, withRule, emptyFilter
} from '../utils/manuscriptFilter';

/**
 * A filter over a table of rows and columns, wherever they come from: the manuscripts table of the
 * editor, or the manuscripts of a documentation somebody opened. It knows nothing of settings or
 * storage; the pages say what the rows are, what a cell says, and how each column is filtered.
 *
 * @param {object} p
 * @param {import('vue').Ref<object>} p.filter   the filter that is set (a ref, so the page decides how long it lives)
 * @param {import('vue').Ref<string[]>} p.ids    the rows
 * @param {import('vue').Ref<Array<{ key: string, label: string }>>} p.columns  the columns that can be filtered
 * @param {(id: string, col: object) => string} p.cell
 * @param {(col: object, cells: string[]) => { kind: string, offered: boolean }} p.configOf  how a column is filtered, from its cells
 */
export function useRowFilter({ filter, ids, columns, cell, configOf }) {
    /** The text of every cell of every column, so a filter reads each cell once. */
    const texts = computed(() => {
        const out = new Map();
        for (const col of columns.value) out.set(col.key, ids.value.map(id => String(cell(id, col) ?? '')));
        return out;
    });
    const rowIndex = computed(() => new Map(ids.value.map((id, i) => [id, i])));

    function textOf(id, key) {
        const column = texts.value.get(key);
        const i = rowIndex.value.get(id);
        return column && i !== undefined ? column[i] : '';
    }

    function configFor(col) {
        const cells = texts.value.get(col.key) || [];
        const distinct = new Set(cells.map(c => c.trim().toLowerCase()).filter(Boolean)).size;
        return { distinct, ...configOf(col, cells) };
    }

    /** The columns the panel lists: those offered, and any that has a rule set even if it is not. */
    const facets = computed(() => columns.value
        .map(col => ({ col, ...configFor(col), rule: filter.value.rules[col.key] || null }))
        .filter(f => f.offered || f.rule));

    const active = computed(() => ruleCount(filter.value) > 0);
    const matching = computed(() => filterRows(filter.value, ids.value, textOf));

    function setRule(key, rule) { filter.value = withRule(filter.value, key, rule); }
    function setMode(mode) { filter.value = { ...filter.value, mode: mode === 'any' ? 'any' : 'all' }; }
    function clear() { filter.value = emptyFilter(); }
    const rowsFor = (key) => rowsForFacet(filter.value, ids.value, textOf, key);

    /** Keep the rows whose cell in a column says what this text says (or, with `not`, drop them). */
    function onlyValue(col, text, not = false) {
        const t = String(text ?? '').trim();
        setRule(col.key, t ? { kind: 'values', values: [t], not } : { kind: 'values', values: [], empty: true, not });
    }

    /** One line for each rule: for the chips above the table. */
    const chips = computed(() => Object.entries(filter.value.rules).map(([key, rule]) => {
        const col = columns.value.find(c => c.key === key);
        return { key, label: col ? col.label : key, text: describeRule(rule), problem: ruleProblem(rule) };
    }));

    return { filter, active, matching, chips, facets, filterable: columns, textOf, rowsFor, configFor, setRule, setMode, clear, onlyValue };
}

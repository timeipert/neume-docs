import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

/**
 * What the user has changed about the metadata the corpus brought with it.
 *
 * The corpus itself is never edited: the catalogue it was imported with stays as
 * it was. An edit is stored here as an override of one field of one manuscript,
 * and the value shown is the override if there is one, else the corpus's value.
 * Putting a field back to the corpus's value removes its override, so what is
 * stored is exactly what differs.
 *
 *   overrides: { [source]: { [field]: text } }     '' is an override too: it blanks the field
 *   hiddenColumns: [columnKey]                      which columns the metadata table hides
 *   widths: { [columnKey]: pixels }
 */
export const useManuscriptMetaStore = defineStore('manuscriptMeta', () => {
    const overrides = ref({})
    const hiddenColumns = ref(null) // null = not chosen yet: the table shows its default columns
    const widths = ref({})

    const STORAGE_KEY = 'manuscriptMeta_v1'

    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
        try {
            hydrate(JSON.parse(stored))
        } catch (e) {
            console.error('Error loading manuscript metadata', e)
        }
    }

    watch([overrides, hiddenColumns, widths], () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize()))
    }, { deep: true })

    function has(source, field) {
        const o = overrides.value[source]
        return !!o && Object.prototype.hasOwnProperty.call(o, field)
    }

    function get(source, field) {
        return has(source, field) ? overrides.value[source][field] : undefined
    }

    /**
     * Set a field. Passing the corpus's own value (`base`) removes the override.
     * @returns {string|undefined} the override that was there before
     */
    function set(source, field, value, base = '') {
        const before = get(source, field)
        const text = value === null || value === undefined ? '' : String(value)
        if (text === String(base ?? '')) {
            revert(source, field)
        } else {
            overrides.value = {
                ...overrides.value,
                [source]: { ...(overrides.value[source] || {}), [field]: text }
            }
        }
        return before
    }

    function revert(source, field) {
        if (!has(source, field)) return
        const { [field]: _gone, ...rest } = overrides.value[source]
        const next = { ...overrides.value }
        if (Object.keys(rest).length) next[source] = rest
        else delete next[source]
        overrides.value = next
    }

    function revertColumn(field) {
        const next = {}
        for (const [source, fields] of Object.entries(overrides.value)) {
            const { [field]: _gone, ...rest } = fields
            if (Object.keys(rest).length) next[source] = rest
        }
        overrides.value = next
    }

    function editedCount() {
        return Object.values(overrides.value).reduce((n, f) => n + Object.keys(f).length, 0)
    }

    function setHidden(list) { hiddenColumns.value = [...list] }
    function setWidth(key, px) { widths.value = { ...widths.value, [key]: Math.round(px) } }

    function serialize() {
        return { overrides: overrides.value, hiddenColumns: hiddenColumns.value, widths: widths.value }
    }

    /** Take on someone else's overrides without losing ours: theirs win only where both have a value. */
    function mergeIn(payload) {
        if (!payload || !payload.overrides) return
        const next = { ...overrides.value }
        for (const [source, fields] of Object.entries(payload.overrides)) {
            next[source] = { ...(next[source] || {}), ...fields }
        }
        overrides.value = next
    }

    function hydrate(payload) {
        if (!payload) return
        if (payload.overrides && typeof payload.overrides === 'object') overrides.value = payload.overrides
        if (Array.isArray(payload.hiddenColumns) || payload.hiddenColumns === null) hiddenColumns.value = payload.hiddenColumns
        if (payload.widths && typeof payload.widths === 'object') widths.value = payload.widths
    }

    return {
        overrides, hiddenColumns, widths,
        has, get, set, revert, revertColumn, editedCount,
        setHidden, setWidth, serialize, hydrate, mergeIn
    }
})

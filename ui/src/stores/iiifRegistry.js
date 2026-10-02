import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

/**
 * The user's own table of IIIF resources: which manifest (or image address) belongs
 * to which manuscript. A manuscript may have several; the one that is *in use* is
 * the iiif store's link. Entries come from the user, or from suggestions taken
 * from the MMMO catalogue (`origin: 'mmmo'`, with the catalogue id kept so the
 * source can be shown).
 *
 *   entries: [{ id, siglum, url, kind: 'manifest'|'images', label, note, origin: 'own'|'mmmo', mmmoId?, addedAt }]
 */
export const useIiifRegistryStore = defineStore('iiifRegistry', () => {
    const entries = ref([])
    // Suggestions the user turned down, so they do not come back: { [siglum]: [mmmoId, ...] }
    const dismissed = ref({})

    const STORAGE_KEY = 'iiifRegistry_v1'
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
        try {
            const data = JSON.parse(stored)
            if (Array.isArray(data.entries)) entries.value = data.entries
            if (data.dismissed && typeof data.dismissed === 'object') dismissed.value = data.dismissed
        } catch (e) {
            console.error('Error loading the IIIF table', e)
        }
    }

    watch([entries, dismissed], () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries: entries.value, dismissed: dismissed.value }))
    }, { deep: true })

    let counter = 0
    const newId = () => `iiif_${Date.now().toString(36)}_${(counter++).toString(36)}`

    const clean = (v) => String(v ?? '').trim()

    /** Same manuscript and same address: one row, however often it is added. */
    function find(siglum, url) {
        return entries.value.find(e => e.siglum === clean(siglum) && e.url === clean(url)) || null
    }

    /** @returns {object|null} the new entry, or the existing one; null if siglum or address is missing */
    function add({ siglum, url, kind = 'manifest', label = '', note = '', origin = 'own', mmmoId = null }) {
        const s = clean(siglum)
        const u = clean(url)
        if (!s || !u) return null
        const existing = find(s, u)
        if (existing) return existing
        const entry = {
            id: newId(), siglum: s, url: u, kind: kind === 'images' ? 'images' : 'manifest',
            label: clean(label), note: clean(note), origin, ...(mmmoId ? { mmmoId } : {}), addedAt: new Date().toISOString()
        }
        entries.value = [...entries.value, entry]
        return entry
    }

    function update(id, patch) {
        entries.value = entries.value.map(e => (e.id === id ? { ...e, ...patch } : e))
    }

    function remove(id) {
        entries.value = entries.value.filter(e => e.id !== id)
    }

    function forSiglum(siglum) {
        return entries.value.filter(e => e.siglum === siglum)
    }

    function dismiss(siglum, mmmoId) {
        const list = dismissed.value[siglum] || []
        if (!list.includes(mmmoId)) dismissed.value = { ...dismissed.value, [siglum]: [...list, mmmoId] }
    }

    function undismiss(siglum, mmmoId) {
        const list = (dismissed.value[siglum] || []).filter(id => id !== mmmoId)
        const next = { ...dismissed.value }
        if (list.length) next[siglum] = list
        else delete next[siglum]
        dismissed.value = next
    }

    function isDismissed(siglum, mmmoId) {
        return (dismissed.value[siglum] || []).includes(mmmoId)
    }

    function clear() {
        entries.value = []
        dismissed.value = {}
    }

    function serialize() {
        return { entries: entries.value, dismissed: dismissed.value }
    }

    function hydrate(payload) {
        if (!payload) return
        if (Array.isArray(payload.entries)) entries.value = payload.entries
        if (payload.dismissed && typeof payload.dismissed === 'object') dismissed.value = payload.dismissed
    }

    /** Take on someone else's entries without losing ours. */
    function mergeIn(payload) {
        if (!payload || !Array.isArray(payload.entries)) return
        for (const e of payload.entries) add(e)
    }

    return { entries, dismissed, add, update, remove, find, forSiglum, dismiss, undismiss, isDismissed, clear, serialize, hydrate, mergeIn }
})

import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { legacyDrafts } from '../utils/projectLegacy'
import { getBaseCode } from '../utils/patternCode'

export const FOCUS = ['transcription', 'manuscript']
export const IMAGES = ['iiif', 'screenshots']
export const SNIPPETS = ['lines', 'signs']

/**
 * A project: a range of folios in one manuscript — one hand, say — and the
 * table that documents its neumes.
 *
 *   id, name, scribe, notes
 *   source            the manuscript (a source of the loaded corpus, or free text)
 *   from, to          the folio range ('' is open at that end)
 *   focus             'transcription'  the corpus is the starting point: its neumes say where to look
 *                     'manuscript'     the images are, there may be no transcription at all
 *   images            'iiif'           page images from a manifest
 *                     'screenshots'    images pasted in, kept in a custom collection
 *   snippets          'lines'          line regions first, then the signs on them
 *                     'signs'          the signs alone
 *   columns           the standard table: codes chosen for it
 *   extended          the codes added beyond it
 *   collectionId      the custom collection holding the screenshots
 *   published         shown in the public views (see utils/projectPublishing)
 *   columnsChosen     the person has been through "choose columns" (or the project came from an existing table)
 *   legacyKey         what it was made from ('table:Aa 13'), so it is made once
 *   createdAt, updatedAt
 *
 * Snippets are not stored here: they stay keyed by manuscript and folio (or in the
 * collection), so a project is a way of looking at them, never a copy.
 */
export const useProjectsStore = defineStore('projects', () => {
    const projects = ref([])
    // Old work the person chose not to have as a project (their legacy keys).
    const dismissed = ref([])
    const lastOpenedId = ref('')

    let counter = 0
    const newId = () => `p_${Date.now().toString(36)}_${(counter++).toString(36)}`
    const text = (v) => String(v ?? '').trim()
    const oneOf = (v, list) => (list.includes(v) ? v : list[0])
    const codes = (list) => [...new Set((Array.isArray(list) ? list : []).map(getBaseCode).filter(Boolean))]

    function normalise(p) {
        const now = new Date().toISOString()
        const columns = codes(p.columns)
        return {
            id: p.id || newId(),
            name: text(p.name),
            scribe: text(p.scribe),
            notes: text(p.notes),
            source: text(p.source),
            from: text(p.from),
            to: text(p.to),
            focus: oneOf(p.focus, FOCUS),
            images: oneOf(p.images, IMAGES),
            snippets: oneOf(p.snippets, SNIPPETS),
            columns,
            extended: codes(p.extended).filter(c => !columns.includes(c)),
            collectionId: text(p.collectionId),
            published: !!p.published,
            columnsChosen: !!p.columnsChosen,
            legacyKey: text(p.legacyKey),
            createdAt: p.createdAt || now,
            updatedAt: p.updatedAt || now
        }
    }

    const STORAGE_KEY = 'projects_v1'
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
        try {
            const data = JSON.parse(stored)
            if (Array.isArray(data.projects)) projects.value = data.projects.map(normalise)
            if (Array.isArray(data.dismissed)) dismissed.value = data.dismissed
            if (typeof data.lastOpenedId === 'string') lastOpenedId.value = data.lastOpenedId
        } catch (e) {
            console.error('Error loading the projects', e)
        }
    }

    watch([projects, dismissed, lastOpenedId], () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            projects: projects.value, dismissed: dismissed.value, lastOpenedId: lastOpenedId.value
        }))
    }, { deep: true })

    function get(id) {
        return projects.value.find(p => p.id === id) || null
    }

    /** @returns {object} the new project */
    function create(fields) {
        const project = normalise({ ...fields, id: undefined, createdAt: undefined, updatedAt: undefined })
        if (!project.name) project.name = project.source || 'Project'
        projects.value = [...projects.value, project]
        return project
    }

    function update(id, patch) {
        projects.value = projects.value.map(p => (p.id === id
            ? normalise({ ...p, ...patch, id: p.id, createdAt: p.createdAt, updatedAt: new Date().toISOString() })
            : p))
        return get(id)
    }

    /** @returns {object|null} the removed project, to put back with `restore` */
    function remove(id) {
        const project = get(id)
        if (!project) return null
        projects.value = projects.value.filter(p => p.id !== id)
        if (project.legacyKey && !dismissed.value.includes(project.legacyKey)) {
            dismissed.value = [...dismissed.value, project.legacyKey]
        }
        if (lastOpenedId.value === id) lastOpenedId.value = ''
        return project
    }

    function restore(project) {
        if (!project || get(project.id)) return
        projects.value = [...projects.value, normalise(project)]
        dismissed.value = dismissed.value.filter(k => k !== project.legacyKey)
    }

    function setColumns(id, columns) {
        return update(id, { columns, columnsChosen: true })
    }

    function setExtended(id, extended) {
        return update(id, { extended })
    }

    function markOpened(id) {
        if (get(id)) lastOpenedId.value = id
    }

    /**
     * Make projects of the work that exists without one: each neume table, each
     * custom collection. Safe to call again — what was adopted once is not adopted
     * twice, and what was deleted stays deleted.
     *
     * @returns {number} how many projects were made
     */
    function adoptLegacy({ tables = [], collections = [], corpusSources = new Set() } = {}) {
        const drafts = legacyDrafts({
            tables, collections, projects: projects.value, dismissed: dismissed.value, corpusSources
        })
        for (const draft of drafts) create(draft)
        return drafts.length
    }

    /**
     * Take on projects from a file: one that has the same id is replaced, the others are added.
     * Projects of the manuscripts in `skipSources` (the ones the person chose not to import) are left out.
     *
     * @returns {number} how many were taken
     */
    function mergeIn(payload, { skipSources = [] } = {}) {
        if (!payload || !Array.isArray(payload.projects)) return 0
        let taken = 0
        for (const raw of payload.projects) {
            if (!raw || skipSources.includes(raw.source)) continue
            const incoming = normalise(raw)
            projects.value = projects.value.some(p => p.id === incoming.id)
                ? projects.value.map(p => (p.id === incoming.id ? incoming : p))
                : [...projects.value, incoming]
            taken++
        }
        return taken
    }

    function clear() {
        projects.value = []
        dismissed.value = []
        lastOpenedId.value = ''
    }

    function serialize() {
        return { projects: projects.value, dismissed: dismissed.value }
    }

    function hydrate(payload) {
        if (!payload) return
        if (Array.isArray(payload.projects)) projects.value = payload.projects.map(normalise)
        if (Array.isArray(payload.dismissed)) dismissed.value = payload.dismissed
        if (lastOpenedId.value && !get(lastOpenedId.value)) lastOpenedId.value = ''
    }

    return {
        projects, dismissed, lastOpenedId,
        get, create, update, remove, restore, setColumns, setExtended, markOpened,
        adoptLegacy, clear, serialize, hydrate, mergeIn
    }
})

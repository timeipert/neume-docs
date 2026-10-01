import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const usePersonalTablesStore = defineStore('personalTables', () => {
    const tables = ref([])
    const starredItems = ref(new Set()) // "source|folio|pattern|id"

    // Load from local storage
    const stored = localStorage.getItem('personalTables')
    if (stored) {
        try {
            const data = JSON.parse(stored)
            tables.value = data.tables || data // handle legacy
            if (data.starredItems) starredItems.value = new Set(data.starredItems)
        } catch (e) {
            console.error("Failed to parse local storage", e)
        }
    }

    // Sync to local storage
    watch([tables, starredItems], () => {
        const data = {
            tables: tables.value,
            starredItems: Array.from(starredItems.value)
        }
        localStorage.setItem('personalTables', JSON.stringify(data))
    }, { deep: true })

    function toggleStarred(id) {
        if (starredItems.value.has(id)) {
            starredItems.value.delete(id)
        } else {
            starredItems.value.add(id)
        }
        starredItems.value = new Set(starredItems.value) // trigger reactivity
    }

    function createTable(name) {
        const id = Date.now().toString()
        tables.value.push({
            id,
            name,
            source: '',
            notes: '',
            patterns: [], // List of strings (pattern names)
            rows: [] // List of { pattern: "...", customId: "..." }
        })
        return id
    }

    function getTable(id) {
        return tables.value.find(t => t.id === id)
    }

    function updateTable(id, updates) {
        const idx = tables.value.findIndex(t => t.id === id)
        if (idx !== -1) {
            tables.value[idx] = { ...tables.value[idx], ...updates }
        }
    }

    function deleteTable(id) {
        const idx = tables.value.findIndex(t => t.id === id)
        if (idx !== -1) {
            tables.value.splice(idx, 1)
        }
    }

    function getOrCreateTableForSource(sourceName) {
        const existing = tables.value.find(t => t.source === sourceName)
        if (existing) return existing.id

        const id = createTable(sourceName) // Use source name as table name
        updateTable(id, { source: sourceName })
        return id
    }

    function ensurePatternsInTable(sourceName, patternList) {
        if (!sourceName || !Array.isArray(patternList) || !patternList.length) return null;
        const tableId = getOrCreateTableForSource(sourceName);
        const table = getTable(tableId);
        if (!table) return tableId;

        const existingPats = new Set(table.rows.map(r => r.pattern));
        let added = false;
        for (const pat of patternList) {
            if (pat && !existingPats.has(pat)) {
                table.rows.push({ pattern: pat, customId: pat });
                if (!table.patterns.includes(pat)) table.patterns.push(pat);
                existingPats.add(pat);
                added = true;
            }
        }
        if (added) {
            updateTable(tableId, { rows: [...table.rows], patterns: [...table.patterns] });
        }
        return tableId;
    }

    /**
     * Rows of a manuscript's table. A row is `{ pattern, customId, notes, tier? }`;
     * `tier` is 'standard' or 'expanded' (see utils/neumeTable) and is absent on
     * rows made before the neume table existed, which then get their default.
     */
    function rowsFor(sourceName) {
        const table = tables.value.find(t => t.source === sourceName)
        return table ? table.rows : []
    }

    /** Add a pattern to a manuscript's table, or update its tier if it is already there. */
    function addRow(sourceName, pattern, { tier, customId = '' } = {}) {
        if (!sourceName || !pattern) return null
        const id = getOrCreateTableForSource(sourceName)
        const table = getTable(id)
        const existing = table.rows.find(r => r.pattern === pattern)
        if (existing) {
            if (tier) existing.tier = tier
        } else {
            table.rows.push({ pattern, customId, notes: '', ...(tier ? { tier } : {}) })
            if (!table.patterns.includes(pattern)) table.patterns.push(pattern)
        }
        updateTable(id, { rows: [...table.rows], patterns: [...table.patterns] })
        return id
    }

    function removeRow(sourceName, pattern) {
        const table = tables.value.find(t => t.source === sourceName)
        if (!table) return false
        const rows = table.rows.filter(r => r.pattern !== pattern)
        if (rows.length === table.rows.length) return false
        updateTable(table.id, { rows, patterns: table.patterns.filter(p => p !== pattern) })
        return true
    }

    function updateRow(sourceName, pattern, patch) {
        const table = tables.value.find(t => t.source === sourceName)
        if (!table) return
        const rows = table.rows.map(r => r.pattern === pattern ? { ...r, ...patch } : r)
        updateTable(table.id, { rows })
    }

    function deleteTableForSource(sourceName) {
        const idx = tables.value.findIndex(t => t.source === sourceName);
        if (idx !== -1) {
            tables.value.splice(idx, 1);
            return true;
        }
        return false;
    }

    function clearTableRowsForSource(sourceName) {
        const table = tables.value.find(t => t.source === sourceName);
        if (table) {
            table.rows = [];
            table.patterns = [];
            updateTable(table.id, { rows: [], patterns: [] });
            return true;
        }
        return false;
    }

    return { 
        tables, 
        starredItems, 
        toggleStarred, 
        createTable, 
        getTable, 
        updateTable, 
        deleteTable, 
        deleteTableForSource,
        clearTableRowsForSource,
        getOrCreateTableForSource,
        ensurePatternsInTable,
        rowsFor,
        addRow,
        removeRow,
        updateRow
    }
})

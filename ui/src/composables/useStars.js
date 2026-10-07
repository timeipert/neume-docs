import { computed, ref, watch } from 'vue';

/**
 * The snippets a reader has starred in a documentation, to come back to or to cite together.
 * They stay in this browser (per documentation) and are never sent anywhere.
 * A star is "<manuscript>|<snippet>".
 */
export function starKey(entryId, snippetId) {
    return `${entryId}|${snippetId}`;
}

export function useStars(idRef) {
    const storageKey = computed(() => `neume-docs.stars.${idRef.value}`);
    const set = ref(new Set());

    function read() {
        try {
            const list = JSON.parse(localStorage.getItem(storageKey.value) || '[]');
            set.value = new Set(Array.isArray(list) ? list.filter(k => typeof k === 'string') : []);
        } catch { set.value = new Set(); }
    }
    function write() {
        try {
            if (set.value.size) localStorage.setItem(storageKey.value, JSON.stringify([...set.value]));
            else localStorage.removeItem(storageKey.value);
        } catch { /* private window: the stars last until the page is closed */ }
    }
    watch(storageKey, read, { immediate: true });

    const has = (entryId, snippetId) => set.value.has(starKey(entryId, snippetId));
    function toggle(entryId, snippetId) {
        const next = new Set(set.value);
        const key = starKey(entryId, snippetId);
        if (next.has(key)) next.delete(key); else next.add(key);
        set.value = next;
        write();
    }
    function remove(keys) {
        const next = new Set(set.value);
        for (const k of keys) next.delete(k);
        set.value = next;
        write();
    }
    function clear() { set.value = new Set(); write(); }

    /** [{ entry, snippet, key }] */
    const list = computed(() => [...set.value].map(key => {
        const i = key.indexOf('|');
        return { key, entry: key.slice(0, i), snippet: key.slice(i + 1) };
    }));

    return { has, toggle, remove, clear, list, count: computed(() => set.value.size), keys: set };
}

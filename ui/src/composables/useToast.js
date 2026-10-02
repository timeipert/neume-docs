import { ref } from 'vue';

/**
 * Short messages that confirm what just happened ("Deleted 412 snippets"),
 * optionally with one action ("Undo"). The single place feedback is shown, so
 * every page confirms things the same way instead of using alert() or a banner
 * of its own.
 */
const toasts = ref([]);
let nextId = 1;
const timers = new Map();

function dismiss(id) {
    clearTimeout(timers.get(id));
    timers.delete(id);
    toasts.value = toasts.value.filter(t => t.id !== id);
}

/**
 * @param {string} message
 * @param {{ tone?: 'info'|'success'|'error', action?: { label: string, run: Function }, timeout?: number }} [options]
 *   `timeout` in ms; 0 keeps it until dismissed. Errors stay longer by default.
 */
function show(message, { tone = 'info', action = null, timeout } = {}) {
    const id = nextId++;
    toasts.value = [...toasts.value, { id, message, tone, action }];
    const ms = timeout ?? (tone === 'error' ? 12000 : action ? 12000 : 5000);
    if (ms > 0) timers.set(id, setTimeout(() => dismiss(id), ms));
    return id;
}

export function useToast() {
    return { toasts, show, dismiss };
}

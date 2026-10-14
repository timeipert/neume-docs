import { computed, onScopeDispose, ref, unref, watch } from 'vue';

/** Addresses that failed in this session: a later picture asks for them last, not first. */
const failedAddresses = new Set();
const MOST_REMEMBERED = 2000;

/** Forget which addresses failed (a new server, or a test). */
export function forgetFailedImages() {
    failedAddresses.clear();
}

/**
 * Show one picture out of several addresses: the first, and when it fails the next, down the list.
 * A picture that is not there in the end is tried once more after a pause (a server that was busy),
 * and one that does not answer at all is given up after a while instead of showing a spinner for ever.
 *
 * An address that failed is remembered for the session — if another address of the list then worked, which shows that
 * it was the address and not a busy server — and tried last by the next picture asking for the same part (a server
 * that refuses to enlarge refuses it for every small snippet alike, so it is not asked again first).
 *
 * Give `failed` the event of the picture (so that a late message about an address that was
 * given up on does not count), `loaded` when it is there.
 *
 * @param {import('vue').Ref<string[]>|string[]} candidates addresses, best first; a new list starts again
 * @param {{ enabled?: import('vue').Ref<boolean>|boolean, timeout?: number, passes?: number, pause?: number }} [options]
 *   `enabled`: nothing is asked for while false (a picture that is not in view yet);
 *   `timeout`: ms to wait for one address; `passes`: how often the whole list is gone through; `pause`: ms between passes
 * @returns {{ url: import('vue').ComputedRef<string>, index: import('vue').Ref<number>, status: import('vue').Ref<'loading'|'loaded'|'error'>,
 *   loaded: Function, failed: Function, retry: Function }}
 */
export function useImageFallback(candidates, { enabled = true, timeout = 25000, passes = 2, pause = 1500 } = {}) {
    const list = computed(() => {
        const all = [...new Set((unref(candidates) || []).filter(Boolean))];
        // what failed before goes to the end (still tried: a busy server may answer now)
        return [...all.filter(u => !failedAddresses.has(u)), ...all.filter(u => failedAddresses.has(u))];
    });
    const key = computed(() => list.value.join('\n'));
    const index = ref(0);
    const pass = ref(1);
    const status = ref('loading');
    let timer = null;
    /** the addresses that failed in this go, until one of the others has worked */
    const pending = new Set();

    const clear = () => { clearTimeout(timer); timer = null; };
    const url = computed(() => (unref(enabled) && list.value.length ? list.value[Math.min(index.value, list.value.length - 1)] : ''));

    function arm() {
        clear();
        if (url.value && timeout > 0) timer = setTimeout(() => failed(), timeout);
    }

    /** From the first address again. */
    function retry() {
        clear();
        pending.clear();
        index.value = 0;
        pass.value = 1;
        if (!unref(enabled)) { status.value = 'loading'; return; }
        status.value = list.value.length ? 'loading' : 'error';
        arm();
    }

    function failed(event) {
        // an event for an address that is no longer the one asked for
        const target = event && event.target;
        if (target && target.getAttribute) {
            const was = target.getAttribute('href') ?? target.getAttribute('src');
            if (was && was !== url.value) return;
        }
        clear();
        if (!url.value) return;
        pending.add(url.value);
        if (index.value + 1 < list.value.length) {
            index.value++;
            status.value = 'loading';
            arm();
        } else if (pass.value < passes) {
            status.value = 'loading';
            timer = setTimeout(() => { pass.value++; index.value = 0; arm(); }, pause);
        } else {
            status.value = 'error';
        }
    }

    function loaded() {
        clear();
        status.value = 'loaded';
        // one address worked where others did not: those others are the ones to be wary of
        if (pending.size && !pending.has(url.value)) {
            if (failedAddresses.size + pending.size > MOST_REMEMBERED) failedAddresses.clear();
            for (const address of pending) failedAddresses.add(address);
        }
        pending.clear();
    }

    watch([key, () => unref(enabled)], retry, { immediate: true });
    onScopeDispose(clear);

    return { url, index, status, loaded, failed, retry };
}

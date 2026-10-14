import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { forgetFailedImages, useImageFallback } from './useImageFallback';

/** What a picture's error event looks like, for the address it was asked for. */
const event = (src) => ({ target: { getAttribute: (name) => (name === 'href' || name === 'src' ? src : null) } });

function make(candidates, options) {
    const scope = effectScope();
    const result = scope.run(() => useImageFallback(candidates, options));
    return { ...result, stop: () => scope.stop() };
}

describe('showing a picture from a list of addresses', () => {
    beforeEach(() => { vi.useFakeTimers(); forgetFailedImages(); });
    afterEach(() => { vi.useRealTimers(); });

    it('asks for the first address, and is done when it loads', () => {
        const f = make(ref(['a', 'b']));
        expect(f.url.value).toBe('a');
        expect(f.status.value).toBe('loading');
        f.loaded();
        expect(f.status.value).toBe('loaded');
        expect(f.url.value).toBe('a');
        f.stop();
    });

    it('goes down the list when an address fails', () => {
        const f = make(ref(['a', 'b', 'c']));
        f.failed(event('a'));
        expect(f.url.value).toBe('b');
        f.failed(event('b'));
        expect(f.url.value).toBe('c');
        expect(f.status.value).toBe('loading');
        f.loaded();
        expect(f.status.value).toBe('loaded');
        f.stop();
    });

    it('tries the whole list once more after a pause, and then gives up', () => {
        const f = make(ref(['a', 'b']), { pause: 1000, passes: 2, timeout: 0 });
        f.failed(event('a'));
        f.failed(event('b'));
        expect(f.status.value).toBe('loading');
        vi.advanceTimersByTime(1000);
        expect(f.url.value).toBe('a');
        f.failed(event('a'));
        f.failed(event('b'));
        expect(f.status.value).toBe('error');
        f.stop();
    });

    it('can be told to go through the list only once', () => {
        const f = make(ref(['a']), { passes: 1, timeout: 0 });
        f.failed(event('a'));
        expect(f.status.value).toBe('error');
        f.stop();
    });

    it('gives up on an address that does not answer', () => {
        const f = make(ref(['a', 'b']), { timeout: 5000 });
        vi.advanceTimersByTime(5000);
        expect(f.url.value).toBe('b');
        f.loaded();
        vi.advanceTimersByTime(60000);
        expect(f.status.value).toBe('loaded');
        f.stop();
    });

    it('does not count a message about an address it has left behind', () => {
        const f = make(ref(['a', 'b', 'c']), { timeout: 0 });
        f.failed(event('a'));
        f.failed(event('a')); // late, again, for the address that was already given up
        expect(f.url.value).toBe('b');
        f.stop();
    });

    it('has no address to show while it is not asked to (a picture out of view)', async () => {
        const enabled = ref(false);
        const f = make(ref(['a']), { enabled });
        expect(f.url.value).toBe('');
        enabled.value = true;
        await nextTick();
        expect(f.url.value).toBe('a');
        f.stop();
    });

    it('starts again from the first address when the list changes, and ignores a list that only repeats itself', async () => {
        const list = ref(['a', 'b']);
        const f = make(list, { timeout: 0 });
        f.failed(event('a'));
        expect(f.url.value).toBe('b');
        list.value = ['a', 'b'];
        await nextTick();
        expect(f.url.value).toBe('b');
        list.value = ['x', 'y'];
        await nextTick();
        expect(f.url.value).toBe('x');
        expect(f.status.value).toBe('loading');
        f.stop();
    });

    it('says error when there is nothing to ask for, and recovers when something comes', async () => {
        const list = ref([]);
        const f = make(list);
        expect(f.status.value).toBe('error');
        list.value = ['a'];
        await nextTick();
        expect(f.status.value).toBe('loading');
        expect(f.url.value).toBe('a');
        f.stop();
    });

    it('asks last for an address that failed where another worked, for the next picture', () => {
        const first = make(ref(['a', 'b', 'c']), { timeout: 0 });
        first.failed(event('a'));
        first.loaded(); // b worked: a is the one to be wary of
        first.stop();
        const next = make(ref(['a', 'b', 'c']), { timeout: 0 });
        expect(next.url.value).toBe('b');
        next.failed(event('b'));
        expect(next.url.value).toBe('c');
        next.failed(event('c'));
        expect(next.url.value).toBe('a'); // still tried, as the last resort
        next.stop();
    });

    it('does not hold it against an address that failed once and then worked (a busy server)', () => {
        const first = make(ref(['a', 'b']), { timeout: 0, pause: 100 });
        first.failed(event('a'));
        first.failed(event('b'));
        vi.advanceTimersByTime(100);
        expect(first.url.value).toBe('a');
        first.loaded(); // a worked the second time
        first.stop();
        expect(make(ref(['a', 'b']), { timeout: 0 }).url.value).toBe('a');
    });

    it('does not remember anything when nothing worked', () => {
        const first = make(ref(['a', 'b']), { timeout: 0, passes: 1 });
        first.failed(event('a'));
        first.failed(event('b'));
        first.stop();
        expect(make(ref(['a', 'b']), { timeout: 0 }).url.value).toBe('a');
    });

    it('lists an address once', () => {
        const f = make(ref(['a', 'a', 'b']), { timeout: 0 });
        f.failed(event('a'));
        expect(f.url.value).toBe('b');
        f.stop();
    });
});

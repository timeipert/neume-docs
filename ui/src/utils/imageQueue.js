/**
 * A few pictures at a time from one server.
 *
 * A comparison table shows hundreds of cut-outs of the same library at once. Libraries such as
 * Gallica answer that many requests with errors, or block the reader for a while, and a picture
 * that failed stays empty. So each picture waits for its turn: at most `LIMIT` are being fetched
 * from one server at any moment, the others queue up in the order they asked.
 *
 * A picture asks with `waitTurn(url)` and must call the `release` it gets when it is done
 * (loaded, or given up); a picture from the same origin as the page needs no turn.
 */

export const LIMIT = 4;

const active = new Map(); // host -> number of pictures being fetched
const waiting = new Map(); // host -> resolvers, in order

function hostOf(url, base = (typeof location !== 'undefined' ? location.href : 'http://localhost/')) {
    try {
        const u = new URL(url, base);
        return u.origin === new URL(base).origin ? '' : u.host;
    } catch {
        return '';
    }
}

/**
 * @param {string} url the address that is going to be asked for
 * @returns {Promise<() => void>} resolves when it may be asked for; call the result when done (more than once is harmless)
 */
export function waitTurn(url, { limit = LIMIT, base } = {}) {
    const host = hostOf(url, base);
    if (!host) return Promise.resolve(() => {});
    return new Promise((resolve) => {
        const start = () => {
            active.set(host, (active.get(host) || 0) + 1);
            let released = false;
            resolve(() => {
                if (released) return;
                released = true;
                active.set(host, active.get(host) - 1);
                const next = (waiting.get(host) || []).shift();
                if (next) next();
            });
        };
        if ((active.get(host) || 0) < limit) start();
        else {
            if (!waiting.has(host)) waiting.set(host, []);
            waiting.get(host).push(start);
        }
    });
}

/** For tests: forget everything. */
export function resetQueue() {
    active.clear();
    waiting.clear();
}

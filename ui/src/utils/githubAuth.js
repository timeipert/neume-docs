/**
 * Logging in with a GitHub App, as the person: the browser sends them to GitHub, GitHub sends them
 * back with a one-time `code`, and a small proxy (auth-proxy/) trades that code for a token, because
 * the trade needs the app's secret and the browser must never have it. Everything here is plain
 * functions: the time, the random numbers, the storage and the network are handed in, so none of it
 * needs a browser to be tested.
 */

const AUTHORIZE = 'https://github.com/login/oauth/authorize';
const PENDING_KEY = 'githubLoginPending';
// A little before the token really ends, so a request never starts with one that dies on the way.
const EXPIRY_MARGIN_MS = 60 * 1000;

const base64url = (bytes) => {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** The two halves of PKCE: a secret only this browser knows, and its fingerprint that GitHub is given. */
export async function createPkce(cryptoApi = globalThis.crypto) {
    const verifier = base64url(cryptoApi.getRandomValues(new Uint8Array(32)));
    const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

export const randomState = (cryptoApi = globalThis.crypto) => base64url(cryptoApi.getRandomValues(new Uint8Array(16)));

export function authorizeUrl({ clientId, redirectUri, state, challenge }) {
    const q = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256'
    });
    return `${AUTHORIZE}?${q}`;
}

/** The address GitHub sends the person back to: this page, without the part after `#`. */
export const callbackUrl = (location = globalThis.location) => `${location.origin}${location.pathname}`;

/**
 * Remembers what the return needs (the PKCE secret, the state, where the person was) for the
 * short time they are away. Session storage: it ends with the tab and is never sent anywhere.
 *
 * @returns {Promise<string>} the address to go to
 */
export async function beginLogin({ clientId, redirectUri, returnHash = '', storage = globalThis.sessionStorage, cryptoApi = globalThis.crypto }) {
    const { verifier, challenge } = await createPkce(cryptoApi);
    const state = randomState(cryptoApi);
    storage.setItem(PENDING_KEY, JSON.stringify({ state, verifier, redirectUri, returnHash }));
    return authorizeUrl({ clientId, redirectUri, state, challenge });
}

/**
 * Reads what GitHub sent back. Returns null when this page was not opened by a login.
 *
 * @returns {null | { error: string } | { code: string, verifier: string, redirectUri: string, returnHash: string }}
 */
export function takeCallback(search, storage = globalThis.sessionStorage) {
    const q = new URLSearchParams(search);
    if (!q.has('code') && !q.has('error')) return null;
    let pending = null;
    try { pending = JSON.parse(storage.getItem(PENDING_KEY) || 'null'); } catch { /* a damaged entry counts as none */ }
    try { storage.removeItem(PENDING_KEY); } catch { /* nothing to remove */ }
    if (!pending || !q.get('state') || q.get('state') !== pending.state) {
        // Not a login this tab began (or a forged return): the code is not used.
        return { error: 'The sign-in did not start here, so it was ignored. Please try again.' };
    }
    if (q.has('error')) {
        return { error: q.get('error') === 'access_denied' ? 'Signing in was cancelled.' : (q.get('error_description') || q.get('error')) };
    }
    return { code: q.get('code'), verifier: pending.verifier, redirectUri: pending.redirectUri, returnHash: pending.returnHash || '' };
}

/** GitHub's answer, as the app keeps it. Throws with GitHub's own words when it is a refusal. */
export function readTokenResponse(json, now = Date.now()) {
    if (!json || json.error || !json.access_token) {
        throw new Error(json?.error_description || json?.error || 'GitHub did not give a token.');
    }
    return {
        accessToken: json.access_token,
        refreshToken: json.refresh_token || '',
        // An app whose tokens do not expire has no expires_in; the token then lasts until it is revoked.
        expiresAt: json.expires_in ? now + Number(json.expires_in) * 1000 : 0
    };
}

async function callProxy(proxyUrl, route, body, fetchFn, now) {
    const res = await fetchFn(`${proxyUrl.replace(/\/+$/, '')}/${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    let json = null;
    try { json = await res.json(); } catch { /* handled below */ }
    if (!res.ok && !json?.error) throw new Error(`The sign-in service answered ${res.status}.`);
    return readTokenResponse(json, now());
}

export const exchangeCode = ({ proxyUrl, code, verifier, redirectUri, fetchFn = globalThis.fetch.bind(globalThis), now = Date.now }) =>
    callProxy(proxyUrl, 'token', { code, code_verifier: verifier, redirect_uri: redirectUri }, fetchFn, now);

export const refreshToken = ({ proxyUrl, refresh, fetchFn = globalThis.fetch.bind(globalThis), now = Date.now }) =>
    callProxy(proxyUrl, 'refresh', { refresh_token: refresh }, fetchFn, now);

/** Whether a token is still good (one that never expires has no end). */
export const isFresh = (session, now = Date.now()) =>
    !!session?.accessToken && (!session.expiresAt || session.expiresAt - EXPIRY_MARGIN_MS > now);

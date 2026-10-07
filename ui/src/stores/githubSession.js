import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { beginLogin, callbackUrl, exchangeCode, isFresh, refreshToken, takeCallback } from '../utils/githubAuth';
import { getUser } from '../utils/githubApi';

/**
 * Who is signed in to GitHub, and where their work is saved to.
 *
 * Deliberately a store of its own and not part of the settings: everything in the settings travels in
 * backups, restore points and the files that are put in a repository, and a token must never do that.
 * The token is kept for its few hours in this browser; the key to renew it lives only as long as the tab.
 */

const LS_KEY = 'githubSession';
const SS_REFRESH = 'githubRefresh';

const env = import.meta.env || {};
export const githubConfig = {
    clientId: env.VITE_GITHUB_CLIENT_ID || '',
    proxyUrl: env.VITE_AUTH_PROXY_URL || '',
    // Where the app can be installed on a repository (https://github.com/apps/<name>); optional
    appUrl: env.VITE_GITHUB_APP_URL || ''
};

function readJson(storage, key) {
    try { return JSON.parse(storage.getItem(key) || 'null') || {}; } catch { return {}; }
}

export const useGithubSessionStore = defineStore('githubSession', () => {
    const saved = readJson(localStorage, LS_KEY);
    const accessToken = ref(saved.accessToken || '');
    const expiresAt = ref(saved.expiresAt || 0);
    const login = ref(saved.login || '');
    const repo = ref(saved.repo || '');
    const branch = ref(saved.branch || '');
    const folder = ref(saved.folder || '');
    let refresh = '';
    try { refresh = sessionStorage.getItem(SS_REFRESH) || ''; } catch { /* blocked storage: sign in again after the token ends */ }

    const configured = computed(() => !!(githubConfig.clientId && githubConfig.proxyUrl));
    // Signed in while there is a token, or a way to get a new one.
    const signedIn = computed(() => isFresh({ accessToken: accessToken.value, expiresAt: expiresAt.value }) || !!(accessToken.value && refresh));

    function persist() {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify({
                accessToken: accessToken.value, expiresAt: expiresAt.value, login: login.value,
                repo: repo.value, branch: branch.value, folder: folder.value
            }));
        } catch { /* storage full or blocked: the sign-in lasts until the page is closed */ }
    }

    function setSession(session) {
        accessToken.value = session.accessToken;
        expiresAt.value = session.expiresAt;
        refresh = session.refreshToken || '';
        try {
            if (refresh) sessionStorage.setItem(SS_REFRESH, refresh); else sessionStorage.removeItem(SS_REFRESH);
        } catch { /* see above */ }
        persist();
    }

    function setTarget({ repo: r = repo.value, branch: b = branch.value, folder: f = folder.value }) {
        repo.value = r; branch.value = b; folder.value = f;
        persist();
    }

    function signOut() {
        accessToken.value = ''; expiresAt.value = 0; login.value = ''; refresh = '';
        try { sessionStorage.removeItem(SS_REFRESH); } catch { /* nothing to remove */ }
        persist();
    }

    /** A token that works now, renewed first if it ran out. Signs out when it cannot be renewed. */
    async function token({ fetchFn } = {}) {
        if (isFresh({ accessToken: accessToken.value, expiresAt: expiresAt.value })) return accessToken.value;
        if (!refresh) { signOut(); throw new Error('The GitHub sign-in has ended. Please sign in again.'); }
        try {
            setSession(await refreshToken({ proxyUrl: githubConfig.proxyUrl, refresh, fetchFn }));
        } catch (e) {
            signOut();
            throw new Error(`The GitHub sign-in could not be renewed (${e.message}). Please sign in again.`);
        }
        return accessToken.value;
    }

    async function startLogin() {
        window.location.assign(await beginLogin({
            clientId: githubConfig.clientId,
            redirectUri: callbackUrl(),
            returnHash: window.location.hash
        }));
    }

    /**
     * If this page was opened by GitHub sending the person back, finish the sign-in. The address is
     * cleaned first so that the code is never left in the address bar or the history.
     * @returns {Promise<null | { ok: true, login: string, returnHash: string } | { ok: false, message: string, returnHash: string }>}
     */
    async function completeLogin({ search = window.location.search, fetchFn } = {}) {
        const back = takeCallback(search);
        if (!back) return null;
        window.history.replaceState(null, '', window.location.pathname);
        const returnHash = back.returnHash || '';
        if (back.error) return { ok: false, message: back.error, returnHash };
        try {
            setSession(await exchangeCode({ proxyUrl: githubConfig.proxyUrl, code: back.code, verifier: back.verifier, redirectUri: back.redirectUri, fetchFn }));
            login.value = (await getUser({ token: accessToken.value, fetchFn })).login;
            persist();
            return { ok: true, login: login.value, returnHash };
        } catch (e) {
            signOut();
            return { ok: false, message: e.message || 'Signing in failed.', returnHash };
        }
    }

    return { accessToken, login, repo, branch, folder, configured, signedIn, setTarget, signOut, token, startLogin, completeLogin };
});

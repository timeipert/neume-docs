import { describe, it, expect, beforeEach } from 'vitest';
import { freshStores, fillStores } from '../utils/workspaceTestKit';
import { captureWorkspace } from '../utils/workspaceSnapshot';
import { useGithubSessionStore } from './githubSession';

const memorySession = () => {
    const m = new Map();
    globalThis.sessionStorage = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
    return m;
};

describe('the GitHub sign-in', () => {
    beforeEach(() => { memorySession(); });

    it('never ends up in what is backed up, restored or published', async () => {
        const stores = await freshStores();
        fillStores(stores);
        const gh = useGithubSessionStore();
        gh.setTarget({ repo: 'me/private-notes', branch: 'main' });
        gh.$patch({});
        // a token as the sign-in would leave it
        const raw = JSON.stringify({ accessToken: 'ghu_SECRET_TOKEN' });
        localStorage.setItem('githubSession', raw);
        const snapshot = JSON.stringify(captureWorkspace({ ...stores, projects: stores.projects }));
        expect(snapshot).not.toMatch(/ghu_SECRET_TOKEN/);
        expect(snapshot).not.toMatch(/private-notes/);
        expect(snapshot).not.toMatch(/github/i);
    });

    it('keeps the renewal key for the tab only, and the token for its hours', async () => {
        await freshStores();
        const gh = useGithubSessionStore();
        const fetchFn = async () => ({ ok: true, status: 200, json: async () => ({ access_token: 'new', refresh_token: 'r2', expires_in: 28800 }) });
        // a token that ran out, with a key to renew it
        sessionStorage.setItem('githubRefresh', 'r1');
        localStorage.setItem('githubSession', JSON.stringify({ accessToken: 'old', expiresAt: 1 }));
        const { setActivePinia, createPinia } = await import('pinia');
        setActivePinia(createPinia());
        const again = useGithubSessionStore();
        expect(again.signedIn).toBe(true);
        expect(await again.token({ fetchFn })).toBe('new');
        expect(sessionStorage.getItem('githubRefresh')).toBe('r2');
        expect(JSON.parse(localStorage.getItem('githubSession')).accessToken).toBe('new');
        expect(localStorage.getItem('githubSession')).not.toMatch(/r2/);
        expect(gh).toBeTruthy();
    });

    it('signs out when the token ended and cannot be renewed', async () => {
        await freshStores();
        localStorage.setItem('githubSession', JSON.stringify({ accessToken: 'old', expiresAt: 1, login: 'me' }));
        const { setActivePinia, createPinia } = await import('pinia');
        setActivePinia(createPinia());
        const gh = useGithubSessionStore();
        await expect(gh.token()).rejects.toThrow(/sign in again/i);
        expect(gh.signedIn).toBe(false);
        expect(JSON.parse(localStorage.getItem('githubSession')).accessToken).toBe('');
    });
});

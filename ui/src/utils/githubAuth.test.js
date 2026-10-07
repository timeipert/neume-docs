import { describe, it, expect } from 'vitest';
import {
    createPkce, authorizeUrl, beginLogin, takeCallback, readTokenResponse, exchangeCode, refreshToken, isFresh
} from './githubAuth';

const memoryStorage = () => {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
};
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const reply = (body, ok = true, status = 200) => async () => ({ ok, status, json: async () => body });

describe('PKCE', () => {
    it('the challenge is the SHA-256 of the verifier, in base64url', async () => {
        const { verifier, challenge } = await createPkce();
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
        expect(challenge).toBe(b64url(new Uint8Array(digest)));
        expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('is different every time', async () => {
        expect((await createPkce()).verifier).not.toBe((await createPkce()).verifier);
    });
});

describe('the way to GitHub and back', () => {
    it('builds the address GitHub is sent to', () => {
        const url = new URL(authorizeUrl({ clientId: 'Iv1.abc', redirectUri: 'https://x.org/', state: 's1', challenge: 'c1' }));
        expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
        expect(Object.fromEntries(url.searchParams)).toEqual({
            client_id: 'Iv1.abc', redirect_uri: 'https://x.org/', state: 's1', code_challenge: 'c1', code_challenge_method: 'S256'
        });
    });

    it('accepts a return that carries the state it started with, once', async () => {
        const storage = memoryStorage();
        const url = new URL(await beginLogin({ clientId: 'id', redirectUri: 'https://x.org/', returnHash: '#/workspace', storage }));
        const state = url.searchParams.get('state');
        const back = takeCallback(`?code=abc&state=${state}`, storage);
        expect(back).toMatchObject({ code: 'abc', redirectUri: 'https://x.org/', returnHash: '#/workspace' });
        expect(back.verifier).toBeTruthy();
        // used up: the same return again is refused
        expect(takeCallback(`?code=abc&state=${state}`, storage).error).toBeTruthy();
    });

    it('refuses a return with another state, or one this tab never began', async () => {
        const storage = memoryStorage();
        await beginLogin({ clientId: 'id', redirectUri: 'https://x.org/', storage });
        expect(takeCallback('?code=abc&state=forged', storage).error).toMatch(/ignored/);
        expect(takeCallback('?code=abc&state=forged', memoryStorage()).error).toMatch(/ignored/);
    });

    it('says plainly when the person said no', async () => {
        const storage = memoryStorage();
        const state = new URL(await beginLogin({ clientId: 'id', redirectUri: 'https://x.org/', storage })).searchParams.get('state');
        expect(takeCallback(`?error=access_denied&state=${state}`, storage).error).toMatch(/cancelled/);
    });

    it('is not a sign-in when there is no code', () => {
        expect(takeCallback('', memoryStorage())).toBeNull();
        expect(takeCallback('?page=2', memoryStorage())).toBeNull();
    });
});

describe('tokens', () => {
    it('reads GitHub\'s answer with the end of the token', () => {
        expect(readTokenResponse({ access_token: 't', refresh_token: 'r', expires_in: 28800 }, 1000))
            .toEqual({ accessToken: 't', refreshToken: 'r', expiresAt: 1000 + 28800 * 1000 });
        expect(readTokenResponse({ access_token: 't' }).expiresAt).toBe(0);
    });

    it('turns a refusal into an error in GitHub\'s words', () => {
        expect(() => readTokenResponse({ error: 'bad_verification_code', error_description: 'The code passed is incorrect or expired.' })).toThrow(/incorrect or expired/);
        expect(() => readTokenResponse({})).toThrow();
    });

    it('trades the code through the helper, never straight with GitHub', async () => {
        const seen = [];
        const fetchFn = async (url, init) => { seen.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 10 }) }; };
        const s = await exchangeCode({ proxyUrl: 'https://helper.example/', code: 'c', verifier: 'v', redirectUri: 'https://x.org/', fetchFn, now: () => 0 });
        expect(s.accessToken).toBe('t');
        expect(seen).toEqual([{ url: 'https://helper.example/token', body: { code: 'c', code_verifier: 'v', redirect_uri: 'https://x.org/' } }]);
        expect(JSON.stringify(seen)).not.toMatch(/secret/i);
    });

    it('renews through the helper', async () => {
        const seen = [];
        const fetchFn = async (url, init) => { seen.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => ({ access_token: 't2', refresh_token: 'r2', expires_in: 10 }) }; };
        const s = await refreshToken({ proxyUrl: 'https://helper.example', refresh: 'r1', fetchFn, now: () => 0 });
        expect(s).toMatchObject({ accessToken: 't2', refreshToken: 'r2' });
        expect(seen[0]).toEqual({ url: 'https://helper.example/refresh', body: { refresh_token: 'r1' } });
    });

    it('reports a helper that fails without a message', async () => {
        await expect(exchangeCode({ proxyUrl: 'https://h', code: 'c', verifier: 'v', redirectUri: 'r', fetchFn: async () => ({ ok: false, status: 502, json: async () => { throw new Error('x'); } }) }))
            .rejects.toThrow(/502/);
    });

    it('knows when a token is still good, with a margin', () => {
        expect(isFresh({ accessToken: 't', expiresAt: 0 }, 5)).toBe(true);
        expect(isFresh({ accessToken: 't', expiresAt: 100_000 }, 0)).toBe(true);
        expect(isFresh({ accessToken: 't', expiresAt: 100_000 }, 50_000)).toBe(false);
        expect(isFresh({ accessToken: '', expiresAt: 0 })).toBe(false);
    });
});

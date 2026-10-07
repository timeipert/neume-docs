import { describe, it, expect } from 'vitest';
import { handle } from '../../../auth-proxy/worker.js';

const env = { GITHUB_CLIENT_ID: 'cid', GITHUB_CLIENT_SECRET: 'sek', ALLOWED_ORIGINS: 'https://site.example, http://localhost:5173' };
const ask = (path, body, { origin = 'https://site.example', method = 'POST' } = {}) =>
    new Request(`https://helper.example${path}`, { method, headers: { ...(origin ? { Origin: origin } : {}), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const githubSays = (answer, seen = []) => async (url, init) => { seen.push({ url, form: Object.fromEntries(init.body) }); return { json: async () => answer }; };

describe('the sign-in helper', () => {
    it('adds the secret to a code exchange and hands GitHub\'s answer on', async () => {
        const seen = [];
        const res = await handle(ask('/token', { code: 'c', code_verifier: 'v', redirect_uri: 'https://site.example/' }), env, githubSays({ access_token: 't' }, seen));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ access_token: 't' });
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://site.example');
        expect(seen[0].url).toBe('https://github.com/login/oauth/access_token');
        expect(seen[0].form).toEqual({ client_id: 'cid', client_secret: 'sek', code: 'c', code_verifier: 'v', redirect_uri: 'https://site.example/' });
    });

    it('renews a token', async () => {
        const seen = [];
        const res = await handle(ask('/refresh', { refresh_token: 'r' }), env, githubSays({ access_token: 't2' }, seen));
        expect(res.status).toBe(200);
        expect(seen[0].form).toEqual({ client_id: 'cid', client_secret: 'sek', grant_type: 'refresh_token', refresh_token: 'r' });
    });

    it('does not answer a page that is not allowed, nor a request without an origin', async () => {
        for (const origin of ['https://evil.example', '']) {
            const res = await handle(ask('/token', { code: 'c', code_verifier: 'v', redirect_uri: 'https://site.example/' }, { origin }), env, githubSays({}));
            expect(res.status).toBe(403);
            expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
        }
    });

    it('does not send the person anywhere else', async () => {
        const res = await handle(ask('/token', { code: 'c', code_verifier: 'v', redirect_uri: 'https://evil.example/' }), env, githubSays({}));
        expect(res.status).toBe(400);
        const bad = await handle(ask('/token', { code: 'c', code_verifier: 'v', redirect_uri: 'not an address' }), env, githubSays({}));
        expect(bad.status).toBe(400);
    });

    it('passes GitHub\'s refusal on as an error', async () => {
        const res = await handle(ask('/token', { code: 'c', code_verifier: 'v', redirect_uri: 'https://site.example/' }), env, githubSays({ error: 'bad_verification_code' }));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('bad_verification_code');
    });

    it('answers the browser\'s question before a POST', async () => {
        const res = await handle(ask('/token', undefined, { method: 'OPTIONS' }), env, githubSays({}));
        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Methods')).toMatch(/POST/);
    });

    it('knows only two routes, and wants a plain body', async () => {
        expect((await handle(ask('/other', {}), env, githubSays({}))).status).toBe(404);
        expect((await handle(ask('/token', { code: 5 }), env, githubSays({}))).status).toBe(400);
        expect((await handle(ask('/token', undefined, { method: 'GET' }), env, githubSays({}))).status).toBe(405);
    });
});

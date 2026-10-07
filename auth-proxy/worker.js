/**
 * The sign-in helper of neume-docs: a Cloudflare Worker that trades what the browser has for a GitHub
 * token. GitHub wants the app's client secret for that, and a secret cannot live in a web page.
 *
 *   POST /token    { code, code_verifier, redirect_uri }  ->  GitHub's token answer
 *   POST /refresh  { refresh_token }                      ->  GitHub's token answer
 *
 * It keeps nothing, logs nothing and answers only pages on the allowed origins.
 *
 * Settings (see README.md): secrets GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET, variable ALLOWED_ORIGINS
 * (comma-separated, e.g. "https://neumedocs.monodi.app,http://localhost:5173").
 */

const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const MAX_FIELD = 2048;

const originsOf = (env) => String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

function json(body, status, origin) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {})
        }
    });
}

const field = (body, key) => (typeof body?.[key] === 'string' && body[key] && body[key].length <= MAX_FIELD ? body[key] : '');

export async function handle(request, env, fetchFn = fetch) {
    const origin = request.headers.get('Origin') || '';
    const allowed = originsOf(env);
    // Not a page of ours: no answer that a browser would hand on.
    if (!origin || !allowed.includes(origin)) return json({ error: 'forbidden', error_description: 'This origin is not allowed.' }, 403, '');

    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400',
                Vary: 'Origin'
            }
        });
    }
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);

    const route = new URL(request.url).pathname.replace(/\/+$/, '');
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad_request', error_description: 'The body is not JSON.' }, 400, origin); }

    const form = { client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET };
    if (route === '/token') {
        const code = field(body, 'code');
        const verifier = field(body, 'code_verifier');
        const redirect = field(body, 'redirect_uri');
        if (!code || !verifier || !redirect) return json({ error: 'bad_request', error_description: 'code, code_verifier and redirect_uri are needed.' }, 400, origin);
        // The way back must lead to a page of ours.
        let redirectOrigin = '';
        try { redirectOrigin = new URL(redirect).origin; } catch { /* not an address */ }
        if (!allowed.includes(redirectOrigin)) return json({ error: 'bad_request', error_description: 'redirect_uri is not allowed.' }, 400, origin);
        Object.assign(form, { code, code_verifier: verifier, redirect_uri: redirect });
    } else if (route === '/refresh') {
        const refresh = field(body, 'refresh_token');
        if (!refresh) return json({ error: 'bad_request', error_description: 'refresh_token is needed.' }, 400, origin);
        Object.assign(form, { grant_type: 'refresh_token', refresh_token: refresh });
    } else {
        return json({ error: 'not_found' }, 404, origin);
    }

    const upstream = await fetchFn(TOKEN_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(form)
    });
    // GitHub answers 200 even for a refusal, with `error` in the body; that is handed on as it is.
    let answer;
    try { answer = await upstream.json(); } catch { answer = { error: 'bad_gateway', error_description: 'GitHub did not answer in the expected way.' }; }
    return json(answer, answer.error ? 400 : 200, origin);
}

export default { fetch: (request, env) => handle(request, env) };

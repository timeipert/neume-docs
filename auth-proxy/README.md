# Sign-in helper

neume-docs can save to a GitHub repository as the person who is signed in. GitHub needs the app's
secret to hand out a token, and a web page cannot keep a secret, so this tiny Cloudflare Worker does
that one step. It keeps nothing, logs nothing, and answers only the pages in `ALLOWED_ORIGINS`.

After signing in, the browser talks to `api.github.com` itself; the helper is used only to trade the
sign-in code for a token and to renew a token that ran out (every 8 hours).

## Setting it up (once, about an hour)

1. **Register a GitHub App** (GitHub → Settings → Developer settings → GitHub Apps → New):
   - *Callback URL*: `https://neumedocs.monodi.app/` and, for development, `http://localhost:5173/`
   - *Expire user authorization tokens*: on
   - *Request user authorization (OAuth) during installation*: off
   - *Webhook*: off
   - *Repository permissions → Contents*: Read and write (nothing else)
   - *Where can this app be installed*: Only on this account — or Any account, if others sign in with their own repositories
   - Make a **client secret** and note the **Client ID**.
2. **Deploy the helper** (needs a free Cloudflare account):
   ```bash
   cd auth-proxy
   npx wrangler secret put GITHUB_CLIENT_ID
   npx wrangler secret put GITHUB_CLIENT_SECRET
   npx wrangler deploy
   ```
   Edit `ALLOWED_ORIGINS` in `wrangler.toml` first if the site is at another address. Wrangler prints the
   helper's address, like `https://neume-docs-auth.<you>.workers.dev`.
3. **Tell the app** about both. In the repository's *Settings → Secrets and variables → Actions → Variables*:
   - `VITE_GITHUB_CLIENT_ID` — the Client ID (public)
   - `VITE_AUTH_PROXY_URL` — the helper's address

   For development, put the same two lines in `ui/.env.local` (see `ui/.env.example`).
4. **Install the app on the repository** people will save to (the app's page → Install App). Only
   repositories it is installed on can be chosen in the editor, and only if the person signed in may write there.

## Testing it

```bash
npx wrangler dev
# a request from a page that is not allowed gets no answer a browser would hand on:
curl -i -X POST localhost:8787/token -H 'Origin: https://evil.example' -d '{}'
# a bad code from an allowed page returns GitHub's own error:
curl -i -X POST localhost:8787/token -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json' \
  -d '{"code":"x","code_verifier":"y","redirect_uri":"http://localhost:5173/"}'
```

## If the secret leaks

Make a new client secret on the app's page, run `npx wrangler secret put GITHUB_CLIENT_SECRET`, delete the old one.
Nobody can get a person's token with the secret alone: the sign-in code and the PKCE secret of that person's browser are needed too.

## Moving it

`worker.js` uses only `fetch`, `Request` and `Response`. It runs unchanged on other hosts that support them
(Netlify Edge, Vercel Edge, Deno Deploy); only the `export default` line differs.

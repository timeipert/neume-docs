/**
 * Lets the app's development server (and `vite preview`) serve the catalogue's data to the review tool
 * and keep its decisions on disk — on this computer only. It is not part of a build. The published site
 * has no server: there the tool reads the same files from `hung/` (see `src/publish.mjs`) and keeps the
 * decisions in the browser.
 *
 *   GET  /neuma-data/<path>      the files of ./data (catalogue.json, snippets.json, snippets/…, documentation/…)
 *   POST /neuma-data/decisions   merge decisions into data/decisions.json: { set: { id: { code, status, note } }, remove: [id] }
 *   POST /neuma-data/export      write data/documentation/ (the folder the viewer and GitHub read): ?include=reviewed|proposed
 *
 * The two POSTs need the header `X-Neuma-Import: 1`, which a page on another site cannot send without
 * asking first (and nothing here answers such a question), so no other page can write into the files.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeDocumentation } from './src/export.mjs';
import { STATUSES, cleanDecision, mergeDecisions } from './src/decisions.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MOUNT = '/neuma-data';

const TYPES = { '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.html': 'text/html; charset=utf-8' };
const READABLE = [/^catalogue\.json$/, /^snippets\.json$/, /^decisions\.json$/, /^problems\.json$/, /^snippets\/[\w.-]+\/[\w.-]+\.png$/, /^raw\/composite\/[\w.-]+\.png$/, /^documentation\/.+/];
export { STATUSES, cleanDecision, mergeDecisions };
const MAX_BODY = 8 * 1024 * 1024;

function writeAtomic(path, text) {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.part`;
    writeFileSync(tmp, text);
    renameSync(tmp, path);
}

function readBody(req) {
    return new Promise((resolveBody, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', c => {
            size += c.length;
            if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
            chunks.push(c);
        });
        req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
    res.statusCode = status;
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'no-store');
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

/**
 * A middleware for connect (what Vite uses).
 * @param {{ dir?: string, glyphsFile?: string }} [options]
 */
export function neumaMiddleware({ dir = join(HERE, 'data'), glyphsFile = '' } = {}) {
    const root = resolve(dir);
    const decisionsFile = join(root, 'decisions.json');
    const readDecisions = () => (existsSync(decisionsFile) ? JSON.parse(readFileSync(decisionsFile, 'utf8')) : { version: 1, decisions: {} });

    return async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        // connect strips the mount path, so what is left is the file
        const path = decodeURIComponent(url.pathname).replace(/^\/+/, '');

        try {
            if (req.method === 'POST') {
                if (req.headers['x-neuma-import'] !== '1') return send(res, 403, { error: 'missing header' });
                if (path === 'decisions') {
                    const change = JSON.parse(await readBody(req) || '{}');
                    const merged = mergeDecisions(readDecisions(), change);
                    writeAtomic(decisionsFile, JSON.stringify(merged));
                    return send(res, 200, { saved: Object.keys(merged.decisions).length });
                }
                if (path === 'export') {
                    const include = url.searchParams.get('include') === 'proposed' ? 'proposed' : 'reviewed';
                    const result = await writeDocumentation({ dir: root, out: join(root, 'documentation'), include, glyphsFile });
                    return send(res, 200, result);
                }
                return send(res, 404, { error: 'not found' });
            }

            if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method not allowed' });
            if (!path || !READABLE.some(re => re.test(path))) return send(res, 404, { error: 'not found' });
            // nothing decided yet is an empty file, not an error
            if (path === 'decisions.json' && !existsSync(decisionsFile)) return send(res, 200, { version: 1, decisions: {} });
            const file = normalize(join(root, path));
            if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, { error: 'not found' });
            res.statusCode = 200;
            res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
            res.setHeader('Cache-Control', 'no-store');
            if (req.method === 'HEAD') return res.end();
            createReadStream(file).pipe(res);
        } catch (e) {
            send(res, e.status || 500, { error: e.message });
        }
    };
}

/** The Vite plugin: serves and keeps the data while `vite` or `vite preview` runs. */
export function neumaData(options = {}) {
    const glyphsFile = options.glyphsFile
        ?? (() => { const f = join(HERE, '..', 'ui', 'src', 'data', 'glyphs.js'); return existsSync(f) ? pathToFileURL(f).href : ''; })();
    const middleware = neumaMiddleware({ ...options, glyphsFile });
    return {
        name: 'neuma-data',
        configureServer(server) { server.middlewares.use(MOUNT, middleware); },
        configurePreviewServer(server) { server.middlewares.use(MOUNT, middleware); }
    };
}

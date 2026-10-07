/**
 * A documentation: what somebody has published about the neumes of some manuscripts, as plain
 * files that can sit in a GitHub repository (or on any web server) and be read — never changed —
 * by anyone who opens the viewer.
 *
 *   neume-docs.json        the index: who made it, which metadata columns there are and which of
 *                          them may be filtered, the list of manuscripts with their metadata
 *   data/<manuscript>.json one file per manuscript: its pattern table and its snippets
 *   images/…               pictures of snippets, if they are kept as files
 *
 * An endpoint is a place such a documentation is read from. The hosting of the app lists the
 * endpoints it offers (`endpoints.json`, next to the app); a person can also open any public
 * GitHub repository by its address, `gh:owner/repo`.
 *
 * Everything here is plain functions over plain data. What is read from a repository is untrusted:
 * it is cleaned here before anything draws it, and paths and addresses that lead anywhere but
 * where a documentation may point are dropped.
 */
import { FILTER_KINDS } from './manuscriptFilter';

export const FORMAT = 'neume-docs';
export const VERSION = 1;
export const INDEX_FILE = 'neume-docs.json';
/** The documentation made from this browser's own work, for looking at it before it is published. */
export const LOCAL_ID = 'local';

const MAX_MANUSCRIPTS = 5000;
const MAX_ROWS = 5000;
const MAX_SNIPPETS = 30000;
const COLUMN_TYPES = ['text', 'century', 'location', 'number'];
const KINDS = ['iiif', 'collection'];
const TIERS = ['standard', 'expanded'];

const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = 300) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');

// ---- addresses and paths ------------------------------------------------------------------------

/** An address that may be linked to or used for a picture: http(s) only. */
export function safeHttpUrl(value) {
    try {
        const u = new URL(String(value));
        return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
    } catch { return ''; }
}

/** A path inside a documentation: relative, without `..`, no scheme, no backslash. */
export function safeRelativePath(value) {
    const p = String(value ?? '').trim();
    if (!p || p.length > 300 || p.startsWith('/') || /[\\\u0000-\u001f]/.test(p)) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return '';
    if (p.split('/').some(seg => seg === '..' || seg === '')) return '';
    return p;
}

/**
 * What may stand for a picture: a file of the documentation, an https address (a IIIF crop), or a
 * small inline image. Anything else is no picture.
 */
export function cleanImageRef(value) {
    const v = String(value ?? '').trim();
    if (!v) return '';
    if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(v)) return v;
    if (/^https?:/i.test(v)) return safeHttpUrl(v);
    return safeRelativePath(v);
}

/** A path of the glyph of a sign: only what a path may hold, since it is written into an image. */
const GLYPH_PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]*$/;
const GLYPH_BOX = /^[-\d.\s]+$/;

function cleanSigns(raw) {
    const out = {};
    if (!plain(raw)) return out;
    for (const [key, g] of Object.entries(raw)) {
        if (!/^[A-Z]$/.test(key) || !plain(g)) continue;
        const d = typeof g.d === 'string' ? g.d : '';
        const viewBox = typeof g.viewBox === 'string' ? g.viewBox : '';
        if (d && d.length <= 20000 && GLYPH_PATH.test(d) && GLYPH_BOX.test(viewBox) && viewBox.length <= 80) {
            out[key] = { viewBox: viewBox.trim(), d, label: text(g.label, 80), abbrev: text(g.abbrev, 12) };
        }
    }
    return out;
}

// ---- endpoints ----------------------------------------------------------------------------------

const GH_ID = /^gh:([\w.-]+)\/([\w.-]+)(?:@([^:]+))?(?::(.+))?$/;

/**
 * An endpoint from its id, if the id says everything: `gh:owner/repo`, `gh:owner/repo@branch`,
 * `gh:owner/repo@branch:folder`, or `url:https://host/folder/`. Ids of the hosting's own list say
 * nothing by themselves.
 */
export function endpointFromId(id) {
    const s = String(id ?? '');
    if (isCombineId(s)) {
        const parts = combinedParts(s);
        return parts.length ? { id: s, kind: 'combine', parts, name: `${parts.length} documentations together`, description: '', custom: true } : null;
    }
    const gh = s.match(GH_ID);
    if (gh) {
        const path = gh[4] ? gh[4].split('/').filter(Boolean).join('/') : '';
        if (path && !safeRelativePath(path)) return null;
        return {
            id: s, kind: 'github', owner: gh[1], repo: gh[2], branch: gh[3] || 'main', path,
            name: `${gh[1]}/${gh[2]}`, description: '', custom: true
        };
    }
    if (s.startsWith('url:')) {
        const url = s.slice(4);
        if (!/^(https?:\/\/|\.\/|\/)/i.test(url)) return null;
        return { id: s, kind: 'url', url, name: url.replace(/^https?:\/\//, '').replace(/\/$/, ''), description: '', custom: true };
    }
    return null;
}

/** The id that names a GitHub repository, from what a person types: `owner/repo`, a github.com address. */
export function idFromRepoInput(input) {
    let s = String(input ?? '').trim();
    if (!s) return '';
    const web = s.match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+?))?)?\/?$/i);
    if (web) return `gh:${web[1]}/${web[2]}${web[3] ? `@${web[3]}` : ''}${web[4] ? `:${web[4]}` : ''}`;
    s = s.replace(/^gh:/, '');
    const short = s.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:@([^:]+))?(?::(.+))?$/);
    return short ? `gh:${short[1]}/${short[2]}${short[3] ? `@${short[3]}` : ''}${short[4] ? `:${short[4]}` : ''}` : '';
}

/** The id of several documentations looked at together: `combine:` and their ids, each written safe for a list. */
export const COMBINE_PREFIX = 'combine:';
export const combineId = (ids) => `${COMBINE_PREFIX}${ids.map(encodeURIComponent).join(',')}`;
export const isCombineId = (id) => String(id ?? '').startsWith(COMBINE_PREFIX);
/** The ids a combined id names, once each; the combined id itself is no part of one. */
export function combinedParts(id) {
    if (!isCombineId(id)) return [];
    const parts = [];
    for (const raw of String(id).slice(COMBINE_PREFIX.length).split(',')) {
        let part = '';
        try { part = decodeURIComponent(raw); } catch { part = ''; }
        if (part && !isCombineId(part) && !parts.includes(part)) parts.push(part);
    }
    return parts.slice(0, 12);
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * The hosting's list of endpoints (`endpoints.json`), cleaned. Each entry is `{ name, repo: "owner/name",
 * branch?, path?, description? }`, or `{ name, url }` for a documentation on any web server.
 * @returns {Array<object>}
 */
export function cleanEndpointList(raw) {
    const list = Array.isArray(raw) ? raw : (plain(raw) && Array.isArray(raw.endpoints) ? raw.endpoints : []);
    const out = [];
    const seen = new Set([LOCAL_ID]);
    for (const e of list) {
        if (!plain(e)) continue;
        const name = text(e.name, 80);
        const description = text(e.description, 400);
        let endpoint = null;
        if (typeof e.repo === 'string') {
            const m = e.repo.trim().match(/^([\w.-]+)\/([\w.-]+)$/);
            const path = typeof e.path === 'string' ? e.path.split('/').filter(Boolean).join('/') : '';
            if (m && (!path || safeRelativePath(path))) {
                endpoint = { kind: 'github', owner: m[1], repo: m[2], branch: text(e.branch, 100) || 'main', path };
            }
        } else if (typeof e.url === 'string' && /^(https?:\/\/|\.\/|\/)/i.test(e.url.trim())) {
            endpoint = { kind: 'url', url: e.url.trim() };
        }
        if (!endpoint) continue;
        let id = slug(text(e.id, 60) || name || (endpoint.repo || endpoint.url));
        if (!id) continue;
        for (let n = 2; seen.has(id); n++) id = `${slug(text(e.id, 60) || name || endpoint.repo || 'documentation')}-${n}`;
        seen.add(id);
        out.push({
            id, ...endpoint, description, custom: false,
            name: name || (endpoint.kind === 'github' ? `${endpoint.owner}/${endpoint.repo}` : endpoint.url)
        });
    }
    return out;
}

/** The endpoint an id stands for: one of the hosting's list, or one the id describes itself. */
export function resolveEndpoint(id, list = []) {
    return list.find(e => e.id === id) || endpointFromId(id);
}

const encodePath = (p) => String(p).split('/').filter(Boolean).map(encodeURIComponent).join('/');

/** Where the files of an endpoint are, with a closing slash. `documentBase` resolves relative addresses. */
export function baseUrl(endpoint, documentBase = 'http://localhost/') {
    if (endpoint.kind === 'github') {
        const branch = String(endpoint.branch || 'main').split('/').map(encodeURIComponent).join('/');
        const path = endpoint.path ? `${encodePath(endpoint.path)}/` : '';
        return `https://raw.githubusercontent.com/${encodeURIComponent(endpoint.owner)}/${encodeURIComponent(endpoint.repo)}/${branch}/${path}`;
    }
    const u = new URL(endpoint.url, documentBase).href;
    return u.endsWith('/') ? u : `${u}/`;
}

/** The address of a file of a documentation, or '' if the path may not be used. */
export function fileUrl(base, rel) {
    if (typeof rel === 'string' && /^(https?:|data:image\/)/i.test(rel)) return cleanImageRef(rel);
    const p = safeRelativePath(rel);
    return p ? `${base}${encodePath(p)}` : '';
}

/** The page of a repository on GitHub, for "where does this come from". */
export function repoWebUrl(endpoint) {
    if (endpoint.kind === 'github') {
        const tree = endpoint.path || (endpoint.branch && endpoint.branch !== 'main') ? `/tree/${endpoint.branch}${endpoint.path ? `/${endpoint.path}` : ''}` : '';
        return `https://github.com/${endpoint.owner}/${endpoint.repo}${tree}`;
    }
    return '';
}

// ---- the index ------------------------------------------------------------------------------------

/**
 * @returns {{ index: object } | { error: string }}
 */
export function cleanIndex(raw) {
    if (!plain(raw) || raw.format !== FORMAT) return { error: `This is not a neume-docs documentation: ${INDEX_FILE} has no "format": "${FORMAT}".` };
    if (typeof raw.version !== 'number' || raw.version < 1) return { error: 'The documentation does not say which version of the format it uses.' };
    if (raw.version > VERSION) return { error: `This documentation uses a newer version of the format (${raw.version}) than this viewer knows (${VERSION}). Reload the page; if that does not help, the viewer needs an update.` };

    const info = plain(raw.info) ? raw.info : {};
    const authors = (Array.isArray(info.authors) ? info.authors : []).map(a => text(a, 120)).filter(Boolean).slice(0, 40);
    const year = /^\d{4}$/.test(String(info.year ?? '')) ? String(info.year) : '';
    const out = {
        format: FORMAT,
        version: raw.version,
        generated: /^\d{4}-\d{2}-\d{2}/.test(String(raw.generated ?? '')) ? String(raw.generated).slice(0, 10) : '',
        info: {
            title: text(info.title, 200) || 'Untitled documentation',
            description: text(info.description, 2000),
            authors,
            publisher: text(info.publisher, 200),
            license: text(info.license, 200),
            doi: text(info.doi, 200),
            preferredCitation: text(info.preferredCitation, 600),
            url: safeHttpUrl(info.url),
            year
        },
        columns: [],
        manuscripts: [],
        signs: cleanSigns(raw.signs),
        discriminateSigns: raw.discriminateSigns !== false
    };

    const keys = new Set();
    for (const c of Array.isArray(raw.columns) ? raw.columns : []) {
        const key = text(c && c.key, 80);
        const label = text(c && c.label, 80);
        if (!key || !label || keys.has(key)) continue;
        keys.add(key);
        out.columns.push({
            key, label,
            type: COLUMN_TYPES.includes(c.type) ? c.type : 'text',
            filter: FILTER_KINDS.includes(c.filter) ? c.filter : ''
        });
    }

    const ids = new Set();
    for (const m of (Array.isArray(raw.manuscripts) ? raw.manuscripts : []).slice(0, MAX_MANUSCRIPTS)) {
        const id = text(m && m.id, 120);
        const file = safeRelativePath(m && m.file);
        if (!id || !file || !file.endsWith('.json') || ids.has(id)) continue;
        ids.add(id);
        const meta = {};
        if (plain(m.meta)) for (const c of out.columns) if (typeof m.meta[c.key] === 'string' && m.meta[c.key].trim()) meta[c.key] = text(m.meta[c.key], 500);
        out.manuscripts.push({
            id, file, meta,
            source: text(m.source, 120) || id,
            name: text(m.name, 200),
            kind: KINDS.includes(m.kind) ? m.kind : 'iiif',
            patterns: Number.isFinite(m.patterns) ? Math.max(0, Math.floor(m.patterns)) : 0,
            snippets: Number.isFinite(m.snippets) ? Math.max(0, Math.floor(m.snippets)) : 0
        });
    }
    return { index: out };
}

/** One manuscript's file, cleaned. */
export function cleanManuscript(raw, fallbackId = '') {
    if (!plain(raw)) return { error: 'The manuscript file is empty or not a JSON object.' };
    const out = {
        id: text(raw.id, 120) || fallbackId,
        source: text(raw.source, 120) || fallbackId,
        name: text(raw.name, 200),
        notes: text(raw.notes, 5000),
        kind: KINDS.includes(raw.kind) ? raw.kind : 'iiif',
        rows: [],
        snippets: [],
        lines: []
    };
    const seenRows = new Set();
    for (const r of (Array.isArray(raw.rows) ? raw.rows : []).slice(0, MAX_ROWS)) {
        const pattern = text(r && r.pattern, 120);
        if (!pattern || seenRows.has(pattern)) continue;
        seenRows.add(pattern);
        out.rows.push({ pattern, refId: text(r.refId, 60), notes: text(r.notes, 1000), tier: TIERS.includes(r.tier) ? r.tier : '' });
    }
    const seenSnippets = new Set();
    for (const s of (Array.isArray(raw.snippets) ? raw.snippets : []).slice(0, MAX_SNIPPETS)) {
        const pattern = text(s && s.pattern, 120);
        let id = text(s && s.id, 160);
        if (!pattern || !id) continue;
        if (seenSnippets.has(id)) continue;
        seenSnippets.add(id);
        out.snippets.push({
            id, pattern,
            variant: text(s.variant, 20),
            refId: text(s.refId, 60) || '-',
            folio: text(s.folio, 40),
            line: text(s.line, 80),
            syllable: text(s.syllable, 120),
            caption: text(s.caption, 300),
            image: cleanImageRef(s.image),
            zoom: cleanImageRef(s.zoom),
            lineId: text(s.lineId, 160)
        });
    }
    const ids = new Set(out.snippets.map(s => s.id));
    const seenLines = new Set();
    for (const l of (Array.isArray(raw.lines) ? raw.lines : []).slice(0, MAX_ROWS)) {
        const id = text(l && l.id, 160);
        if (!id || seenLines.has(id)) continue;
        seenLines.add(id);
        const items = [];
        for (const it of (Array.isArray(l.items) ? l.items : []).slice(0, 500)) {
            const snippet = text(it && it.id, 160);
            if (!snippet || !ids.has(snippet)) continue;
            const item = { id: snippet, box: null, points: '' };
            const b = it.box;
            if (b && [b.x, b.y, b.w, b.h].every(n => Number.isFinite(n))) {
                const clamp = (n) => Math.min(100, Math.max(0, n));
                item.box = { x: clamp(b.x), y: clamp(b.y), w: clamp(b.w), h: clamp(b.h) };
            }
            if (typeof it.points === 'string' && it.points.length <= 3000 && /^[-\d.,\s]+$/.test(it.points)) item.points = it.points.trim();
            if (item.box || item.points) items.push(item);
        }
        out.lines.push({ id, folio: text(l.folio, 40), name: text(l.name, 80), image: cleanImageRef(l.image), items });
    }
    return { manuscript: out };
}

// ---- where a manuscript is kept ---------------------------------------------------------------------

const HOLDING_KEYS = ['cat:bibliotheksort', 'cat:bibliothek', 'cat:bibliothekssignatur'];
const HOLDING_LABEL = /(^|\b)(library|bibliothek|repository|holding|shelf ?mark|signatur|signature)/i;

/**
 * Where a manuscript is kept — city, library, shelfmark — from its metadata, for a citation.
 * Uses the columns the editor's catalogue has under those names, or any whose label says so.
 * @param {Object<string, string>} meta
 * @param {Array<{ key: string, label: string }>} columns
 */
export function holdingOf(meta, columns) {
    const byKey = HOLDING_KEYS.map(k => (meta && meta[k]) || '').filter(Boolean);
    if (byKey.length) return byKey.join(', ');
    return columns.filter(c => HOLDING_LABEL.test(c.label) && meta && meta[c.key]).map(c => meta[c.key]).join(', ');
}

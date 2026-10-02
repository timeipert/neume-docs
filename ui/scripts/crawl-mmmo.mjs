#!/usr/bin/env node
/**
 * Collects the source catalogue of the MMMO database (Medieval Music Manuscripts
 * Online, https://musmed.eu) into a local file, so the editor can suggest IIIF
 * manifests and metadata for a manuscript it has not seen before.
 *
 *   node scripts/crawl-mmmo.mjs                    # listing, then detail pages; resumable
 *   node scripts/crawl-mmmo.mjs --phase listing    # only the 100-per-page listing (about 90 requests)
 *   node scripts/crawl-mmmo.mjs --minutes 110      # stop after a while; run it again to go on
 *   node scripts/crawl-mmmo.mjs --contact you@example.org
 *
 * Good manners, because this is somebody else's server:
 *  - it reads robots.txt first, obeys its Disallow rules and never goes faster than
 *    its Crawl-delay (10 s at the time of writing). `--delay` can only slow it down;
 *  - it asks for each page once and keeps what it got; running it again only fetches
 *    what is missing (`--refresh` starts the detail pages over);
 *  - it sends no personal data. `--contact` adds an address to the User-Agent if YOU
 *    want the site's operators to be able to reach you (recommended for a long crawl).
 *
 * The listing carries siglum, place, origin, century, type and links of every
 * source. Only the detail page of a source names its IIIF manifest, so the detail
 * phase is what takes long (one request per source, roughly a day for the whole
 * database). It works through the sources most likely to have images first.
 *
 * Output (default `src/data/mmmo/`): listing.json, details.json (the crawl state)
 * and sources.json (the merged, compact catalogue the editor reads).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://musmed.eu';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? fallback : args[i + 1];
};
const flag = (name) => args.includes(`--${name}`);

const outDir = resolve(opt('out', join(HERE, '..', 'src', 'data', 'mmmo')));
const phase = opt('phase', 'all'); // listing | details | all | merge
const minutes = Number(opt('minutes', 0)); // 0 = no limit
const maxDetails = Number(opt('max-details', 0));
const requestedDelay = Number(opt('delay', 10));
const contact = opt('contact', '');
const userAgent = `cm-neumen-editor-metadata-crawler/1.0 (research use; polite, one request at a time)${contact ? ` ${contact}` : ''}`;

mkdirSync(outDir, { recursive: true });
const file = (name) => join(outDir, name);
const readJson = (name, fallback) => (existsSync(file(name)) ? JSON.parse(readFileSync(file(name), 'utf8')) : fallback);
function writeJson(name, value) {
    const tmp = `${file(name)}.tmp`;
    writeFileSync(tmp, JSON.stringify(value));
    renameSync(tmp, file(name));
}

const startedAt = Date.now();
const timeUp = () => minutes > 0 && Date.now() - startedAt > minutes * 60_000;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

// ---- robots.txt ------------------------------------------------------------------------

let delayMs = Math.max(10, requestedDelay) * 1000;
let disallowed = [];

async function readRobots() {
    const res = await fetch(`${BASE}/robots.txt`, { headers: { 'User-Agent': userAgent } });
    if (!res.ok) { log(`robots.txt answered ${res.status}; assuming the default delay and no exclusions`); return; }
    const text = await res.text();
    // The group for `*` (the crawler is not named in the file).
    let applies = false;
    for (const raw of text.split('\n')) {
        const line = raw.replace(/#.*/, '').trim();
        if (!line) continue;
        const [key, ...rest] = line.split(':');
        const value = rest.join(':').trim();
        const k = key.toLowerCase();
        if (k === 'user-agent') applies = value === '*';
        else if (applies && k === 'crawl-delay') delayMs = Math.max(delayMs, Number(value) * 1000 || 0);
        else if (applies && k === 'disallow' && value) disallowed.push(value);
    }
    log(`robots.txt: crawl-delay ${delayMs / 1000} s, ${disallowed.length} excluded paths`);
}

function allowed(path) {
    return !disallowed.some(rule => path.startsWith(rule.replace(/\*.*$/, '')));
}

// ---- fetching, one at a time, never faster than the delay -------------------------------

let lastRequest = 0;
let failures = 0;

async function get(path) {
    if (!allowed(path)) throw new Error(`robots.txt excludes ${path}`);
    for (let attempt = 1; attempt <= 4; attempt++) {
        const wait = lastRequest + delayMs - Date.now();
        if (wait > 0) await sleep(wait);
        lastRequest = Date.now();
        try {
            const res = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': userAgent, Accept: 'text/html' }, signal: AbortSignal.timeout(45_000) });
            if (res.status === 429 || res.status === 503) {
                log(`${res.status} for ${path}: the server asks for patience, waiting a minute`);
                await sleep(60_000);
                continue;
            }
            if (res.status === 404) return null;
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            failures = 0;
            return await res.text();
        } catch (e) {
            log(`${path}: ${e.message} (attempt ${attempt})`);
            await sleep(attempt * 15_000);
        }
    }
    failures++;
    if (failures >= 5) throw new Error('Five pages in a row failed; stopping so the server is not bothered further.');
    return undefined;
}

// ---- reading the pages ------------------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
const text = (html) => decode(html.replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').replace(/\s+,/g, ',').replace(/[,\s]+$/, '').trim();
const anchors = (html) => [...html.matchAll(/<a\b[^>]*>(.*?)<\/a>/gis)].map(m => text(m[1])).filter(Boolean);
const hrefs = (html) => [...html.matchAll(/<a\b[^>]*href="([^"]*)"/gi)].map(m => decode(m[1]).trim()).filter(u => /^https?:\/\//i.test(u));

/** One page of the listing: [{ id, siglum, ... }] and the total the page announces. */
export function parseListing(html) {
    const total = Number((html.match(/Displaying\s+\d+\s*-\s*\d+\s+of\s+(\d+)/i) || [])[1]) || 0;
    const start = html.indexOf('<table');
    const end = html.indexOf('</table>', start);
    if (start === -1) return { total, rows: [] };
    const rows = [];
    for (const row of html.slice(start, end).match(/<tr\b.*?<\/tr>/gis) || []) {
        const cells = row.match(/<td\b.*?<\/td>/gis);
        if (!cells || cells.length < 5) continue;
        const idMatch = cells[0].match(/href="\/source\/(\d+)"/);
        if (!idMatch) continue;
        const place = anchors(cells[1]);
        rows.push({
            id: Number(idMatch[1]),
            siglum: text(cells[0]),
            country: place[0] || '',
            city: place[1] || '',
            origin: text(cells[2]),
            centuries: anchors(cells[3]),
            types: anchors(cells[4]),
            links: cells[5] ? hrefs(cells[5]) : []
        });
    }
    return { total, rows };
}

/** The fields of one source's own page. */
export function parseDetail(html) {
    const fields = {};
    for (const m of html.matchAll(/<div class="field field-name-([a-z0-9-]+)[^"]*"[^>]*>(.*?)<\/div><\/div><\/div>/gis)) {
        // Everything after the label: the values.
        fields[m[1]] = m[2].split(/<div class="field-items">/i)[1] || '';
    }
    const field = (name) => fields[name] || '';
    const manifestField = field('field-manifest-iiif');
    const manifest = hrefs(manifestField)[0] || (text(manifestField).match(/https?:\/\/\S+/) || [])[0] || '';
    return {
        rism: anchors(field('field-rism')).join(', '),
        archive: anchors(field('field-archive')).join(', '),
        shelfmark: text(field('field-shelf-mark')),
        years: text(field('field-year')),
        notation: anchors(field('field-notation')),
        links: hrefs(field('links-web1-web2')),
        manifest: manifest.replace(/[.,;]+$/, '')
    };
}

// ---- the crawl --------------------------------------------------------------------------

async function crawlListing() {
    const listing = readJson('listing.json', { total: 0, pages: 0, rows: [] });
    const known = new Map(listing.rows.map(r => [r.id, r]));
    let page = listing.pages;
    log(`listing: ${known.size} sources so far, continuing at page ${page}`);
    for (;;) {
        if (timeUp()) { log('time limit reached'); break; }
        const html = await get(page === 0 ? '/sources' : `/sources?page=${page}`);
        if (html === undefined) break;
        if (html === null) { log(`page ${page} does not exist: the listing is complete`); listing.pages = page; break; }
        const { total, rows } = parseListing(html);
        if (!rows.length) { log(`page ${page} is empty: the listing is complete`); break; }
        for (const r of rows) known.set(r.id, r);
        page++;
        listing.total = total || listing.total;
        listing.pages = page;
        listing.rows = [...known.values()];
        writeJson('listing.json', listing);
        log(`listing page ${page}: ${known.size} of ${listing.total}`);
        if (listing.total && known.size >= listing.total) { log('the listing is complete'); break; }
    }
    return readJson('listing.json', listing);
}

/** Sources that name a digital copy come first: they are the ones likely to carry a manifest. */
const priority = (row) => (row.links.length ? 0 : 1);

async function crawlDetails(listing) {
    const details = flag('refresh') ? {} : readJson('details.json', {});
    const todo = listing.rows
        .filter(r => !(r.id in details))
        .sort((a, b) => priority(a) - priority(b) || a.id - b.id);
    log(`details: ${Object.keys(details).length} done, ${todo.length} to go`);
    let done = 0;
    for (const row of todo) {
        if (timeUp()) { log('time limit reached'); break; }
        if (maxDetails && done >= maxDetails) break;
        const html = await get(`/source/${row.id}`);
        if (html === undefined) continue;
        details[row.id] = html === null ? { missing: true } : parseDetail(html);
        done++;
        if (done % 10 === 0) {
            writeJson('details.json', details);
            const withManifest = Object.values(details).filter(d => d.manifest).length;
            log(`details: ${Object.keys(details).length} of ${listing.rows.length}; ${withManifest} with a IIIF manifest`);
        }
    }
    writeJson('details.json', details);
    return details;
}

/** The compact catalogue the editor reads: one short record per source. */
function merge() {
    const listing = readJson('listing.json', { rows: [] });
    const details = readJson('details.json', {});
    const sources = listing.rows.map(r => {
        const d = details[r.id] || {};
        const record = {
            id: r.id,
            siglum: r.siglum,
            rism: d.rism || (r.siglum.includes(' : ') ? r.siglum.split(' : ')[0] : ''),
            country: r.country,
            city: r.city,
            archive: d.archive || '',
            shelfmark: d.shelfmark || (r.siglum.includes(' : ') ? r.siglum.split(' : ').slice(1).join(' : ') : ''),
            origin: r.origin,
            centuries: r.centuries,
            years: d.years || '',
            types: r.types,
            notation: d.notation || [],
            links: [...new Set([...(d.links || []), ...r.links])],
            manifest: d.manifest || '',
            // Whether the detail page has been read: a source without a manifest and without
            // this flag may simply not have been looked at yet.
            checked: Boolean(d.manifest !== undefined || d.missing)
        };
        for (const key of Object.keys(record)) {
            const v = record[key];
            if (v === '' || v === false || (Array.isArray(v) && !v.length)) delete record[key];
        }
        return record;
    });
    writeJson('sources.json', { source: 'MMMO Database, https://musmed.eu', collectedAt: new Date().toISOString().slice(0, 10), sources });
    const withManifest = sources.filter(s => s.manifest).length;
    log(`sources.json: ${sources.length} sources, ${withManifest} with a IIIF manifest`);
}

async function main() {
    if (phase !== 'merge') {
        await readRobots();
        let listing = readJson('listing.json', { rows: [] });
        if (phase === 'listing' || phase === 'all') listing = await crawlListing();
        if (phase === 'details' || phase === 'all') {
            if (!listing.rows.length) throw new Error('There is no listing yet; run with --phase listing first.');
            await crawlDetails(listing);
        }
    }
    merge();
}

// Run only when started from the command line (the parsers are imported by the tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main().catch(e => { console.error(`\n✗ ${e.message}`); try { merge(); } catch { /* nothing collected yet */ } process.exitCode = 1; });
}

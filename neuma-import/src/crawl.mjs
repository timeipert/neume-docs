/**
 * Collects the overview of the Hungarian Neume Catalogue into local files: the page itself, the detail
 * text of every source and the picture of every cell of the table.
 *
 * Good manners, because this is somebody else's server: a few requests at a time with a pause between
 * them, every file asked for once and kept (running it again only fetches what is missing), and no
 * personal data — the User-Agent says what this is and nothing about who runs it.
 */
import { existsSync, mkdirSync, renameSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseOverview, parseDetail } from './parse.mjs';

import { SITE, OVERVIEW_PAGE } from './origin.mjs';

export { SITE, OVERVIEW_PAGE };
export const USER_AGENT = 'neume-docs-neuma-import/0.1 (research tool; polite, few requests at a time)';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function writeAtomic(path, data) {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.part`;
    writeFileSync(tmp, data);
    renameSync(tmp, path);
}

/**
 * A fetcher that never starts two requests closer than `gapMs`, and never more than `concurrency` at once.
 * @returns {(url: string) => Promise<Buffer>}
 */
export function politeFetcher({ gapMs = 250, concurrency = 2, retries = 4, fetchImpl = fetch, log = () => {} } = {}) {
    let active = 0;
    let nextStart = 0;
    const waiting = [];

    const pump = () => {
        while (active < concurrency && waiting.length) {
            const job = waiting.shift();
            active++;
            const wait = Math.max(0, nextStart - Date.now());
            nextStart = Math.max(nextStart, Date.now()) + gapMs;
            sleep(wait).then(job.run).finally(() => { active--; pump(); });
        }
    };

    async function attempt(url) {
        let lastError;
        for (let n = 0; n <= retries; n++) {
            try {
                const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT } });
                if (res.status === 404) throw Object.assign(new Error(`404 ${url}`), { notFound: true });
                if (!res.ok) throw new Error(`${res.status} ${url}`);
                return Buffer.from(await res.arrayBuffer());
            } catch (e) {
                if (e.notFound) throw e;
                lastError = e;
                log(`  retry ${n + 1}/${retries} for ${url}: ${e.message}`);
                await sleep(1000 * 2 ** n);
            }
        }
        throw lastError;
    }

    return (url) => new Promise((resolve, reject) => {
        waiting.push({ run: () => attempt(url).then(resolve, reject) });
        pump();
    });
}

/**
 * Fetches what is missing.
 *
 * @param {object} options
 * @param {string} options.dir        where the raw files go (`<dir>/raw/…`)
 * @param {boolean} [options.refresh] fetch the overview page again even if it is there
 * @param {number} [options.limit]    only this many sources (for trying it out)
 * @param {(msg: string) => void} [options.log]
 * @param {Function} [options.fetcher] replaces the network (tests)
 */
export async function crawl({ dir, refresh = false, limit = 0, log = console.log, fetcher = politeFetcher({ log }) }) {
    const raw = join(dir, 'raw');
    const overviewFile = join(raw, OVERVIEW_PAGE);

    if (refresh || !existsSync(overviewFile)) {
        log(`fetching ${SITE}${OVERVIEW_PAGE}`);
        writeAtomic(overviewFile, await fetcher(SITE + OVERVIEW_PAGE));
    }
    let sources = parseOverview(readFileSync(overviewFile, 'utf8'));
    if (limit > 0) sources = sources.slice(0, limit);
    log(`${sources.length} sources in the overview`);

    const jobs = [];
    for (const s of sources) {
        const detail = join(raw, 'detail', `${s.id}.html`);
        if (!existsSync(detail)) jobs.push({ file: detail, url: `${SITE}en_forras_reszletes.asp?i=${encodeURIComponent(s.id)}` });
        for (const path of Object.values(s.images)) {
            const file = join(raw, 'composite', path.split('/').pop());
            if (!existsSync(file)) jobs.push({ file, url: SITE + path.split('/').map(encodeURIComponent).join('/') });
        }
    }
    log(`${jobs.length} files to fetch`);

    let done = 0;
    const failed = [];
    await Promise.all(jobs.map(async job => {
        try {
            writeAtomic(job.file, await fetcher(job.url));
        } catch (e) {
            failed.push({ url: job.url, error: e.message });
            log(`  failed: ${job.url} (${e.message})`);
        }
        done++;
        if (done % 100 === 0 || done === jobs.length) log(`  ${done}/${jobs.length}`);
    }));

    return { sources: sources.length, fetched: jobs.length - failed.length, failed };
}

/** The sources with the detail fields of their pages, read from the raw files. */
export function readSources(dir) {
    const raw = join(dir, 'raw');
    const sources = parseOverview(readFileSync(join(raw, OVERVIEW_PAGE), 'utf8'));
    return sources.map(s => {
        const file = join(raw, 'detail', `${s.id}.html`);
        const detail = existsSync(file) ? parseDetail(readFileSync(file, 'utf8')) : { title: '', description: '', fields: {} };
        return { ...s, detail };
    });
}

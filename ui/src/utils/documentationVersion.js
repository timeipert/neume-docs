/**
 * Which version of a documentation is being looked at. A documentation on GitHub changes whenever
 * its authors push; a citation should name the version it was made from, and a link in it should
 * keep leading to that version. A commit does that: `gh:owner/repo@<commit>` opens the files as
 * they were then.
 */

const SHA = /^[0-9a-f]{40}$/i;

/** Whether the endpoint is already a fixed commit. */
export const isPinned = (endpoint) => !!endpoint && endpoint.kind === 'github' && SHA.test(String(endpoint.branch));

/** A commit as it is usually written: the first seven characters. */
export const shortSha = (sha) => String(sha ?? '').slice(0, 7);

/** Whether a version can be named for this endpoint at all: only repositories on GitHub have commits. */
export const canPin = (endpoint) => !!endpoint && endpoint.kind === 'github';

/** The id of the same documentation at a commit. */
export function pinnedId(endpoint, sha) {
    return `gh:${endpoint.owner}/${endpoint.repo}@${sha}${endpoint.path ? `:${endpoint.path}` : ''}`;
}

/** The id of the same documentation on its branch again (what "open the latest" leads to). */
export function latestId(endpoint, branch = 'main') {
    return `gh:${endpoint.owner}/${endpoint.repo}${branch !== 'main' ? `@${branch}` : ''}${endpoint.path ? `:${endpoint.path}` : ''}`;
}

const cache = new Map();

/**
 * The commit a branch is at now, from GitHub's API (which answers the browser's request without
 * a login for public repositories, a limited number of times an hour).
 * @returns {Promise<string>} the full commit, or '' if it could not be found out
 */
export async function resolveCommit(endpoint, fetchFn = (...a) => fetch(...a)) {
    if (!canPin(endpoint)) return '';
    if (isPinned(endpoint)) return endpoint.branch.toLowerCase();
    const key = `${endpoint.owner}/${endpoint.repo}@${endpoint.branch}`;
    if (!cache.has(key)) {
        cache.set(key, (async () => {
            try {
                const ref = endpoint.branch.split('/').map(encodeURIComponent).join('/');
                const response = await fetchFn(`https://api.github.com/repos/${encodeURIComponent(endpoint.owner)}/${encodeURIComponent(endpoint.repo)}/commits/${ref}`, {
                    headers: { Accept: 'application/vnd.github.sha' }, credentials: 'omit'
                });
                if (!response.ok) return '';
                const sha = (await response.text()).trim();
                return SHA.test(sha) ? sha.toLowerCase() : '';
            } catch { return ''; }
        })());
    }
    const sha = await cache.get(key);
    if (!sha) cache.delete(key); // not found out: try again next time
    return sha;
}

/** Forget what was found out (for tests, and for "check again"). */
export const forgetCommits = () => cache.clear();

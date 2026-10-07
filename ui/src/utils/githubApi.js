/**
 * What the app asks of GitHub once a person is signed in: who they are, which repositories the app
 * may write to, and putting a set of files into one. The token and the network are handed in.
 */

const API = 'https://api.github.com';

export class GithubError extends Error {
    constructor(message, status = 0) {
        super(message);
        this.name = 'GithubError';
        this.status = status;
    }
}

async function call(path, { token, method = 'GET', body, fetchFn = globalThis.fetch.bind(globalThis) }) {
    const res = await fetchFn(`${API}${path}`, {
        method,
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    let json = null;
    try { json = await res.json(); } catch { /* an empty answer */ }
    if (!res.ok) throw new GithubError(json?.message || `GitHub answered ${res.status}.`, res.status);
    return json;
}

const encodePath = (p) => String(p).split('/').map(encodeURIComponent).join('/');

export async function getUser(opts) {
    const u = await call('/user', opts);
    return { login: u.login, name: u.name || '' };
}

/**
 * The repositories the app is installed on and the person may write to.
 * @returns {Promise<Array<{ fullName: string, private: boolean, defaultBranch: string }>>}
 */
export async function listRepositories(opts) {
    const installs = await call('/user/installations?per_page=100', opts);
    const out = [];
    for (const inst of installs.installations || []) {
        const page = await call(`/user/installations/${inst.id}/repositories?per_page=100`, opts);
        for (const r of page.repositories || []) {
            if (r.permissions && r.permissions.push === false) continue;
            out.push({ fullName: r.full_name, private: !!r.private, defaultBranch: r.default_branch || 'main' });
        }
    }
    return out.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export async function listBranches(repo, opts) {
    const branches = await call(`/repos/${repo}/branches?per_page=100`, opts);
    return branches.map(b => b.name);
}

/** A folder path as GitHub wants it: no slashes at either end, no `..`. */
export function cleanFolder(folder) {
    return String(folder ?? '').split('/').map(s => s.trim()).filter(s => s && s !== '.' && s !== '..').join('/');
}

const inFolder = (folder, path) => (folder ? `${folder}/${path}` : path);

/**
 * Puts the files in one commit on a branch. Files that are already there unchanged add nothing; when
 * nothing differs no commit is made. The branch only moves forward: if someone else committed in
 * the meantime, GitHub refuses and nothing is overwritten.
 *
 * @param {{ repo: string, branch: string, message: string, folder?: string, files: Array<{ path: string, text?: string, base64?: string }> }} job
 * @returns {Promise<{ unchanged: boolean, sha: string, url: string }>}
 */
export async function commitFiles({ repo, branch, message, folder = '', files }, { token, fetchFn }) {
    const opts = { token, fetchFn };
    const prefix = cleanFolder(folder);
    const ref = encodePath(`heads/${branch}`);

    let head;
    try {
        head = await call(`/repos/${repo}/git/ref/${ref}`, opts);
    } catch (e) {
        if (e.status === 404 || e.status === 409) {
            throw new GithubError(`The branch “${branch}” does not exist in ${repo}, or the repository is empty. Make a first commit on GitHub (for instance a README) and try again.`, e.status);
        }
        throw e;
    }
    const parent = head.object.sha;
    const parentCommit = await call(`/repos/${repo}/git/commits/${parent}`, opts);

    // The pictures can be many; a few at a time keeps GitHub's limits for secondary requests in view.
    const entries = new Array(files.length);
    let next = 0;
    const worker = async () => {
        while (next < files.length) {
            const i = next++;
            const f = files[i];
            const blob = await call(`/repos/${repo}/git/blobs`, {
                ...opts,
                method: 'POST',
                body: f.base64 !== undefined ? { content: f.base64, encoding: 'base64' } : { content: f.text ?? '', encoding: 'utf-8' }
            });
            entries[i] = { path: inFolder(prefix, f.path), mode: '100644', type: 'blob', sha: blob.sha };
        }
    };
    await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker));

    const tree = await call(`/repos/${repo}/git/trees`, { ...opts, method: 'POST', body: { base_tree: parentCommit.tree.sha, tree: entries } });
    if (tree.sha === parentCommit.tree.sha) {
        return { unchanged: true, sha: parent, url: `https://github.com/${repo}/commit/${parent}` };
    }
    const commit = await call(`/repos/${repo}/git/commits`, { ...opts, method: 'POST', body: { message, tree: tree.sha, parents: [parent] } });
    try {
        await call(`/repos/${repo}/git/refs/${ref}`, { ...opts, method: 'PATCH', body: { sha: commit.sha, force: false } });
    } catch (e) {
        if (e.status === 422) throw new GithubError(`GitHub did not move “${branch}”: someone else changed it in the meantime, or it is protected. Nothing was overwritten.`, 422);
        if (e.status === 403 || e.status === 404) throw new GithubError(`“${branch}” cannot be written to with this sign-in — it may be protected, or the app lacks the Contents permission on ${repo}.`, e.status);
        throw e;
    }
    return { unchanged: false, sha: commit.sha, url: `https://github.com/${repo}/commit/${commit.sha}` };
}

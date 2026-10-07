import { describe, it, expect } from 'vitest';
import { commitFiles, listRepositories, cleanFolder, GithubError } from './githubApi';

/** A GitHub that remembers what it was asked: routes by "METHOD path". */
function fakeGithub(routes) {
    const calls = [];
    const fetchFn = async (url, init = {}) => {
        const path = url.replace('https://api.github.com', '');
        const key = `${init.method || 'GET'} ${path}`;
        calls.push({ key, body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.Authorization });
        const route = routes[key];
        if (!route) return { ok: false, status: 404, json: async () => ({ message: `no route ${key}` }) };
        const r = typeof route === 'function' ? route(calls.at(-1)) : route;
        return { ok: r.status === undefined || r.status < 400, status: r.status ?? 200, json: async () => r.body };
    };
    return { fetchFn, calls };
}

describe('which repositories are offered', () => {
    it('lists those of every installation the person may push to, sorted', async () => {
        const { fetchFn } = fakeGithub({
            'GET /user/installations?per_page=100': { body: { installations: [{ id: 1 }, { id: 2 }] } },
            'GET /user/installations/1/repositories?per_page=100': { body: { repositories: [
                { full_name: 'me/zeta', private: true, default_branch: 'main', permissions: { push: true } },
                { full_name: 'me/readonly', private: false, default_branch: 'main', permissions: { push: false } }
            ] } },
            'GET /user/installations/2/repositories?per_page=100': { body: { repositories: [{ full_name: 'lab/alpha', private: false, default_branch: 'master', permissions: { push: true } }] } }
        });
        expect(await listRepositories({ token: 't', fetchFn })).toEqual([
            { fullName: 'lab/alpha', private: false, defaultBranch: 'master' },
            { fullName: 'me/zeta', private: true, defaultBranch: 'main' }
        ]);
    });
});

describe('cleanFolder', () => {
    it('keeps a plain relative path', () => {
        expect(cleanFolder(' /docs//data/ ')).toBe('docs/data');
        expect(cleanFolder('../../etc')).toBe('etc');
        expect(cleanFolder('')).toBe('');
        expect(cleanFolder(undefined)).toBe('');
    });
});

const repo = 'me/notes';
const job = { repo, branch: 'main', message: 'm', folder: 'docs', files: [{ path: 'a.json', text: '{}' }, { path: 'images/p.png', base64: 'QUJD' }] };

function happyRoutes(overrides = {}) {
    return {
        [`GET /repos/${repo}/git/ref/heads/main`]: { body: { object: { sha: 'c0' } } },
        [`GET /repos/${repo}/git/commits/c0`]: { body: { tree: { sha: 't0' } } },
        [`POST /repos/${repo}/git/blobs`]: (c) => ({ body: { sha: `blob-${c.body.content}` } }),
        [`POST /repos/${repo}/git/trees`]: { body: { sha: 't1' } },
        [`POST /repos/${repo}/git/commits`]: { body: { sha: 'c1' } },
        [`PATCH /repos/${repo}/git/refs/heads/main`]: { body: {} },
        ...overrides
    };
}

describe('commitFiles', () => {
    it('puts everything in one commit, on top of the branch, without force', async () => {
        const { fetchFn, calls } = fakeGithub(happyRoutes());
        const done = await commitFiles(job, { token: 'tok', fetchFn });
        expect(done).toEqual({ unchanged: false, sha: 'c1', url: `https://github.com/${repo}/commit/c1` });

        const tree = calls.find(c => c.key.endsWith('/git/trees')).body;
        expect(tree.base_tree).toBe('t0');
        expect(tree.tree).toEqual([
            { path: 'docs/a.json', mode: '100644', type: 'blob', sha: 'blob-{}' },
            { path: 'docs/images/p.png', mode: '100644', type: 'blob', sha: 'blob-QUJD' }
        ]);
        const blobs = calls.filter(c => c.key.endsWith('/git/blobs')).map(c => c.body);
        expect(blobs).toContainEqual({ content: '{}', encoding: 'utf-8' });
        expect(blobs).toContainEqual({ content: 'QUJD', encoding: 'base64' });
        expect(calls.find(c => c.key.endsWith('/git/commits') && c.key.startsWith('POST')).body).toEqual({ message: 'm', tree: 't1', parents: ['c0'] });
        expect(calls.at(-1).body).toEqual({ sha: 'c1', force: false });
        expect(calls.every(c => c.auth === 'Bearer tok')).toBe(true);
    });

    it('makes no commit when nothing differs', async () => {
        const { fetchFn, calls } = fakeGithub(happyRoutes({ [`POST /repos/${repo}/git/trees`]: { body: { sha: 't0' } } }));
        expect(await commitFiles(job, { token: 't', fetchFn })).toMatchObject({ unchanged: true, sha: 'c0' });
        expect(calls.some(c => c.key.startsWith('PATCH'))).toBe(false);
    });

    it('explains an empty repository or a missing branch', async () => {
        const { fetchFn } = fakeGithub(happyRoutes({ [`GET /repos/${repo}/git/ref/heads/main`]: { status: 409, body: { message: 'Git Repository is empty.' } } }));
        await expect(commitFiles(job, { token: 't', fetchFn })).rejects.toThrow(/first commit/);
    });

    it('does not overwrite when the branch moved meanwhile', async () => {
        const { fetchFn } = fakeGithub(happyRoutes({ [`PATCH /repos/${repo}/git/refs/heads/main`]: { status: 422, body: { message: 'Update is not a fast forward' } } }));
        const err = await commitFiles(job, { token: 't', fetchFn }).catch(e => e);
        expect(err).toBeInstanceOf(GithubError);
        expect(err.message).toMatch(/Nothing was overwritten/);
    });

    it('encodes a branch with a slash', async () => {
        const routes = happyRoutes();
        routes[`GET /repos/${repo}/git/ref/heads/feature/x`] = routes[`GET /repos/${repo}/git/ref/heads/main`];
        routes[`PATCH /repos/${repo}/git/refs/heads/feature/x`] = { body: {} };
        const { fetchFn } = fakeGithub(routes);
        expect(await commitFiles({ ...job, branch: 'feature/x' }, { token: 't', fetchFn })).toMatchObject({ unchanged: false });
    });
});

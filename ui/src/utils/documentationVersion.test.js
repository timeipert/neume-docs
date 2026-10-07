import { beforeEach, describe, expect, it } from 'vitest';
import { canPin, forgetCommits, isPinned, latestId, pinnedId, resolveCommit, shortSha } from './documentationVersion';
import { endpointFromId } from './documentation';

const SHA = 'a'.repeat(40);
const gh = endpointFromId('gh:owner/repo');

const answer = (status, body) => async () => ({ ok: status === 200, status, text: async () => body });

describe('which version', () => {
    beforeEach(() => forgetCommits());

    it('can be named only for a repository on GitHub', () => {
        expect(canPin(gh)).toBe(true);
        expect(canPin(endpointFromId('url:https://example.org/'))).toBe(false);
        expect(canPin(null)).toBe(false);
    });

    it('knows a fixed commit when it is one', () => {
        expect(isPinned(endpointFromId(`gh:owner/repo@${SHA}`))).toBe(true);
        expect(isPinned(gh)).toBe(false);
        expect(isPinned(endpointFromId('gh:owner/repo@dev'))).toBe(false);
    });

    it('makes the id of the same documentation at a commit, and back on its branch', () => {
        expect(pinnedId(gh, SHA)).toBe(`gh:owner/repo@${SHA}`);
        expect(pinnedId(endpointFromId('gh:owner/repo@dev:docs/x'), SHA)).toBe(`gh:owner/repo@${SHA}:docs/x`);
        expect(latestId(endpointFromId(`gh:owner/repo@${SHA}:docs/x`))).toBe('gh:owner/repo:docs/x');
        expect(latestId(endpointFromId(`gh:owner/repo@${SHA}`), 'dev')).toBe('gh:owner/repo@dev');
        expect(shortSha(SHA)).toBe('aaaaaaa');
    });

    it('asks GitHub which commit a branch is at, once', async () => {
        let calls = 0;
        const fetchFn = async (url, options) => { calls++; expect(url).toBe('https://api.github.com/repos/owner/repo/commits/main'); expect(options.credentials).toBe('omit'); return answer(200, `${SHA}\n`)(); };
        expect(await resolveCommit(gh, fetchFn)).toBe(SHA);
        expect(await resolveCommit(gh, fetchFn)).toBe(SHA);
        expect(calls).toBe(1);
    });

    it('is already the answer for a fixed commit, and nothing for a server', async () => {
        const never = async () => { throw new Error('no request'); };
        expect(await resolveCommit(endpointFromId(`gh:owner/repo@${SHA}`), never)).toBe(SHA);
        expect(await resolveCommit(endpointFromId('url:https://example.org/'), never)).toBe('');
    });

    it('is nothing when GitHub does not say, and asks again next time', async () => {
        expect(await resolveCommit(gh, answer(404, 'nope'))).toBe('');
        expect(await resolveCommit(gh, answer(200, 'not a commit'))).toBe('');
        expect(await resolveCommit(gh, async () => { throw new TypeError('offline'); })).toBe('');
        expect(await resolveCommit(gh, answer(200, SHA))).toBe(SHA);
    });
});

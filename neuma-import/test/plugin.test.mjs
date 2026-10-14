import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanDecision, mergeDecisions, neumaMiddleware, MOUNT } from '../vite-plugin.mjs';

let dir, server, base;

before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'neuma-'));
    mkdirSync(join(dir, 'snippets', '007'), { recursive: true });
    writeFileSync(join(dir, 'catalogue.json'), JSON.stringify({ format: 'neuma-import', sources: [{ id: '007', siglum: 'X', description: '', type: '', date: '', cells: {} }], origin: { name: 'n', url: 'u', authors: ['A (x)'], publisher: 'p', note: '' }, columns: [] }));
    writeFileSync(join(dir, 'snippets.json'), JSON.stringify([{ id: '007b-1', source: '007', column: 'b', index: 1, count: 1, file: 'snippets/007/b-1.png', suggestion: { code: '[*u]' } }]));
    writeFileSync(join(dir, 'snippets', '007', 'b-1.png'), 'png-bytes');
    writeFileSync(join(dir, 'secret.txt'), 'nope');
    const middleware = neumaMiddleware({ dir });
    // connect strips the mount path before the middleware sees the url
    server = createServer((req, res) => {
        if (!req.url.startsWith(MOUNT)) { res.statusCode = 404; return res.end('outside'); }
        req.url = req.url.slice(MOUNT.length) || '/';
        middleware(req, res, () => { res.statusCode = 404; res.end('next'); });
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}${MOUNT}/`;
});

after(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

const post = (path, body, headers = { 'X-Neuma-Import': '1' }) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('a decision is kept only with a known status and, where it needs one, a code', () => {
    assert.equal(cleanDecision({ status: 'accepted', code: '[*u]' }).code, '[*u]');
    assert.equal(cleanDecision({ status: 'accepted' }), null);
    assert.equal(cleanDecision({ status: 'corrected', code: '  *V ' }).code, '*V');
    assert.equal(cleanDecision({ status: 'later' }).status, 'later');
    assert.equal(cleanDecision({ status: 'discarded', code: 'x' }).code, undefined);
    assert.equal(cleanDecision({ status: 'maybe', code: '*' }), null);
    assert.equal(cleanDecision('accepted'), null);
    assert.equal(cleanDecision({ status: 'later', note: 'x'.repeat(900) }).note.length, 500);
    assert.equal(cleanDecision({ status: 'later', sig: '45,63,92,81' }).sig, '45,63,92,81');
    assert.equal(cleanDecision({ status: 'later', sig: '<script>' }).sig, undefined);
});

test('a change is merged into what is there', () => {
    const before = { decisions: { '007b-1': { status: 'accepted', code: '[*u]' }, '007b-2': { status: 'later' } } };
    const after = mergeDecisions(before, { set: { '007b-2': { status: 'corrected', code: '*u' }, '../x': { status: 'later' }, bad: { status: 'nope' } }, remove: ['007b-1'] });
    assert.deepEqual(Object.keys(after.decisions), ['007b-2']);
    assert.equal(after.decisions['007b-2'].code, '*u');
});

test('the data is served, and nothing else in the folder', async () => {
    assert.equal((await fetch(base + 'catalogue.json')).status, 200);
    assert.equal((await fetch(base + 'snippets.json')).headers.get('content-type'), 'application/json; charset=utf-8');
    const png = await fetch(base + 'snippets/007/b-1.png');
    assert.equal(png.status, 200);
    assert.equal(png.headers.get('content-type'), 'image/png');
    assert.equal(await png.text(), 'png-bytes');
    assert.equal((await fetch(base + 'secret.txt')).status, 404);
    assert.equal((await fetch(base + 'snippets/007/..%2F..%2Fsecret.txt')).status, 404);
    assert.equal((await fetch(base + '%2e%2e/secret.txt')).status, 404);
});

test('nothing decided yet is an empty file, not an error', async () => {
    const res = await fetch(base + 'decisions.json');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { version: 1, decisions: {} });
});

test('a page of another site cannot write: the header is needed', async () => {
    assert.equal((await post('decisions', { set: { '007b-1': { status: 'accepted', code: '[*u]' } } }, {})).status, 403);
    assert.equal(existsSync(join(dir, 'decisions.json')), false);
    assert.equal((await post('export', {}, {})).status, 403);
});

test('decisions are written, merged and read back', async () => {
    assert.equal((await post('decisions', { set: { '007b-1': { status: 'accepted', code: '[*u]' } } })).status, 200);
    assert.equal((await post('decisions', { set: { '007b-2': { status: 'later' } } })).status, 200);
    const saved = JSON.parse(readFileSync(join(dir, 'decisions.json'), 'utf8'));
    assert.deepEqual(Object.keys(saved.decisions).sort(), ['007b-1', '007b-2']);
    const again = await (await fetch(base + 'decisions.json')).json();
    assert.equal(again.decisions['007b-1'].code, '[*u]');
});

test('the documentation is written to its folder and served from there', async () => {
    const res = await post('export?include=reviewed', {});
    assert.equal(res.status, 200);
    const result = await res.json();
    assert.equal(result.manuscripts, 1);
    assert.equal(result.snippets, 1);
    const index = await (await fetch(base + 'documentation/neume-docs.json')).json();
    assert.equal(index.format, 'neume-docs');
    assert.equal((await fetch(base + 'documentation/images/007/007b-1.png')).status, 200);
    assert.equal((await fetch(base + 'documentation/data/007.json')).status, 200);
});

test('a method it does not know is refused', async () => {
    assert.equal((await fetch(base + 'catalogue.json', { method: 'DELETE' })).status, 405);
});

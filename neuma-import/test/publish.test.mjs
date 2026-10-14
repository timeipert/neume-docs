import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishSite, publishedCatalogue, landingPage } from '../src/publish.mjs';
import { ORIGIN } from '../src/origin.mjs';

const catalogue = {
    origin: ORIGIN,
    sources: [{ id: '007', siglum: 'A', cells: { b: { image: 'raw/composite/007b.png', width: 208, height: 126, snippets: 2 }, h: { image: 'raw/composite/007h.png', width: 206, height: 120, snippets: 0 } } }]
};
const snippets = [
    { id: '007b-1', source: '007', column: 'b', file: 'snippets/007/b-1.png' },
    { id: '007b-2', source: '007', column: 'b', file: 'snippets/007/b-2.png' }
];

function folder() {
    const dir = mkdtempSync(join(tmpdir(), 'neuma-pub-'));
    mkdirSync(join(dir, 'snippets', '007'), { recursive: true });
    mkdirSync(join(dir, 'raw', 'composite'), { recursive: true });
    writeFileSync(join(dir, 'catalogue.json'), JSON.stringify(catalogue));
    writeFileSync(join(dir, 'snippets.json'), JSON.stringify(snippets));
    writeFileSync(join(dir, 'snippets', '007', 'b-1.png'), 'one');
    writeFileSync(join(dir, 'snippets', '007', 'b-2.png'), 'two');
    writeFileSync(join(dir, 'snippets', '007', 'stray.png'), 'not in the list');
    writeFileSync(join(dir, 'raw', 'composite', '007b.png'), 'cell');
    writeFileSync(join(dir, 'decisions.json'), '{"decisions":{"007b-1":{"status":"accepted","code":"[*u]"}}}');
    return dir;
}

test('the published catalogue points at no picture it does not carry', () => {
    const published = publishedCatalogue(catalogue);
    assert.equal(published.sources[0].cells.b.image, '');
    assert.equal(published.sources[0].cells.b.width, 208);
    assert.equal(catalogue.sources[0].cells.b.image, 'raw/composite/007b.png'); // the original is untouched
    // the credit is the one of today, whatever an older split wrote into its catalogue
    assert.deepEqual(publishedCatalogue({ ...catalogue, origin: { name: 'old' } }).origin, ORIGIN);
});

test('the site folder has the catalogue, the snippets that are listed and the way in — and nothing else', () => {
    const dir = folder();
    const out = mkdtempSync(join(tmpdir(), 'neuma-site-'));
    const result = publishSite({ dir, out });
    assert.deepEqual(result, { sources: 1, snippets: 2 });
    assert.deepEqual(readdirSync(out).sort(), ['catalogue.json', 'index.html', 'snippets', 'snippets.json']);
    assert.deepEqual(readdirSync(join(out, 'snippets', '007')).sort(), ['b-1.png', 'b-2.png']);
    assert.equal(readFileSync(join(out, 'snippets', '007', 'b-1.png'), 'utf8'), 'one');
    assert.equal(JSON.parse(readFileSync(join(out, 'catalogue.json'), 'utf8')).sources[0].cells.b.image, '');
    assert.equal(existsSync(join(out, 'decisions.json')), false);
    rmSync(dir, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
});

test('publishing again removes what is gone and keeps what is not the folder\'s to remove', () => {
    const dir = folder();
    const out = mkdtempSync(join(tmpdir(), 'neuma-site-'));
    writeFileSync(join(out, 'README.txt'), 'mine');
    publishSite({ dir, out });
    mkdirSync(join(out, 'snippets', '999'), { recursive: true });
    writeFileSync(join(out, 'snippets', '999', 'old.png'), 'old');
    publishSite({ dir, out });
    assert.equal(existsSync(join(out, 'snippets', '999')), false);
    assert.equal(readFileSync(join(out, 'README.txt'), 'utf8'), 'mine');
    rmSync(dir, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
});

test('the page leads to the tool and carries the credit', () => {
    const page = landingPage();
    assert.match(page, /url=\.\.\/#\/tools\/neuma/);
    assert.match(page, /location\.replace\("\.\.\/#\/tools\/neuma"\)/);
    assert.match(page, /Gilányi/);
    assert.match(page, /neuma\.zti\.hu/);
    assert.match(page, /agreement of the catalogue/);
});

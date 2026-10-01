#!/usr/bin/env node
/**
 * End-to-end smoke test, driven by Playwright against a running dev server.
 *
 *   npm run dev                                   # in one terminal
 *   npm run e2e -- --data /path/to/project-folder # in another
 *
 * `--data` is a Corpus Monodicum project folder (or any folder of sources); a
 * few sources are enough. `--base` is the server address (default
 * http://localhost:5173). `--shots <dir>` saves screenshots.
 *
 * It walks the new user story: the editor starts empty, a corpus is loaded and
 * survives a reload, a manuscript's standard table is filled (including the
 * three-constellation limit), the expanded documentation takes an addition by
 * code, and the comparison table shows the standard columns in the fixed order.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? fallback : args[i + 1];
};
const base = opt('base', 'http://localhost:5173');
const data = opt('data');
const shots = opt('shots');
if (!data) {
    console.error('Usage: npm run e2e -- --data <project folder> [--base <url>] [--shots <dir>]');
    process.exit(2);
}

const STANDARD = ['*', '*d', '*u', '*e', '*dd', '*ud', '*uu', '*du', '*udd', '*uud', '*ddu', 'L', 'O', 'Q', ',', 'Clef', 'Custos'];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const problems = [];
page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
page.on('pageerror', e => problems.push(`page error: ${e.message}`));

const shot = (name) => (shots ? page.screenshot({ path: `${shots}/${name}.png` }) : null);
const step = (name) => console.log(`✓ ${name}`);

try {
    // 1. Starts empty --------------------------------------------------------
    await page.goto(`${base}/#/setup`);
    await page.getByText('Continue without a folder').click();
    await page.goto(`${base}/#/`);
    await page.waitForURL(/#\/corpus/);
    assert.equal(await page.locator('.loaded').count(), 0, 'no corpus is loaded at first');
    step('starts empty, sends a first visitor to the Corpus page');

    // 2. Load a corpus --------------------------------------------------------
    await page.locator('input[webkitdirectory]').setInputFiles(data);
    await page.waitForSelector('.stats', { timeout: 10 * 60 * 1000 });
    const sources = Number((await page.locator('.stats strong').first().innerText()).replace(/\D/g, ''));
    assert.ok(sources > 0, 'at least one source loaded');
    await shot('corpus');
    await page.reload();
    await page.waitForSelector('.stats');
    step(`loaded ${sources} source(s); still there after a reload`);

    // 3. The overview works on the loaded corpus ------------------------------
    await page.goto(`${base}/#/`);
    await page.waitForSelector('.controls');
    step('overview renders the loaded corpus');

    // 4. Fill in the standard table -------------------------------------------
    await page.goto(`${base}/#/table`);
    await page.waitForSelector('.ms');
    const name = (await page.locator('.ms .ms-name').first().innerText()).trim();
    await page.locator('.ms').first().click();
    await page.waitForSelector('.grid .cell');

    const headers = await page.locator('.cell .code').allInnerTexts();
    assert.deepEqual(headers, STANDARD, 'the standard table has the columns of the brief, in order');
    step('standard table: * *d *u *e *dd *ud *uu *du *udd *uud *ddu | L O Q , | Clef Custos');

    await page.locator('.cell[data-column="dir:*ud"]').getByRole('button', { name: /Choose for|Change/ }).click();
    await page.waitForSelector('.picker');
    const variants = await page.locator('.picker .variant').count();
    assert.ok(variants >= 1, 'the library offers variants for *ud');
    const letters = await page.locator('.picker .variant code').allInnerTexts();
    assert.ok(letters.every(c => !/[A-Z]/.test(c)), 'a directional column offers no special signs');
    await page.locator('.picker .variant').first().click();
    await page.getByRole('button', { name: 'Done' }).click();
    assert.equal(await page.locator('.cell[data-column="dir:*ud"] .items li').count(), 1);
    step('picked a plain variant for *ud from the library');

    await page.locator('.cell[data-column="special:L"]').getByRole('button', { name: /Choose for|Change/ }).click();
    await page.waitForSelector('.picker');
    const groups = page.locator('.picker .sig-group');
    assert.ok(await groups.count() >= 4, 'the L library offers several constellations');
    for (let i = 0; i < 3; i++) await groups.nth(i).locator('.variant').first().click();
    assert.equal((await page.locator('.picker .chosen-label strong').innerText()).trim(), '3/3');
    assert.ok(await groups.nth(3).locator('.variant').first().isDisabled(), 'a fourth constellation is refused');
    await shot('picker-L');
    await page.getByRole('button', { name: 'Done' }).click();
    step('L: three constellations chosen, the fourth is refused');

    // 5. Expanded documentation ----------------------------------------------
    // Removing is undoable
    const udCell = page.locator('.cell[data-column="dir:*ud"] .items li');
    await udCell.first().getByRole('button', { name: /Remove/ }).click();
    assert.equal(await udCell.count(), 0, 'the pattern is removed');
    await page.getByRole('button', { name: 'Undo' }).click();
    assert.equal(await udCell.count(), 1, 'Undo puts it back');
    step('removal can be undone');

    // Progress bar: clicking a segment jumps to its cell
    await page.locator('.toolbar-progress .seg', { hasText: '*udd' }).click();
    await page.waitForSelector('.cell.highlighted');
    step('the progress bar jumps to a cell');

    await page.getByRole('radio', { name: 'Expanded Documentation' }).click();
    await page.waitForSelector('.search-panel');
    await page.locator('#pattern-search').fill('*ed');
    await page.waitForSelector('.results .result');
    const first = (await page.locator('.results .result code').first().innerText()).trim();
    await page.locator('.results .result').first().click();
    const expanded = await page.locator('.cell .code').allInnerTexts();
    assert.ok(expanded.some(h => h.startsWith('*ed')), 'the addition got a column of its own');
    assert.ok(expanded.indexOf('*du') > expanded.indexOf('*uu'), 'the standard columns keep their order');
    await shot('expanded');
    step(`expanded documentation: added ${first} by code`);

    await page.getByRole('radio', { name: 'Standard Table' }).click();
    const hidden = await page.locator('.cell .code').allInnerTexts();
    assert.deepEqual(hidden, STANDARD, 'the standard table hides the addition');
    step('Show Standard Table hides it again');

    // 6. The comparison table -------------------------------------------------
    // Seed one published manuscript with annotated patterns, as the annotation
    // editor would have saved them.
    await page.evaluate((source) => {
        const tables = JSON.parse(localStorage.getItem('personalTables') || '{"tables":[]}');
        const t = (tables.tables || []).find(x => x.source === source);
        t.isPublished = true;
        localStorage.setItem('personalTables', JSON.stringify(tables));
        const rows = t.rows.map(r => r.pattern);
        const items = rows.map((p, i) => ({ id: `i${i}`, pattern: p, points: '0,0 10,0 10,10' }));
        localStorage.setItem('annotations_v2', JSON.stringify({
            annotations: {}, manualLines: {},
            regions: { [`${source}_1r`]: [{ id: 'r1', name: 'Line 1', points: '0,0 1,0 1,1' }] },
            regionItems: { r1: items }
        }));
    }, name);
    await page.goto(`${base}/#/public/table`);
    await page.reload();
    await page.waitForSelector('.neume-matrix');
    const matrixHeads = (await page.locator('.neume-matrix .pattern-header-cell').allInnerTexts())
        .map(t => t.replace(/\s+/g, ' ').trim().split(' ')[0]);
    assert.deepEqual(matrixHeads, STANDARD, 'the comparison table shows the standard columns');
    assert.ok(await page.locator('.snippet-cell .snippet-card').count() > 0, 'the chosen patterns appear as snippets');
    await shot('comparison-standard');
    step('comparison table: standard columns, filled from the manuscript\'s selection');

    if (problems.length) throw new Error(`console errors:\n  ${problems.join('\n  ')}`);
    console.log('\nAll checks passed.');
} catch (e) {
    await shot('failure');
    console.error(`\n✗ ${e.message}`);
    process.exitCode = 1;
} finally {
    await browser.close();
}

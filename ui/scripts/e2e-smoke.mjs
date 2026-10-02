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
    await page.waitForTimeout(300); // let the dialog finish appearing
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
    await page.waitForTimeout(300); // let the dialog finish appearing
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
    await page.waitForSelector('.aside .panel');
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

    // 7. The manuscript metadata table ---------------------------------------
    await page.goto(`${base}/#/metadata`);
    await page.waitForSelector('.grid-scroller td');

    /** The cell of a manuscript (by row index in view order) in a column (by header label). */
    const cellAt = async (row, label) => page.locator('.grid-scroller').evaluateHandle((root, [r, l]) => {
        const heads = [...root.querySelectorAll('th.head')].map(h => h.querySelector('.label').textContent.trim());
        return root.querySelector(`td[data-r="${r}"][data-c="${heads.indexOf(l)}"]`);
    }, [row, label]);
    const textAt = async (row, label) => (await cellAt(row, label)).evaluate(el => el.querySelector('.text')?.textContent.trim());
    const clickAt = async (row, label) => (await cellAt(row, label)).asElement().click();

    const sigla = await page.locator('.grid-scroller td[data-c="0"] .text').allInnerTexts();
    assert.ok(sigla.length >= 4, 'the table lists the loaded manuscripts');
    step(`metadata table lists ${sigla.length} manuscripts`);

    const original = await textAt(0, 'Place of origin');
    await clickAt(0, 'Place of origin');
    await page.keyboard.type('Test place');
    await page.keyboard.press('Enter');
    assert.equal(await textAt(0, 'Place of origin'), 'Test place');
    assert.ok(await (await cellAt(0, 'Place of origin')).evaluate(el => el.classList.contains('edited')), 'edited cells are marked');
    await page.keyboard.press('Control+z');
    assert.equal(await textAt(0, 'Place of origin'), original);
    step('typing edits a cell, marks it, and Ctrl+Z undoes it');

    await clickAt(0, 'Library city');
    await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.setData('text/plain', 'Alpha\tBeta\nGamma\tDelta');
        document.querySelector('.grid-scroller').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    assert.equal(await textAt(0, 'Library city'), 'Alpha');
    assert.equal(await textAt(1, 'Library'), 'Delta');
    step('pasting a block from Excel fills several cells');

    await clickAt(0, 'Source type');
    await page.keyboard.type('Gradual');
    await page.keyboard.press('Enter');
    await (await cellAt(0, 'Source type')).asElement().click();
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Control+d');
    assert.equal(await textAt(2, 'Source type'), 'Gradual');
    step('Ctrl+D fills down');

    await clickAt(1, 'IIIF manifest');
    await page.keyboard.type('https://example.org/iiif/manifest.json');
    await page.keyboard.press('Enter');
    const links = await page.evaluate(() => JSON.parse(localStorage.getItem('iiifLinks') || '{}'));
    assert.equal(links[sigla[1]], 'https://example.org/iiif/manifest.json');
    step('the manifest column sets the manuscript\'s IIIF link');

    await page.getByRole('button', { name: /Find & replace/ }).click();
    await page.locator('#rep-find').fill('Gradual');
    await page.locator('.md-dialog input[placeholder^="Leave empty"]').fill('Graduale');
    await page.locator('.md-dialog select').selectOption('all');
    await page.getByRole('button', { name: /^Replace/ }).click();
    assert.equal(await textAt(2, 'Source type'), 'Graduale');
    step('find & replace works over the whole table, as one step');
    await page.keyboard.press('Escape');

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        (async () => { await page.getByRole('button', { name: /Export/ }).click(); await page.getByRole('button', { name: 'Download CSV', exact: true }).click(); })()
    ]);
    const { readFileSync } = await import('node:fs');
    const csv = readFileSync(await download.path(), 'utf8');
    assert.ok(csv.startsWith('\uFEFFSiglum,'), 'the CSV starts with a byte order mark and the Siglum column');
    assert.ok(csv.includes('Graduale'));
    step('the table downloads as CSV');

    const csvIn = `Siglum,Shelfmark\n${sigla[3]},Imported shelfmark\n`;
    await page.locator('.tools input[type=file]').setInputFiles({ name: 'meta.csv', mimeType: 'text/csv', buffer: Buffer.from(csvIn) });
    await page.waitForSelector('.md-dialog');
    await page.locator('.md-dialog .md-foot .ne-btn--primary').click();
    await page.waitForSelector('.md-dialog', { state: 'detached' });
    assert.equal(await textAt(3, 'Shelfmark'), 'Imported shelfmark');
    step('a CSV is imported by siglum');

    await page.reload();
    await page.waitForSelector('.grid-scroller td');
    assert.equal(await textAt(3, 'Shelfmark'), 'Imported shelfmark');
    step('edits survive a reload');

    // 8. Your own metadata column can be renamed in the table itself ---------
    await page.getByRole('button', { name: /Columns/ }).click();
    await page.locator('.add-column input').fill('Notation type');
    await page.locator('.add-column .ne-btn--primary').click();
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 400); // close the columns menu
    const ownHead = page.locator('th.head', { hasText: 'Notation type' });
    await ownHead.hover();
    await ownHead.locator('.col-menu').click({ force: true });
    await page.getByRole('button', { name: /Edit this column/ }).click();
    await page.waitForSelector('.md-dialog');
    await page.locator('.md-dialog input.ne-input').first().fill('Notation family');
    await page.locator('.md-dialog .md-foot .ne-btn--primary').click();
    await page.waitForSelector('th.head:has-text("Notation family")');
    step('an own column is renamed from its menu, in the table');

    // 9. Pattern library: where signs, variants and preferred IDs are set up --
    await page.goto(`${base}/#/patterns?setup=signs`);
    await page.waitForSelector('#sign-key');
    await page.locator('#sign-key').fill('v');
    await page.locator('#sign-label').fill('Virga');
    await page.getByRole('button', { name: 'Add sign' }).click();
    assert.equal(await page.locator('.signs-table tbody tr').count(), 1, 'the sign was added');
    await page.getByRole('button', { name: /Preferred IDs/ }).click();
    await page.locator('input[aria-label="Pattern"]').fill('*dd');
    await page.locator('input[aria-label="Preferred ID"]').fill('Type A');
    await page.locator('.pids .ne-btn', { hasText: 'Add' }).click();
    assert.equal(await page.locator('.pids tbody tr').count(), 1, 'the preferred ID was added');
    step('signs and preferred IDs are set up in the pattern library');

    await page.goto(`${base}/#/settings`);
    await page.waitForSelector('.panel');
    assert.equal(await page.locator('.panel').count(), 2, 'Settings holds only the two global preferences');
    step('Settings is down to the global preferences');

    await page.goto(`${base}/#/equivalents`);
    await page.waitForURL(/#\/table$/);
    step('the old Equivalents list leads to the neume tables');

    // Every page still opens without errors, and the table editor leads to the annotation view and back.
    for (const route of ['/', '/corpus', '/metadata', '/metadata/iiif', '/table', '/compare', '/patterns', '/polygons', '/custom-manuscripts', '/ommr', '/settings', '/workspace']) {
        const before = problems.length;
        await page.goto(`${base}/#${route}`);
        await page.waitForTimeout(500);
        assert.equal(problems.length, before, `no errors on ${route}: ${problems.slice(before).join(' | ')}`);
    }
    step('every page opens without errors');

    await page.goto(`${base}/#/table`);
    await page.waitForSelector('.ms');
    await page.locator('.ms').first().click();
    await page.getByRole('button', { name: /Annotate snippets/ }).click();
    await page.waitForURL(/#\/annotations\//);
    await page.getByRole('button', { name: 'Back to the neume table' }).click();
    await page.waitForURL(/#\/table\/.+/);
    step('Annotate snippets leads to the annotation view, which leads back to the table');

    // The table of IIIF sources, and adding a manuscript that is not in the corpus.
    await page.goto(`${base}/#/metadata/iiif`);
    await page.waitForSelector('#table');
    await page.locator('input[aria-label="Manuscript"]').fill('Eichstätt 84');
    await page.locator('input[aria-label="Address"]').fill('https://example.org/iiif/eu84/manifest.json');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.waitForSelector('[data-table="iiif"] tr.in-use');
    const iiifLinks = await page.evaluate(() => JSON.parse(localStorage.getItem('iiifLinks') || '{}'));
    assert.equal(iiifLinks['Eichstätt 84'], 'https://example.org/iiif/eu84/manifest.json');
    step('a row added to the IIIF table is put to use');

    await page.getByRole('button', { name: 'Add a manuscript…' }).click();
    await page.locator('#am-siglum').fill('Test 1');
    await page.locator('#am-city').fill('Testville');
    await page.getByRole('button', { name: 'Add manuscript' }).click();
    await page.waitForURL(/#\/metadata\?q=/);
    await page.waitForSelector('.grid-scroller td[data-c="0"] .text:has-text("Test 1")');
    step('a manuscript outside the corpus is added and appears in the metadata table');

    // 10. Workspace management ------------------------------------------------
    await page.goto(`${base}/#/workspace`);
    await page.waitForSelector('[data-area="tables"]');
    const holds = async (area) => (await page.locator(`[data-area="${area}"] .holds`).innerText()).trim();
    assert.match(await holds('tables'), /table/);
    assert.match(await holds('metadata'), /edited cell/);
    assert.match(await holds('library'), /custom sign/);
    assert.match(await holds('images'), /IIIF table row/);
    step('the workspace page counts what each part holds');

    // Delete one part, then take it back with Undo.
    await page.locator('[data-area="metadata"]').getByRole('button', { name: /Delete/ }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.waitForSelector('.toast:has-text("Deleted: manuscript metadata")');
    assert.match(await holds('metadata'), /Nothing yet/);
    await page.locator('.toast:has-text("Deleted: manuscript metadata") .toast-action').click();
    await page.waitForFunction(() => /edited cell/.test(document.querySelector('[data-area="metadata"] .holds')?.textContent || ''));
    step('one part is deleted and brought back with Undo');

    // Restore points were made on the way.
    assert.ok(await page.locator('#restore tbody tr').count() >= 1, 'a restore point was kept');

    // Delete all work needs a typed word.
    await page.getByRole('button', { name: 'Delete all work…' }).click();
    const confirmButton = page.locator('.md-dialog .md-foot .ne-btn--danger-solid');
    assert.ok(await confirmButton.isDisabled(), 'the button waits for the typed word');
    await page.locator('#cd-confirm-input').fill('delete');
    await confirmButton.click();
    await page.waitForSelector('.toast:has-text("All your work was deleted")');
    assert.match(await holds('tables'), /Nothing yet/);
    assert.match(await holds('library'), /Nothing yet/);
    step('delete all work asks for a typed word, then empties every part');

    // Restore from the list.
    await page.locator('#restore tbody tr').filter({ hasText: 'Before deleting all work' }).getByRole('button', { name: /Restore/ }).click();
    await page.locator('.md-dialog .md-foot .ne-btn--primary').click();
    await page.waitForFunction(() => /table/.test(document.querySelector('[data-area="tables"] .holds')?.textContent || ''));
    assert.match(await holds('library'), /custom sign/);
    step('a restore point puts everything back');

    // Reset the app: back to a first visit.
    await page.getByRole('button', { name: 'Reset the app…' }).click();
    await page.locator('#cd-confirm-input').fill('reset');
    await page.locator('.md-dialog .md-foot .ne-btn--danger-solid').click();
    await page.waitForSelector('.toast:has-text("The app was reset")');
    assert.match(await holds('tables'), /Nothing yet/);
    await page.goto(`${base}/#/corpus`);
    await page.waitForSelector('.drop-card');
    assert.equal(await page.locator('.loaded').count(), 0, 'the corpus is gone');
    step('reset the app: work, preferences and corpus are gone');

    if (problems.length) throw new Error(`console errors:\n  ${problems.join('\n  ')}`);
    console.log('\nAll checks passed.');
} catch (e) {
    await shot('failure');
    console.error(`\n✗ ${e.message}`);
    process.exitCode = 1;
} finally {
    await browser.close();
}

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
 * It walks the user story: the editor starts empty, a corpus is loaded and
 * survives a reload, a project is made with the wizard and its columns are chosen
 * (including the three-constellation limit), a cell opens, the extended table takes
 * an addition by code, the table of all manuscripts has the project as a row, and
 * publishing it fills the public comparison table in the fixed order.
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
    await page.waitForURL(/#\/projects/);
    await page.waitForSelector('.empty');
    assert.equal(await page.locator('.card').count(), 0, 'there is no project at first');
    step('starts empty: the home page is the (empty) list of projects');

    await page.goto(`${base}/#/projects/new`);
    await page.waitForSelector('.cc-card');
    assert.ok(await page.getByRole('radio', { name: /The transcription/ }).isDisabled(), 'without a corpus the project cannot start from the transcription');
    step('without a corpus, a project starts from the manuscript');

    // 2. Load a corpus --------------------------------------------------------
    await page.goto(`${base}/#/manuscripts/corpus`);
    await page.locator('input[webkitdirectory]').setInputFiles(data);
    await page.waitForSelector('.stats', { timeout: 10 * 60 * 1000 });
    const sources = Number((await page.locator('.stats strong').first().innerText()).replace(/\D/g, ''));
    assert.ok(sources > 0, 'at least one source loaded');
    await shot('corpus');
    await page.reload();
    await page.waitForSelector('.stats');
    step(`loaded ${sources} source(s); still there after a reload`);

    // 3. The overview works on the loaded corpus ------------------------------
    await page.goto(`${base}/#/patterns/corpus`);
    await page.waitForSelector('.controls');
    step('overview renders the loaded corpus');

    // 4. A project, and its columns -------------------------------------------
    await page.goto(`${base}/#/projects/new`);
    await page.waitForSelector('.cc-card');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.waitForSelector('#w-source');
    const name = (await page.locator('#w-sources option').first().getAttribute('value')).trim();
    await page.locator('#w-source').fill(name);
    // a folio is a number and r or v: anything else is refused, and the way on is shut
    await page.locator('#w-from').fill('12');
    assert.match(await page.locator('.field-error').first().innerText(), /number and r or v/);
    assert.ok(await page.getByRole('button', { name: 'Next' }).isDisabled(), 'a folio that does not fit stops the wizard');
    await page.locator('#w-from').fill('');
    step('a folio that is not a number and r or v is refused');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('radio', { name: /IIIF page images/ }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('radio', { name: /Lines, then signs/ }).click();
    await shot('wizard');
    await page.getByRole('button', { name: /Create project/ }).click();
    await page.waitForSelector('.pt--select');
    step(`a project for ${name} made with the four questions`);

    const groupLabels = await page.locator('.pt--select th.cat .cat-name code').allInnerTexts();
    assert.deepEqual(groupLabels, [...STANDARD.slice(0, 11), 'Clef · Custos'], 'the first tab lays out the shapes, by length and then frequency');
    step('Columns: * *d *u *e *dd *ud *uu *du *udd *uud *ddu, then Clef · Custos');

    // The library writes a constellation in several ways (`*dL`, `[*dL]`, …): take the one Find shows first.
    const bare = (code) => code.replace(/[[\]]/g, '');
    const tick = async (signature) => {
        await page.locator('input[aria-label="Search codes"]').fill(signature);
        await page.waitForTimeout(400);
        const code = await page.locator('.pt--select thead .l2 th').evaluateAll(
            (ths, sig) => ths.map(t => t.dataset.code).find(c => c.replace(/[[\]]/g, '') === sig), signature);
        assert.ok(code, `the library has a column for ${signature}`);
        // click, not check(): a refused choice puts the box back, which check() would call a failure
        await page.locator(`th[data-code="${code}"] input[type=checkbox]`).click({ force: true });
        return code;
    };
    // the number of chosen columns is the count of the Columns tab
    const chosenCount = async () => Number((await page.locator('a.tab', { hasText: 'Columns' }).locator('.count').innerText().catch(() => '0')).trim() || 0);
    await page.getByRole('button', { name: /Add suggested/ }).click();
    const chosen = await chosenCount();
    assert.ok(chosen > 0, 'the most frequent codes of the transcription are chosen');
    step(`${chosen} columns taken from the transcription`);

    // Start the special signs from nothing, so that the three that are ticked are the only ones.
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    assert.equal(await chosenCount(), 0);
    const chosenL = [];
    for (const signature of ['*dL', '*uL', '*ddL']) chosenL.push(await tick(signature));
    const refused = await tick('*uuL');
    await page.waitForSelector('text=At most 3 constellations');
    assert.equal(await page.locator(`th[data-code="${refused}"] input[type=checkbox]`).isChecked(), false, 'a fourth constellation is refused');
    await shot('columns');
    step('L: three constellations chosen, the fourth is refused');

    // A code the library does not have is added from the table, checked, and chosen.
    await page.locator('input[aria-label="Search codes"]').fill('ux');
    assert.equal(await page.locator('.unknown').count(), 0, 'a text that is not a code is not offered for adding');
    await page.locator('input[aria-label="Search codes"]').fill('{*u}{d}d');
    await page.getByRole('button', { name: 'Add it…' }).click();
    await page.getByRole('button', { name: 'Add to the library' }).click();
    await page.waitForSelector('th[data-code="{*u}{d}d"]');
    assert.ok(await page.locator('th[data-code="{*u}{d}d"] input[type=checkbox]').isChecked(), 'the new code is chosen');
    step('typing a code the library does not have offers to add it: checked, added, chosen');

    // What the transcription suggests fills in the shapes that have no column yet.
    await page.getByRole('button', { name: /Add suggested/ }).click();
    assert.ok(await chosenCount() > 3, 'the transcription adds columns for the other shapes');

    // 5. The standard table, a cell, the extended table ------------------------
    await page.getByRole('button', { name: /^Standard table/ }).click();
    await page.waitForSelector('.pt--fill');
    const standardCodes = await page.locator('.pt--fill thead .l2 th').evaluateAll(ths => ths.map(t => t.dataset.code));
    assert.ok(chosenL.every(c => standardCodes.includes(c)) && !standardCodes.includes(refused), 'the standard table has the chosen columns');
    await page.locator('.pt--fill .r-snip .cell').first().click();
    await page.waitForSelector('.drawer');
    assert.match(page.url(), /[?&]cell=/, 'an open cell has an address');
    await shot('cell');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.drawer', { state: 'detached' });
    step('Standard table: a cell opens beside it, with an address, and closes with Esc');

    await page.getByRole('link', { name: /Extended table/ }).first().click();
    await page.waitForSelector('.aside .panel');
    await page.locator('#pattern-search').fill('*ed');
    await page.waitForSelector('.results .result');
    const first = (await page.locator('.results .result code').first().innerText()).trim();
    await page.locator('.results .result').first().click();
    await page.waitForSelector('.drawer');
    const extended = await page.locator('.pt--fill thead .l2 th').evaluateAll(ths => ths.map(t => t.dataset.code));
    assert.ok(extended.includes(first), `the addition (${first}) got a column of its own`);
    assert.ok(extended.length > standardCodes.length, 'the extended table has more columns');
    await shot('extended');
    step(`Extended table: added ${first} by code`);

    await page.keyboard.press('Escape');
    const before = extended.length;
    await page.locator('th.added .x').first().click();
    assert.equal(await page.locator('.pt--fill thead .l2 th').count(), before - 1, 'the column is taken out');
    // earlier messages may still be showing: the newest Undo is the last one
    await page.getByRole('button', { name: 'Undo' }).last().click();
    assert.equal(await page.locator('.pt--fill thead .l2 th').count(), before, 'Undo puts it back');
    step('taking a column out can be undone');

    await page.getByRole('link', { name: /All manuscripts/ }).first().click();
    await page.waitForSelector('.pt--matrix');
    assert.equal(await page.locator('.pt--matrix .r-row').count(), 1, 'the project is a row of the table of all manuscripts');
    await shot('all-manuscripts');
    step('All manuscripts: the project is a row');

    // The old addresses lead to the project's tabs.
    await page.goto(`${base}/#/compare`);
    await page.waitForSelector('.pt--matrix');
    await page.goto(`${base}/#/table/${encodeURIComponent(name)}`);
    await page.waitForSelector('.pt--fill');
    step('the old addresses (#/compare, #/table/…) lead to the project');

    // 6. Publishing, and the public comparison table --------------------------
    await page.getByRole('button', { name: 'Settings…' }).click();
    await page.getByLabel('Show this project in the public views').check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction((source) => {
        const t = (JSON.parse(localStorage.getItem('personalTables') || '{"tables":[]}').tables || []).find(x => x.source === source);
        return t && t.isPublished && t.rows.length > 0;
    }, name);
    // Seed annotated snippets for the chosen patterns, as the annotation editor would have saved them.
    await page.evaluate((source) => {
        const t = JSON.parse(localStorage.getItem('personalTables')).tables.find(x => x.source === source);
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
    step('publishing the project fills the public comparison table: standard columns, filled from its selection');

    // 6b. Screenshots of lines: a line, its signs, validated ---------------------
    await page.goto(`${base}/#/projects/new`);
    await page.waitForSelector('.cc-card');
    await page.getByRole('radio', { name: /The manuscript/ }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.locator('#w-source').fill('Screenshot codex');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('radio', { name: /Screenshots/ }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('radio', { name: /screenshot of the line/ }).click();
    await page.getByRole('button', { name: /Create project/ }).click();
    await page.waitForSelector('.pt--select');
    await page.locator('th[data-code="*"] input[type=checkbox]').check({ force: true });
    await page.getByRole('button', { name: /^Standard table/ }).click();
    await page.waitForSelector('.pt--fill');
    await page.getByRole('button', { name: 'Add a line…' }).click();
    const linePng = Buffer.from(await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 1200; c.height = 120;
        const g = c.getContext('2d'); g.fillStyle = '#f6efdc'; g.fillRect(0, 0, 1200, 120);
        g.fillStyle = '#222'; for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(100 + i * 130, 50, 14, 0, 7); g.fill(); }
        return c.toDataURL('image/png').split(',')[1];
    }), 'base64');
    await page.locator('.new input[type=file]').setInputFiles({ name: 'line.png', mimeType: 'image/png', buffer: linePng });
    await page.waitForSelector('.preview img');
    await page.locator('#ln-folio').fill('118');
    await page.locator('#ln-line').fill('two');
    assert.ok(await page.getByRole('button', { name: /Mark the signs/ }).isDisabled(), 'a line needs a folio and a line that fit');
    await page.locator('#ln-folio').fill('118R');
    await page.locator('#ln-line').fill('2');
    await page.getByRole('button', { name: /Mark the signs/ }).click();
    await page.waitForSelector('.stage');
    const stage = await page.locator('.stage').boundingBox();
    for (const [x1, x2] of [[0.06, 0.12], [0.2, 0.26]]) {
        await page.mouse.move(stage.x + stage.width * x1, stage.y + stage.height * 0.2);
        await page.mouse.down();
        await page.mouse.move(stage.x + stage.width * x2, stage.y + stage.height * 0.8, { steps: 5 });
        await page.mouse.up();
        await page.waitForSelector(`.sign >> nth=${x1 < 0.1 ? 0 : 1}`);
    }
    assert.equal(await page.locator('.sign').count(), 2, 'two signs are marked on the line');
    await page.locator('.sign input.code').first().fill('*');
    await page.locator('.sign input.code').first().press('Enter');
    await page.locator('.sign input.code').first().blur();
    await page.locator('.sign input.code').nth(1).fill('xx');
    await page.locator('.sign input.code').nth(1).blur();
    assert.ok(await page.locator('.sign .error').count(), 'a code that does not fit is refused');
    await shot('line-editor');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForSelector('.md-dialog', { state: 'detached' });
    assert.equal(await page.locator('.lines .card').count(), 1, 'the line is listed');
    assert.ok(await page.locator('.pt--fill .r-snip .cell .n').first().innerText(), 'the sign is a snippet of its column');
    await page.locator('.pt--fill .r-snip .cell').first().click();
    await page.waitForSelector('.drawer');
    await page.locator('.drawer .grid .snip').first().click();
    assert.match(await page.locator('.drawer .detail-head strong').innerText(), /f\. 118r · l\. 2 · sign 1/);
    step('Screenshots of lines: a line (folio and line checked), signs marked on it, each tied to its line');

    // 7. The manuscript metadata table ---------------------------------------
    await page.goto(`${base}/#/manuscripts`);
    await page.waitForSelector('.grid-scroller td');
    // one flat navigation, and the manuscripts have their own tabs
    assert.deepEqual(await page.locator('.top-nav .nav-links > a:not(.nav-util)').allInnerTexts(), ['Projects', 'Manuscripts', 'Patterns', 'Workspace', 'Settings'], 'one flat navigation, no drop-down');
    assert.deepEqual((await page.locator('nav[aria-label="Manuscripts"] .tab').allInnerTexts()).map(t => t.trim()), ['Catalogue', 'Images', 'Corpus']);
    await page.goto(`${base}/#/metadata`);
    await page.waitForURL(/#\/manuscripts$/);
    step('the old addresses (#/metadata, #/corpus, #/overview) lead to the manuscripts and the patterns');

    /** The cell of a manuscript (by row index in view order) in a column (by header label). */
    const cellAt = async (row, label) => page.locator('.grid-scroller').evaluateHandle((root, [r, l]) => {
        const heads = [...root.querySelectorAll('th.head')].map(h => h.querySelector('.label').textContent.trim());
        return root.querySelector(`td[data-r="${r}"][data-c="${heads.indexOf(l)}"]`);
    }, [row, label]);
    const textAt = async (row, label) => (await cellAt(row, label)).evaluate(el => el.querySelector('.text')?.textContent.trim());
    const clickAt = async (row, label) => (await cellAt(row, label)).asElement().click();

    const sigla = await page.locator('.grid-scroller td[data-c="0"] .text').allInnerTexts();
    assert.ok(sigla.length >= 4, 'the table lists the loaded manuscripts');
    step(`the catalogue lists ${sigla.length} manuscripts`);

    // the manuscript of the selected row leads on to its project and its pages
    await page.locator('.grid-scroller td[data-c="0"]').first().click();
    await page.getByRole('button', { name: /Start a project|Project →|projects →/ }).waitFor();
    await page.getByRole('button', { name: 'Pages →' }).waitFor();
    step('selecting a row offers Project → and Pages →');

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
    assert.equal(await page.locator('.panel').count(), 3, 'Settings holds the global preferences and the snippet attributes');
    // snippet attributes: a folio is a number and r or v, by default
    assert.ok(await page.locator('#snippet-attributes').count());
    assert.equal(await page.locator('#snippet-attributes tbody tr').count(), 3, 'folio, line and syllable');
    await page.locator('input[aria-label="New attribute of sign snippets"]').fill('Ink');
    await page.getByRole('button', { name: 'Add attribute' }).last().click();
    assert.equal(await page.locator('#snippet-attributes tbody tr').count(), 4, 'an attribute can be added');
    await page.getByRole('button', { name: 'Back to the defaults' }).click();
    assert.equal(await page.locator('#snippet-attributes tbody tr').count(), 3, 'and the defaults come back');
    step('Settings: global preferences, and the attributes of a snippet (extended, reset)');

    await page.goto(`${base}/#/equivalents`);
    await page.waitForURL(/#\/projects$/);
    step('the old Equivalents list leads to the projects');

    // Every page still opens without errors, and the table editor leads to the annotation view and back.
    for (const route of ['/', '/projects', '/projects/new', '/overview', '/patterns/corpus', '/corpus', '/manuscripts', '/manuscripts/images', '/manuscripts/corpus', '/metadata', '/metadata/iiif', '/table', '/compare', '/patterns', '/polygons', '/custom-manuscripts', '/ommr', '/settings', '/workspace']) {
        const before = problems.length;
        await page.goto(`${base}/#${route}`);
        await page.waitForTimeout(500);
        assert.equal(problems.length, before, `no errors on ${route}: ${problems.slice(before).join(' | ')}`);
    }
    step('every page opens without errors');

    // The old pattern editor (reference IDs, public notes) is still there for old work.
    await page.goto(`${base}/#/annotations`);
    await page.waitForTimeout(500);
    step('the old pattern editor still opens');

    // The table of IIIF sources, and adding a manuscript that is not in the corpus.
    await page.goto(`${base}/#/manuscripts/images`);
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
    await page.waitForURL(/#\/manuscripts\?q=/);
    await page.waitForSelector('.grid-scroller td[data-c="0"] .text:has-text("Test 1")');
    step('a manuscript outside the corpus is added and appears in the metadata table');

    // 10. Workspace management ------------------------------------------------
    await page.goto(`${base}/#/workspace`);
    await page.waitForSelector('[data-area="tables"]');
    const holds = async (area) => (await page.locator(`[data-area="${area}"] .holds`).innerText()).trim();
    assert.match(await holds('projects'), /project/);
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
    await page.goto(`${base}/#/manuscripts/corpus`);
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

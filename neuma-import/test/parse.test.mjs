import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOverview, parseDetail, textOf } from '../src/parse.mjs';

const overview = `
<table id="attek_tab"><thead><tr><th>Source</th></tr></thead>
<tbody><tr>
  <td id="forr_007" onclick="openForr('007');"><b>A-GÜ 4/4 etc.</b><br>ANTIPHONALE<br>
    <span style="font-size: 11px">Antiphoner (fragment)</span></td>
  <td><img src="img/a/007a.png"></td><td><img src="img/b/007b.png"></td><td><img src="img/k/007k.png"></td>
</tr>
<tbody><tr>
  <td id="forr_008"><b>H-Bs &amp; Co</b><br>GRADUALE<br></td>
  <td><img src="img/m/008m.png"></td>
</tr></table>`;

test('the overview gives a source with its pictures by column', () => {
    const [a, b] = parseOverview(overview);
    assert.equal(a.id, '007');
    assert.equal(a.siglum, 'A-GÜ 4/4 etc.');
    assert.equal(a.type, 'ANTIPHONALE');
    assert.equal(a.description, 'Antiphoner (fragment)');
    assert.deepEqual(a.images, { a: 'img/a/007a.png', b: 'img/b/007b.png', k: 'img/k/007k.png' });
    assert.equal(b.siglum, 'H-Bs & Co');
    assert.equal(b.description, '');
    assert.deepEqual(b.images, { m: 'img/m/008m.png' });
});

test('an image that is not a cell of the table is ignored', () => {
    const [a] = parseOverview('<table id="attek_tab"><tr><td id="forr_1"><b>X</b></td><td><img src="img/neuma.jpg"></td></tr></table>');
    assert.deepEqual(a.images, {});
});

test('the detail page gives its labelled fields and leaves out what is commented out', () => {
    const html = `<b>A-GÜ 4/4 etc.:</b> &nbsp; Antiphoner (fragment)<br><br>
    <table><tr><td><label>Type of source: </label> ANTIPHONALE</td><td><label>Collection: </label> Güssing (A)</td></tr>
    <tr><td><label>Date: </label> 14/2</td><td><label>RISM: </label> A-GÜ 4/4, 4/30</td></tr>
    <!--- <tr><td colspan="2"><label>Link: </label> <a href="http://example.org/secret">x</a></td></tr> -->
    </table>`;
    const d = parseDetail(html);
    assert.equal(d.title, 'A-GÜ 4/4 etc.');
    assert.equal(d.description, 'Antiphoner (fragment)');
    assert.deepEqual(d.fields, { type: 'ANTIPHONALE', collection: 'Güssing (A)', date: '14/2', rism: 'A-GÜ 4/4, 4/30' });
});

test('textOf decodes entities and folds white space', () => {
    assert.equal(textOf('a&nbsp;&nbsp;b <i>c</i> &#252;&#x20AC;'), 'a b c ü€');
});

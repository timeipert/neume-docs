import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, columnOfImage, proposeFromColumn, withVirga, withoutVirga, noteCount } from '../src/columns.mjs';

test('there are the catalogue\'s thirteen columns, a to m', () => {
    assert.deepEqual(COLUMNS.map(c => c.key), 'abcdefghijklm'.split(''));
});

test('a picture name says its column', () => {
    assert.equal(columnOfImage('img/b/007b.png').name, 'Pes');
    assert.equal(columnOfImage('img/k/123k.png').name, 'Combinations');
    assert.equal(columnOfImage('img/neuma.jpg'), null);
});

test('a shape is proposed by its name; a combination is not proposed at all', () => {
    assert.equal(proposeFromColumn(COLUMNS[1]).code, '[*u]');
    assert.equal(proposeFromColumn(COLUMNS[2]).code, '[*d]');
    assert.equal(proposeFromColumn(COLUMNS[11]).code, '(Clef)');
    const combination = proposeFromColumn(COLUMNS[10]);
    assert.equal(combination.code, '');
    assert.equal(combination.confidence, 'none');
});

test('the punctum column is proposed with less confidence than a pes', () => {
    assert.equal(proposeFromColumn(COLUMNS[0]).confidence, 'medium');
    assert.equal(proposeFromColumn(COLUMNS[1]).confidence, 'high');
});

test('every code that a column proposes has the notes the name says', () => {
    const notes = { a: 1, b: 2, c: 2, d: 3, e: 3, f: 3, h: 2, j: 4 };
    for (const c of COLUMNS) {
        if (!(c.key in notes)) continue;
        for (const code of c.codes.slice(0, 3)) assert.equal(noteCount(code), notes[c.key], `${c.name}: ${code}`);
    }
});

test('the virga letter goes after the note it belongs to', () => {
    assert.equal(withVirga('*ud', 0), '*Vud');
    assert.equal(withVirga('*ud', 1), '*uVd');
    assert.equal(withVirga('[*du]', 2), '[*duV]');
    assert.equal(withoutVirga('*uVd'), '*ud');
});

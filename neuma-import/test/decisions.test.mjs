import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDecisionsFile } from '../src/decisions.mjs';

test('a decisions file is read back as it was written', () => {
    const file = { version: 1, updated: '2026-10-14T10:00:00Z', decisions: {
        '007b-1': { status: 'accepted', code: '[*u]', sig: '45,63,92,81', at: '2026-10-14T09:00:00.000Z' },
        '007b-2': { status: 'later' }
    } };
    const { decisions, dropped, valid } = readDecisionsFile(file);
    assert.equal(valid, true);
    assert.equal(dropped, 0);
    assert.deepEqual(Object.keys(decisions), ['007b-1', '007b-2']);
    assert.equal(decisions['007b-1'].sig, '45,63,92,81');
    assert.equal(decisions['007b-1'].at, '2026-10-14T09:00:00.000Z');
});

test('what is not well-formed is left out, and counted', () => {
    const { decisions, dropped } = readDecisionsFile({ decisions: {
        '007b-1': { status: 'accepted' }, // no code
        '../x': { status: 'later' }, // not an id
        '007b-3': { status: 'maybe' },
        '007b-4': 'accepted',
        '007b-5': { status: 'corrected', code: '*u' }
    } });
    assert.deepEqual(Object.keys(decisions), ['007b-5']);
    assert.equal(dropped, 4);
});

test('something that is no decisions file says so', () => {
    for (const raw of [null, 'x', 3, [], {}, { decisions: [] }, { decisions: 'a' }]) assert.equal(readDecisionsFile(raw).valid, false);
});

import { describe, it, expect } from 'vitest';
import { buildLineIndex, alignItems, proposeLinks, applyProposals } from './linkAssistant';

/** A transcription line as the reader keeps it: occurrences, uuids and reading order, per pattern. */
function transcription(lines) {
    const occurrences = {};
    const noteUuids = {};
    const noteOrder = {};
    let order = 0;
    for (const [folio, line, patterns] of lines) {
        patterns.forEach((pattern, k) => {
            (occurrences[pattern] ||= []).push(['D1', folio, String(line), `s${order}`, `n${order}`]);
            (noteUuids[pattern] ||= []).push(`u${order}`);
            (noteOrder[pattern] ||= []).push(order);
            order++;
            void k;
        });
    }
    return buildLineIndex(occurrences, noteUuids, noteOrder);
}

const box = (x, w = 3) => `${x},10 ${x + w},10 ${x + w},15 ${x},15`;
const snippet = (id, pattern, x, extra = {}) => ({ id, pattern, points: box(x), ...extra });
const region = (id, name, extra = {}) => ({ id, name, points: '5,8 95,8 95,17 5,17', ...extra });
const sysId = (n, folio, line, syl = `s${n}`) => `D1|${folio}|${line}|${syl}|n${n}`;

describe('buildLineIndex', () => {
    it('puts the neumes of each line in reading order, whatever their pattern', () => {
        const index = transcription([['1r', 1, ['*', '*u', '*', '*d']]]);
        expect(index.ready).toBe(true);
        expect(index.lines.get('1r|1').map(n => n.pattern)).toEqual(['*', '*u', '*', '*d']);
        expect(index.lines.get('1r|1').map(n => n.uuid)).toEqual(['u0', 'u1', 'u2', 'u3']);
        expect(index.lines.get('1r|1')[1].sysId).toBe('D1|1r|1|s1|n1');
    });

    it('lists the lines of a folio in numeric order', () => {
        const index = transcription([['1r', 10, ['*']], ['1r', 2, ['*']], ['1v', 1, ['*']]]);
        expect(index.byFolio.get('1r')).toEqual(['2', '10']);
    });

    it('is not ready for a source imported before the order was kept', () => {
        expect(buildLineIndex({ '*': [['D', '1r', '1', 's', 'n']] }, { '*': ['u'] }, null).ready).toBe(false);
        expect(buildLineIndex(null, null, null).ready).toBe(false);
    });
});

describe('alignItems', () => {
    const neumes = (...p) => p.map(pattern => ({ pattern }));
    const item = (id, pattern, centre) => ({ id, pattern, centre });

    it('pairs snippets with neumes one to one', () => {
        const a = alignItems([item('a', '*', 10), item('b', '*u', 40), item('c', '*d', 80)], neumes('*', '*u', '*d'), { min: 5, max: 95 });
        expect(a.pairs.map(p => [p.item.id, p.neume.pattern])).toEqual([['a', '*'], ['b', '*u'], ['c', '*d']]);
        expect(a.matched).toBe(3);
    });

    it('uses where a snippet stands to say which of several equal neumes it is', () => {
        const list = neumes('*', '*', '*', '*');
        const right = alignItems([item('x', '*', 85)], list, { min: 5, max: 95 });
        expect(list.indexOf(right.pairs[0].neume)).toBe(3); // the right-hand end: the last of four plain notes
        const left = alignItems([item('x', '*', 8)], list, { min: 5, max: 95 });
        expect(list.indexOf(left.pairs[0].neume)).toBe(0);
    });

    it('skips snippets and neumes that have no partner, keeping the order', () => {
        const list = neumes('*', '*u', '*', '*d');
        const a = alignItems([item('a', '*u', 30), item('b', '*d', 80)], list, { min: 5, max: 95 });
        expect(a.pairs.map(p => [p.item.id, list.indexOf(p.neume)])).toEqual([['a', 1], ['b', 3]]);
    });

    it('matches nothing when no pattern agrees', () => {
        expect(alignItems([item('a', '*dd', 50)], neumes('*', '*u'), { min: 0, max: 100 }).matched).toBe(0);
    });
});

describe('proposeLinks', () => {
    const source = (extra = {}) => ({ name: 'Aa 1', lineUuids: { '1r': { 1: 'lc-1', 2: 'lc-2' } }, ...extra });
    const ws = (regions, items) => ({ regions: { 'Aa 1_1r': regions }, regionItems: items });

    it('links a region whose snippets are the neumes of one line, and ties it to the line', () => {
        const index = transcription([['1r', 1, ['*', '*u', '*d']], ['1r', 2, ['*dd', '*']]]);
        const { proposals, snippets, linked } = proposeLinks(source(), index,
            ws([region('r1', 'Line 1')], { r1: [snippet(1, '*', 10), snippet(2, '*u', 40), snippet(3, '*d', 75)] }));
        expect(snippets).toBe(3);
        expect(linked).toBe(0);
        expect(proposals).toHaveLength(1);
        const p = proposals[0];
        expect(p).toMatchObject({ source: 'Aa 1', folio: '1r', regionId: 'r1', line: '1', lineUuid: 'lc-1', basis: 'snippets', confidence: 'high', unmatched: 0 });
        expect(p.links).toEqual([
            { itemId: 1, index: 0, sysId: sysId(0, '1r', 1), pattern: '*' },
            { itemId: 2, index: 1, sysId: sysId(1, '1r', 1), pattern: '*u' },
            { itemId: 3, index: 2, sysId: sysId(2, '1r', 1), pattern: '*d' }
        ]);
    });

    it('finds the line by fit when the region is named otherwise', () => {
        const index = transcription([['1r', 1, ['*dd', '*dd']], ['1r', 2, ['*', '*u', '*d']]]);
        const { proposals } = proposeLinks(source(), index,
            ws([region('r1', 'Line 1')], { r1: [snippet(1, '*', 10), snippet(2, '*u', 40), snippet(3, '*d', 75)] }));
        expect(proposals[0]).toMatchObject({ line: '2', lineUuid: 'lc-2', confidence: 'high' });
    });

    it('prefers the line the name says when two fit equally', () => {
        const index = transcription([['1r', 1, ['*', '*u']], ['1r', 2, ['*', '*u']]]);
        const { proposals } = proposeLinks(source(), index,
            ws([region('r2', 'Line 2')], { r2: [snippet(1, '*', 10), snippet(2, '*u', 75)] }));
        expect(proposals[0].line).toBe('2');
    });

    it('gives two regions two different lines', () => {
        const index = transcription([['1r', 1, ['*', '*u']], ['1r', 2, ['*', '*u']]]);
        const { proposals } = proposeLinks(source(), index, ws(
            [region('r1', 'Line 1'), region('r2', 'Line 2')],
            { r1: [snippet(1, '*', 10), snippet(2, '*u', 75)], r2: [snippet(3, '*', 10), snippet(4, '*u', 75)] }
        ));
        expect(proposals.map(p => [p.regionId, p.line])).toEqual([['r1', '1'], ['r2', '2']]);
    });

    it('is high for part of a line when the snippets stand where those neumes stand', () => {
        const index = transcription([['1r', 1, ['*', '*u', '*', '*d', '*', '*u']]]);
        const p = proposeLinks(source(), index, ws([region('r1', 'Line 1')], { r1: [snippet(1, '*u', 25), snippet(2, '*d', 52)] })).proposals[0];
        expect(p.links.map(l => l.sysId)).toEqual([sysId(1, '1r', 1), sysId(3, '1r', 1)]);
        expect(p.confidence).toBe('high');
    });

    it('is medium when everything matches but the positions disagree', () => {
        const index = transcription([['1r', 1, ['*', '*u', '*', '*d', '*', '*u']]]);
        // '*d' occurs once, as the fourth of six neumes, yet the snippet stands at the far right of the region
        const p = proposeLinks(source(), index, ws([region('r1', 'Line 1')], { r1: [snippet(1, '*d', 85)] })).proposals[0];
        expect(p.links.map(l => l.sysId)).toEqual([sysId(3, '1r', 1)]);
        expect(p.confidence).toBe('medium');
    });

    it('is low when some snippets do not fit', () => {
        const index = transcription([['1r', 1, ['*', '*u', '*', '*d', '*', '*u']]]);
        const p = proposeLinks(source(), index, ws([region('r1', 'Line 1')], { r1: [snippet(1, '*u', 25), snippet(2, '*d', 52), snippet(3, '*dd', 80)] })).proposals[0];
        expect(p.confidence).toBe('low');
        expect(p.unmatched).toBe(1);
    });

    it('proposes nothing when the snippets fit no line', () => {
        const index = transcription([['1r', 1, ['*', '*u']]]);
        const out = proposeLinks(source(), index, ws([region('r1', 'Line 1')], { r1: [snippet(1, '*dd', 10), snippet(2, '*ud', 40)] }));
        expect(out.proposals).toEqual([]);
        expect(out.unresolved[0]).toMatchObject({ folio: '1r', region: 'Line 1' });
    });

    it('starts from the line the already-linked snippets stand on, and does not reuse their neumes', () => {
        const index = transcription([['1r', 1, ['*', '*', '*']]]);
        const done = snippet(1, '*', 10, { linkData: { sysId: sysId(0, '1r', 1) } });
        const { proposals, linked } = proposeLinks(source(), index, ws([region('r1', 'Line 7')], { r1: [done, snippet(2, '*', 45), snippet(3, '*', 80)] }));
        expect(linked).toBe(1);
        expect(proposals[0].line).toBe('1'); // not 7: its own snippet is on line 1
        expect(proposals[0].links.map(l => l.sysId)).toEqual([sysId(1, '1r', 1), sysId(2, '1r', 1)]);
    });

    it('proposes the right links even when snippets share an id', () => {
        const index = transcription([['1r', 1, ['*', '*u', '*d']]]);
        const same = (pattern, x) => snippet(5, pattern, x);
        const { proposals } = proposeLinks(source(), index, ws([region('r1', 'Line 1')], { r1: [same('*', 10), same('*u', 40), same('*d', 75)] }));
        expect(proposals[0].links.map(l => [l.index, l.sysId])).toEqual([[0, sysId(0, '1r', 1)], [1, sysId(1, '1r', 1)], [2, sysId(2, '1r', 1)]]);
    });

    it('ignores what is not a neume (a clef, a custos)', () => {
        const index = transcription([['1r', 1, ['*', '*u']]]);
        const { proposals, snippets } = proposeLinks(source(), index,
            ws([region('r1', 'Line 1')], { r1: [snippet(1, 'clef', 6), snippet(2, '*', 20), snippet(3, '*u', 60)] }));
        expect(snippets).toBe(2);
        expect(proposals[0].confidence).toBe('high');
        expect(proposals[0].links).toHaveLength(2);
    });

    it('offers a region without snippets its named line, with low confidence', () => {
        const index = transcription([['1r', 2, ['*', '*u']]]);
        const { proposals } = proposeLinks(source(), index, ws([region('r2', 'Line 2')], { r2: [] }));
        expect(proposals).toEqual([expect.objectContaining({ regionId: 'r2', line: '2', lineUuid: 'lc-2', basis: 'name', confidence: 'low', links: [] })]);
    });

    it('does not touch a region that already has its line', () => {
        const index = transcription([['1r', 2, ['*', '*u']]]);
        const { proposals } = proposeLinks(source(), index, ws([region('r2', 'Line 2', { lineUUID: 'chosen' })], { r2: [] }));
        expect(proposals).toEqual([]);
    });

    it('leaves out the line link when the line has no ending marker, but still links the snippets', () => {
        const index = transcription([['1r', 3, ['*', '*u']]]);
        const { proposals } = proposeLinks(source(), index, ws([region('r3', 'Line 3')], { r3: [snippet(1, '*', 10), snippet(2, '*u', 75)] }));
        expect(proposals[0].lineUuid).toBe('');
        expect(proposals[0].links).toHaveLength(2);
    });

    it('works only on its own source', () => {
        const index = transcription([['1r', 1, ['*']]]);
        const workspace = { regions: { 'Bb 2_1r': [region('x', 'Line 1')] }, regionItems: { x: [snippet(1, '*', 10)] } };
        expect(proposeLinks(source(), index, workspace).proposals).toEqual([]);
    });
});

describe('applyProposals', () => {
    const workspace = () => ({
        regions: { 'Aa 1_1r': [{ id: 'r1', name: 'Line 1', points: 'p' }, { id: 'r2', name: 'Line 2', points: 'p' }] },
        regionItems: {
            r1: [{ id: 1, pattern: '*', points: 'p' }, { id: 2, pattern: '*u', points: 'p', linkData: { sysId: 'already' } }],
            r2: [{ id: 3, pattern: '*', points: 'p' }]
        }
    });
    const proposal = (extra = {}) => ({
        source: 'Aa 1', folio: '1r', regionId: 'r1', line: '1', lineUuid: 'lc-1', basis: 'snippets', confidence: 'high',
        links: [{ itemId: 1, index: 0, sysId: 'D1|1r|1|s0|n0', pattern: '*' }, { itemId: 2, index: 1, sysId: 'D1|1r|1|s1|n1', pattern: '*u' }], ...extra
    });

    it('links the snippets and the line', () => {
        const out = applyProposals([proposal()], workspace());
        expect(out.regionItems.r1[0].linkData).toEqual({ sysId: 'D1|1r|1|s0|n0' });
        expect(out.regions['Aa 1_1r'][0].lineUUID).toBe('lc-1');
        expect(out.linkedSnippets).toBe(1);
        expect(out.linkedLines).toBe(1);
    });

    it('never replaces a link that is already there', () => {
        const out = applyProposals([proposal()], workspace());
        expect(out.regionItems.r1[1].linkData.sysId).toBe('already');
    });

    it('does not change what it was given, and leaves other regions as they are', () => {
        const ws = workspace();
        const before = JSON.stringify(ws);
        const out = applyProposals([proposal()], ws);
        expect(JSON.stringify(ws)).toBe(before);
        expect(out.regionItems.r2).toBe(ws.regionItems.r2);
        expect(out.regions['Aa 1_1r'][1]).toBe(ws.regions['Aa 1_1r'][1]);
    });

    it('takes snippet ids as numbers or strings', () => {
        const out = applyProposals([proposal({ links: [{ itemId: '1', index: 0, sysId: 'x', pattern: '*' }] })], workspace());
        expect(out.regionItems.r1[0].linkData.sysId).toBe('x');
    });

    it('addresses snippets by position, so snippets that share an id (made in the same millisecond) are told apart', () => {
        const ws = {
            regions: { 'Aa 1_1r': [{ id: 'r1', name: 'Line 1', points: 'p' }] },
            regionItems: { r1: [{ id: 7, pattern: '*', points: 'p' }, { id: 7, pattern: '*u', points: 'p' }, { id: 7, pattern: '*d', points: 'p' }] }
        };
        const out = applyProposals([{ source: 'Aa 1', folio: '1r', regionId: 'r1', lineUuid: '', links: [
            { itemId: 7, index: 0, sysId: 'a', pattern: '*' }, { itemId: 7, index: 2, sysId: 'c', pattern: '*d' }] }], ws);
        expect(out.regionItems.r1.map(i => i.linkData?.sysId)).toEqual(['a', undefined, 'c']);
        expect(out.linkedSnippets).toBe(2);
    });

    it('links nothing if the snippet at that position is no longer the one proposed', () => {
        const out = applyProposals([proposal({ links: [{ itemId: 99, index: 0, sysId: 'x', pattern: '*' }] })], workspace());
        expect(out.regionItems.r1[0].linkData).toBeUndefined();
        expect(out.linkedSnippets).toBe(0);
    });

    it('can link a line alone (a region without snippets)', () => {
        const out = applyProposals([proposal({ regionId: 'r2', links: [], basis: 'name', lineUuid: 'lc-2' })], workspace());
        expect(out.regions['Aa 1_1r'][1].lineUUID).toBe('lc-2');
        expect(out.linkedSnippets).toBe(0);
    });
});

import { describe, expect, it } from 'vitest';
import { iiifKey, iiifStatus, isWebAddress } from './iiifStatus';

const store = (over = {}) => ({ links: {}, parsedData: {}, folioImageSources: {}, manifestStatus: {}, ...over });

describe('the page images of a manuscript', () => {
    it('are not there when nothing is linked and nothing is known', () => {
        expect(iiifStatus(store(), 'A')).toEqual({ state: 'none', link: '', error: '' });
        expect(iiifStatus(store(), '')).toEqual({ state: 'none', link: '', error: '' });
    });

    it('are ready when the pages are known', () => {
        const parsed = store({ links: { A: 'https://x/m' }, parsedData: { A: [{ folio: '1r', imgUrl: 'u' }] } });
        expect(iiifStatus(parsed, 'A')).toEqual({ state: 'ready', link: 'https://x/m', error: '' });
    });

    it('are ready from the addresses in the corpus, without a manifest', () => {
        const docs = store({ parsedData: { A: [{ folio: '1r' }] }, folioImageSources: { A: true } });
        expect(iiifStatus(docs, 'A').state).toBe('ready');
        expect(iiifStatus(store({ folioImageSources: { A: true } }), 'A').state).toBe('ready');
    });

    it('are being read while a linked manifest has no pages yet', () => {
        expect(iiifStatus(store({ links: { A: 'https://x/m' } }), 'A').state).toBe('loading');
        expect(iiifStatus(store({ links: { A: 'https://x/m' }, manifestStatus: { A: { status: 'loading' } } }), 'A').state).toBe('loading');
    });

    it('say why a manifest could not be read', () => {
        const failed = store({ links: { A: 'https://x/m' }, manifestStatus: { A: { status: 'error', error: 'HTTP 404' } } });
        expect(iiifStatus(failed, 'A')).toEqual({ state: 'error', link: 'https://x/m', error: 'HTTP 404' });
    });

    it('are not those of another manuscript', () => {
        expect(iiifStatus(store({ links: { B: 'https://x/m' }, parsedData: { B: [{ folio: '1r' }] } }), 'A').state).toBe('none');
    });
});

describe('a manifest address', () => {
    it('is a web address', () => {
        expect(isWebAddress('https://example.org/iiif/manifest.json')).toBe(true);
        expect(isWebAddress(' http://example.org/m ')).toBe(true);
        expect(isWebAddress('example.org/manifest')).toBe(false);
        expect(isWebAddress('https://exa mple.org')).toBe(false);
        expect(isWebAddress('')).toBe(false);
    });
});

describe('the key a source is kept under', () => {
    const links = { 'Kön D': 'https://a/m.json', 'Kön': 'https://a/n.json', 'Pa 1235': 'https://a/p.json' };

    it('is the source itself when a manifest is linked for it', () => {
        expect(iiifKey(store({ links }), 'Kön D')).toBe('Kön D');
    });

    it('is the longest manifest the source starts with, ending at a hyphen or a space', () => {
        expect(iiifKey(store({ links }), 'Kön D-219v-a-19')).toBe('Kön D');
        expect(iiifKey(store({ links }), 'Kön D 219')).toBe('Kön D');
        expect(iiifKey(store({ links }), 'Pa 1235-9-1')).toBe('Pa 1235');
    });

    it('is not a manifest whose name only begins like the source', () => {
        expect(iiifKey(store({ links }), 'Pa 12350')).toBe('Pa 12350');
        expect(iiifKey(store({ links }), 'Kön Dx')).toBe('Kön');
    });

    it('is the source itself when no manifest is known, and nothing for nothing', () => {
        expect(iiifKey(store({ links }), 'Zürich C 78')).toBe('Zürich C 78');
        expect(iiifKey(store(), '')).toBe('');
        expect(iiifKey(store(), undefined)).toBe('');
    });

    it('lets the status of a closer source be the status of its manifest', () => {
        const parsedData = { 'Kön D': [{ folio: '1r' }] };
        expect(iiifStatus(store({ links, parsedData }), 'Kön D-219v-a-19').state).toBe('ready');
        expect(iiifStatus(store({ links, manifestStatus: { 'Kön D': { status: 'error', error: 'HTTP 500' } } }), 'Kön D-219v').state).toBe('error');
    });
});

import { describe, expect, it } from 'vitest';
import { iiifStatus, isWebAddress } from './iiifStatus';

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

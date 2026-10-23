import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick, ref } from 'vue';
import { installStorage } from '../utils/workspaceTestKit';

async function fresh() {
    installStorage();
    setActivePinia(createPinia());
    const { useAnnotationsStore } = await import('../stores/annotations');
    const { useDirectSnippetsStore } = await import('../stores/directSnippets');
    const { useSnippetEdit } = await import('./useSnippetEdit');
    const { useSnippetRetag } = await import('./useSnippetRetag');
    const { usePatternDraft } = await import('./usePatternDraft');
    const { useToast } = await import('./useToast');
    return {
        annotations: useAnnotationsStore(), direct: useDirectSnippetsStore(),
        useSnippetEdit, useSnippetRetag, usePatternDraft, toasts: useToast().toasts
    };
}

describe('editing a snippet', () => {
    let t;
    beforeEach(async () => { t = await fresh(); });

    function pageSnippet() {
        t.annotations.addAnnotation('Aa 13', '8r', '*', '1,1 2,1 2,2 1,2', { id: 's1' });
        return { id: 's1', source: 'Aa 13', folio: '8r', pattern: '*', kind: 'sign' };
    }

    function screenshot() {
        const c = t.direct.createCollection('Aa 13', 'Aa 13');
        t.direct.addPattern(c.id, '*');
        t.direct.addSnippet(c.id, { pattern: '*', image: 'data:image/png;base64,AA==' });
        const s = t.direct.getCollection(c.id).snippets[0];
        return { collection: c, snippet: { ...s, kind: 'image' } };
    }

    describe('useSnippetEdit', () => {
        it('saves an attribute on a sign, and takes it off when it is emptied', () => {
            const s = pageSnippet();
            const { saveAttr } = t.useSnippetEdit(() => null);
            const def = { key: 'syllable', label: 'Syllable', type: 'text' };
            expect(saveAttr(s, def, 'um').ok).toBe(true);
            expect(t.annotations.getAnnotations('Aa 13', '8r', '*')[0].attrs).toEqual({ syllable: 'um' });
            saveAttr({ ...s, attrs: { syllable: 'um' } }, def, '');
            expect(t.annotations.getAnnotations('Aa 13', '8r', '*')[0].attrs).toEqual({});
        });

        it('saves on a screenshot through its collection', () => {
            const { collection, snippet } = screenshot();
            const { savePaleo } = t.useSnippetEdit(() => collection);
            expect(savePaleo(snippet, ['r'])).toBe(true);
            expect(t.direct.getCollection(collection.id).snippets[0].paleo).toEqual(['r']);
        });

        it('cannot save a screenshot without a collection', () => {
            const { snippet } = screenshot();
            expect(t.useSnippetEdit(() => null).update(snippet, { favorite: true })).toBe(false);
        });
    });

    describe('useSnippetRetag', () => {
        it('re-files a sign and offers Undo', () => {
            const s = pageSnippet();
            const { retag } = t.useSnippetRetag(() => null);
            expect(retag(s, '*V')).toBe(true);
            expect(t.annotations.getAnnotations('Aa 13', '8r', '*V')).toHaveLength(1);

            t.toasts.value.at(-1).action.run();
            expect(t.annotations.getAnnotations('Aa 13', '8r', '*')).toHaveLength(1);
            expect(t.annotations.getAnnotations('Aa 13', '8r', '*V')).toHaveLength(0);
        });

        it('re-files a screenshot and gives its collection the new pattern', () => {
            const { collection, snippet } = screenshot();
            const { retag } = t.useSnippetRetag(() => collection);
            expect(retag(snippet, '*V')).toBe(true);
            const now = t.direct.getCollection(collection.id);
            expect(now.snippets[0].pattern).toBe('*V');
            expect(now.patterns.map(p => p.code)).toContain('*V');
        });

        it('refuses a code the library cannot hold, and the same code', () => {
            const s = pageSnippet();
            const { retag } = t.useSnippetRetag(() => null);
            expect(retag(s, 'u')).toBe(false);
            expect(retag(s, '[*u')).toBe(false);
            expect(retag(s, '*')).toBe(false);
            expect(t.annotations.getAnnotations('Aa 13', '8r', '*')).toHaveLength(1);
        });
    });

    describe('usePatternDraft', () => {
        it('follows the snippet, and says whether the draft differs from it', async () => {
            const s = ref({ id: 's1', pattern: '*' });
            const { draft, changed, virgaCount } = t.usePatternDraft(s, () => true);
            expect(draft.value).toBe('*');
            expect(changed.value).toBe(false);
            draft.value = '*V';
            expect(changed.value).toBe(true);
            expect(virgaCount.value).toBe(1);
            s.value = { id: 's2', pattern: '[*d]' };
            await nextTick();
            expect(draft.value).toBe('[*d]');
            expect(virgaCount.value).toBe(2);
        });

        it('toggles a virga and commits at once', () => {
            const s = ref({ id: 's1', pattern: '*' });
            const calls = [];
            const { toggleVirgaNote, virgaOn } = t.usePatternDraft(s, (snippet, code) => { calls.push(code); return true; });
            toggleVirgaNote(0);
            expect(calls).toEqual(['*V']);
            expect(virgaOn.value).toEqual([0]);
        });
    });
});

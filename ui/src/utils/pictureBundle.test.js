import { describe, expect, it } from 'vitest';
import { pictureFilePath, planPictures, withLocalPaths } from './pictureBundle';

const items = () => [
    { id: 'Pa 833', data: { snippets: [{ id: '1', image: 'https://gallica.example/a/300,/0/default.jpg' }, { id: '2', image: '' }, { id: '3', image: 'images/x.jpg' }, { id: '4', image: 'https://gallica.example/b', local: 'images/Pa_833/4.jpg' }] } },
    { id: 'Aa 13', data: { snippets: [{ id: '9', image: 'https://diamm.example/c' }] } }
];

describe('pictures as files', () => {
    it('names a file after the manuscript and the snippet, safe in a file name', () => {
        expect(pictureFilePath('Pa 833', '17/8')).toBe('images/Pa_833/17_8.jpg');
    });
    it('plans only the pictures that come from a server and are no file yet', () => {
        expect(planPictures(items())).toEqual([
            { item: 0, snippet: '1', url: 'https://gallica.example/a/300,/0/default.jpg', path: 'images/Pa_833/1.jpg' },
            { item: 1, snippet: '9', url: 'https://diamm.example/c', path: 'images/Aa_13/9.jpg' }
        ]);
    });
    it('names the file of each snippet that was written, and leaves the rest and the original alone', () => {
        const before = items();
        const after = withLocalPaths(before, [{ item: 0, snippet: '1', path: 'images/Pa_833/1.jpg' }]);
        expect(after[0].data.snippets[0]).toMatchObject({ id: '1', local: 'images/Pa_833/1.jpg', image: 'https://gallica.example/a/300,/0/default.jpg' });
        expect(after[0].data.snippets[1].local).toBeUndefined();
        expect(after[1]).toBe(before[1]);
        expect(before[0].data.snippets[0].local).toBeUndefined();
    });
});

/**
 * Favourite snippets. A cell can hold many snippets of one code; the person picks the ones that stand for it
 * and the table always shows those, one under the other. A cell without a favourite shows its first snippet, as it did,
 * so no table is empty for want of a choice.
 *
 * A favourite is a flag on the snippet itself (`favorite`), wherever the snippet is kept.
 *
 * Plain functions on plain data.
 */

export const isFavorite = (snippet) => !!(snippet && snippet.favorite);

/** The snippets of a place that are shown: the favourites, in the order they come, else the first one. */
export function shownOf(list) {
    const items = Array.isArray(list) ? list : [];
    const favourites = items.filter(isFavorite);
    return favourites.length ? favourites : items.slice(0, 1);
}

/** How many snippets of a place are not shown. */
export const notShown = (list) => (Array.isArray(list) ? list.length : 0) - shownOf(list).length;

/** The snippet that stands for a place — its first favourite, else its first snippet — or null. */
export const representative = (list) => shownOf(list)[0] || null;

/**
 * The snippets of a cell that a table shows: its favourites, wherever they stand — a favourite `*V{l}` needs no `*V` beside it —
 * or, without any, the first snippet of each place (`placeKey` says which place a snippet is in: its attributes).
 */
export function visibleSnippets(list, placeKey = () => '') {
    const items = Array.isArray(list) ? list : [];
    if (items.some(isFavorite)) return items.filter(isFavorite);
    const seen = new Set();
    return items.filter((s) => {
        const key = placeKey(s);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

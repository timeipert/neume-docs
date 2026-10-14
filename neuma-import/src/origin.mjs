/**
 * Where the catalogue's data comes from and who made it, to be carried with everything made from it.
 * Kept apart from the code that needs images (`pngjs`), so that anything may read it.
 */
export const SITE = 'https://neuma.zti.hu/';
export const OVERVIEW_PAGE = 'en_attekinto.asp';

export const ORIGIN = {
    name: 'Hungarian Neume Catalogue – Notation Signs in Medieval Hungary',
    url: `${SITE}${OVERVIEW_PAGE}`,
    authors: ['Gabriella Gilányi (project idea, content)', 'Zsolt Kemecsei (web design, programming)', 'Adrienn Ádám (picture editing)'],
    publisher: 'Institute of Musicology, Research Centre for the Humanities, Budapest',
    note: 'The snippets are excerpts from manuscripts, published by the catalogue under the right to quote for scientific purposes (Hungarian Act LXXVI of 1999, Section 34). Cite the catalogue and the source of the snippet.'
};


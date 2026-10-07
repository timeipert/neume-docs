/**
 * What is said about a documentation when it is published: who made it, under which licence,
 * and which metadata columns the readers are shown. Kept with the settings, so it travels with
 * backups. Plain functions, so what is stored and restored can be cleaned the same way.
 */

export const defaultPublication = () => ({
    title: '', description: '', authors: [], publisher: '', license: '', doi: '', url: '', year: '', preferredCitation: '',
    /** the keys of the metadata columns shown to readers; null = the ones that are safe to show */
    columns: null
});

const text = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** What is read from storage or a backup, made safe to use. */
export function cleanPublication(raw) {
    const out = defaultPublication();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    out.title = text(raw.title, 200);
    out.description = text(raw.description, 2000);
    out.publisher = text(raw.publisher, 200);
    out.license = text(raw.license, 200);
    out.doi = text(raw.doi, 200);
    out.preferredCitation = text(raw.preferredCitation, 600);
    out.url = text(raw.url, 500);
    out.year = /^\d{4}$/.test(String(raw.year ?? '').trim()) ? String(raw.year).trim() : '';
    out.authors = (Array.isArray(raw.authors) ? raw.authors : []).map(a => text(a, 120)).filter(Boolean).slice(0, 40);
    if (Array.isArray(raw.columns)) out.columns = [...new Set(raw.columns.filter(k => typeof k === 'string' && k))].slice(0, 200);
    return out;
}

/** Authors as typed, one on each line (or separated by semicolons). */
export function parseAuthors(source) {
    return String(source ?? '').split(/[\r\n;]+/).map(a => a.trim()).filter(Boolean).slice(0, 40);
}

/**
 * Catalogue fields shown to readers unless the publisher says otherwise. The comment, the folio
 * offset and the status are the publisher's working notes, so they stay out until they are ticked.
 */
export const PUBLIC_CATALOGUE_FIELDS = [
    'herkunftsregion', 'herkunftsort', 'herkunftsinstitution', 'ordenstradition', 'quellentyp',
    'bibliotheksort', 'bibliothek', 'bibliothekssignatur', 'datierung', 'jahrhundert'
];

/**
 * The columns readers are shown.
 * @param {Array<{ key: string, group: string, field?: string }>} columns  the columns of the manuscripts table
 */
export function publishedColumns(columns, publication) {
    const metadata = columns.filter(c => c.group === 'catalogue' || c.group === 'project');
    if (publication && Array.isArray(publication.columns)) {
        const wanted = new Set(publication.columns);
        return metadata.filter(c => wanted.has(c.key));
    }
    return metadata.filter(c => c.group === 'project' || PUBLIC_CATALOGUE_FIELDS.includes(c.field));
}

/** Whether a documentation could be published as it is: what is missing, as a sentence each. */
export function publicationGaps(publication, count) {
    const gaps = [];
    if (!publication.title.trim()) gaps.push('It has no title.');
    if (!publication.authors.length) gaps.push('Nobody is named as its author, so a citation has nobody to name.');
    if (!publication.license.trim()) gaps.push('It has no licence, so readers do not know what they may do with it.');
    if (!count) gaps.push('Nothing is published yet: publish a project (its settings have the switch) to put a manuscript into it.');
    return gaps;
}

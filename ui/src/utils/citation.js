/**
 * Suggestions for citing a documentation, or one thing in it: a manuscript, a pattern of a manuscript,
 * a cell of the neume table, a snippet, a selection made with the filters.
 *
 * What is cited is named by `target`; where it is by `url` (the address that leads back to exactly
 * that thing, highlighted); the documentation by `info` (see utils/documentation); the version by
 * `version` (a commit, when the documentation is on GitHub) and the day it was looked at by `accessed`.
 * All plain functions.
 */

export const CITE_STYLES = [
    { value: 'short', label: 'Short', hint: 'For a footnote or running text' },
    { value: 'apa', label: 'APA', hint: 'APA 7th edition' },
    { value: 'chicago', label: 'Chicago', hint: 'Chicago author–date, 17th edition' },
    { value: 'mla', label: 'MLA', hint: 'MLA 9th edition' },
    { value: 'bibtex', label: 'BibTeX', hint: 'For LaTeX and reference managers' },
    { value: 'ris', label: 'RIS', hint: 'For Zotero, EndNote, Citavi' }
];

/** What a style's file is called when it is saved, or '' for a style that is only text. */
export const CITE_FILE = { bibtex: { extension: 'bib', type: 'application/x-bibtex' }, ris: { extension: 'ris', type: 'application/x-research-info-systems' } };

// ---- names -------------------------------------------------------------------------------------

const PARTICLES = new Set(['van', 'von', 'de', 'der', 'den', 'di', 'da', 'del', 'della', 'du', 'la', 'le', 'zu', 'zur', 'dos', 'das', 'ter', 'ten']);

/** "Anna Author", "Author, Anna", "Jan van der Berg" → { family, given }. */
export function splitName(name) {
    const n = String(name ?? '').trim().replace(/\s+/g, ' ');
    if (!n) return { family: '', given: '' };
    if (n.includes(',')) {
        const [family, ...rest] = n.split(',');
        return { family: family.trim(), given: rest.join(',').trim() };
    }
    const tokens = n.split(' ');
    if (tokens.length === 1) return { family: tokens[0], given: '' };
    let i = tokens.length - 1;
    while (i > 1 && PARTICLES.has(tokens[i - 1].toLowerCase())) i--;
    return { family: tokens.slice(i).join(' '), given: tokens.slice(0, i).join(' ') };
}

/** "Anna Maria" → "A. M."; "Jean-Luc" → "J.-L." */
export function initials(given) {
    return String(given ?? '').trim().split(/\s+/).filter(Boolean)
        .map(part => part.split('-').filter(Boolean).map(p => `${p[0].toUpperCase()}.`).join('-')).join(' ');
}

const natural = (n) => { const { family, given } = splitName(n); return [given, family].filter(Boolean).join(' '); };
const inverted = (n) => { const { family, given } = splitName(n); return [family, given].filter(Boolean).join(', '); };
const apaName = (n) => { const { family, given } = splitName(n); return given ? `${family}, ${initials(given)}` : family; };

/** A list of names with "and": A / A and B / A, B, and C (Chicago, MLA) */
function andList(names) {
    if (names.length <= 1) return names[0] || '';
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/** APA: A / A, & B / A, B, & C */
function apaList(names) {
    if (names.length <= 1) return names[0] || '';
    if (names.length === 2) return `${names[0]}, & ${names[1]}`;
    return `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`;
}

// ---- what is cited -----------------------------------------------------------------------------------

/** What is cited, in words. `target.kind` is documentation | manuscript | pattern | cell | pattern-column | snippet | selection. */
export function describeTarget(target) {
    if (!target) return '';
    const t = target;
    const holding = t.holding ? ` [${t.holding}]` : '';
    switch (t.kind) {
        case 'manuscript': return `${t.source}${holding}`;
        case 'pattern': return `${t.source}${holding}, pattern ${t.pattern}${t.refId && t.refId !== '-' ? ` (Ref ID ${t.refId})` : ''}`;
        case 'cell': return `${t.source}${holding}, pattern ${t.pattern}`;
        case 'pattern-column': return `Pattern ${t.pattern}`;
        case 'snippet': {
            const where = [t.folio ? `f. ${t.folio}` : '', t.line ? `line ${t.line}` : ''].filter(Boolean).join(', ');
            return `${t.source}${holding}${where ? `, ${where}` : ''}, pattern ${t.pattern}${t.refId && t.refId !== '-' ? ` (${t.refId})` : ''}`;
        }
        case 'selection': return `Selection of ${t.count} manuscript${t.count === 1 ? '' : 's'}${t.summary ? ` (${t.summary})` : ''}`;
        default: return '';
    }
}

const yearOf = (info, generated) => info.year || String(generated || '').slice(0, 4);
const MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function dateParts(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}
const mlaDate = (iso) => { const p = dateParts(iso); return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : ''; };
const longDate = (iso) => { const p = dateParts(iso); return p ? `${MONTH_NAMES[p.m - 1]} ${p.d}, ${p.y}` : ''; };

const doiUrl = (doi) => (!doi ? '' : /^https?:/i.test(doi) ? doi : `https://doi.org/${doi.replace(/^doi:\s*/i, '')}`);
const stop = (s) => (/[.!?”"]$/.test(s) ? s : `${s}.`);
const clean = (s) => s.replace(/\s+/g, ' ').replace(/\s+([.,])/g, '$1').trim();

/** The kind of work it is, in a few words, for the styles that say so. */
const WORK = 'Documentation of neume notation';

function bibKey(info, year, target) {
    const family = splitName((info.authors || [])[0]).family;
    const part = target && target.kind !== 'documentation' ? (target.source || target.pattern || target.kind) : '';
    return [family || 'neumedocs', year, part].filter(Boolean).join('-').toLowerCase().replace(/[^a-z0-9-]+/g, '') || 'neumedocs';
}

const brace = (s) => String(s).replace(/[{}]/g, '');

// ---- the suggestions --------------------------------------------------------------------------------------

/**
 * One suggestion, as text.
 * @param {string} style  short | preferred | apa | chicago | mla | bibtex | ris
 */
export function citation(style, { info, generated = '', target = null, url = '', accessed = '', version = '' }) {
    const what = describeTarget(target);
    const title = info.title;
    const year = yearOf(info, generated);
    const authors = info.authors || [];
    const doi = doiUrl(info.doi);
    const publisher = info.publisher || '';
    const ver = version ? `version ${version}` : '';
    // a reference to one thing is cited by its own address; the DOI names the documentation as a whole
    const link = target && target.kind !== 'documentation' ? url : (doi || url);

    if (style === 'short') {
        return clean(`${what ? `${what} — ` : ''}${title}${year ? ` (${year})` : ''}${ver ? `, ${ver}` : ''}${url ? `, ${url}` : ''}`);
    }

    if (style === 'preferred') {
        return clean(`${stop(info.preferredCitation || title)}${what ? ` ${stop(what)}` : ''}${url ? ` ${url}` : ''}${accessed ? ` (accessed ${accessed})` : ''}`);
    }

    if (style === 'apa') {
        const who = apaList(authors.map(apaName));
        const work = `${title} [${WORK}${ver ? `, ${ver}` : ''}]`;
        const titlePart = what ? `${stop(what)} In ${work}.` : `${work}.`;
        const parts = who ? [`${who} (${year || 'n.d.'}).`, titlePart] : [titlePart, `(${year || 'n.d.'}).`];
        if (publisher) parts.push(stop(publisher));
        if (link) parts.push(link);
        return clean(parts.join(' '));
    }

    if (style === 'chicago') {
        const names = authors.map((n, i) => (i === 0 ? inverted(n) : natural(n)));
        const who = andList(names);
        const parts = [];
        parts.push(who ? stop(who) : '');
        parts.push(stop(year || 'n.d.'));
        if (what) parts.push(`“${stop(what)}” In ${stop(title)}`);
        else parts.push(stop(title));
        if (ver) parts.push(`${stop(ver.charAt(0).toUpperCase() + ver.slice(1))}`);
        if (publisher) parts.push(stop(publisher));
        if (link) parts.push(link);
        if (accessed) parts.push(`Accessed ${longDate(accessed)}.`);
        return clean(parts.filter(Boolean).join(' '));
    }

    if (style === 'mla') {
        const names = authors.map((n, i) => (i === 0 ? inverted(n) : natural(n)));
        // MLA: one author, two (the first inverted, with a comma before the and), or the first and "et al"
        const who = names.length > 2 ? `${names[0]}, et al` : names.length === 2 ? `${names[0]}, and ${names[1]}` : names[0] || '';
        const parts = [];
        if (who) parts.push(stop(who));
        if (what) parts.push(`“${stop(what)}”`);
        const container = [title, ver ? ver.charAt(0).toUpperCase() + ver.slice(1) : '', publisher, year, link].filter(Boolean).join(', ');
        parts.push(stop(container));
        if (accessed) parts.push(`Accessed ${mlaDate(accessed)}.`);
        return clean(parts.join(' '));
    }

    if (style === 'bibtex') {
        const field = (name, value, wrap = (v) => v) => (value ? `  ${name} = {${wrap(brace(value))}},\n` : '');
        return `@online{${bibKey(info, year, target)},\n`
            + field('author', authors.map(inverted).join(' and '))
            + field('title', what ? `${what}. In: ${title}` : title)
            + field('year', year)
            + field('publisher', publisher)
            + field('version', version)
            + field('doi', info.doi && info.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, ''))
            + field('url', url)
            + field('urldate', accessed)
            + field('note', [info.license ? `License: ${info.license}` : '', WORK].filter(Boolean).join('. '))
            + '}';
    }

    if (style === 'ris') {
        const line = (tag, value) => (value ? `${tag}  - ${String(value).replace(/\r?\n/g, ' ')}\r\n` : '');
        return 'TY  - ELEC\r\n'
            + authors.map(a => line('AU', inverted(a))).join('')
            + line('TI', what ? `${what}. In: ${title}` : title)
            + line('PY', year)
            + line('PB', publisher)
            + line('ET', version)
            + line('DO', info.doi && info.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, ''))
            + line('UR', url)
            + line('Y2', accessed && accessed.replace(/-/g, '/'))
            + line('N1', [info.license ? `License: ${info.license}` : '', WORK].filter(Boolean).join('. '))
            + 'ER  - \r\n';
    }

    return '';
}

/** Several things at once (the snippets a reader starred): one entry each, with keys that differ. */
export function citationList(style, { info, generated = '', items, accessed = '', version = '' }) {
    const entries = items.map(({ target, url }) => citation(style, { info, generated, target, url, accessed, version }));
    if (style === 'bibtex') {
        const seen = new Map();
        return entries.map(entry => entry.replace(/^@online\{([^,]+),/, (_, key) => {
            const n = (seen.get(key) || 0) + 1;
            seen.set(key, n);
            return `@online{${n > 1 ? `${key}-${n}` : key},`;
        })).join('\n\n');
    }
    if (style === 'ris') return entries.join('\r\n');
    return entries.map((e, i) => `${i + 1}. ${e}`).join('\n');
}

/** The address of a reference: the page, with what to highlight as a query. */
export function referenceUrl(pageUrl, query = {}) {
    const [path, existing = ''] = String(pageUrl).split('?');
    const params = new URLSearchParams(existing);
    for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null || v === '') params.delete(k);
        else params.set(k, String(v));
    }
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
}

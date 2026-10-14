/**
 * Reads the pages of the catalogue: the overview table (one row per source, one picture per kind of
 * neume) and the detail text of a source.
 *
 * The pages are plain, regular HTML that the catalogue's own scripts fill, so a few regular expressions
 * are enough and nothing has to be installed. Everything returned is plain data.
 */
import { COLUMNS, columnOfImage } from './columns.mjs';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Text of a piece of HTML: tags dropped, entities decoded, white space folded. */
export function textOf(html) {
    return String(html ?? '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
            if (e[0] === '#') {
                const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
                return Number.isFinite(code) ? String.fromCodePoint(code) : m;
            }
            return ENTITIES[e.toLowerCase()] ?? m;
        })
        .replace(/[ \t\r\f\v ]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .trim();
}

/**
 * The sources of the overview page.
 *
 * @param {string} html the page `en_attekinto.asp`
 * @returns {Array<{ id: string, siglum: string, type: string, description: string, images: Object<string, string> }>}
 *   `images` maps a column key (a–m) to the picture's path on the site, e.g. `{ b: 'img/b/007b.png' }`
 */
export function parseOverview(html) {
    const table = /<table id="attek_tab"[\s\S]*?<\/table>|<table id="attek_tab"[\s\S]*$/.exec(html);
    const body = table ? table[0] : html;
    const sources = [];
    for (const row of body.split(/<tr[\s>]/i).slice(1)) {
        const head = /id="forr_(\w+)"[^>]*>([\s\S]*?)<\/td>/i.exec(row);
        if (!head) continue;
        const id = head[1];
        const lines = textOf(head[2]).split('\n').map(s => s.trim()).filter(Boolean);
        const images = {};
        for (const m of row.matchAll(/<img[^>]*\ssrc="([^"]+)"/gi)) {
            const column = columnOfImage(m[1]);
            if (column) images[column.key] = m[1].replace(/^\.?\//, '');
        }
        sources.push({
            id,
            siglum: lines[0] || id,
            type: lines[1] || '',
            description: lines.slice(2).join(' '),
            images
        });
    }
    return sources;
}

/** The labels of a source's detail page, in the language of the page (English) and the keys we use. */
const DETAIL_KEYS = {
    'type of source': 'type',
    'collection': 'collection',
    'date': 'date',
    'rism': 'rism',
    'provenance': 'provenance',
    'notation': 'notation',
    'numerus': 'numerus',
    'presentation': 'presentation',
    'link': 'link'
};

/**
 * What a source's detail page says: its label/value pairs.
 *
 * @param {string} html the page `en_forras_reszletes.asp?i=…`
 * @returns {{ title: string, description: string, fields: Object<string, string> }}
 */
export function parseDetail(html) {
    // The page keeps a link to the source inside a comment, which its authors left out of what is shown;
    // that stays out (textOf drops comments, and so does this).
    const live = String(html ?? '').replace(/<!--[\s\S]*?-->/g, '');
    const head = /<b>([\s\S]*?):?<\/b>\s*(?:&nbsp;|\s)*([^<]*)/i.exec(live);
    const fields = {};
    for (const m of live.matchAll(/<label>\s*([^<]*?)\s*:?\s*<\/label>([\s\S]*?)<\/td>/gi)) {
        const key = DETAIL_KEYS[textOf(m[1]).replace(/:$/, '').toLowerCase()];
        const value = textOf(m[2]);
        if (key && value) fields[key] = value;
    }
    return {
        title: head ? textOf(head[1]).replace(/:$/, '') : '',
        description: head ? textOf(head[2]) : '',
        fields
    };
}

export { COLUMNS };

/**
 * Folio handling for the corpus import.
 *
 * The folio strings in a transcription are free text ("113", "113 r", "(113v)",
 * "p. 12", "113ra"). The rest of the app compares them as plain strings, so the
 * import normalises them once, here, to the short form used everywhere else:
 * "113r", "113v", "12".
 */

/**
 * @param {unknown} value
 * @returns {string} normalised folio, '' when there is nothing usable
 */
export function normalizeFolio(value) {
    if (value === null || value === undefined) return '';

    let s = String(value).toLowerCase();
    s = s.replace(/\s+/g, '');
    s = s.replace(/[()]/g, '');
    s = s.replace(/^p\.?/, '');
    s = s.replace(/^0+/, '');
    s = s.replace(/recto/g, 'r').replace(/verso/g, 'v');
    // Trailing column / line markers: "113r-a", "113r/2"
    s = s.replace(/[-/][a-g1-9]$/, '');
    // Trailing column letter after a leaf number: "113ra" -> "113r", "113a" -> "113".
    // (Only after a number, so a word like "guard" is left alone.)
    s = s.replace(/(\d[rv]?)[a-g]$/, '$1');

    if (!s) return '';
    // A bare number is a leaf, i.e. its recto.
    if (/^\d+$/.test(s)) return `${s}r`;
    return s;
}

/**
 * Source-specific corrections to the folio numbering found in the transcription.
 *
 * "Tri 2254" skips two leaves in its foliation, so everything from f. 334 on is
 * shifted back by two. Saved annotations of earlier workspaces are keyed on the
 * corrected folios, so the correction is kept to leave them valid.
 */
const FOLIO_QUIRKS = {
    'Tri 2254': (folio) => {
        const m = /(\d+)/.exec(folio);
        if (!m) return folio;
        const num = Number(m[1]);
        return num >= 334 ? folio.split(m[1]).join(String(num - 2)) : folio;
    }
};

/**
 * @param {string} source source name (siglum)
 * @param {string} folio an already normalised folio
 */
export function applyFolioQuirk(source, folio) {
    const fix = FOLIO_QUIRKS[source];
    return fix && folio ? fix(folio) : folio;
}

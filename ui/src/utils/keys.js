/**
 * Page keys and folio names.
 *
 *   page key   "Source_Folio"   (regions, manual lines)
 *
 * A source's name may contain an underscore ("WiSch 4_5"); a folio never does,
 * so a key is always split from the RIGHT.
 */

export function pageKey(source, folio) {
    return `${source}_${folio}`;
}

/** "Source_Folio" -> { source, folio }, or null if the key has no separator. */
export function parsePageKey(key) {
    const s = String(key);
    const i = s.lastIndexOf('_');
    if (i <= 0) return null;
    return { source: s.slice(0, i), folio: s.slice(i + 1) };
}

export function isPageKeyOf(key, source) {
    return parsePageKey(key)?.source === source;
}

/**
 * A folio label written the way it is stored: spacing, brackets, a "fol." / "f." /
 * "p." prefix and leading zeros removed, "recto"/"verso" shortened to r/v. Case is
 * kept, so a transcription's own spelling survives ("A1r" stays "A1r").
 *   "fol. 18v" -> "18v"    "018v" -> "18v"    "(18 verso)" -> "18v"
 */
export function tidyFolio(folio) {
    let s = String(folio ?? '').replace(/\s+/g, '').replace(/[()]/g, '');
    s = s.replace(/^(fol|f|p|bl|blatt|seite|s)\.?(?=\d)/i, '');
    s = s.replace(/^0+(?=\d)/, '');
    return s.replace(/recto/gi, 'r').replace(/verso/gi, 'v');
}

/**
 * What identifies a page in a folio label: its tidy form, ignoring case. "18v",
 * "fol. 18v", "F.18V" and "018v" are one page; nothing else is merged ("22" and
 * "22b", "22r" and "22v" stay different pages).
 *
 * Stored page keys use the transcription's folio (see services/alignment). Older
 * data was sometimes keyed by a spelling of it, which this identity still finds.
 */
export function folioIdentity(folio) {
    return tidyFolio(folio).toLowerCase();
}

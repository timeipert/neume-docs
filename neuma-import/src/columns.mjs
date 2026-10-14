/**
 * The columns of the catalogue's overview table, and what each says about the patterns in it.
 *
 * Every column of the overview is one *kind of neume* by name (Pes, Clivis, …), and the picture in a
 * cell holds the examples of it that the catalogue's authors chose for one source. Those names are the
 * only information the catalogue gives about a snippet, so a snippet's first proposal is read from its
 * column. Two columns say nothing about the shape — Combinations mixes patterns, and the Punctum column
 * does not tell a punctum from a virga — so they are proposed with less confidence.
 *
 * Codes are the transcription codes of neume-docs (`ui/src/utils/patternCode.js`): `*` a note, `u` up,
 * `d` down, `e` equal; `[…]` notes written as one connected sign; `V` after a note says it is a virga;
 * `L` liquescent, `S` strophicus.
 *
 * This file knows nothing about the app; it only produces strings in that grammar.
 */

/**
 * @typedef {object} Column
 * @property {string} key       the letter the catalogue uses in its image names (`img/b/007b.png`)
 * @property {string} name      the catalogue's heading
 * @property {string} kind      'shape' | 'combination' | 'clef' | 'custos'
 * @property {string[]} codes   the codes it is proposed as, most likely first (first is the proposal)
 * @property {string} [about]   what to know when correcting it
 */

/** @type {Column[]} */
export const COLUMNS = [
    { key: 'a', name: 'Punctum', kind: 'shape', codes: ['*', '*V'],
      about: 'A single note. The catalogue does not say punctum from virga — a tall stroke is a virga (`*V`).' },
    { key: 'b', name: 'Pes', kind: 'shape', codes: ['[*u]', '*u', '[*uV]', '*uV'],
      about: 'Two notes, the second higher.' },
    { key: 'c', name: 'Clivis', kind: 'shape', codes: ['[*d]', '*d', '[*Vd]', '*Vd'],
      about: 'Two notes, the second lower.' },
    { key: 'd', name: 'Torculus', kind: 'shape', codes: ['[*ud]', '*ud', '*[ud]', '[*uVd]', '*uVd'],
      about: 'Three notes: low, high, low.' },
    { key: 'e', name: 'Porrectus', kind: 'shape', codes: ['[*du]', '*du', '*[du]', '[*Vdu]', '*Vdu'],
      about: 'Three notes: high, low, high.' },
    { key: 'f', name: 'Scandicus', kind: 'shape', codes: ['*uu', '[*uu]', '*u[u]', '*[uu]', '*uVu'],
      about: 'Three notes, rising.' },
    { key: 'g', name: 'Climacus', kind: 'shape', codes: ['*dd', '*ddd', '*dddd', '*Vdd', '[*d]d', '*d[d]'],
      about: 'A virga and falling notes: the number of notes decides the code.' },
    { key: 'h', name: 'Cephalicus', kind: 'shape', codes: ['[*dL]', '*dL', '*[dL]'],
      about: 'A clivis whose last note is liquescent.' },
    { key: 'i', name: 'Strophicus', kind: 'shape', codes: ['*SeS', '*SeSeS', '*S', '*eS', '*SeSeSeS'],
      about: 'Repeated notes on one pitch: two (bistropha), three (tristropha) or more.' },
    { key: 'j', name: 'Pes subbipunctis', kind: 'shape', codes: ['[*u]dd', '*udd', '*u[dd]', '*[ud]d'],
      about: 'A pes followed by two falling notes.' },
    { key: 'k', name: 'Combinations', kind: 'combination', codes: [],
      about: 'Larger signs that mix several patterns. The catalogue gives no name: choose the code by the notes.' },
    { key: 'l', name: 'Clefs', kind: 'clef', codes: ['(Clef)'], about: 'A clef.' },
    { key: 'm', name: 'Custos', kind: 'custos', codes: ['(Custos)'], about: 'A direct (custos).' }
];

export const COLUMN_BY_KEY = Object.fromEntries(COLUMNS.map(c => [c.key, c]));

/** The column that a catalogue image name belongs to. */
export function columnOfImage(path) {
    const m = /\/([a-m])\/\d+[a-m]\.\w+$/i.exec(String(path));
    return m ? COLUMN_BY_KEY[m[1].toLowerCase()] || null : null;
}

/** How many notes (`*` and every `u`, `d`, `e`) a code has. */
export function noteCount(code) {
    let n = 0;
    for (const ch of String(code).replace(/\(.*\)/, '')) if ('*ude'.includes(ch)) n++;
    return n;
}

/**
 * A code, with the virga letter put on the note it stands for.
 * `virga('*ud', 1)` is `*Vud`... the letter follows the note it belongs to, so note 0 is the first note.
 * @param {string} code a code without a V
 * @param {number} note which note (0 = the first) carries the virga
 */
export function withVirga(code, note) {
    let n = -1;
    let out = '';
    for (const ch of String(code)) {
        out += ch;
        if ('*ude'.includes(ch)) {
            n++;
            if (n === note) out += 'V';
        }
    }
    return out;
}

/** A code without the virga letters. */
export const withoutVirga = (code) => String(code).replace(/V/g, '');

/**
 * What to suggest for a snippet, from its column alone.
 *
 * @param {Column} column
 * @returns {{ code: string, alternatives: string[], confidence: 'high'|'medium'|'low'|'none', reason: string }}
 */
export function proposeFromColumn(column) {
    if (!column) return { code: '', alternatives: [], confidence: 'none', reason: 'unknown column' };
    if (column.kind === 'combination') {
        return { code: '', alternatives: [], confidence: 'none', reason: 'a combination: the catalogue does not say which' };
    }
    const [code, ...alternatives] = column.codes;
    const confidence = column.kind === 'clef' || column.kind === 'custos' ? 'high'
        : column.key === 'a' ? 'medium'
        : column.key === 'g' || column.key === 'f' || column.key === 'i' ? 'medium'
        : 'high';
    return { code, alternatives, confidence, reason: `the catalogue shows it under ${column.name}` };
}

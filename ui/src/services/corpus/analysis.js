/**
 * Pattern extraction from a Monodi transcription tree.
 *
 * A syllable carries `notes.spaced[]`; each spaced item holds a `nonSpaced[]`
 * list of `grouped[]` note groups — one neume as written without a gap. That
 * whole list is ONE pattern, in the code grammar documented in utils/patternCode:
 *
 *   *        first note
 *   u d e    the next note is higher / lower / equal
 *   [ ... ]  notes written as one connected group (a ligature)
 *   L O Q S  suffix on a note: liquescent, oriscus, quilisma, strophicus
 *
 * so a 4-note neume made of an ascending pair followed by two descending single
 * notes is `[*u]dd`.
 */

import { normalizeFolio, applyFolioQuirk } from './folio.js';

const PITCH_OFFSETS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Absolute pitch used only to compare two notes. */
export function pitchToMidi(base, octave) {
    return Number(octave) * 12 + (PITCH_OFFSETS[String(base).toUpperCase()] ?? 0);
}

function direction(from, to) {
    if (to > from) return 'u';
    if (to < from) return 'd';
    return 'e';
}

/** The paleographic suffix for a note's shape. */
export function noteSuffix(noteType, liquescent) {
    let s = '';
    switch (String(noteType)) {
        case 'Oriscus': s += 'O'; break;
        case 'Quilisma': s += 'Q'; break;
        case 'Strophicus': s += 'S'; break;
        case 'Ascending': s += 'LA'; break;
        case 'Descending': s += 'LD'; break;
        case 'Liquescent': s += 'L'; break;
        default: break;
    }
    if (liquescent && !s.includes('L')) s += 'L';
    return s;
}

function isPitched(note) {
    return !!note && typeof note === 'object'
        && !!note.base && note.octave !== undefined && note.octave !== null;
}

/** The notes of one `grouped` entry (which may itself nest groups). */
function collectNotes(element, out = []) {
    if (!element || typeof element !== 'object') return out;
    if (Array.isArray(element.grouped)) {
        for (const sub of element.grouped) collectNotes(sub, out);
    } else if (isPitched(element)) {
        out.push(element);
    }
    return out;
}

/**
 * The uuid Monodi-Zero uses to point at a neume: that of its first note. (A
 * neume has no uuid of its own; Monodi's `AnnotationItem.uuid` is this one.)
 *
 * @param {Array} nonSpaced list of `{ grouped: [...] }`
 * @returns {string} '' when the notes carry no uuid
 */
export function firstNoteUuid(nonSpaced) {
    if (!Array.isArray(nonSpaced)) return '';
    for (const item of nonSpaced) {
        const first = collectNotes(item)[0];
        if (first && first.uuid) return String(first.uuid);
    }
    return '';
}

/**
 * Turn one `nonSpaced` list into its pattern code and note list.
 *
 * @param {Array} nonSpaced list of `{ grouped: [...] }`
 * @returns {{ pattern: string, notes: string } | null} `notes` is e.g. "G4-A4-G4"
 */
export function extractPattern(nonSpaced) {
    if (!Array.isArray(nonSpaced) || nonSpaced.length === 0) return null;

    const groups = nonSpaced
        .map(item => collectNotes(item))
        .filter(g => g.length > 0);
    if (groups.length === 0) return null;

    const parts = [];
    let prev = null;

    groups.forEach((group, i) => {
        const isGroup = group.length > 1;
        const first = group[0];
        if (isGroup) parts.push('[');

        if (i === 0) {
            parts.push('*' + noteSuffix(first.noteType, first.liquescent));
        } else {
            const link = direction(prev.pitch, pitchToMidi(first.base, first.octave));
            parts.push(link + noteSuffix(first.noteType, first.liquescent));
        }

        for (let k = 0; k < group.length - 1; k++) {
            const d = direction(
                pitchToMidi(group[k].base, group[k].octave),
                pitchToMidi(group[k + 1].base, group[k + 1].octave)
            );
            parts.push(d + noteSuffix(group[k + 1].noteType, group[k + 1].liquescent));
        }

        if (isGroup) parts.push(']');

        const last = group[group.length - 1];
        prev = { pitch: pitchToMidi(last.base, last.octave) };
    });

    const notes = groups.flat().map(n => `${n.base}${n.octave}`).join('-');
    return { pattern: parts.join(''), notes };
}

/** Python-style int(): the whole string must be an integer. */
function parseLineNumber(value) {
    const s = String(value ?? '').trim();
    return /^[+-]?\d+$/.test(s) ? parseInt(s, 10) : null;
}

/**
 * Walk one document and report every pattern with where it stands.
 *
 * The position (folio, line) follows the transcription's own markers: the
 * document's start folio/line from its metadata, `FolioChange` nodes, `LineChange`
 * nodes, and `|` marks inside paratext.
 *
 * @param {object} root the document's RootContainer
 * @param {{ source: string, documentId: string, foliostart?: string, zeilenstart?: string }} ctx
 * @param {(pattern: string, info: string[], noteUuid: string) => void} emit
 *        `info` is `[documentId, folio, line, syllable, notes]`. Its join('|') is the
 *        `sysId` snippets use to link to an occurrence, so it must not change shape.
 *        `noteUuid` is the first note's uuid ('' if the file has none).
 * @returns {{ clefs: number, folios: Set<string>, patterns: number, lineUuids: Object<string, Object<string, string>> }}
 *          `lineUuids[folio][line]` is the uuid of the LineChange that ENDS that line
 *          (Monodi's `lineUUID`); a line with no such marker has no entry
 */
export function analyzeDocument(root, ctx, emit) {
    const { source, documentId } = ctx;

    const initialFolio = applyFolioQuirk(source, normalizeFolio(ctx.foliostart));
    const startParsed = parseLineNumber(ctx.zeilenstart);
    const lineStart = startParsed === null ? 1 : startParsed;
    let lineCounter = lineStart > 0 ? lineStart : 1;

    let folio = initialFolio;
    let line = String(lineCounter);
    let syllable = '';

    const stats = { clefs: 0, folios: new Set(), patterns: 0, lineUuids: {} };
    if (folio) stats.folios.add(folio);

    const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            for (const child of node) visit(child);
            return;
        }

        const kind = node.kind;
        const oldFolio = folio;

        if (kind === 'Syllable') {
            if ((node.syllableType ?? 'Normal') !== 'Normal') return;
            syllable = node.text ?? '';
            const spaced = node.notes && node.notes.spaced;
            if (!Array.isArray(spaced)) return;
            for (const item of spaced) {
                if (!item || !Array.isArray(item.nonSpaced)) continue;
                const found = extractPattern(item.nonSpaced);
                if (!found) continue;
                stats.patterns++;
                emit(found.pattern, [documentId, folio, line, syllable, found.notes], firstNoteUuid(item.nonSpaced));
            }
            return;
        }

        if (kind === 'Clef') stats.clefs++;

        if (kind === 'FolioChange') {
            if ('folio' in node) folio = normalizeFolio(node.folio);
            else if ('text' in node) folio = normalizeFolio(node.text);
        }

        if (folio !== oldFolio) {
            folio = applyFolioQuirk(source, folio);
            lineCounter = folio === initialFolio ? lineStart : 1;
            line = String(lineCounter);
            if (folio) stats.folios.add(folio);
        } else if (kind === 'LineChange') {
            if (folio && node.uuid) (stats.lineUuids[folio] || (stats.lineUuids[folio] = {}))[line] = String(node.uuid);
            lineCounter += 1;
            line = String(lineCounter);
        } else if (kind === 'ParatextContainer') {
            const text = node.text ?? '';
            if (text.includes('|')) {
                lineCounter += text.split('|').length - 1;
                line = String(lineCounter);
            }
        }

        const children = node.children ?? node.elements;
        if (Array.isArray(children)) {
            for (const child of children) visit(child);
        }
    };

    visit(root);
    return stats;
}

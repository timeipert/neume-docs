/**
 * Reads transcription data in the formats the Corpus Monodicum tools produce and
 * turns it into one result per source.
 *
 * Accepted inputs (any mix, in one call):
 *
 *   - a Monodi-Zero workspace backup, `*.monodijson` — `{ sources, documents, notes }`
 *   - a Monodi-Zero bundle — `{ source, documents, notes }`
 *   - a Corpus Monodicum project, as a folder or a ZIP of it:
 *       <source>/meta.json
 *       <source>/<document>/meta.json
 *       <source>/<document>/data.json
 *     The folder may be the whole project, one source, or one document.
 *   - a lone document tree (`kind: "RootContainer"`)
 *
 * This module has no DOM, Vue or Worker dependency: it runs in the import worker,
 * in the main thread and in Node (the tests and the reference build script).
 */

import JSZip from 'jszip';
import { analyzeDocument } from './analysis.js';
import { normalizeFolio } from './folio.js';

/** Document ids ending like this are working copies, not transcriptions. */
export const DEFAULT_SKIPPED_SUFFIXES = ['TR', 'GS'];

const MAX_ZIP_DEPTH = 3;

/**
 * @typedef {Object} CorpusFile
 * @property {string} path  slash-separated, relative to whatever was picked
 * @property {number} [size]
 * @property {() => Promise<string>} text
 * @property {() => Promise<ArrayBuffer|Uint8Array>} [bytes]
 */

/** Wrap a browser `File` (or anything file-shaped) as a CorpusFile. */
export function toCorpusFile(file, path) {
    return {
        path: normalisePath(path || file.webkitRelativePath || file.path || file.name),
        size: file.size,
        text: () => file.text(),
        bytes: () => file.arrayBuffer()
    };
}

function normalisePath(p) {
    return String(p || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function dirname(p) {
    const i = p.lastIndexOf('/');
    return i === -1 ? '' : p.slice(0, i);
}

function basename(p) {
    const i = p.lastIndexOf('/');
    return i === -1 ? p : p.slice(i + 1);
}

function join(dir, name) {
    return dir ? `${dir}/${name}` : name;
}

const lower = (s) => s.toLowerCase();

/** Hidden files and macOS archive litter are never data. */
function isNoise(path) {
    return path.split('/').some(seg => seg.startsWith('.') || seg === '__MACOSX');
}

async function expandZips(files, depth = 0) {
    const out = [];
    for (const file of files) {
        if (lower(file.path).endsWith('.zip') && depth < MAX_ZIP_DEPTH) {
            const buf = await (file.bytes ? file.bytes() : Promise.reject(new Error('Cannot read ZIP')));
            const zip = await JSZip.loadAsync(buf);
            const inner = [];
            zip.forEach((relative, entry) => {
                if (entry.dir) return;
                const path = normalisePath(relative);
                if (isNoise(path)) return;
                inner.push({
                    path,
                    size: entry._data && entry._data.uncompressedSize,
                    text: () => entry.async('string'),
                    bytes: () => entry.async('uint8array')
                });
            });
            out.push(...await expandZips(inner, depth + 1));
        } else {
            out.push(file);
        }
    }
    return out;
}

/** Fields of a source's meta.json that are worth keeping in the index. */
const SOURCE_FIELDS = [
    'id', 'quellensigle', 'herkunftsregion', 'herkunftsort', 'herkunftsinstitution',
    'ordenstradition', 'quellentyp', 'bibliotheksort', 'bibliothek', 'bibliothekssignatur',
    'kommentar', 'datierung', 'jahrhundert', 'status', 'manifest', 'foliooffset'
];

const DOCUMENT_FIELDS = [
    'id', 'dokumenten_id', 'gattung1', 'gattung2', 'festtag', 'feier', 'textinitium',
    'bibliographischerverweis', 'druckausgabe', 'foliostart', 'zeilenstart', 'editionsstatus'
];

function pick(obj, fields) {
    const out = {};
    for (const f of fields) {
        const v = obj && obj[f];
        if (v !== undefined && v !== null && v !== '') out[f] = v;
    }
    return out;
}

function isRoot(value) {
    return !!value && typeof value === 'object' && value.kind === 'RootContainer';
}

function skipped(documentId, suffixes) {
    return suffixes.some(s => String(documentId || '').endsWith(s));
}

/**
 * Collects the results of one source across however many documents it has.
 */
class SourceAccumulator {
    constructor(name, meta = {}) {
        this.name = name;
        this.meta = pick(meta, SOURCE_FIELDS);
        this.documents = [];
        this.patterns = Object.create(null);
        this.folios = new Set();
        this.clefs = 0;
        this.skippedDocuments = 0;
    }

    addDocument(docMeta, root, suffixes) {
        const documentId = docMeta.dokumenten_id || docMeta.id || '';
        if (skipped(documentId, suffixes)) {
            this.skippedDocuments++;
            return;
        }

        const stats = analyzeDocument(root, {
            source: this.name,
            documentId,
            foliostart: docMeta.foliostart,
            zeilenstart: docMeta.zeilenstart
        }, (pattern, info) => {
            (this.patterns[pattern] || (this.patterns[pattern] = [])).push(info);
        });

        this.clefs += stats.clefs;
        for (const f of stats.folios) this.folios.add(f);
        this.documents.push({ ...pick(docMeta, DOCUMENT_FIELDS), patternCount: stats.patterns });
    }

    result() {
        const counts = {};
        for (const [pattern, occurrences] of Object.entries(this.patterns)) {
            counts[pattern] = occurrences.length;
        }
        return {
            name: this.name,
            meta: this.meta,
            documents: this.documents,
            patterns: this.patterns,
            counts,
            folios: [...this.folios].filter(Boolean).sort(compareFoliosSimple),
            clefs: this.clefs,
            skippedDocuments: this.skippedDocuments
        };
    }
}

function compareFoliosSimple(a, b) {
    return a.localeCompare(b, undefined, { numeric: true });
}

/**
 * Documents in reading order: by start folio, then start line, then id. The
 * files of a project are named by UUID, so their own order means nothing.
 */
export function compareDocuments(a, b) {
    const fa = normalizeFolio(a.foliostart);
    const fb = normalizeFolio(b.foliostart);
    if (fa !== fb) return compareFoliosSimple(fa, fb);
    const la = parseInt(a.zeilenstart, 10);
    const lb = parseInt(b.zeilenstart, 10);
    if (Number.isFinite(la) && Number.isFinite(lb) && la !== lb) return la - lb;
    return compareFoliosSimple(String(a.dokumenten_id || a.id || ''), String(b.dokumenten_id || b.id || ''));
}

/** One JSON file, with a message a user can act on when it is too big to hold. */
async function readJson(file) {
    try {
        return JSON.parse(await file.text());
    } catch (e) {
        if (e instanceof RangeError || /string length|out of memory/i.test(String(e && e.message))) {
            throw new Error('too large to read in one piece — export the workspace per manuscript, or as a project folder');
        }
        throw e;
    }
}

/**
 * @typedef {Object} ReadOptions
 * @property {(event: object) => void} [onProgress]
 * @property {(result: object) => (void|Promise<void>)} [onSource] called once per finished source
 * @property {{ aborted: boolean }} [signal]
 * @property {string[]} [skipSuffixes] document-id suffixes to leave out
 */

/**
 * Read a set of files and report each source as it completes.
 *
 * @param {CorpusFile[]} inputs
 * @param {ReadOptions} [options]
 * @returns {Promise<{ sources: number, documents: number, skipped: number, emptySources: string[], warnings: string[] }>}
 *          `emptySources` are sources left out because nothing in them could be analysed
 *          (typically: they hold only working copies)
 */
export async function readCorpus(inputs, options = {}) {
    const {
        onProgress = () => {},
        onSource = () => {},
        signal = { aborted: false },
        skipSuffixes = DEFAULT_SKIPPED_SUFFIXES
    } = options;

    const summary = { sources: 0, documents: 0, skipped: 0, emptySources: [], warnings: [] };

    onProgress({ phase: 'scan' });
    const files = (await expandZips(inputs.map(f => ({ ...f, path: normalisePath(f.path) }))))
        .filter(f => !isNoise(f.path));

    const jsonFiles = files.filter(f => lower(f.path).endsWith('.json') || lower(f.path).endsWith('.monodijson'));
    const treeData = jsonFiles.filter(f => basename(f.path) === 'data.json');
    const treeMeta = new Map(jsonFiles.filter(f => basename(f.path) === 'meta.json').map(f => [f.path, f]));
    const standalone = jsonFiles.filter(f => !['data.json', 'meta.json'].includes(basename(f.path)));

    const emit = async (acc) => {
        const result = acc.result();
        summary.skipped += result.skippedDocuments;
        if (result.documents.length === 0) {
            summary.emptySources.push(result.name);
            return;
        }
        summary.sources++;
        summary.documents += result.documents.length;
        await onSource(result);
    };

    // ---- Folder / ZIP layout: <source>/<document>/data.json ----------------
    const sourceGroups = new Map(); // srcDir -> { metaFile, docs: [{ dataFile, metaFile }] }
    for (const dataFile of treeData) {
        const docDir = dirname(dataFile.path);
        const srcDir = dirname(docDir);
        if (!sourceGroups.has(srcDir)) {
            sourceGroups.set(srcDir, { metaFile: treeMeta.get(join(srcDir, 'meta.json')) || null, docs: [] });
        }
        sourceGroups.get(srcDir).docs.push({ dataFile, metaFile: treeMeta.get(join(docDir, 'meta.json')) || null });
    }

    const totalDocs = treeData.length;
    let doneDocs = 0;
    let doneSources = 0;

    // Resolve each group's name first, so the same source split over several
    // folders or archives ends up as one.
    const named = new Map(); // name -> { sourceMeta, docs: [] }
    for (const [srcDir, group] of sourceGroups) {
        let sourceMeta = {};
        if (group.metaFile) {
            try {
                const parsed = await readJson(group.metaFile);
                if (parsed && parsed.quellensigle) sourceMeta = parsed;
            } catch (e) {
                summary.warnings.push(`${group.metaFile.path}: ${e.message}`);
            }
        }
        const name = sourceMeta.quellensigle || sourceMeta.id || basename(srcDir) || 'Unbekannte Quelle';
        if (!named.has(name)) named.set(name, { sourceMeta, docs: [] });
        const entry = named.get(name);
        if (!entry.sourceMeta.quellensigle && sourceMeta.quellensigle) entry.sourceMeta = sourceMeta;
        entry.docs.push(...group.docs);
    }

    const sourceNames = [...named.keys()].sort(compareFoliosSimple);

    for (const name of sourceNames) {
        if (signal.aborted) return summary;
        const { sourceMeta, docs } = named.get(name);
        const acc = new SourceAccumulator(name, sourceMeta);

        // Document metadata is small; read it all first so the documents can be
        // analysed in reading order.
        const entries = await Promise.all(docs.map(async (doc) => ({
            doc,
            meta: doc.metaFile ? await readJson(doc.metaFile).catch(() => ({})) : {}
        })));
        entries.sort((a, b) => compareDocuments(a.meta, b.meta)
            || compareFoliosSimple(a.doc.dataFile.path, b.doc.dataFile.path));

        // Read the next document's data while the current one is being analysed.
        const load = (entry) => readJson(entry.doc.dataFile).then(data => ({ data }), error => ({ error }));

        let pending = entries.length ? load(entries[0]) : null;
        for (let i = 0; i < entries.length; i++) {
            if (signal.aborted) return summary;
            const loaded = await pending;
            pending = i + 1 < entries.length ? load(entries[i + 1]) : null;

            if (loaded.error) {
                summary.warnings.push(`${entries[i].doc.dataFile.path}: ${loaded.error.message}`);
            } else if (!isRoot(loaded.data)) {
                summary.warnings.push(`${entries[i].doc.dataFile.path}: not a transcription (no RootContainer)`);
            } else {
                acc.addDocument(entries[i].meta, loaded.data, skipSuffixes);
            }

            doneDocs++;
            if (doneDocs % 20 === 0 || i === entries.length - 1) {
                onProgress({ phase: 'read', source: name, doneDocs, totalDocs, doneSources, totalSources: sourceNames.length });
            }
        }

        await emit(acc);
        doneSources++;
        onProgress({ phase: 'read', source: name, doneDocs, totalDocs, doneSources, totalSources: sourceNames.length });
    }

    // ---- Standalone JSON: workspace, bundle or lone document ---------------
    for (const file of standalone) {
        if (signal.aborted) return summary;
        onProgress({ phase: 'json', file: file.path });

        let json;
        try {
            json = await readJson(file);
        } catch (e) {
            summary.warnings.push(`${file.path}: ${e.message}`);
            continue;
        }

        const accs = accumulatorsFromJson(json, file, skipSuffixes, summary);
        for (const acc of accs) {
            if (signal.aborted) return summary;
            await emit(acc);
        }
    }

    if (summary.sources === 0 && summary.warnings.length === 0) {
        summary.warnings.push(summary.emptySources.length
            ? 'Everything found was a working copy (document IDs ending in TR or GS) and was left out. Untick that option to include them.'
            : 'No transcriptions found. Expected a .monodijson file or a Corpus Monodicum project (source/document/data.json).');
    }
    return summary;
}

/** Turn one parsed standalone JSON into source accumulators. */
function accumulatorsFromJson(json, file, skipSuffixes, summary) {
    if (isRoot(json)) {
        const name = basename(file.path).replace(/\.[^.]+$/, '') || 'Unbekannte Quelle';
        const acc = new SourceAccumulator(name);
        acc.addDocument({ id: name, dokumenten_id: name }, json, skipSuffixes);
        return [acc];
    }

    const notes = json && json.notes;
    const documents = json && json.documents;
    if (!notes || typeof notes !== 'object' || !Array.isArray(documents)) {
        summary.warnings.push(`${file.path}: not a Monodi workspace, bundle or transcription`);
        return [];
    }

    // A bundle carries a single `source`, a workspace a list of `sources`.
    const sources = Array.isArray(json.sources) ? json.sources : (json.source ? [json.source] : []);
    const byId = new Map();
    const accs = new Map();

    for (const s of sources) {
        const name = s.quellensigle || s.id || 'Unbekannte Quelle';
        if (!accs.has(name)) accs.set(name, new SourceAccumulator(name, s));
        byId.set(s.id, name);
        if (s.quellensigle) byId.set(s.quellensigle, name);
    }

    for (const doc of [...documents].sort(compareDocuments)) {
        const root = notes[doc.id];
        if (!isRoot(root)) continue;
        const ownerKey = doc.quelle_id || '';
        let name = byId.get(ownerKey) || ownerKey || 'Ohne Quelle';
        if (sources.length === 1 && !byId.has(ownerKey)) name = byId.values().next().value || name;
        if (!accs.has(name)) accs.set(name, new SourceAccumulator(name));
        accs.get(name).addDocument(doc, root, skipSuffixes);
    }

    return [...accs.values()].filter(a => a.documents.length > 0 || a.skippedDocuments > 0);
}

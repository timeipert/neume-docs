# Neumen-Editor

A research tool for documenting the neume shapes of a manuscript against the *Corpus Monodicum* (CM). Load a transcribed corpus, fill in a **Neume Table** per manuscript, link the shapes to the scans, and compare manuscripts side by side.

It is the successor of the earlier *Neume Viewer* (CM-Transcription-Equivalents) with one radical change: **the editor starts empty.** Nothing is built in. You load a Monodi-Zero workspace or a Corpus Monodicum project, and everything is derived from that, in your browser.

## What it does

### Load data (new)

- **`.monodijson`** — a Monodi-Zero workspace (`{ sources, documents, notes }`), or a single-source bundle.
- **Corpus Monodicum project** — a folder or ZIP laid out as `source/meta.json`, `source/document/meta.json`, `source/document/data.json` (monodi+ export). The whole project, one source or one document.

Files are read in a Web Worker and stored in IndexedDB. The entire CM (112 sources, ~6,000 documents, ~950,000 neumes, 1.8 GB) loads in about 15 seconds and survives a reload. Nothing leaves the browser.

### The neume table (new)

The neume table orders and fills the columns of a table of neumes:

1. **Order.** Columns are ordered by **number of tones**, then by **frequency in the CM** within that number. A direction's frequency counts every way of writing it — brackets and special signs ignored. (On the real corpus this reproduces the editorial order `*d > *u > *e`, `*dd > *ud > *uu > *du`, `*udd > *uud > *ddu` exactly.)
2. **Standard table.** Fixed columns: `* | *d | *u | *e | *dd | *ud | *uu | *du | *udd | *uud | *ddu | L | O | Q | , | Clef | Custos`. Per directional column the pattern library offers the plain ways of writing it. The special columns L, O, Q and `,` (strophicus) each offer all patterns with that sign — a pattern with several signs goes to the column of its **first** sign — and a manuscript chooses **at most three** constellations per column.
3. **Expanded documentation.** Any pattern can be added by searching the whole library by code (`*udL`); each addition appears at its place in the ordering. *Show Standard Table* hides everything but the standard selection again.

The same three-level logic drives the comparison table (*Public → Neume Table*): manuscripts as rows, neume columns in the fixed order.

### Inherited from CM-Transcription-Equivalents

Pattern equivalents with Reference IDs and variants, IIIF manuscript annotation (line regions and polygon snippets), the pattern library with MEI templates, custom manuscripts without IIIF, OMMR4all import, public manuscript pages, static site export, workspace folder autosave.

## Running it

Requires Node.js 20+ (22 recommended).

```bash
cd ui
npm install
npm run dev      # development server
npm test         # unit tests
npm run build    # production build into ./dist
```

From the repository root, `npm run dev | build | test` do the same.

An end-to-end smoke test (Playwright) walks the whole user story — empty start, loading a corpus, filling the standard table, the expanded documentation, the comparison table. With `npm run dev` running:

```bash
npm run e2e -- --data /path/to/a/project/folder
```

## How patterns are read

A syllable's notes are read into a **pattern code**: `*` is the first note, then `u`, `d` or `e` for a next note higher, lower or equal. `[ … ]` marks notes written as one connected group (a ligature); the letters `L O Q S` on a note mark liquescent, oriscus, quilisma and strophicus.

| Code | Meaning |
| --- | --- |
| `*ud` | three notes: up, then down |
| `[*u]d` | the same, the first two connected |
| `*dL` | two notes, the second liquescent |

Terms used in the code: the **signature** of a code is the code without brackets (`*udL`); its **direction** is the signature without signs (`*ud`); **tones** is the number of notes.

The reader (`ui/src/services/corpus`) reproduces the pattern extraction of the earlier Python pipeline record for record: on the full CM export every occurrence — folio, line, syllable and notes — matches.

## Layout

```
ui/                          the Vue 3 app
  src/services/corpus/       reading and storing a corpus (reader, analysis, IndexedDB, worker)
  src/utils/neumeTable.js    ordering, standard table, special signs, columns — pure functions, tested
  src/composables/           useTranscriptionData (the loaded corpus), usePatternCatalog (library + frequencies)
  src/views/                 CorpusView, NeumeTableListView, NeumeTableView, PublicNeumeTableView, …
  src/data/cmReference.json  frequency of every pattern in the whole CM (counts only, no transcriptions)
  scripts/                   build-cm-reference, build-glyphs
user-manual/                 the VitePress manual (npm run build:manual)
glyphs/                      the built-in neume glyphs (npm run build:glyphs)
```

### The CM frequency snapshot

"Frequency in the CM" has to mean the whole CM, not whatever happens to be loaded, so the editor carries a snapshot of the counts: `ui/src/data/cmReference.json`. It holds pattern codes and counts only. Regenerate it when the corpus has grown:

```bash
npm run build:reference -- /path/to/Corpus-Monodicum-project
```

*Settings → Neume Table* switches the count to the loaded corpus instead.

## Data and privacy

Everything is stored in the browser (IndexedDB for the corpus, localStorage and an optional project folder for your tables and annotations). Because the browser owns the storage, make regular backups (*Settings → Share / Backup*).

The tool was part-wise created with the help of Large Language Models.

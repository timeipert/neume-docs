# neume-docs

A research tool for documenting the neume shapes of a manuscript against the *Corpus Monodicum* (CM). Load a transcribed corpus, make a **project** for a range of folios, fill in its **Neume Table**, link the shapes to the scans, and compare manuscripts side by side.

It is the successor of the earlier *Neume Viewer* (CM-Transcription-Equivalents) with one radical change: **the editor starts empty.** Nothing is built in. You load a Monodi-Zero workspace or a Corpus Monodicum project, and everything is derived from that, in your browser.

## What it does

### Load data (new)

- **`.monodijson`** — a Monodi-Zero workspace (`{ sources, documents, notes }`), or a single-source bundle.
- **Corpus Monodicum project** — a folder or ZIP laid out as `source/meta.json`, `source/document/meta.json`, `source/document/data.json` (monodi+ export). The whole project, one source or one document.

Files are read in a Web Worker and stored in IndexedDB. The entire CM (112 sources, ~6,000 documents, ~950,000 neumes, 1.8 GB) loads in about 15 seconds and survives a reload. Nothing leaves the browser.

### Manuscript metadata (new)

*Manuscripts → Catalogue* shows all manuscripts as a spreadsheet: every field the corpus has for a source, the IIIF manifest, and columns of your own. Edit by typing, paste from Excel, fill down (`Ctrl+D`), find and replace, import and export CSV, undo. Your edits are stored on top of the corpus, which is never changed.

It also uses the IIIF the corpus carries. Few sources have a manifest, but many documents name the IIIF image they were transcribed from; the editor turns those into the manuscript's pages, so a manuscript shows its images in the annotation workspace without a manifest.

### Round trip with Monodi-Zero (new)

The transcription lives in Monodi-Zero, the annotations here, and a file carries each direction:

- **Monodi-Zero → editor**: load a `.monodijson` (or a single-source bundle) on the *Corpus* page, as before. Loading a source again *updates* it: your annotations are kept, and if the transcriber changed a folio, the pages that lost theirs are listed with a button to move them to the folio that now shows the same image. Annotations that were already on the source in Monodi-Zero are offered for review, never merged silently.
- **Editor → Monodi-Zero**: *Workspace → Exchange with Monodi-Zero* writes one file with the line regions, snippets and neume table rows. A snippet you linked to a neume keeps that link (the neume's `uuid`), and a line region whose linked snippets all lie on one transcription line is tied to it, so Monodi-Zero can show a neume in the manuscript. Catalogue data is never sent: Monodi-Zero owns it.

- **Linking snippets to the transcription**: *Workspace → Exchange with Monodi-Zero → Find links…* works out which snippet depicts which neume, by aligning each line region's snippets (left to right) with the neumes of one transcription line by pattern, and shows the proposals with a confidence (high, medium, low) to tick before anything is changed. A restore point is kept first. A source loaded before the reading order was kept has to be loaded again.

The file format and the reasoning are in `INTEGRATION-PLAN.md` of the monodi-light repository; the code is `ui/src/services/exchange/`.

### Projects (new)

Work happens in **projects**. A project is a range of folios in one manuscript — one scribe's pages, say — and the table that documents its neumes. **New project** asks four questions (start from the transcription or from the manuscript; which manuscript and folios; IIIF or screenshots; lines or signs), and the project then leads through four tabs:

1. **Columns** — the whole pattern library as one table: a top row of shapes (only up, down, equal) and under each every code with that movement — plain, in brackets, with signs, variants — all in one order: length, then frequency. Tick the columns of the standard table; snippets already drawn in these folios are loaded in.
2. **Standard table** — one cell per chosen column. Open a cell to find the neume in the transcription and mark it on the page (IIIF, line or sign snippets), or to paste a screenshot.
3. **Extended table** — the standard table plus any other pattern of the library.
4. **All manuscripts** — the projects as rows, side by side.

With **screenshots of lines**, a project keeps the lines themselves (folio and line, validated), and the signs are marked on them in a line editor — each with its pattern code, its syllable and a link to the transcription's neume; a sign stays tied to its line. What a snippet says about itself (folio, line, syllable, and attributes of your own) is set in *Settings*. Variants and codes the library does not have are added from the tables.

Snippets stay keyed by manuscript and folio (or in a custom collection), so a project is a view of them, never a copy. Neume tables and custom manuscripts from before projects become projects automatically. See `user-manual/docs/projects.md`.

### The neume table

The neume table orders and fills the columns of a table of neumes:

1. **Order.** Columns are ordered by **number of tones**, then by **frequency in the CM** within that number. A direction's frequency counts every way of writing it — brackets and special signs ignored. (On the real corpus this reproduces the editorial order `*d > *u > *e`, `*dd > *ud > *uu > *du`, `*udd > *uud > *ddu` exactly.)
2. **Standard table.** Fixed columns: `* | *d | *u | *e | *dd | *ud | *uu | *du | *udd | *uud | *ddu | L | O | Q | , | Clef | Custos`. Per directional column the pattern library offers the plain ways of writing it. The special columns L, O, Q and `,` (strophicus) each offer all patterns with that sign — a pattern with several signs goes to the column of its **first** sign — and a manuscript chooses **at most three** constellations per column.
3. **Expanded documentation.** Any pattern can be added by searching the whole library by code (`*udL`); each addition appears at its place in the ordering. *Show Standard Table* hides everything but the standard selection again.

The same three-level logic drives the comparison table (*Public → Neume Table*): manuscripts as rows, neume columns in the fixed order.

### Reading and publishing documentations (new)

The app starts with two ways in: **View documentations** and **Editor**.

- **View documentations** (`#/docs`) reads what others have published — read-only, no corpus and no workspace folder needed. The *endpoints* it offers are listed in `ui/public/endpoints.json` (a GitHub repository, or any web address, each with a name); whoever hosts a copy of the app edits that list. A reader can also open any public GitHub repository by its address (`owner/name`). An endpoint holds plain files: `neume-docs.json` (who made it, the metadata columns and which of them can be filtered, the list of manuscripts) and one file per manuscript in `data/`. The viewer lists the manuscripts with the metadata the authors chose to show, with a filter panel (pick values, date ranges drawn on a timeline, number ranges, text; "match all" or "match any"), compares them in the neume table, and shows a manuscript's patterns and snippets. The list shows the repositories and — for anyone who has made something in the editor — **your own work**, and any of them can be **looked at together** (`combine:` ids): their manuscripts stand in one table and one neume table, each cited by the documentation it comes from. **Everything can be referenced:** a manuscript, a pattern of a manuscript, a cell of the neume table, a column, a snippet and a filtered selection each have a link that opens exactly that, softly highlighted, and a suggestion for citing it (short, author–date, BibTeX).
- **Editor** is the editor as before. *Workspace → Publish a documentation* says who made the documentation and under which licence, chooses which metadata readers are shown, previews it as readers see it (*This browser* in the viewer) and downloads it as a ZIP: the files to commit to a GitHub repository. Which columns of the manuscripts table can be filtered by readers is set there too (the *Filter* box of a column, in *Settings → Manuscript metadata*).

The file format is `ui/src/utils/documentation.js`; the files are built by `ui/src/utils/buildDocumentation.js` — the same function for the preview and the download. `ui/public/docs-demo/` is an invented example documentation (`node ui/scripts/make-demo-docs.mjs` makes it).

### Inherited from CM-Transcription-Equivalents

Pattern equivalents with Reference IDs and variants, IIIF manuscript annotation (line regions and polygon snippets), the pattern library with MEI templates, screenshot projects without IIIF, OMMR4all import, public manuscript pages, static site export, workspace folder autosave.

## The MMMO catalogue

To suggest IIIF manifests and catalogue data for manuscripts it has not seen, the editor can use the catalogue of the [MMMO Database](https://musmed.eu). It is third-party data, so it is collected per installation and kept out of git (`ui/src/data/mmmo/`):

```bash
npm run crawl:mmmo        # polite and resumable: honours robots.txt and its 10 s crawl-delay
npm run crawl:mmmo -- --for /path/to/corpus-folder --only-matched   # just the manuscripts of your corpus: under an hour
```

Without it the editor works as before and says that no catalogue is available. Check the MMMO's terms before sharing the collected file or an app that contains it. See `user-manual/docs/iiif-sources.md`.

## Interface

The app starts at a page with two choices, *View documentations* and *Editor*; the viewer has its own slim frame, without the editor's navigation. In the editor, everything you document is a **project** (see above); the navigation is *Projects · Manuscripts · Patterns · Workspace · Settings*. *Manuscripts* has three tabs — the catalogue (where the selected row leads on to its project and its pages), the images (IIIF sources) and the corpus (loading); *Patterns* has the library and what the corpus makes of it. The page editor and the custom collections are reached from a project's cell, the catalogue or the Workspace. Each function has one place: signs and preferred IDs are set up in the pattern library, own metadata columns in the metadata table, backups and deleting on the Workspace page, and Settings keeps only the two global preferences. The conventions every page follows (page structure, buttons, how deleting works, naming) are in [UI-CONVENTIONS.md](UI-CONVENTIONS.md).

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

An end-to-end smoke test (Playwright) walks the whole user story — empty start, loading a corpus, making a project, choosing its columns, the standard and extended table, the table of all manuscripts. With `npm run dev` running:

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
  src/utils/project*.js      projects: the two-level table, folio ranges and snippets, old work as projects, publishing (pure, tested)
  src/stores/projects.js     the projects (saved with the workspace)
  src/views/                 StartView, ProjectsView, ProjectWizardView, ProjectShellView and its tabs, CorpusView, WorkspaceView, …
  src/views/docs/            the viewer: the list of documentations, one documentation (manuscripts, manuscript, neume table, about)
  src/utils/documentation*.js, buildDocumentation.js, citation.js, publication.js   the documentation format, reading it, building it, citing it (pure, tested)
  src/utils/manuscriptFilter.js, composables/useRowFilter.js   the filter of the manuscripts table, shared by the editor and the viewer
  src/components/ui/         the shared building blocks: Panel, PageShell, ModalDialog, ConfirmDialog, toasts, …
  src/components/workspace/  the panels of the Workspace page
  src/services/mmmo/         matching a manuscript against the MMMO catalogue (pure, tested)
  src/utils/workspace*.js    what "the workspace" is: capture/restore, its parts, restore points (pure, tested)
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

*Settings → Ordering of the neume table* switches the count to the loaded corpus instead.

## Data and privacy

Everything is stored in the browser (IndexedDB for the corpus, localStorage and an optional project folder for your tables and annotations). Because the browser owns the storage, make regular backups, or connect a project folder (both on the *Workspace* page). Every deletion there keeps a restore point first, so it can be undone.

The tool was part-wise created with the help of Large Language Models.

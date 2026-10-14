# neuma-import

Opens up the [Hungarian Neume Catalogue](https://neuma.zti.hu/en_attekinto.asp) (*Notation Signs in Medieval Hungary*, Gabriella Gilányi et al., Institute of Musicology, Budapest) as data that neume-docs can read.

The catalogue's *Overview* is one table: a row for each of 246 sources, a column for each kind of neume (Punctum, Pes, Clivis, Torculus, Porrectus, Scandicus, Climacus, Cephalicus, Strophicus, Pes subbipunctis, Combinations, Clefs, Custos). Each cell is **one picture with several snippets pasted onto white**, and there is no more information than that: no pattern codes, no virga, and *Combinations* mixes patterns. This module

1. **collects** the table, the text of every source and every picture (`bin/crawl.mjs`),
2. **takes the pictures apart**, so that every snippet is a picture of its own, and proposes what each is from the column it stands in (`bin/split.mjs`),
3. is **reviewed** in a tool inside the app, where each snippet is accepted, corrected, set aside or discarded (`#/tools/neuma`),
4. and **writes a documentation** — the files `neume-docs.json`, `data/<source>.json` and `images/…` that the viewer reads and a GitHub repository can hold (`bin/export.mjs`).

It is a module of its own and knows nothing of the app, apart from the format it writes (`ui/src/utils/documentation.js` is that format's authority; `ui/src/utils/neumaDocumentation.test.js` holds the two together) and, optionally, the glyph of the virga (`ui/src/data/glyphs.js`). The app knows nothing of it except one hidden page and one line in `ui/vite.config.js`.

## The data is not ours

The snippets are excerpts from manuscripts, whose copyright remains with their holders. The catalogue publishes them under the right to quote for scientific purposes (Hungarian Act LXXVI of 1999, Section 34), *indicating the source and the author* — see its [Navigation page](https://neuma.zti.hu/en_honlap.asp) — and its editors have agreed that they are used here. Everything written from the data carries the credit (`src/origin.mjs`: the documentation's description, license and preferred citation; the tool's footer; the page at `hung/`).

Like the MMMO catalogue, the data is **collected on the computer that uses it and kept out of git** (`neuma-import/data/` is ignored). What is committed is `ui/public/hung/` — the snippets and the catalogue, published on purpose with `npm run publish-site` — and nothing else of it.

## Use

```bash
cd neuma-import
npm install          # once (only the PNG reader)
npm run crawl        # ≈ 3,400 files, 75 MB; a few requests a second, so about half an hour. Can be stopped and run again
npm run split        # 4,800 snippets as pictures of their own (a few seconds)

cd ../ui && npm run dev       # then open  http://localhost:5173/#/tools/neuma
```

With the development server, the tool serves `neuma-import/data/` (`/neuma-data/…`) and keeps your decisions in `data/decisions.json`. It is not linked from the editor.

### Online: `…/hung/`

`npm run publish-site` copies the catalogue and the snippets (not the catalogue's pictures of whole cells: they would double the size) to `ui/public/hung/`; committed and pushed, the site's workflow publishes them, and **`<site>/hung/` leads to the tool**. There is no server there, so:

- the decisions are kept **in the browser** (and *Save the decisions as a file* / *Load decisions from a file…* carry them from one browser to another or into `data/decisions.json`),
- *Download the documentation (ZIP)* makes the documentation in the browser — `neume-docs.json`, `data/`, `images/` — with the same code as `npm run export` (`src/documentation.mjs`), to unpack into a folder of a GitHub repository.

After a new `split`, run `publish-site` again; decisions that were made about snippets that have moved no longer count (see below), so do that before anybody starts, if you can.

`npm run export` writes the documentation to `data/documentation/` (the *Write the documentation* button of the tool does the same). Open it in the viewer at
`#/docs/url%3A%2Fneuma-data%2Fdocumentation%2F`, or commit the folder to a GitHub repository.

```bash
npm run export                      # only what was accepted or corrected
npm run export -- --include proposed  # also what is merely proposed, to see how it will look
npm run publish-site                # the website's folder: ../ui/public/hung/
npm test                            # the module's own tests (node:test)
```

## What is written

```
data/raw/                 what the crawl got: the overview page, the text of each source, each picture of a cell
data/catalogue.json       where it comes from, the 13 columns, the sources with their text and their cells
data/snippets.json        one entry for each snippet: its picture, its place in the cell, its proposal, flags
data/snippets/<source>/<column>-<n>.png    the snippets
data/problems.json        what was left out, and what to look at
data/decisions.json       what the review decided (the tool writes it)
data/info.json            optional: overrides of the documentation's title, authors, licence, …
data/documentation/       the documentation (written by export)
../ui/public/hung/        what goes on the website (written by publish-site): catalogue.json, snippets.json, snippets/, index.html
```

A snippet's id is the catalogue's own name for the cell plus its number: `007b-2` is the second snippet of source 007's *Pes* cell (`img/b/007b.png`).

### Decisions

`{ "version": 1, "decisions": { "007b-2": { "status": "corrected", "code": "[*uV]", "at": "…" } } }`

| status | meaning |
| --- | --- |
| `accepted` | it is what was proposed |
| `corrected` | it is something else: `code` says what |
| `later` | set aside; not in the documentation yet |
| `discarded` | no usable snippet; left out of the documentation |

A decision also carries `sig`, where its snippet lay in the catalogue's cell. If the catalogue is split again and the snippet is no longer there, the decision does not count (the tool says how many) and the snippet shows as not looked at — a snippet's id is only its place in the cell's reading order, and splitting is the part of this module that may still get better. A snippet with no decision is *not looked at*. Only `accepted` and `corrected` snippets go into a documentation (or also the merely proposed ones, with `--include proposed`).

## Taking the pictures apart

The pictures are small — a snippet is typically 60–150 px — and exist in no larger size (the zoom on the catalogue's site is a CSS scale of 2.5). So the cutting is **lossless**: the pixels of a snippet are those of the catalogue's picture, no scaling, no re-compression, nothing made transparent. The review tool shows a snippet enlarged, which is the browser's smoothing and nothing more.

What makes it harder than finding rectangles on white (`src/split.mjs`):

- Some pictures have a faint halo of near-white noise (235–252) around the snippets that joins neighbours. A snippet is *seeded* where the picture is clearly not white (below 240); the fainter pixels are given to the nearest seed.
- The catalogue leaves anything from 3 to 12 px between snippets. A photograph (a *block*: nearly every pixel of its box is not white) is never joined to anything; loose ink on white paper (some black-and-white sources) is joined to ink within 5 px.
- Pure white can be in the photograph, so it is not made transparent.
- Lines and strips (remnants of staff lines) are left out and listed in `problems.json`.

What is left is flagged for a look (`flags` in `snippets.json`, *Only cuts that look odd* in the tool): `tiny`, `thin`, and `parts` (a white band right through it). In a full run, about 80 of 4,800 snippets are flagged. The tool cannot cut again; a snippet that is cut wrongly is discarded, and the catalogue's whole cell is shown beside it, with the snippet marked, so it is clear what it should have been.

## What is proposed

From the column alone (`src/columns.mjs`; the codes are those of `ui/src/utils/patternCode.js`):

| Column | proposed | also offered |
| --- | --- | --- |
| Punctum | `*` (a tall stroke: `*V`, low confidence) | `*V` |
| Pes | `[*u]` | `*u`, the virga on each note |
| Clivis | `[*d]` | `*d`, … |
| Torculus | `[*ud]` | `*ud`, `*[ud]`, … |
| Porrectus | `[*du]` | `*du`, `*[du]`, … |
| Scandicus | `*uu` | `[*uu]`, `*u[u]`, … |
| Climacus | `*dd` | `*ddd`, `*dddd`, `[*d]d`, … |
| Cephalicus | `[*dL]` | `*dL`, … |
| Strophicus | `*SeS` | `*SeSeS`, `*S`, … |
| Pes subbipunctis | `[*u]dd` | `*udd`, … |
| Combinations | *nothing* — the catalogue names no pattern | the common long patterns of the library |
| Clefs, Custos | `(Clef)`, `(Custos)` | |

The catalogue does not tell a virga from a punctum; the review offers the virga (`V` on a note: `*uVd`) wherever it makes sense, and a code field with a button for each note. These are **assumptions** — in particular that the catalogue's *Pes* is `[*u]` (written as one sign) rather than `*u`, that *Cephalicus* is the liquescent clivis, and that *Strophicus* is `*SeS` (the CM writes the repeated notes that way) — and `columns.mjs` is the one place to change them.

## Tests

`npm test` runs the module's tests (`node --test`; the site's workflow runs them too): parsing, the columns, the splitting on synthetic pictures, the documentation and its export, the decisions, publishing, and the development-server plugin over real HTTP (including that another site's page cannot write, and that nothing but the data is served). The app's `npm test` holds the module and the app together: what is written must pass `cleanIndex` / `cleanManuscript`, and the tool's own tests (`useNeumaReview.test.js`) run the online case — data from `hung/`, decisions in the browser, the ZIP.

# Page layout of a manuscript: design of the building blocks

State: 2026-11-12. Branch `feat/neume-docs-page-layout` of monodi-platform (not merged). Format version 1.

## What it is for, who it is for, where to start

The notation documentation of a printed *Corpus Monodicum* (CM) volume describes, for each manuscript, how the page
is laid out: the division of the writing space, how text lines and staves sit in it, the number and kind of staff
lines, the colourings and clefs that mark pitch, and the custodes. The notes on use of the printed volume (CM-hub
repository, `config/print/de/notes-on-use.md`, paragraph "Einteilung des Schriftraums"; English:
`config/print/en/notes-on-use.md`, "Division of the Written Area") name exactly these items, and ask for colourings
and clefs "in descending order of frequency".

This document fixes a controlled vocabulary and a data model for these properties, so that they can be recorded once
per manuscript (or folio range, or notator), drawn as a schematic, written as text in German and English, and read by
other tools. It is for the people who maintain neume-docs, Monodi-Zero and CM-hub's print volumes, and for editors of
the CM who record the data.

Where to start:

| What | File (authoritative) |
|---|---|
| Vocabulary (allowed values, English and German wording) | [`packages/core/src/page-layout/vocabulary.ts`](../../../packages/core/src/page-layout/vocabulary.ts) |
| Data model, normalisation, consistency checks | [`packages/core/src/page-layout/model.ts`](../../../packages/core/src/page-layout/model.ts) |
| Text in German and English | [`packages/core/src/page-layout/describe.ts`](../../../packages/core/src/page-layout/describe.ts) |
| Schematic drawings (SVG) | [`packages/core/src/page-layout/diagram.ts`](../../../packages/core/src/page-layout/diagram.ts) |
| Worked examples (Aa 13, Pa 1871) | [`packages/core/src/page-layout/examples.ts`](../../../packages/core/src/page-layout/examples.ts) |
| Editing and display in neume-docs | `ui/src/views/ProjectLayoutView.vue`, `ui/src/components/projects/layout/` |
| File export and import | `ui/src/utils/pageLayout.js` |

The shared code is imported as `@monodi/core/page-layout` (framework-free TypeScript, see
[`packages/core/README.md`](../../../packages/core/README.md)); neume-docs is the first app that uses it.

## Sources of the vocabulary

Read on 2026-11-12:

1. The source descriptions of the CM (`olyro/data` repository, `content/quellenbeschreibungen/*.html`, a copy in the
   local checkout `CM/data/content/`): 121 files, of which 50 have the section "Schriftraum – Notation – Textschrift"
   and most a section "Ausstattung" (decoration). These sections hold almost all wording used here. Typical sentence
   (Aa 13): "37 x 24,5 cm, 15 Notensysteme. Deutsche Neumen … auf vier Linien …, rote F- (oder f-) und gelbe c-Linie,
   F- und c-Schlüssel, beide auch einzeln, der F-Schlüssel meist punktförmig."
2. The notation documentations: the column `notationsdokumentation` of `Quellendaten.xlsx` (CM-hub; one filled row,
   Aa 13) and the HTML fragments in `olyro/data` `content/notationsdokumentationen` (17 files). Both hold only the
   pattern table and the line gallery made by neume-docs, no layout text. The layout part of the printed notation
   documentation therefore has no digital model yet; this document is the first.
3. The notes on use of the printed volume (see above), which give the categories and their order.

The notation type of a source ("Quadratnotation", "Deutsche Neumen", "Aquitanische Notation") and the text script
("Textualis") are not part of the page layout; they stay in the source description.

## Terms

| Term | Meaning |
|---|---|
| Writing space, written area (Schriftraum) | The ruled part of the page that holds text and music, height × width in cm. |
| Leaf (Blatt) | The whole parchment leaf. |
| Staff, system (Notensystem) | The lines on which the neumes of one line of chant are written. |
| Text line (Textzeile) | The line of text under a staff. |
| Dry-point (Blindlinie, blindgeritzt) | A line scratched into the parchment without ink. |
| Heighted, diastematic | Neumes placed at heights that show pitch; unheighted (adiastematic) neumes do not. |
| Coloured line (Färbung) | A staff line drawn in a colour that marks a pitch, e.g. the red F line and the yellow c line. |
| Clef (Schlüssel, Schlüsselung) | A pitch letter at the start of a staff line (F, c, g, …), fixing the pitch of that line. Letters follow the Guidonian gamut: Γ, A–G, a–g, aa. |
| Custos (pl. custodes, Kustos) | A small sign at the end of a staff showing the first pitch of the next staff. |
| Rubric (Rubrik) | A heading or instruction written in red. |
| Lombard, cadel | Kinds of initials: a coloured, rounded capital; a black capital built of pen strokes. |
| Section | A part of a layout that applies to a folio range or a notator, when a manuscript changes its layout. |
| Not recorded | The empty value of a field: nothing is said. It is never the same as "none". |

## The model

A layout (`PageLayout`) has a format version and one or more sections (`LayoutSection`). Each section has a folio
range, a hand, the four groups below, and a note in English with its German original (`note`, `note_de`; both or
neither, as the writing rule of the root `CLAUDE.md` asks for notes in data). Every field may stay empty.

### 1. Division of the writing space (`writingSpace`)

| Field | Values | Source wording |
|---|---|---|
| `leaf.height`, `leaf.width` | cm, single value or range | "Pergament, 172 Bl., 47 x 32,5 cm" |
| `area.height`, `area.width` | cm, single value or range (`min`, `max`) | "17–17,5 x 12–12,5 cm" |
| `areaSource` | `measured`, `reproduction`, `calculated`, `literature` | "(Abmessung nach digitaler Reproduktion)", "(errechneter Wert)", "(Husmann 1964)" |
| `areaReference` | text, for `literature` | "Husmann 1964" |
| `columns` | 1, 2 | "zweispaltige Anlage" |
| `columnWidth` | cm, two columns only | "Spaltenbreite: 8,1 cm" |
| `sideColumn` | `none`, `initials`, `margin` | "0,75 cm breite Versalienspalten", "die schmalere Randspalte" |
| `sideColumnWidth` | cm | |
| `ruling` | any of `drypoint`, `ink`, `plummet` | "Breite der Tintenlinierung" |
| `margins.top/bottom/inner/outer` | cm | (only for the diagram; the printed diagram is to scale) |
| `lines.unit` | `systems`, `text-lines` | "15 Notensysteme", "18 Textzeilen" |
| `lines.count` | number or range | "zehn oder elf Notensysteme" |
| `lines.variable` | yes/no; the count is then the maximum | "Wechselnde Anzahl von Notensystemen (max. 15 Notensysteme pro Spalte)" |

### 2. Text lines and staves (`staves`)

| Field | Values | Source wording |
|---|---|---|
| `arrangement` | `alternating`, `interlinear`, `textless` | text line and staff in turn; "linienlose Neumennotation" over the text; "mit textlosen Sequenzmelodien beschrieben" |
| `heighting` | `heighted`, `unheighted` | "adiastematische Neumennotation" |
| `lineCount` | 0–6 (0 = no line) | "auf vier Linien", "eine Blindlinie", "ohne Blindlinie" |
| `otherLineCounts` | list of (count, frequency) | "vier oder (selten) fünf", "p. 37–54 auf fünf roten Linien" |
| `ruling` | any of `drypoint`, `ink`, `plummet` | "blindgeritzten oder mit Tinte gezogenen Linien" |
| `lineColour` | colour of the lines not coloured for pitch | "vier roten Linien", "braunen Linien", "diese grün, wenn nicht … gefärbt" |
| `textLineAsStaffLine` | frequency, or empty | "die für den Text gezogene Linie kann als fünfte Notenlinie mitverwendet sein" |

### 3. Colourings (`colourings`)

| Field | Values | Source wording |
|---|---|---|
| `lines` | ordered list of (pitch, alternative, colour, frequency), most frequent first | "rote F- (oder f-) und gelbe c-Linie", "gelbe B-Linie eine Quint unter der F-Linie (selten)" |
| `rubrication` | `throughout`, `partial`, `not-executed`, `none` | "Durchgehend rubriziert", "Rubriken nicht ausgeführt" |
| `initials.kinds` | any of `lombard`, `cadel`, `fleuronne`, `split`, `foliate`, `painted`, `historiated`, `gold` | "rote und blaue Lombarden", "Cadellen", "Fleuronné-Initialen", "gespaltene", "Rankeninitialen", "Deckfarbeninitialen", "historisierte Initialen", "in Blattgold" |
| `initials.colours` | any colours | |
| `initials.size` | lines high, number or range | "ein- bis dreizeilige" |
| `melismaBands` | any colours | "rote Melismenbänder" |

Colours: `red`, `yellow`, `green`, `blue`, `light-blue`, `violet`, `brown`, `black`, `gold`.

### 4. Clefs and custodes (`clefs`)

| Field | Values | Source wording |
|---|---|---|
| `uses` | ordered list of (letters, frequency), most frequent first. Letters written together form one use; alternatives are separate uses | "F- und c-Schlüssel" = one use [F, c]; "F- oder c-Schlüssel" = two uses [F], [c]; "F- und c-Schlüssel, beide auch einzeln" = [F, c], [F], [c] |
| `shapes` | list of (letter, `letter`/`dot`/`hook`) | "der F-Schlüssel punktförmig", "hakenförmig" |
| `placement` | `every-system`, `when-needed`, `none` | "ungeschlüsselte Blindlinie", "im Editionskorpus keine Schlüssel" |
| `changes` | `none`, `between-systems`, `within-system` | |
| `custos` | `none`, `present`, `sporadic`, `later-hand` | "Kustoden", "nur sporadisch vorhanden", "Kustoden von späterer Hand ergänzt" |

Frequencies (for lines, clefs and the text line): `always` (unmarked), `mostly` (meist), `often` (häufig),
`sometimes` (bisweilen, gelegentlich), `sporadic` (sporadisch), `rarely` (selten), `very-rarely` (sehr selten).

### Which values combine

- Every group is independent; all four can be recorded or left empty.
- Ruling methods combine (`drypoint` and `ink`: "blindgeritzt oder mit Tinte gezogen"), as do initial kinds and
  colours.
- A coloured line needs at least one staff line; a clef needs a staff line too (`lineCount` 0 with clefs or coloured
  lines is reported as a problem).
- Lines are a third apart, so two pitches that should both lie on lines of one staff must be an even number of
  steps apart. F and c (four steps) fit; F and G do not. A clef use of two letters an odd number of steps apart is
  reported. F and f (an octave, seven steps) cannot both be lines of one staff: record f as the `alternative` of the
  F line ("F- (oder f-) Linie").
- `columnWidth` is kept only for two columns, `sideColumnWidth` only with a side column, `areaReference` is shown
  only for `literature`.
- `interlinear` goes with `lineCount` 0 and usually `unheighted`; Aquitanian notation is `heighted` with one dry-point
  line or none.

The checks live in `sectionProblems`; they warn in the editor and reject nothing. `normalisePageLayout` drops values
outside the vocabulary, unknown fields and impossible numbers, so a stored or imported layout is always complete.

## What neume-docs does with it

- **Record.** Each project (a folio range of one manuscript, often one hand) has a tab *Page layout*
  (`#/projects/<id>/layout`). The form has the four groups, one tab per section (*+ Section* for a folio range or
  notator with a layout of its own), and shows the consistency problems. Every change is kept with the project
  (field `layout` of the projects store, `null` when nothing is recorded) and so travels with the workspace backup.
- **Display.** Next to the form: a schematic verso page (written area, columns, side column, staves in their colours,
  first initial; proportional to the measures; what had to be assumed is named in the drawing's title), one staff with
  its lines, clefs and custos, and the text in German and English.
- **Export.** *Download file* writes `page-layout_<siglum>.json`; *Text (Markdown)* writes the German and English
  paragraphs under the headings "Textzeilen und Notensysteme" and "Text lines and staves" (the heading the notes on use
  refer to, "KB | Die Notationen | Textzeilen und Notensysteme"). *Import file…* reads such a file back.

### Export format

```json
{
  "format": "neume-docs/page-layout",
  "version": 1,
  "generated": "2026-11-12",
  "source": "Aa 13",
  "folios": { "from": "", "to": "" },
  "hand": "",
  "project": "Aa 13",
  "layout": { "version": 1, "sections": [ { "folios": "", "hand": "", "writingSpace": {}, "staves": {}, "colourings": {}, "clefs": {}, "note": "", "note_de": "" } ] },
  "text": { "de": "37 x 24,5 cm, 15 Notensysteme. …", "en": "37 x 24.5 cm, 15 staves. …" }
}
```

`layout` is authoritative; `text` is derived and given for readers that do not run the shared code. Several projects
in one file use `"format": "neume-docs/page-layouts"` with a list `layouts` (function `pageLayoutsExport`; no button
offers it, state 2026-11-12). A reader in CM-hub (Python) can take `text.de` / `text.en` for the critical
report directly, or run `describePageLayout` and `pageDiagramSvg` through Node.

## How it is checked

```bash
cd packages/core && npm test                      # vocabulary, normalisation, text, drawings (page-layout.test.ts)
cd apps/neume-docs/ui && npm test                 # store field, export and import (pageLayout.test.js, projects.test.js)
cd apps/neume-docs/ui && npm run build            # the app builds with the new tab
```

Type check of the shared code: see `packages/core/README.md`, section "How to check". The worked examples in
`examples.ts` reproduce the source descriptions of Aa 13 and Pa 1871; their text is compared in the tests.

## Status

State 2026-11-12.

| Item | Status |
|---|---|
| Vocabulary from the source descriptions and the notes on use | done |
| Data model, normalisation, checks (`@monodi/core/page-layout`) | done |
| Text in German and English, schematic page and staff | done |
| Recording and display per project in neume-docs, file export and import | done |
| Display in the public documentation viewer (`#/docs`) | open (question 3) |
| Use in CM-hub's print volumes and in Monodi-Zero's notation documentation PDF | open (question 4) |
| Recording the layouts of the CM manuscripts | open; none recorded (state 2026-11-12) |

## Open questions

| # | Question | Context and options | Who decides |
|---|---|---|---|
| 1 | Where does a layout belong: the project or the manuscript? | A project is a folio range of one manuscript, often one hand; the layout is kept there (decision for version 1, 2026-11-12, because a layout often changes with the folio range or the notator, and the project already names both). Options: (a) keep it with the project, as it is; (b) keep it with the manuscript (the metadata store), with sections for ranges and hands, so that two projects on one manuscript share one layout; (c) both, with the project's layout overriding the manuscript's. | editor-in-chief of the notation documentation (CM) |
| 2 | Is the vocabulary complete? | Built from 50 source descriptions (state 2026-11-12). Not covered: line colours "eine Quint über der F-Linie" stated as an interval rather than a pitch (record the pitch), the flat sign next to the c clef ("c-Schlüssel häufig in Verbindung mit b-Vorzeichen"; record as a note), the notation type and the script (left to the source description by design). Options: (a) keep notes for these; (b) add fields (e.g. `clefs.flatWithClef`). | editor-in-chief of the notation documentation (CM) |
| 3 | Should readers of a published documentation see the layout? | The public viewer (`#/docs`) reads only the files of a published documentation. Options: (a) add the layout of each published project to the documentation's manuscript file and show the diagram and text on the manuscript page; (b) leave it to the print volume. | maintainer of neume-docs |
| 4 | How do the print volumes take the layout? | CM-hub prints the Markdown field `notationsdokumentation` of `Quellendaten.xlsx` (`docs/PRINT-VOLUMES.md` in CM-hub). Options: (a) paste the Markdown export into that field; (b) let CM-hub read the JSON files (a folder per volume) and print `text.de`/`text.en` plus the SVG drawing; (c) let Monodi-Zero's PDF export import `@monodi/core/page-layout` and draw the diagram itself. | maintainer of CM-hub's print volumes |
| 5 | Should the page diagram be to scale with a scale bar, as in the printed volume II-2? | The drawing is proportional to the recorded measures, with defaults where nothing is recorded, and has no scale bar. Options: (a) add a scale bar in cm when leaf and area are recorded; (b) keep it schematic. | editor-in-chief of the notation documentation (CM) |

# Projects

All work in neume-docs happens in **projects**. A project is a **range of folios in one manuscript** — the pages of one scribe, say — together with the table that documents its neumes. One manuscript can have several projects (one per hand); each project is a row in the comparison of all manuscripts.

Open **Projects** in the navigation bar. Snippets are never stored in a project: they stay with the manuscript and its folios (or, for screenshots, in a custom collection). A project only decides which folios count, so two projects on the same manuscript see the same snippets for the same folios, and deleting a project never deletes a snippet.

## Making a project

**New project →** asks four short questions. You can go back to any step, and the address of each step can be bookmarked.

1. **Starting point.** *The transcription*: the corpus says which neumes stand where, and the project finds each one on the page images. *The manuscript*: there is no transcription yet (or it is not the starting point); you look at the manuscript and mark what you find.
2. **Manuscript and folios.** Choose a manuscript (from the corpus, or type the name of another one), the first and last folio of the range — empty ends are open — and, if you like, the scribe or hand. The project name is suggested from these.
3. **Images.** *IIIF page images* come from a manifest; if the manuscript has none yet you can paste its address here. *Screenshots* are images you paste or upload yourself, kept in the editor.
4. **Snippets.** *Lines, then signs* — mark each text line, then the signs on it. *Signs only* — mark each sign directly on the page. With screenshots the same choice is between a screenshot of a whole line and of a single sign.

The last answer creates the project and leads to its columns.

The answers can be changed later under **Settings…** on the project. They decide what a cell offers (see below), nothing is converted.

## The four tabs

Every project has the same four tabs, always in view. Any tab can be entered at any time; the order only says what usually comes next.

| Tab | What it is |
| --- | --- |
| **Columns** | One big table of the whole pattern library, and **the code is what it is about**. The top row has the shapes (only the movement: `*`, `*d`, `*u`, `*ud`, …; Clef and Custos at the end); under each shape stand all the codes with that movement — plain, in brackets, with special signs, code variants. Everything follows one rule, **length, then frequency**: fewer notes first, and among equally long the more frequent first. Tick the columns of this project's standard table. A special sign (L, O, Q, `,`) takes at most three constellations. Under the codes you see how often each occurs in the transcription of this project's folios and how many snippets exist (snippets already drawn there are loaded in, and a new project starts with the columns that already have snippets). **Search** narrows the table to matching codes; the filter shows only the chosen codes, those with snippets, or those in the transcription; **Add suggested** takes the codes with snippets and the most frequent code of each shape in the transcription. |
| **Standard table** | The chosen columns, one cell each. Open a cell to find or add snippets. |
| **Extended table** | The standard table plus any other pattern of the library, added by code (`*udL` finds every way of writing it). Added columns can be taken out again with ✕. |
| **All manuscripts** | Every project as a row, the chosen columns side by side (the standard or the extended columns). A cell opens that project's table at that column. |

### Variants and codes of your own

- **+ variant** under any column makes a *code variant* of it: a code in which a note carries a sign of your own (`*udd` → `*uVdd`; signs are defined in the [pattern library](./conventions)). The variant is a column of its own, right after the code it comes from, and is chosen for the table at once.
- **A code the library does not have:** type it into the search. If it is a good code (the first note is `*`, then `u`, `d` or `e`; `[ ]` joins notes; upper-case letters are signs) it is offered with **Add it…**, shown, filed under its shape and chosen. In the extended table the search on the right offers the same.

## A cell

A cell opens beside the table; the arrows move to the neighbouring column, **Esc** closes it, and its address (`?cell=…`) can be shared. What it offers depends on how the project works:

| Images | Offers |
| --- | --- |
| **IIIF**, from the transcription | The places where the transcription has this code in the project's folios, by folio and line, with how many snippets are drawn there. **Open page →** opens the [page editor](./annotation); *Back to the project table* there returns to the same cell. With line snippets the editor goes to the line region (or asks you to draw it); with sign snippets it takes the whole folio. |
| **IIIF**, without a transcription | The folios of the project, to open and mark by hand. |
| **Screenshots of signs** | A place to paste (Ctrl/⌘ V), drop or choose an image of the sign, with where it is from (folio, line, and whatever else the settings ask for). |
| **Screenshots of lines** | The lines of the project, to mark a sign of this code on, and — with a transcription — the lines the transcription has this code on, each with *Add the picture…* if the line has none yet. |

Click a snippet in the cell to see and edit what it says about itself (its attributes), to open its page or line, or to delete it.

## Lines and signs (screenshots of lines)

With line snippets a project keeps **lines**: pictures of text lines, listed above the table. **Add a line…** takes a pasted or dropped screenshot and asks where it is from — a folio (a number and `r` or `v`, e.g. `12r`) and a line (a number). Then the **line editor** opens:

- Drag on the line to mark a **sign**; click a box to select it, drag it to move, drag a corner to resize, *Delete* removes it. Zoom helps with thin lines.
- Every sign gets a **pattern code** and what the settings ask of a sign (by default its **syllable**). A code the project has no column for yet is added to the extended table, and to the pattern library if it is new.
- A sign keeps its own cut-out picture, so it shows in the table like any snippet, and it stays tied to its line: its place is "f. 12r · l. 3 · sign 2".
- With a transcription, the neumes of that line are laid out in reading order. A new box gets the neume that stands at its place — its code, its syllable and a link — and *Match all signs with these neumes* does it for the whole line. Click a neume to give it to the selected sign.
- ‹ › move to the previous or next line.

## Snippet attributes

What a snippet says about itself is set in **Settings → What a snippet says about itself**: a *line snippet* has a folio and a line, a *sign snippet* has a syllable, and a sign that stands alone carries the folio and line as well (not required). You can add attributes (text, number, folio, line number, or one of a list), make them required, and choose whether they are checked. By default a **folio** is a number and `r` or `v`, a **line** a number; the same check is applied to the first and last folio of a project. A check can be switched off, or a text can be given a pattern of your own.

## Publishing, settings, deleting

**Settings…** on the project changes its name, folios and hand, and the three answers of the wizard. The manuscript stays; another manuscript is another project. Two more things live there:

- **Show this project in the public views** publishes the project's manuscript in the [public views](./public-view). For IIIF projects this fills the public table of the manuscript with the project's columns; for screenshots it publishes their collection.
- **Delete project** removes the project at once and offers **Undo**. Its snippets are untouched.

## Work from before projects

Neume tables and custom manuscripts made before projects existed appear as projects the first time you open Projects: a table's rows become the columns (the standard selection stays the standard selection, the expanded documentation becomes the extended table), a collection is linked as it is. Nothing is copied or deleted, and a project you delete is not made again. The old addresses (`#/table/…`, `#/compare`) lead to the matching project tab.

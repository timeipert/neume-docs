# Manuscript Metadata

**Manuscripts** in the navigation bar (tab *Catalogue*) shows all manuscripts in one table, like a spreadsheet: one row per manuscript, one column per piece of metadata. It is meant for preparing many manuscripts at once.

## What is in the table

The columns stand in **categories**, the bands above their headings. These four are there from the start; you can [make more and rearrange everything](#categories-and-checks).

| Category at first | Where the columns come from |
| --- | --- |
| **Corpus catalogue** — region, place, institution, library, shelfmark, date, … | the `meta.json` of each source in the corpus. Which columns there are depends on what your corpus has; extra ones (Cantus siglum, status, …) can be switched on under *Columns*. |
| **IIIF** — manifest, page images, image source | the manuscript's manifest address, and the page images the corpus names (see below). |
| **Your fields** | columns you add yourself, e.g. "Notation type". They are the attributes the public pages offer as filters. |
| **Corpus** — documents, neumes, patterns, projects | calculated; read-only. |

The corpus itself is never changed. What you edit is stored as a change on top of it, in your workspace, and every changed cell is marked with an orange corner. *Put back to what the corpus says* (column menu) removes your changes again.

## Working in the table

It behaves like Excel:

- **Select** with the mouse (drag, Shift+click) or the arrow keys; click a column header or a row number to select the whole column or row.
- **Edit** by typing, by double-clicking, or with <kbd>F2</kbd>. <kbd>Enter</kbd> and <kbd>Tab</kbd> confirm and move on, <kbd>Esc</kbd> cancels. The bar above the table shows the full text of the selected cell.
- **Copy and paste** blocks of cells, also to and from Excel. One value pasted over a selection fills the whole selection.
- **Fill down** with <kbd>Ctrl</kbd>+<kbd>D</kbd>, **fill right** with <kbd>Ctrl</kbd>+<kbd>R</kbd>. <kbd>Delete</kbd> empties the selected cells.
- **Undo and redo** with <kbd>Ctrl</kbd>+<kbd>Z</kbd> and <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>. A paste, a fill, a replacement or an import is one step.
- **Sort** by clicking a column heading; **hide** columns under *Columns* and **resize** them by dragging the edge of a heading.

### Finding the manuscripts you want

*Search* looks in every shown column. *Filters* adds a filter box under each heading: text finds cells that contain it, `=text` matches exactly, `=` alone finds empty cells, `!text` excludes. The quick filters show only edited manuscripts, those without IIIF, or those with a marked value (see [Categories and checks](#categories-and-checks)).

### Changing many at once

- **Find & replace** works on the selected cells, on one column, or on the whole table, with options for case, whole cells and patterns, and shows what will change before it does.
- **Clean up** trims spaces or changes case in the selected cells.
- **Import** reads a CSV or tab-separated file. The first row names the columns, one of them must be *Siglum*; rows are matched by siglum. You see how many cells will change before anything does.
- **Export** copies the table to the clipboard, ready to paste into Excel, or downloads CSV (comma or semicolon) or TSV. Export, edit in Excel, import again is a quick way to work through a long list.

## Your own columns

*Columns → Add a column of your own* adds a column, under the category you choose. Open its menu (the ⋯ on the heading) and choose **Category, check and more…** to rename it, describe it, change what kind of values it holds (text, date or century, location), move it to another category and say what its cells should look like. A *date* column is read as a year range so the public pages can filter it on a timeline; the dialog tells you how many of its values cannot be read as a date. **Delete this column** removes it with its values; **Undo** in the message that follows brings both back.

The values of manuscript metadata are edited in this table only. Other pages link here.

## Categories and checks

**Settings → Manuscript metadata** (also *Columns → Categories and checks…*) arranges the columns:

- **Categories.** Make a category — *Notation*, say — and put your columns *Ink* and *Clef* beneath it; the table shows it as a band above their headings. Each category can be renamed, moved to the left or right and, if it is one of yours, removed (its columns go back where they came from). The four the table starts with stay, but can be renamed too.
- **Columns.** Every column, those of the corpus catalogue as well, can be moved to another category (the list on its row) and up or down within it. Columns of the catalogue show up once a corpus is loaded; where you put them is kept.
- **Checks.** *Check…* on a column says what its cells should look like: **one of a list** (one value per line; *Add the values in use* fills it from the column) or **a pattern** (a regular expression the *whole* value has to match, like the `pattern` of an HTML input; *Try a value* shows at once whether one fits). A check can ignore upper and lower case and carry a message for a marked cell.

A check **marks, it does not refuse**. A cell that does not fit is outlined in red; point at it to read why, or use the quick filter *Problems* to find them. You can still type what you like. A column with a list becomes a **drop-down** while you edit it (arrow keys and <kbd>Enter</kbd> pick, typing narrows the list). Empty cells are never marked.

The order and the categories also decide the order of your fields on the public pages. They travel with backups and configuration files; *Start over* puts categories, order and checks back (your columns and their values stay).

## IIIF

The **IIIF manifest** column holds each manuscript's manifest address. Type or paste one — a whole column of addresses can be pasted at once. The manifest loads when the manuscript's images are first needed, and the address is checked only for looking like a web address. With a row selected, **Pages →** opens the page editor; for a manuscript without page images the button reads **Add page images…** and asks for the manifest address right there.

Most sources in the CM carry no manifest. But many *documents* name the image they were transcribed from (a IIIF Image API address, in the document's `iiifs` field). The editor reads these on import: for each folio a document starts on, that image becomes the page. The manuscript then shows its pages without a manifest: select its row and choose **Pages →**, or open a cell of a project on it. *Page images* tells you how many pages that gives; *Images from* says whether a manuscript uses its manifest or the corpus's addresses. A manifest you set always takes over.

All the IIIF resources of your manuscripts, several per manuscript if you like, are in a table of their own, with suggestions from the MMMO catalogue: see [IIIF Sources & MMMO Suggestions](./iiif-sources).

Working copies (document IDs ending in `TR` or `GS`) are left out of the neume counts, but their image addresses are used — they often carry them.

## Filters on the public pages

The public manuscript directory filters by the attributes under *Your fields*. To use a corpus column as a filter, open its menu and choose *Copy to a filter column of my own*. This makes a one-time copy; the two columns are independent afterwards.

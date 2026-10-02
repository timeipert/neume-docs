# Manuscript Metadata

**Metadata** in the navigation bar shows all manuscripts in one table, like a spreadsheet: one row per manuscript, one column per piece of metadata. It is meant for preparing many manuscripts at once.

## What is in the table

| Columns | Where they come from |
| --- | --- |
| **Corpus catalogue** — region, place, institution, library, shelfmark, date, … | the `meta.json` of each source in the corpus. Which columns there are depends on what your corpus has; extra ones (Cantus siglum, status, …) can be switched on under *Columns*. |
| **IIIF** — manifest, page images, image source | the manuscript's manifest address, and the page images the corpus names (see below). |
| **Your fields** | columns you add yourself, e.g. "Notation type". They are the attributes the public pages offer as filters. |
| **Corpus** — documents, neumes, patterns, neume table | calculated; read-only. |

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

*Search* looks in every shown column. *Filters* adds a filter box under each heading: text finds cells that contain it, `=text` matches exactly, `=` alone finds empty cells, `!text` excludes. The quick filters show only edited manuscripts, those without IIIF, or those with a problem (an address that is not a web address, or a folio offset that is not a number).

### Changing many at once

- **Find & replace** works on the selected cells, on one column, or on the whole table, with options for case, whole cells and patterns, and shows what will change before it does.
- **Clean up** trims spaces or changes case in the selected cells.
- **Import** reads a CSV or tab-separated file. The first row names the columns, one of them must be *Siglum*; rows are matched by siglum. You see how many cells will change before anything does.
- **Export** copies the table to the clipboard, ready to paste into Excel, or downloads CSV (comma or semicolon) or TSV. Export, edit in Excel, import again is a quick way to work through a long list.

## IIIF

The **IIIF manifest** column holds each manuscript's manifest address. Type or paste one — a whole column of addresses can be pasted at once. The manifest loads when the manuscript's images are first needed, and the address is checked only for looking like a web address.

Most sources in the CM carry no manifest. But many *documents* name the image they were transcribed from (a IIIF Image API address, in the document's `iiifs` field). The editor reads these on import: for each folio a document starts on, that image becomes the page. The manuscript then shows its pages in **Annotate → Manuscripts** without a manifest. *Page images* tells you how many pages that gives; *Images from* says whether a manuscript uses its manifest or the corpus's addresses. A manifest you set always takes over.

Working copies (document IDs ending in `TR` or `GS`) are left out of the neume counts, but their image addresses are used — they often carry them.

## Filters on the public pages

The public manuscript directory filters by the attributes under *Your fields*. To use a corpus column as a filter, open its menu and choose *Copy to a filter column of my own*. This makes a one-time copy; the two columns are independent afterwards.

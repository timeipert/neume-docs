# Viewing and Publishing Documentations

neume-docs has two ways in. **View documentations** is for reading what others have published; **Editor** is for making your own. They meet in the middle: what you publish from the editor is what the viewer shows.

## Reading a documentation

Open **View documentations** on the start page. The page has two parts: **From repositories** — the documentations this site offers and the ones you opened yourself — and **Your own work** (*this browser*), which is there as soon as you have made anything in the editor. Your own work is shown as readers would see it, that is, what you have published; tick *Also show what is not published* to look at all of it. To read a documentation that is not in the list, type the address of its GitHub repository (`owner/name`) under *Open a repository*; it is remembered in this browser.

A documentation has three pages:

- **Manuscripts** — a table of the manuscripts with the metadata the authors chose to show. **Filter** opens a panel: pick values (with how many manuscripts have each), draw a date range on a timeline (the manuscripts are drawn at their datings, so you see where they lie), give a number range, or type. Several filters narrow each other (*Match all*) or add up (*Match any*); *Everything except these* turns a filter round. What is set is in the address, so *Link to this selection…* hands it on.
- **Neume table** — the manuscripts as rows, the neume shapes as columns, in the order of the Corpus Monodicum. *Standard table*, *Expanded documentation* and *All codes* show more or less. *Manuscripts* limits the rows; *Compare these in the neume table* on the first page carries a selection over.
- **About** — who made it, the licence, where the files are, and how to cite it.

### Looking at several together

Tick two or more on the start page and choose *Look at them together* — or, inside a documentation, *Combine with…*. Their manuscripts then stand in one table and one neume table, so your own work can be compared with a repository's, or two repositories with each other. Columns with the same name are one column; a *Documentation* column says where each manuscript comes from, and can be filtered by like any other. A combination has no authors of its own: a manuscript, a pattern, a cell or a snippet is cited by the documentation it comes from (the ⛓ button does that), and the *About* page has a citation for each. Signs that two documentations draw differently are reported. A combination that includes your own work opens only in your browser.

### Links and citations

Look for the **⛓** button. A manuscript, a pattern of a manuscript, a cell of the neume table, a column, a single snippet and a selection each have a link that opens exactly that, highlighted, and suggestions for citing it: *Short*, *APA*, *Chicago*, *MLA*, *BibTeX* and *RIS* (the last two can be saved as files), and the authors' own wording if they gave one. The citation names where the manuscript is kept and the day you looked at it. For documentations on GitHub the link can be fixed to the version you looked at (a commit), so it keeps leading to what you cited.

## Publishing your own

1. Mark projects as published (their settings have the switch) and mark snippets on their pages as usual.
2. Open **Workspace → Publish a documentation**. Give it a **title**, name the **authors** and the **licence** — a citation needs them, and the panel says what is missing. Choose which metadata readers are shown (working notes such as the comment column are left out unless you tick them).
3. **Preview as readers see it** opens it in the viewer.
4. **Download documentation (ZIP)** makes the files. Unzip them into a **public GitHub repository** (at its top, or in a folder), and commit. The README in the ZIP says what to do next.
5. Open it in the viewer with *Open a repository*. To have it listed for everybody on a site, add it to that site's list of endpoints.

### Which columns can be filtered

Readers can filter by the columns you offer. In *Settings → Manuscript metadata* each column has a **Filter** box; the column's menu (*Category, check and more…*) also says *how* it is filtered: **pick values**, **date range**, **number range** or **text**. A column with few different values, a column of datings and a column of numbers are offered without being ticked.

## The list of endpoints (for whoever hosts the app)

The site's list is the file `endpoints.json` next to the app (`ui/public/endpoints.json` in the source):

```json
{
  "endpoints": [
    { "name": "Our documentation", "repo": "owner/name", "description": "Optional" },
    { "name": "On another branch or in a folder", "repo": "owner/name", "branch": "dev", "path": "docs/neumes" },
    { "name": "On any web server", "url": "https://example.org/neume-docs/" }
  ]
}
```

Anyone who copies the app can change the list. Endpoints are read-only: the viewer only fetches files and never writes to them.

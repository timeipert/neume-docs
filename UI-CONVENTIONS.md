# Interface conventions

Every page follows these, so that the editor feels like one tool. When something new is added, use the existing piece; add a new one only if none fits, and put it in `ui/src/components/ui/`.

## One place per function

A function is reachable from one place, the place where it is *used*. Other pages link to it (a link, not a copy of the form).

| Function | Lives in | Linked from |
| --- | --- | --- |
| Signs, code variants, snippet variants, preferred IDs | Patterns (pattern library) | the variant editor (`/patterns?setup=signs`), the snippet dialog (`?setup=snippet-variants`) |
| Own metadata columns, their names and kinds | Manuscripts → Catalogue (column menu) | the annotation view |
| IIIF manifests per manuscript, MMMO suggestions | Manuscripts → Images | the catalogue, the Workspace, a project's cell |
| Folio alignment of scans | the page editor (⇄ on a manuscript), reached by *Pages →* in the catalogue | a project's cell |
| Backups, project folder, restore points, deleting work, reset | Workspace | the save-status pill in the navigation bar |
| Sending annotations to Monodi-Zero, taking them back, linking snippets to the transcription | Workspace (Exchange with Monodi-Zero) | Manuscripts → Corpus, after an update from Monodi-Zero |
| Removing the loaded corpus | Corpus | |
| OMMR4all import | Corpus (leads to `/ommr`) | |
| Making a project, choosing its columns, filling its table, comparing all manuscripts | Projects (the four tabs of a project) | the Corpus page, the Metadata table |
| Lines, the signs on them, snippets | the cell of a table (and the line editor it opens) | |
| What a snippet says about itself: its attributes and how they are checked | Settings | the cell, the line editor |
| Display mode, order of the neume table | Settings | |

Settings is for preferences that apply everywhere. If a setting belongs to one page, it goes on that page.

## Page structure

- **One navigation, no drop-downs:** Projects · Manuscripts · Patterns · Workspace · Settings. A page that has several views shows them as tabs under its title (`PageTabs`: *Manuscripts* has Catalogue, Images, Corpus; *Patterns* has Library, In the corpus); each tab is a page with an address of its own.
- **A row leads on:** where a table lists manuscripts (the catalogue), the selected row offers what can be done with it — *Project →* and *Pages →* — instead of another menu entry.
- Every page starts with `PageHeader`: a small **eyebrow** (where in the workflow), the **title**, a one-line **subtitle**, and the page's main **actions** at the right.
- Pages made of blocks (Workspace, Settings) use `PageShell` with `Panel`s. Panels with an `id` appear in the "On this page" index. Fold-away set-up uses `Disclosure`.
- Tools that need the width (the metadata grid, the neume table, the pattern list) use `PageHeader` and fill the page.

## Projects: guiding, and where you can jump

Work is guided, but never locked: every step has an address, so a person can enter, leave and come back anywhere.

- **A question that shapes the work** is asked in a stepper (`/projects/new?step=…`): one question per step, answers as `ChoiceCards` (each answer explained), back and forth freely, a review at the end. What it decided can be changed later under **Settings…**.
- **The steps of a project** are the four tabs of `ProjectShellView` (Columns → Standard table → Extended table → All manuscripts), always in view and always clickable. They are child routes (`/projects/:id/columns`, `…/standard`, `…/extended`, `…/all`), and the end of each tab offers the next as its primary button.
- **A cell** of a table opens beside it, addressed by `?cell=<code>`. A link to a cell from anywhere is `{ name: 'project_cell', params: { id }, query: { code } }`.
- **A page that is reached from a cell** (the page editor, the line region editor) is given `return_to=project&return_id=<project id>&highlight=<code>`, and its back button leads to that cell.
- **Old addresses** (`/table`, `/table/:source`, `/compare`, `/`) are redirects to the project pages, so links and bookmarks keep working.

## Buttons

Use the `ne-btn` classes (`style.css`).

- One **primary** button per view or dialog, the thing most people come to do.
- **Delete triggers** are `ne-btn--danger` (outline). The filled `ne-btn--danger-solid` is only the *final* button of a confirmation.
- A button that opens a dialog ends in **…**. A button that goes to another page ends in **→**.
- In a dialog, the primary action is last, on the right; **Cancel** is next to it.

## Forms and tables

`ne-input`, `ne-field` (label above), `ne-check` for check boxes and radios, `ne-table` for plain tables, `ne-chip` for small tags, `ne-note` (`--info`, `--warn`, `--error`, `--success`) for a notice inside a page, `ne-empty` when there is nothing yet.

**What cannot work yet is not offered.** Without page images no cell offers *Open page*, and the catalogue offers *Add page images…* instead of *Pages →*: `IiifSetup` stands in the place of the missing thing and says what is missing, why, and what to do — with a field to give the manifest address right there. The same holds for anything else that needs something that is not there: explain, do not show a button that leads nowhere.

An empty state says what will appear and how it gets there ("No manuscript has any work yet. Annotations, line regions and neume table rows will appear here.").

## Feedback

- Confirm what just happened with a **toast** (`useToast`). Never `alert()` or `window.confirm()`.
- A toast that can be taken back carries an **Undo** button.
- Problems that need attention stay on the page as an `ne-note--error`.

## Deleting

How much ceremony a deletion needs depends on how much it takes and whether it can be undone:

1. **A small thing** (one row, one sign, one column): delete at once, show a toast with **Undo**.
2. **Part of the workspace** (a manuscript's data, one area): a dialog that says what goes (`ActionDialog`), a **restore point** is kept first, and the toast offers **Undo**.
3. **Everything** (all work, reset the app): the same, and the person must **type a word** (`delete`, `reset`).

Anything that removes workspace data goes through `useWorkspaceManagement`, which makes the restore point. If a restore point cannot be saved, nothing is deleted unless the person chooses to continue without one.

## Dialogs

`ModalDialog` is the one frame (backdrop, title, body, footer; closes on Esc). `ConfirmDialog` and `ActionDialog` are built on it. Do not write new overlay CSS.

## Naming

| Word | Means |
| --- | --- |
| **Manuscripts** | the catalogue of every manuscript, its images, and the corpus it comes from (three tabs) |
| **Corpus** | the data you loaded (Monodi-Zero workspace or CM project) |
| **Workspace** | everything *you* made on top of it |
| **Patterns** | the pattern library (the vocabulary) |
| **Project** | a range of folios in one manuscript (one scribe's pages, say) and the table that documents its neumes |
| **Standard table** / **Extended table** | the project's table with the columns of the brief / with any further pattern of the library |
| **Page editor** | a manuscript's IIIF folios, where line regions and signs are marked. From a cell it opens inside the project (its tabs stay, with a *Page* tab); *Pages →* in the catalogue opens it on its own |
| **Screenshots** | the images of a project that has no IIIF: lines and signs pasted in, kept in the editor |

All text in the interface is English.

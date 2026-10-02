# Interface conventions

Every page follows these, so that the editor feels like one tool. When something new is added, use the existing piece; add a new one only if none fits, and put it in `ui/src/components/ui/`.

## One place per function

A function is reachable from one place, the place where it is *used*. Other pages link to it (a link, not a copy of the form).

| Function | Lives in | Linked from |
| --- | --- | --- |
| Signs, code variants, snippet variants, preferred IDs | Patterns (pattern library) | the variant editor (`/patterns?setup=signs`), the snippet dialog (`?setup=snippet-variants`) |
| Own metadata columns, their names and kinds | Metadata table (column menu) | the annotation view |
| IIIF manifests per manuscript, MMMO suggestions | Metadata → IIIF sources | the Manuscripts table, the Workspace |
| Folio alignment of scans | Page images (⇄ on a manuscript) | |
| Backups, project folder, restore points, deleting work, reset | Workspace | the save-status pill in the navigation bar |
| Removing the loaded corpus | Corpus | |
| OMMR4all import | Corpus (leads to `/ommr`) | |
| Display mode, order of the neume table | Settings | |

Settings is for preferences that apply everywhere. If a setting belongs to one page, it goes on that page.

## Page structure

- Every page starts with `PageHeader`: a small **eyebrow** (where in the workflow), the **title**, a one-line **subtitle**, and the page's main **actions** at the right.
- Pages made of blocks (Workspace, Settings) use `PageShell` with `Panel`s. Panels with an `id` appear in the "On this page" index. Fold-away set-up uses `Disclosure`.
- Tools that need the width (the metadata grid, the neume table, the pattern list) use `PageHeader` and fill the page.

## Buttons

Use the `ne-btn` classes (`style.css`).

- One **primary** button per view or dialog, the thing most people come to do.
- **Delete triggers** are `ne-btn--danger` (outline). The filled `ne-btn--danger-solid` is only the *final* button of a confirmation.
- A button that opens a dialog ends in **…**. A button that goes to another page ends in **→**.
- In a dialog, the primary action is last, on the right; **Cancel** is next to it.

## Forms and tables

`ne-input`, `ne-field` (label above), `ne-check` for check boxes and radios, `ne-table` for plain tables, `ne-chip` for small tags, `ne-note` (`--info`, `--warn`, `--error`, `--success`) for a notice inside a page, `ne-empty` when there is nothing yet.

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
| **Corpus** | the data you loaded (Monodi-Zero workspace or CM project) |
| **Workspace** | everything *you* made on top of it |
| **Patterns** | the pattern library (the vocabulary) |
| **Neume Tables** | the standard table per manuscript |
| **Page images** | a manuscript's IIIF folios, where line regions are drawn |
| **Custom manuscripts** | collections with their own images, no IIIF |

All text in the interface is English.

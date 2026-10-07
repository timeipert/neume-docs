# Settings

**Settings** holds the few preferences that apply across the whole editor. Anything that belongs to one place is set in that place instead:

| What | Where |
| --- | --- |
| Signs, code variants, snippet variants, preferred IDs | **Patterns** (the pattern library) |
| The values of your own metadata columns, renaming and describing them | **Manuscripts → Catalogue** (a column's menu → *Category, check and more…*) |
| Aligning a manuscript's scans with the folios of the transcription | the page editor (*Pages →* in the catalogue), the ⇄ button of a manuscript |
| Backups, the project folder, restore points, deleting things | **Workspace** |

## Manuscript metadata

How the columns of the manuscripts table are arranged: the **categories** above them, the order, and what the cells of each column should look like (**one of a list**, or **a pattern**; a cell that does not fit is marked, never refused). See [Manuscript Metadata](./manuscript-metadata#categories-and-checks).

## What a snippet says about itself

The attributes of a **line snippet** (its folio and line) and of a **sign snippet** (its syllable), and how strictly they are checked. Add your own, make them required, or switch the check off; by default a folio is a number and `r` or `v` (`12r`), a line a number. See [Projects](./projects).

## How patterns are shown

The standard way a pattern code is drawn wherever it appears: **Graphic** (the neumes), **Arrows** (each step as ↗ ↘ →) or **Text** (the code letters u, d, e).

## Order of the columns

The neume tables order their columns by the number of notes, then by how often each pattern occurs. Only the order uses that count; no frequency is shown in the tables. Here you choose where it comes from:

- **The corpus I loaded** (the default): the counts of what is on the Corpus page. A pattern your corpus has seen more often always comes first; a snapshot of the Corpus Monodicum that is built into the editor only orders the patterns your corpus counts equally or has never seen. Without a loaded corpus the snapshot alone orders the columns.
- **Built-in snapshot of the CM**: only that snapshot, so the order does not change with what you have loaded.

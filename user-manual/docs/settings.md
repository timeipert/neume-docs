# Settings

**Settings** holds the few preferences that apply across the whole editor. Anything that belongs to one place is set in that place instead:

| What | Where |
| --- | --- |
| Signs, code variants, snippet variants, preferred IDs | **Patterns** (the pattern library) |
| Your own metadata columns, renaming and describing them | **Metadata** (a column's menu → *Edit this column…*) |
| Aligning a manuscript's scans with the folios of the transcription | **Annotate → Page images**, the ⇄ button of a manuscript |
| Backups, the project folder, restore points, deleting things | **Workspace** |

## What a snippet says about itself

The attributes of a **line snippet** (its folio and line) and of a **sign snippet** (its syllable), and how strictly they are checked. Add your own, make them required, or switch the check off; by default a folio is a number and `r` or `v` (`12r`), a line a number. See [Projects](./projects).

## How patterns are shown

The standard way a pattern code is drawn wherever it appears: **Graphic** (the neumes), **Arrows** (each step as ↗ ↘ →) or **Text** (the code letters u, d, e).

## Ordering of the neume table

The neume table orders its columns by the number of tones, then by how often each pattern occurs in the Corpus Monodicum. Only the order uses that count; no frequency of the CM is shown in the tables. Here you choose what "the CM" means for it:

- **Whole Corpus Monodicum** (recommended): a snapshot built into the editor. The order does not change with what you have loaded.
- **The corpus I loaded**: counts only what is on the Corpus page. Useful for material outside the CM. Patterns the loaded data has never seen fall back to the CM snapshot.

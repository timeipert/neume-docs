# The Neume Table

Each [project](./projects) gets a **Neume Table**: the neume shapes it uses, in a fixed order, so that manuscripts can be compared column by column. The table is the second and third tab of the project (*Standard table* and *Extended table*); its columns are chosen in the first.

## The order of the columns

Columns are ordered by two criteria:

1. **Number of tones** — all two-note neumes, then all three-note neumes, and so on.
2. **Frequency in the Corpus Monodicum** — within the same number of tones, the more frequent comes first.

A neume's frequency is counted over every way of writing it: brackets (ligatures) and special signs are ignored. `*ud` therefore counts `*ud`, `[*u]d`, `*[ud]` and also `*udL`.

By default "the CM" is the whole Corpus Monodicum, from a snapshot built into the editor, so the order does not change with what you have loaded. *Settings → Ordering of the neume table* lets you count the loaded corpus instead.

## The standard table

The standard table has fixed columns:

`*` · `*d` · `*u` · `*e` · `*dd` · `*ud` · `*uu` · `*du` · `*udd` · `*uud` · `*ddu` · `L` · `O` · `Q` · `,` · `Clef` · `Custos`

This is the same ordering rule, with some cases left out (for instance `*ed` and `*ddd`).

Choosing its columns is the first task of every project (tab *Columns*):

- **Neume shapes.** Each shape (`*ud`, …) is a group; under it stand all the ways of writing it — `*ud`, `[*u]d`, `*[ud]`, `[*ud]` and any code variant of the library. Tick the ones this project uses.
- **Special signs.** A pattern with a sign stands under its shape, among the others: `*dL` under `*d`, `*udL` under `*ud`. Choose **at most three** constellations for each of `L` (liquescent), `O` (oriscus), `Q` (quilisma) and `,` (strophicus) — typically `*dL`, `*uL` and for example `*udL`, but that is for you to decide. A pattern with several signs counts for its **first** sign: `*uOdL` is an `O` pattern.
- **Clef and Custos.** Tick them if the manuscript has them.

## Expanded documentation

What a project needs beyond the standard table goes into the **expanded documentation**, the *Extended table* tab.

- **Add a pattern by code.** Search the whole pattern library — `*udL` finds every way of writing it; with brackets (`[*u]d`) the code must match exactly.
- **Found in this manuscript.** Patterns the loaded transcriptions contain but the table does not yet cover are offered directly.

Each addition appears in the table at its place in the ordering. The search sits beside the table, so you see every addition at once.

## Working in the editor

- The tab *Columns* is one table for the whole library. By default each shape shows its first few codes and those already in use; **+n more** opens the rest, and the search narrows the table to a code.
- Under each column the table shows how often the code occurs in the transcription of the project's folios, and how many snippets the project has.
- In the *Standard table* every column is one cell; open it to find the neume in the transcription and add a snippet.
- Taking a column out of the extended table shows an **Undo** message for a few seconds.
- Whether the project's manuscript appears in the public views is a setting of the project.

## Three views of the same data

| View | What it shows |
| --- | --- |
| **Standard table** | Only the standard selection. Everything else is hidden. |
| **Expanded documentation** | The standard table, plus what is relevant for each project, at its place in the ordering. |
| **All codes** (public comparison only) | Every transcription code as a column of its own. |

In the comparison table (the fourth tab of a project, and *Public → Neume Table*) projects or manuscripts are the rows, so you can read a column down to see how each manuscript writes that neume.

## Snippets

What matters in the table is the pattern code. Every column can be linked to snippets on the manuscript scan, or to screenshots, from its cell; see [Projects](./projects) and [Manuscript Annotation](./annotation). (Reference IDs belong to the older tables; they are kept for work made with them, see [Pattern Editor & Ref IDs](./equivalents).)

# The Neume Table

Each manuscript gets a **Neumentabelle**: the neume shapes it uses, in a fixed order, so that manuscripts can be compared column by column. Open **Neumentabellen** in the navigation bar and choose a manuscript.

## The order of the columns

Columns are ordered by two criteria:

1. **Number of tones** — all two-note neumes, then all three-note neumes, and so on.
2. **Frequency in the Corpus Monodicum** — within the same number of tones, the more frequent comes first.

A neume's frequency is counted over every way of writing it: brackets (ligatures) and special signs are ignored. `*ud` therefore counts `*ud`, `[*u]d`, `*[ud]` and also `*udL`.

By default "the CM" is the whole Corpus Monodicum, from a snapshot built into the editor, so the order does not change with what you have loaded. *Settings → Neume Table* lets you count the loaded corpus instead.

## The standard table

The standard table has fixed columns:

`*` · `*d` · `*u` · `*e` · `*dd` · `*ud` · `*uu` · `*du` · `*udd` · `*uud` · `*ddu` · `L` · `O` · `Q` · `,` · `Clef` · `Custos`

This is the same ordering rule, with some cases left out (for instance `*ed` and `*ddd`).

Filling it in is the standard task for every manuscript:

- **Neume shapes.** For each column, open the **pattern library** and choose how this manuscript writes the neume. The library offers the plain ways of writing it, without special signs.
- **Special signs.** The columns `L` (liquescent), `O` (oriscus), `Q` (quilisma) and `,` (strophicus) each have a library of *all* patterns carrying that sign, ordered by tones and frequency. Choose **at most three** constellations per column — typically `*dL`, `*uL` and for example `*udL`, but that is for you to decide. A pattern with several signs belongs to the column of its **first** sign: `*uOdL` is an `O` pattern.
- **Clef and Custos.** Mark whether the manuscript has them.

## Expanded documentation

What a manuscript needs beyond the standard table goes into the **expanded documentation**. Switch to it with the toggle at the top.

- **Add a pattern by code.** Search the whole pattern library — `*udL` finds every way of writing it; with brackets (`[*u]d`) the code must match exactly.
- **Found in this manuscript.** Patterns the loaded transcriptions contain but the table does not yet cover are offered directly.

Each addition appears in the table at its place in the ordering.

## Three views of the same data

| View | What it shows |
| --- | --- |
| **Standard table** (*Show Standard Table*) | Only the standard selection. Everything else is hidden. |
| **Expanded documentation** | The standard table, plus what is relevant for each manuscript, at its place in the ordering. |
| **All codes** (public comparison only) | Every transcription code as a column of its own. |

In the comparison table (*Public → Neumentabelle*) manuscripts are the rows, so you can read a column down to see how each manuscript writes that neume.

## Reference IDs and snippets

Every pattern in the table can carry a Reference ID, and can be linked to snippets on the manuscript scan with **Annotate snippets**. See [Manuscript Annotation](./annotation).

# Loading Data

The Neumen-Editor starts **empty**: it ships with no manuscripts. Everything you see is built from what you load on the **Corpus** page.

## What you can load

| What | How it looks | Where it comes from |
| --- | --- | --- |
| **Monodi-Zero workspace** | one `.monodijson` file | Monodi-Zero, *Settings → Workspace → export* |
| **Corpus Monodicum project** | a folder, or a ZIP of it, laid out as `source/meta.json`, `source/document/meta.json`, `source/document/data.json` | monodi+ export |

A project folder may be the whole project, a single source, or a single document. Several files and folders can be loaded together, and more can be added later: loading a source that is already there replaces it.

## How to load

1. Open **Corpus** in the navigation bar.
2. Drop files or a folder onto the page, or use **Choose files…** / **Choose a project folder…**.
3. Wait for the import to finish. The whole Corpus Monodicum (about 1.8 GB, 116 sources, 6,000 documents) takes under a minute.

Everything is read **in your browser** and kept in its local storage. Nothing is uploaded. Because the browser owns the storage, clearing the site data for this page removes the loaded corpus — you can simply import it again. Your tables and annotations are stored separately and are not affected.

## Working copies

By default, documents whose ID ends in `TR` or `GS` are left out. These are working copies of a transcription, not transcriptions in their own right, and counting them would count every neume twice. Untick the option on the Corpus page to include them.

## What is extracted

For every syllable with notes, the neumes are read as **pattern codes** (see [Conventions](./conventions) and [The Neume Table](./neume-table)), together with their folio, line and syllable. From the source's `meta.json` the catalogue data (place, date, library, shelfmark) and the IIIF manifest address are taken.

## Removing data

On the Corpus page you can remove single sources or the whole corpus. Your neume tables, annotations and settings are kept.

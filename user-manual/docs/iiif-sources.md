# IIIF Sources & MMMO Suggestions

**Metadata → IIIF sources** is a table of where each manuscript's images come from. Next to the *Manuscripts* table of fields, it lists IIIF resources: manifests and image addresses, several per manuscript if you like, with where each came from.

## The table

| From | Meaning |
| --- | --- |
| **Yours** | rows you added yourself |
| **MMMO** | rows taken from a suggestion of the MMMO catalogue (see below) |
| **In use** | a manifest that is in use for a manuscript but is not in your table yet (for example one typed into the *IIIF manifest* column of the Manuscripts table). **Add to my table** keeps it |
| **Corpus** | page images named by the corpus's documents. They are used automatically and cannot be edited here |

A manuscript can have several rows. The one marked **✓ in use** is the manifest its images are loaded from; **Use** switches to another, **Stop using** lets go of it. Rows you added can be edited in place (the address), and removed with ✕. Removing can be undone from the message that follows.

To add a row, fill in the line above the table: the manuscript (any siglum), the address, whether it is a *manifest* or a plain *Image API* address, and an optional label. *Use now* takes the manifest into use if the manuscript has none yet.

## The MMMO catalogue and suggestions

The [MMMO Database](https://musmed.eu) (Medieval Music Manuscripts Online) lists thousands of manuscripts with their library, shelfmark, century, origin, notation and — for many — the address of a IIIF manifest. The editor can use it to suggest a manifest for a manuscript you have no images for yet.

Suggestions are matched on the library siglum and shelfmark (`D-Eu 84`, taken from the *Cantus siglum* when the corpus has one), or on library city and shelfmark when there is no library siglum, and checked against the date. Each suggestion says why it was made — *same library, same shelfmark, dates overlap* — and how sure it is: **high**, **likely** or **possible**. A shelfmark alone is never enough. Always check that it is the right book before you take it.

- **Use this manifest** adds the row (marked *MMMO*) and takes it into use. **Undo** is in the message that follows.
- **Not this one** hides that candidate for that manuscript for good.

*Search the catalogue* looks for words in any field (“Admont graduale”) and lets you add a manifest to your table.

### Add a manuscript

*Add a manuscript…* (on both Metadata views) is for a manuscript that is not in your corpus. Type its siglum and whatever you know; matching entries of the catalogue are suggested as you type. **Take this** fills in the empty fields (library, shelfmark, date, origin, siglum) and links the manifest. The manuscript then appears as a row of the Manuscripts table, where you can complete it.

## Collecting the catalogue

The catalogue is third-party data, so it is not part of the editor: each installation collects it once. In the `ui` folder:

```bash
npm run crawl:mmmo
```

This reads the MMMO listing (about 90 pages) and then the page of each source, because only that page names the IIIF manifest. It is slow on purpose: it obeys the site's `robots.txt` and waits at least its `Crawl-delay` (10 seconds) between requests, so the whole database takes about a day. It can be stopped at any time and continues where it stopped; `--minutes 120` makes it stop by itself. Sources that name a digital copy are read first, since they are the likeliest to have a manifest. The result is written to `ui/src/data/mmmo/` and read by the editor the next time it is built or reloaded.

Before sharing the collected file or an app built with it, check the terms of the MMMO database and keep its name and address (shown in the table) visible.

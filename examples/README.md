# Example sets

Smaller pieces of the Corpus Monodicum, to try the editor on. Load any of them on the **Corpus** page
(*Choose files…* or drag and drop). The ZIP files are in the project layout
(`source/meta.json`, `source/document/meta.json`, `source/document/data.json`); the `.monodijson` file is a
Monodi-Zero workspace, to try that way of loading too.

| File | Contents | Sources | Documents | Neumes | Size |
| --- | --- | ---: | ---: | ---: | ---: |
| `starter-sample.zip` | Starter sample: a few small sources from different regions — **start here** | 9 | 179 | 4,538 | 0.7 MB |
| `starter-sample.monodijson` | The same starter sample as a Monodi-Zero workspace | 9 | 179 | 4,538 | 2.1 MB |
| `german-origin.zip` | German origin | 36 | 1,069 | 191,532 | 39.8 MB |
| `french-origin.zip` | French origin | 30 | 1,699 | 204,712 | 24.0 MB |
| `italian-origin.zip` | Italian origin | 47 | 1,263 | 125,309 | 25.7 MB |
| `aquitanian-origin.zip` | Aquitanian origin | 9 | 1,248 | 300,682 | 46.8 MB |
| `english-origin.zip` | English origin | 8 | 310 | 28,982 | 3.5 MB |
| `norman-origin.zip` | Norman and Norman-Sicilian origin | 6 | 466 | 46,433 | 5.3 MB |
| `spanish-origin.zip` | Spanish origin | 5 | 135 | 11,271 | 1.4 MB |
| `bohemia-moravia.zip` | Bohemia and Moravia | 6 | 131 | 1,965 | 0.4 MB |
| `religious-orders.zip` | Religious orders | 7 | 226 | 13,668 | 1.7 MB |
| `other-regions.zip` | Other regions (Austria, Switzerland, Netherlands, Italy or south France) | 5 | 77 | 1,045 | 0.2 MB |
| `region-not-recorded.zip` | No region recorded in the CM metadata | 77 | 865 | 45,684 | 14.7 MB |

"Sources" and "Documents" are what the editor loads: documents whose ID ends in `TR` or `GS` are working
copies and are left out unless you untick that option on the Corpus page. 21 of the 257 sources are not loaded at all: 17 have no transcriptions in this export and 4 hold nothing but working copies.

## How the sets were made

Each source goes where its own `herkunftsregion` in the CM metadata says. The CM writes some regions in German and
some in English, and spells a few of them in more than one way, so some sets combine several values:

- **German origin** — “Quellen deutscher Herkunft”, “Germany - southwest - Swabia?”
- **French origin** — “Quellen französischer Herkunft”
- **Italian origin** — “Quellen italienischer Herkunft”
- **Aquitanian origin** — “Quellen aquitanischer Herkunft”
- **English origin** — “Quellen englischer Herkunft”, “England”, “England - south”
- **Norman and Norman-Sicilian origin** — “Quellen normannischer Herkunft”, “Quellen normanno-sizilischer Herkunft”
- **Spanish origin** — “Quellen spanischer Herkunft”, “Spain”
- **Bohemia and Moravia** — “Bohemia - Moravia”
- **Religious orders** — “Quellen aus Ordenstraditionen”
- **Other regions (Austria, Switzerland, Netherlands, Italy or south France)** — “Austria”, “Switzerland”, “Netherlands”, “Italy or France - south”
- **No region recorded in the CM metadata** — *(empty)*

Nothing is guessed from a place name or a shelfmark: the 82 sources
without a recorded region stay together in `region-not-recorded.zip`.

The starter sample takes the two smallest suitable sources (at least 8 documents, between
200 kB and 3 MB of transcription) from each of the German, French, Italian, English and
Norman sets.

Regenerate them from a full export with

```bash
cd ui
node --max-old-space-size=8192 scripts/split-corpus.mjs --zip ../export.zip --out ../examples
```

The ZIP and `.monodijson` files are not tracked by git.

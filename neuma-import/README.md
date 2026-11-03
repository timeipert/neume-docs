# neuma-import

Opens up the [Hungarian Neume Catalogue](https://neuma.zti.hu/en_attekinto.asp) (*Notation Signs in Medieval Hungary*, Gabriella Gilányi et al., Institute of Musicology, Budapest) as data that neume-docs can read.

The catalogue's *Overview* is one table: a row for each of 246 sources, a column for each kind of neume (Punctum, Pes, Clivis, Torculus, Porrectus, Scandicus, Climacus, Cephalicus, Strophicus, Pes subbipunctis, Combinations, Clefs, Custos). Each cell is **one picture with several snippets pasted onto white**, and there is no more information than that: no pattern codes, no virga, and *Combinations* mixes patterns. This module

1. **collects** the table, the text of every source and every picture (`bin/crawl.mjs`),
2. **takes the pictures apart**, so that every snippet is a picture of its own, and proposes what each is from the column it stands in (`bin/split.mjs`),
3. is **reviewed** in a tool inside the app, where each snippet is accepted, corrected, set aside or discarded (`#/tools/neuma`),
4. and **writes a documentation** — the files `neume-docs.json`, `data/<source>.json` and `images/…` that the viewer reads and a GitHub repository can hold (`bin/export.mjs`).

It is a module of its own and knows nothing of the app, apart from the format it writes (`ui/src/utils/documentation.js` is that format's authority; `ui/src/utils/neumaDocumentation.test.js` holds the two together) and, optionally, the glyph of the virga (`ui/src/data/glyphs.js`). The app knows nothing of it except one hidden page and one line in `ui/vite.config.js`.

The data belongs to the catalogue, not to this project. Rights, commands, output files and decisions: [GUIDE.md](GUIDE.md).

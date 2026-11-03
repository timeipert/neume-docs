# Neumedocs

A research tool for documenting the neume shapes of a manuscript against the *Corpus Monodicum* (CM, an edition of medieval monophonic chant). Load a transcribed corpus, make a project for a range of folios, and fill its neume table from the manuscript. Everything is stored in the browser: back up the workspace regularly.

Features, pattern codes, code layout and the MMMO catalogue: [GUIDE.md](GUIDE.md). The user manual is in `user-manual/`.

```bash
cd ui
npm install
npm run dev      # development server
npm test         # unit tests
npm run build    # production build into ./dist
```

Node.js 20 or newer. End-to-end test: see [GUIDE.md](GUIDE.md#running-it).

---

> **Where this code is edited.** The source of this app is the folder `apps/neume-docs` of [timeipert/monodi-platform](https://github.com/timeipert/monodi-platform/tree/main/apps/neume-docs). The repository [timeipert/neume-docs](https://github.com/timeipert/neume-docs) receives a copy of that folder and deploys it; it is not edited directly (a commit there stops the copy). How the copy works: `docs/sync.md` in monodi-platform.

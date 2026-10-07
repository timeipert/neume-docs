# Workspace & Backup

**Workspace** in the navigation bar is where you look after everything you have made in the editor: what is in it, where it is kept, how to back it up, and how to clear it.

Your *work* is the projects, the annotations, the neume tables, your metadata edits, the pattern library (labels, signs, variants, preferred IDs), IIIF links and the screenshots of your projects. It is not the loaded corpus: that is loaded and removed on the [Corpus](./loading-data) page.

## What is in your workspace

The first panel lists the parts of your work with what each holds, for example *412 snippets · 38 line regions*. Click a name to open that part. **Delete…** empties one part and nothing else. **Preferences** can be reset to the defaults here too.

Every deletion keeps a [restore point](#restore-points) first and offers **Undo** straight afterwards.

## Manuscripts

A table of the manuscripts you have worked on, with snippets, line regions and table rows. Tick some and choose **Export selected** to send them to a colleague. **Delete…** on a row lets you choose what to remove from that manuscript (snippets, line regions, the neume table, the IIIF link) and, if you like, only for certain folios.

## Where your work is kept

- **This browser.** Always on, and at once: every change to a project, a snippet, a metadata value or the arrangement of the manuscripts table is written as it is made. Screenshots (and the lines cut from them) are images, so they go to the browser's database a moment later — and straight away when you switch to another tab or close the page. The browser may clear all of it if you wipe site data, so keep a backup or a project folder.
- **Project folder.** In Chrome and Edge you can connect a folder on your disk. Every change is then saved to a `workspace.json` in it, automatically, about a second and a half after the last one. *Disconnect* stops this and leaves the folder as it is.
- **Backup reminder.** Counts what you have changed since the last export — projects, snippets, metadata, the pattern library, manifest addresses — and reminds you to export when it is a lot and some time has passed. Without a project folder the export is the only copy outside the browser. You can turn the reminder off here.

What is saved is the same everywhere — in the folder, in a backup, in a restore point: the projects with their columns, the snippets and line regions of every manuscript, the screenshots, the neume tables, the metadata edits and your own columns with their values, **how the columns are arranged** (categories, order, checks), the pattern library, signs and variants, the manifest addresses and the preferences. The loaded corpus is not part of it.

## Backup & share

- **Download backup** writes your work to a JSON file. Of the snippets and tables, only manuscripts that have work in them are included; the manifest address of a manuscript is kept even before it has any work. Tick *Include pattern library, metadata edits and preferences* to take those along. The name you give the backup is part of the file name.
- **Configuration only** exports the pattern library, signs and variants, preferred IDs, metadata edits and preferences without any manuscript work: a way to give a colleague the same set-up.
- **Import a file…** opens a backup, a single-manuscript export or a configuration file. If it holds work on manuscripts you have also worked on, you choose for each one whether to **skip** it, import it as a **copy**, or **overwrite** yours. Skipping is the default. A restore point is kept first.

## Restore points

A restore point is a copy of your work kept in the browser. One is made automatically before anything is deleted, overwritten or imported, and you can make one yourself at any time. The newest eight are kept (automatic ones are dropped first).

**Restore…** puts your work back exactly as it was then. What you have at that moment is kept as a new restore point, so restoring can be undone too. Restore points hold your own work, not the loaded corpus.

## Publish

**Download static site** produces a self-contained copy of what you have published: one HTML and one Markdown page per published manuscript, and the cropped IIIF snippets as image files. Keep the tab open while it runs, since the snippets are fetched live from the IIIF servers. See [Public Documentation](./public-view).

## Save to GitHub

If your site has sign-in set up, **Save to GitHub** lets you save straight to a repository instead of downloading files and uploading them by hand.

1. **Sign in with GitHub.** GitHub asks you to allow the app, then sends you back to the page you were on. The app can write only to repositories it is installed on, and only where you may write yourself. Nothing else of your account is used.
2. **Choose a repository, a branch and, if you like, a folder.** Only repositories you may write to are listed. If the list is empty, install the app on a repository first (the button points to the app's page on GitHub).
3. **Save documentation…** writes the files the viewer reads (`neume-docs.json`, `data/…`, `images/…`) in one commit. **Save workspace backup…** writes the whole workspace as one backup file, and is offered **only for private repositories**, because it holds all your work.

Before anything is written you see the repository, the branch, the folder and whether the repository is public. Files with the same name are replaced; others are left alone, and earlier versions stay in the repository's history. If someone else changed the branch in the meantime, or it is protected, GitHub refuses and nothing is overwritten.

The sign-in is kept in this browser for about eight hours. **Sign out** forgets it here; to withdraw the app's access altogether, remove it under *Settings → Applications* on GitHub (the panel links there). A site owner sets the sign-in up once; see `auth-proxy/README.md` in the repository.

::: warning A public repository is public for good
Everything saved to a public repository can be read by everybody, including every earlier version in its history. Save documentation there only when you mean to publish it.
:::

## Reset & delete

For starting over, from smallest to largest:

- **Clear the caches** removes downloaded IIIF manifests and cropped images. They are fetched again when needed; nothing of yours is lost.
- **Delete all your work** removes every part listed above except the preferences. You type *delete* to confirm. With a project folder connected, the deletion is saved into it too.
- **Reset the app** returns the editor to how it looks on a first visit: work, preferences, the loaded corpus and the caches are gone. You type *reset* to confirm. With a project folder connected you can choose to disconnect it first, so the work saved in it is kept.

Deleting work and resetting keep a restore point, so both can be undone from the toast that follows or from the list. The loaded corpus cannot be restored from a restore point; load your files again on the Corpus page.

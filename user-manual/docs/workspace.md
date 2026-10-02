# Workspace & Backup

**Workspace** in the navigation bar is where you look after everything you have made in the editor: what is in it, where it is kept, how to back it up, and how to clear it.

Your *work* is the annotations, the neume tables, your metadata edits, the pattern library (labels, signs, variants, preferred IDs), IIIF links and the custom manuscripts. It is not the loaded corpus: that is loaded and removed on the [Corpus](./loading-data) page.

## What is in your workspace

The first panel lists the parts of your work with what each holds, for example *412 snippets · 38 line regions*. Click a name to open that part. **Delete…** empties one part and nothing else. **Preferences** can be reset to the defaults here too.

Every deletion keeps a [restore point](#restore-points) first and offers **Undo** straight afterwards.

## Manuscripts

A table of the manuscripts you have worked on, with snippets, line regions and table rows. Tick some and choose **Export selected** to send them to a colleague. **Delete…** on a row lets you choose what to remove from that manuscript (snippets, line regions, the neume table, the IIIF link) and, if you like, only for certain folios.

## Where your work is kept

- **This browser.** Always on. The browser may clear it if you wipe site data, so keep a backup or a project folder.
- **Project folder.** In Chrome and Edge you can connect a folder on your disk. Every change is then saved to a `workspace.json` in it, automatically. *Disconnect* stops this and leaves the folder as it is.
- **Backup reminder.** Reminds you to export when you have unsaved work and have not exported for a while. You can turn it off here.

## Backup & share

- **Download backup** writes your work to a JSON file. Only manuscripts that have work in them are included. Tick *Include pattern library, metadata edits and preferences* to take those along. The name you give the backup is part of the file name.
- **Configuration only** exports the pattern library, signs and variants, preferred IDs, metadata edits and preferences without any manuscript work: a way to give a colleague the same set-up.
- **Import a file…** opens a backup, a single-manuscript export or a configuration file. If it holds work on manuscripts you have also worked on, you choose for each one whether to **skip** it, import it as a **copy**, or **overwrite** yours. Skipping is the default. A restore point is kept first.

## Restore points

A restore point is a copy of your work kept in the browser. One is made automatically before anything is deleted, overwritten or imported, and you can make one yourself at any time. The newest eight are kept (automatic ones are dropped first).

**Restore…** puts your work back exactly as it was then. What you have at that moment is kept as a new restore point, so restoring can be undone too. Restore points hold your own work, not the loaded corpus.

## Publish

**Download static site** produces a self-contained copy of what you have published: one HTML and one Markdown page per published manuscript, and the cropped IIIF snippets as image files. Keep the tab open while it runs, since the snippets are fetched live from the IIIF servers. See [Public Documentation](./public-view).

## Reset & delete

For starting over, from smallest to largest:

- **Clear the caches** removes downloaded IIIF manifests and cropped images. They are fetched again when needed; nothing of yours is lost.
- **Delete all your work** removes every part listed above except the preferences. You type *delete* to confirm. With a project folder connected, the deletion is saved into it too.
- **Reset the app** returns the editor to how it looks on a first visit: work, preferences, the loaded corpus and the caches are gone. You type *reset* to confirm. With a project folder connected you can choose to disconnect it first, so the work saved in it is kept.

Deleting work and resetting keep a restore point, so both can be undone from the toast that follows or from the list. The loaded corpus cannot be restored from a restore point; load your files again on the Corpus page.

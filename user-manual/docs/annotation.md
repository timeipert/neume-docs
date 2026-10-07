# Manuscript Annotation (Polygon Editor)

The core visual feature of the tool is the **Polygon Editor**. This interface allows you to draw shapes directly onto high-resolution manuscript scans and link them to your transcription data.

## Setting up a Manuscript

Before you can annotate, you need to add a manuscript to your workspace.

1. Open the Polygon Editor: select a manuscript in **Manuscripts** and choose **Pages →**, or open a cell in a [project](./projects#the-page-editor-in-the-project), where the editor opens inside the project. A manuscript without page images offers **Add page images…** instead: the manifest address can be given there (steps 3–5 are then done).
2. In the left sidebar, click the **+ IIIF** button at the top.
3. A modal will appear. Provide the **Source Name** (this should match the source name used in your transcription data, e.g., "St. Gallen 359").
4. **Crucially**, provide the valid **IIIF Manifest URL** for the manuscript.
5. Click **Add Source**. The tool will parse the manifest and list the available folios/pages in the sidebar.


<video src="/figures/iiif.mov" controls autoplay loop muted width="100%" style="border-radius: 8px; margin: 20px 0;"></video>


## Drawing Lines

Annotations are organised by **lines**. The page opens with the lines drawn on it; to add one, **drag a box** around a complete line of music and text, name it (the lines the transcription has on that page are proposed, "Line 3", "Line 4" …) and save. Click a line to work in it; the picture zooms to it.

<video src="/figures/line_select.mov" controls autoplay loop muted width="100%" style="border-radius: 8px; margin: 20px 0;"></video>

## Marking Signs

Inside a line, choose a **pattern** on the cards at the right (or search for it, or type its code) and **drag a box** around each sign. The box is saved as you let go; *Undo* is next to it, and the **Signs** tab lists what is marked, with the link to the transcription. The **Transcription** tab lists the neumes of the line in reading order: pick one, draw a box around it, and the sign is linked to it. See [Projects](./projects#the-page-editor-in-the-project) for all of it.

<video src="/figures/polygon.mov" controls autoplay loop muted width="100%" style="border-radius: 8px; margin: 20px 0;"></video>

## Linking to the Transcription

A sign is linked to the neume of the transcription it shows, by the neume's place (document, folio, line, syllable, notes).

- **By itself:** if the line has only one neume of that pattern that no sign is linked to yet, the new sign is linked to it.
- **Along the line:** in the **Transcription** tab, pick a neume before drawing; the sign is linked to it, and the next neume is ready.
- **Afterwards:** *Link to a neume…* on a sign in the **Signs** tab lists the free neumes of its pattern; ✕ next to a link takes it away.

The transcription is a help, not a requirement: a sign without a link is a sign.

## Variants

The same code can look different. Under the chosen pattern, the **Variant** buttons (`Basis`, `a`, `b` … — what is offered is set under Settings) say which look the next boxes are; each sign in the **Signs** tab has its own variant, which can be changed. A *code variant* — a code in which a note carries a sign of your own — is made with **+ code variant** next to the chosen pattern.

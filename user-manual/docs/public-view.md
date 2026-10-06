# Public Documentation

The ultimate goal of neume-docs is to publish your findings. The tool provides a built-in, static "Public View" that serves as an interactive documentation site for your notation system.

## Generating the Data

The public view relies on a single JSON file that contains all your hard work: definitions, global IDs, local overrides, line regions, and polygon coordinates.

1. Open the **Workspace** page and find the **Publish** panel.
2. Choose **Download static site**.
3. This compiles the manuscripts you marked as *Published* into HTML and Markdown pages with their image snippets.

## The Public Interface

The public-facing side of the application is completely separate from the editing tools. It is designed to be shared with other researchers or the general public.

### Manuscript Directory
A sortable index listing all the manuscripts you have annotated. Clicking a manuscript takes the user to its specific gallery.

### Patterns & Equivalents Index
A comprehensive summary table. It lists every Ref ID you have defined and shows exactly where it appears in the physical manuscripts (e.g., "Found in St. Gallen 359, Folio 12r, Line 4"). 

### Interactive Manuscript Gallery
This is the showcase feature.
- Users see a vertical scroll of the manuscript lines you defined.
- **Hover Effects**: Moving the mouse over the scan reveals interactive, colored labels highlighting the neumes you drew polygons around.
- **Real-time Data**: Hovering over a label displays a tooltip with the Ref ID, variant suffix, and the underlying transcription pattern string.

### Bidirectional Navigation
The public view is highly interconnected:

::: info 💡 Suggestion for Future Documentation
*[A screen recording demonstrating this bidirectional linking would be highly effective. Show a user clicking a row in the table, the page automatically scrolling down, and the corresponding shape pulsing on the manuscript scan.]*
:::

- **Table to Gallery**: Clicking an occurrence listed in the Equivalents Table instantly scrolls the page to the visual gallery, bringing the specific manuscript line into view, and briefly animating the polygon to draw the user's eye to the exact spot on the page.
- **Gallery to Table**: Clicking an interactive label on the manuscript scan itself will scroll the user back up to the exact row in the Equivalents Table, allowing them to see how many other times that specific shape occurs.

## Deployment

Because the public view is a static Vue application, it can be hosted anywhere for free. The primary intended deployment method is **GitHub Pages**.

1. Run the production build command (`npm run build`).
2. This generates the necessary files in the `/docs` folder.
3. Push your repository to GitHub.
4. Enable GitHub Pages in your repository settings, pointing to the `/docs` folder on the `master` branch.
5. Your interactive notation gallery is now live on the internet!

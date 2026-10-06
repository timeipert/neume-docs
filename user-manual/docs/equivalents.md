# Pattern Editor & Ref IDs

The **pattern editor** is where you give the patterns of one manuscript your standardized Reference IDs, look at where they occur (the gallery), and write the public notes for the manuscript.

This is the older way of working with a manuscript's patterns, kept for work made with it. What matters in the [projects](./projects) is the pattern code; reference IDs are no longer needed there. Open the editor at `#/annotations/…`; **Back to the neume table** leads to the manuscript's project.

## The Pattern Editor

The editor is split into two panels:

### 1. Left Panel: Available Patterns
This panel lists every unique musical pattern found in the transcription data for this specific manuscript.
- Use the **Sort** dropdown to order patterns by frequency, alphabetical order, or length.
- Use the **Search** bar to quickly find a specific string (e.g., `*dd`).
- Click on any pattern in the list to add it to your active table on the right.

### 2. Right Panel: Active Table
This table shows the patterns you have selected to manage for this manuscript.

- **ID**: The Reference ID you wish to assign to this pattern in this manuscript. 
- **Pattern**: A visual rendering of the transcription string.
- **Frequency**: How many times this specific pattern occurs within this manuscript.
- **Actions**: Contains a button to open the **Gallery** (to preview the physical occurrences) or remove the pattern from your active list.

## Setting Reference IDs

By default, the ID you type into the "ID" column applies **only to the current manuscript**. Metadata of the manuscript (origin, date, your own fields) is not edited here but in the [Metadata table](./manuscript-metadata). This allows you to handle manuscript-specific graphical variations easily.

### The Global ID Button (★)
If you determine that a pattern should use a specific Ref ID across *all* manuscripts in your project, enter the ID and click the **★ (Star)** icon next to the input field. 

This promotes the ID to a **Global Default**. In the future, whenever you add this pattern to another manuscript, the tool will automatically pre-fill the ID field with your Global Default, saving you time while still allowing you to overwrite it if that specific manuscript differs.

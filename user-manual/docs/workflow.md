# Core Workflow

The typical research process in the Neumen-Editor follows these four steps. For detailed instructions on each step, follow the links to the dedicated feature pages.

## 0. Load Data
The editor starts without data. Load a Monodi-Zero workspace or a Corpus Monodicum project on the **Corpus** page.
- *See [Loading Data](./loading-data).*

## 1. The Neume Table
For each manuscript, fill in the standard table and add what else the manuscript needs.
- Choose, for every column of the standard table, how the manuscript writes that neume.
- Choose up to three constellations for each of the special signs L, O, Q and the comma.
- Add further patterns by code in the expanded documentation, and assign **Ref IDs**.
- *See [The Neume Table](./neume-table) and [Pattern Editor & Ref IDs](./equivalents).*

## 2. Manuscript Annotation
Once your base patterns are defined, you move to the visual phase: linking those patterns to physical ink on the scans.
- Load a manuscript via its IIIF manifest.
- Draw bounding boxes (Line Regions) around individual lines of music.
- Draw precise polygons around individual neumes and link them to specific occurrences in your transcription data.
- *See [Manuscript Annotation](./annotation) for detailed usage.*

## 3. Public Documentation
After your analysis and annotation are complete, you can generate an interactive website to share your findings.
- The tool generates a searchable directory of annotated manuscripts.
- It builds an interactive visual gallery where users can hover over manuscript lines to see the underlying transcription data.
- *See [Public Documentation](./public-view) for detailed usage.*

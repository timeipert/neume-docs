# Getting Started

Welcome to the **Neumen-Editor** user manual.

## What is this tool?
The **Neumen-Editor** is a lightweight research application for **musicologists** working with medieval chant manuscripts and their digital transcriptions in the *Corpus Monodicum* (CM).

It bridges the gap between abstract melodic data and the physical graphical reality of a manuscript. You can:
1. Load a transcribed corpus and see which neume patterns occur in each manuscript.
2. Document the neume shapes of a manuscript in a **Neume Table**: a fixed, comparable table of neumes ordered by number of tones and frequency in the CM.
3. Link patterns directly to specific ink strokes on high-resolution IIIF manuscript scans.
4. Establish a standard typology (Reference IDs) for graphical signs across manuscripts.
5. Publish an interactive comparison of notation across manuscripts.

## The editor starts empty
There is no data built in. The first thing to do is to [load your data](./loading-data): a Monodi-Zero workspace (`.monodijson`) or a Corpus Monodicum project folder.

## Prerequisites
- A modern web browser (Chrome, Edge, Firefox, Safari). Chrome and Edge can also save your work into a project folder automatically.
- A transcribed corpus, exported from Monodi-Zero or monodi+.
- For annotating scans: the IIIF manifests of your manuscripts (usually provided by the libraries).

## Running it
The tool is a web application. To run it locally:
1. Clone the repository.
2. In the `ui` directory, run `npm install`.
3. Run `npm run dev` and open the `localhost` address in your browser.

Next: [Loading Data](./loading-data), then [The Neume Table](./neume-table).

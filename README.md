# HC CozySeq

HC CozySeq is a client-side Vite + React + TypeScript single-page app for practical protein comparison, translation-aware BLASTX-style mutation calling, FASTA upload, batch summaries, mutation highlighting, and rich formatted copy.

This is a local browser approximation of BLASTP/BLASTX-style analysis. It does not call NCBI BLAST and does not require a backend.

## Features

- BLASTP-style protein vs protein local alignment
- BLASTX-style DNA/CDS translation across 6 reading frames
- Met-start ORF preference with fallback ORF candidates
- Template amino-acid-numbered mutation calls such as `F2-K150R`
- Substitution, deletion, and insertion calls such as `K150R`, `K150del`, `Δ150-170del`, and `K150insAA`
- FASTA, FASTQ, GenBank, EMBL, plain sequence, and best-effort SnapGene/ApE sequence upload
- Dynamic mutation color rules used consistently on chips, sequence highlights, and copied HTML
- Batch mutation statistics with repeated positions, repeated exact events, and supporting query names
- `Copy formatted` with `text/html` and `text/plain` clipboard payloads
- Built-in sample data and compact Chinese quick guide

## Run Locally

```bash
npm install
npm run dev
```

Open the printed Vite URL, usually `http://localhost:5173`.

## Build

```bash
npm run build
```

The production output is written to `dist/`.

## Share As A Single File

Build first, then create the offline shareable HTML file:

```bash
npm run build
npm run share
```

The generated file is `share/hc-cozyseq.html`. You can send that single file to another user; it opens in a browser without a backend.

If the recipient wants comparison history saved as a real local file instead of browser-only storage, they can open the History panel and bind a JSON history file (for example in the same folder as `hc-cozyseq.html`). After the first bind, successful runs are written into that file automatically when the browser grants file access.

## Preview Production Build

```bash
npm run preview
```

## Tests

The utility tests use Node's built-in test runner:

```bash
npm test
```

They cover FASTA parsing, terminal `*` trimming, sequence type detection, and mutation extraction/formatting.
With a recent Node runtime, the same script can also be run as `node --run test`.

## Deploy

### Vercel

1. Import the repository.
2. Use the default Vite settings.
3. Build command: `npm run build`
4. Output directory: `dist`

### GitHub Pages

This repository includes `.github/workflows/deploy-pages.yml`. After pushing to a GitHub repository:

1. Open the repository Settings.
2. Go to Pages.
3. Set Source to GitHub Actions.
4. Push to `main`.

Every later push to `main` rebuilds and updates the online page automatically.

The Vite config uses `base: './'`, so the built files can also be deployed from `dist/` to a project page manually.

```bash
npm run build
```

Then publish `dist/` with your preferred GitHub Pages workflow.

## Notes

- All parsing, translation, alignment, mutation extraction, highlighting, batch statistics, and copy formatting run in the browser.
- Protein terminal `*` cleanup removes only trailing stop symbols. Internal `*` symbols are preserved and reported as invalid protein input.
- BLASTP mode blocks DNA-like input and suggests switching to BLASTX.

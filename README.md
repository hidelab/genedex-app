# GeneDeX

**GeneDeX** is an interactive web portal and curated index of Alzheimer's disease (AD) gene lists, enabling researchers to query gene sets against the published AD literature across functional pathways, cellular states, and brain regions in one place.

- **Live Portal:** https://hidelab.github.io/genedex-app/
- **Repository:** https://github.com/hidelab/genedex-app

---

## Overview

GeneDeX indexes **1,574 manually curated gene lists** spanning **17,515 unique HGNC gene symbols** and **228 curated facets** across functional processes, cell types, and anatomical tissues. Each entry is extracted directly from published Alzheimer's disease studies along with study metadata (DOI, PubMed ID, assay/method, direction of change, and source table/figure).

### Key Modules

1. **Gene Search:** Test a query gene set against all 1,574 curated AD lists for statistical overlap using hypergeometric enrichment and Benjamini–Hochberg FDR correction.
2. **Gene Print:** Profile a gene set across functional, cellular, and tissue facets or reference lists as an interactive heatmap.
3. **Context Matrix:** Map query genes across cell type × brain region combinations to inspect directional agreement or conflict across independent studies.
4. **Similarity:** Compare gene sets or pooled AD facets pairwise using the Jaccard index ($J(A,B) = |A \cap B| / |A \cup B|$) with average-linkage hierarchical clustering.

---

## Quick Start

### Prerequisites

- **Python:** `3.11` (matches CI workflow)

### Standard Commands

This repository follows the Hide Lab Web-Tool Repository Standard. Use the standard `Makefile` targets:

```bash
# 1. Install developer and test dependencies
make setup

# 2. Run fast offline smoke checks on bundled data artifacts
make smoke

# 3. Run the automated test and schema audit suite
make test

# 4. Verify and synchronize build artifacts between data/outputs/ and web/data/
make build

# 5. Serve the web application locally at http://localhost:8000
make serve
```

---

## Repository Layout

```text
genedex-app/
|-- README.md                 # Project overview, quick start, citation, license
|-- LICENSE                   # MIT License
|-- CITATION.cff              # Machine-readable citation metadata
|-- CHANGELOG.md              # Consolidated version release notes
|-- DATA_SOURCES.md           # Provenance and schema documentation for curated datasets
|-- Makefile                  # Standard targets: setup, smoke, test, build, serve
|-- pyproject.toml            # Python project and pytest configuration
|-- requirements.txt          # Core runtime dependencies
|-- requirements-dev.txt      # Developer and testing dependencies (pytest)
|-- .env.example              # Template of environment variables
|-- .gitignore                # Ignored files and directories
|-- .gitattributes            # Line-ending and attribute normalization
|
|-- data/
|   `-- outputs/              # Canonical `<tool>_<content>.json` dataset artifacts
|-- web/                      # Single production deployment root (GitHub Pages)
|   |-- index.html            # Main application entry point
|   |-- genedex-data.js       # Client-side data loader and statistical compute layer
|   |-- support.js            # Vendored dc-runtime component framework (same-origin DOM/JSX runtime)
|   |-- css/                  # Application stylesheets (genedex.css)
|   |-- js/                   # Script links for modular layout
|   |-- data/                 # Production JSON datasets served to the browser
|   |-- images/               # Static image assets
|   |-- robots.txt            # Crawler policy referencing sitemap.xml
|   `-- sitemap.xml           # Public portal URL index
|-- scripts/
|   `-- audits/               # Manual and CI data-quality sanity check scripts
|-- tests/                    # Automated Pytest suite for schema and data integrity
|-- docs/                     # Architecture specifications and user guides
|   |-- design/               # Architectural decision records
|   `-- case_studies/         # Worked user walkthroughs
`-- .github/workflows/        # CI test runner and GitHub Pages deployment workflows
```

### Vendored Library Note

- [`web/support.js`](file:///Users/sgupta15/Desktop/genedex-app/web/support.js): Vendored `dc-runtime` library required locally because it parses same-origin `<x-dc>` document templates directly via `fetch(location.href)`.

---

## Citation

If you use GeneDeX or its curated gene list collection in your research, please cite the repository using the metadata in [`CITATION.cff`](file:///Users/sgupta15/Desktop/genedex-app/CITATION.cff).

---

## License

This project is licensed under the MIT License — see [`LICENSE`](file:///Users/sgupta15/Desktop/genedex-app/LICENSE) for details.

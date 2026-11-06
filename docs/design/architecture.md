# Architecture Decision Record: Client-Side Static Architecture

## Decision

GeneDeX operates as a zero-backend static web application served from `web/` via GitHub Pages CDN. All gene set enrichment (hypergeometric testing + Benjamini–Hochberg FDR), facet profiling, context matrix aggregation, and pairwise Jaccard similarity calculations run directly in the user's browser via `web/genedex-data.js`.

## Rationale

1. **Zero Infrastructure & High Availability:** The entire curated corpus (1,574 gene lists, 17,515 unique genes, 228 facet definitions, and 56,331 aliases) totals ~6.8 MB uncompressed (~1.2 MB gzipped over CDN), fitting comfortably in browser memory after a single initial fetch.
2. **Instant Interactive Filtering:** Once loaded into typed in-memory indices (`window.Genedex`), enrichment queries, FDR threshold adjustments, and Jaccard clustering execute in milliseconds without network round-trips.
3. **Future API Extensibility:** `web/genedex-data.js` supports a configurable `window.GENEDEX_CONFIG = { mode: "api", apiBase: "..." }` toggle so that if the corpus scales past the 50 MB static threshold in the future, queries can transparently route to an external API without rewriting the UI components.

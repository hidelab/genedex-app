# Data Sources & Provenance

This document describes the curated datasets served by **GeneDeX**, their provenance, schemas, and file naming mappings.

---

## 1. Corpus Overview

Each entry in GeneDeX is a gene list reported in a published peer-reviewed Alzheimer's disease study, extracted directly from the publication's tables and supplementary materials. Lists are annotated across three orthogonal biological axes:

1. **Functional Facets (`ff`):** Molecular pathways, pathological hallmarks (e.g., amyloid-$\beta$, tau load), and biological processes. Ontology mappings (e.g., MONDO, GO, CL, UBERON) are included where applicable.
2. **Cellular Facets (`cf`):** Brain and peripheral cell types and cellular states (e.g., microglia, astrocytes, excitatory neurons, oligodendrocytes).
3. **Tissue Facets (`tissue`):** Anatomical brain regions or peripheral tissues sampled (e.g., prefrontal cortex, hippocampus, entorhinal cortex, blood).

---

## 2. Dataset Artifacts

All static artifacts are under 10 MB and committed directly to the repository for static serving and offline testing.

| Canonical Name (`data/outputs/`) | Web Deployed Path (`web/data/`) | Size | Records | Description |
| :--- | :--- | :--- | :--- | :--- |
| `data/outputs/genedex_meta.json` | `web/data/genedex-meta.json` | 1.5 MB | 1,574 lists | Accession ID (`gl`), short name, author, contributor, paper title, DOI, PubMed ID (`pmid`), functional facets (`ff`), cellular facets (`cf`), tissue, direction (`dir`), study method, and source table/figure note. |
| `data/outputs/genedex_members.json` | `web/data/genedex-members.json` | 4.2 MB | 1,574 lists (17,515 unique genes) | Mapping of each accession ID (`GL0000001`–`GL0001574`) to its array of standardized HGNC gene symbols. |
| `data/outputs/genedex_facets.json` | `web/data/facet-definitions.json` | 58 KB | 228 facets | Plain-language biological definitions and ontology identifiers (MONDO, GO, CL, UBERON) for functional, cellular, and tissue facets. |
| `data/outputs/genedex_aliases.json` | `web/data/gene-aliases.json` | 1.1 MB | 56,331 aliases | Historical gene symbols, synonyms, and Entrez IDs mapped to their canonical HGNC gene symbol in the GeneDeX universe. |

---

## 3. External Reference Standards

- **Gene Nomenclature:** [HGNC (HUGO Gene Nomenclature Committee)](https://www.genenames.org/) — All gene identifiers are resolved to approved human gene symbols.
- **Disease & Phenotype Ontologies:** [Mondo Disease Ontology (MONDO)](https://mondo.monarchinitiative.org/), [Gene Ontology (GO)](https://geneontology.org/), [Cell Ontology (CL)](https://obophenotype.github.io/cell-ontology/), and [Uber-anatomy Ontology (UBERON)](https://obophenotype.github.io/uberon/).
- **Literature Identifiers:** Every curated list links directly to its primary source via Digital Object Identifier (`https://doi.org/<doi>`) and/or NCBI PubMed ID (`https://pubmed.ncbi.nlm.nih.gov/<pmid>`).

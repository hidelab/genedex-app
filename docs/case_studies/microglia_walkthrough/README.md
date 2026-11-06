# Case Study: Profiling Microglia Activation Signatures in Alzheimer's Disease

This walkthrough demonstrates how to use **GeneDeX** to evaluate a canonical microglia marker gene set across published Alzheimer's disease transcriptomic and proteomic studies.

---

## 1. Input Gene Set

Consider the 10-gene microglia signature preset available on the GeneDeX home screen:

```text
CX3CR1, P2RY12, AIF1, CSF1R, TREM2, ITGAM, C1QA, TMEM119, TYROBP, CD68
```

---

## 2. Step-by-Step Walkthrough

### Step 1: Gene Search (Enrichment Analysis)
1. Open the **GeneDeX** portal and click the **Microglia Markers** preset chip (or paste the 10 genes above into the search box) and click **Analyze**.
2. In **Gene Search**, GeneDeX tests the 10 query genes against all 1,574 curated AD gene lists using the hypergeometric test with Benjamini–Hochberg FDR correction.
3. Filter by **Direction** (`Up`, `Down`, or `All`) or use the **Filter facet** box to narrow to `Neuroinflammation` or `Microglia` lists.

### Step 2: Gene Print (Cross-Facet Profiling)
1. Switch to the **Gene Print** tab to view a gene $\times$ facet heatmap.
2. Set **Counting unit** to `Study` (collapsing multiple lists from the same publication) and **Facet class** to `All`.
3. Observe how `TREM2`, `TYROBP`, and `C1QA` span both cellular microglia facets and functional neuroinflammation / amyloid-$\beta$ clearance facets.

### Step 3: Context Matrix (Anatomical & Directional Agreement)
1. Switch to the **Context Matrix** tab.
2. Inspect each `Cell Type / Brain Region` row (e.g., `Microglia / Prefrontal Cortex`, `Microglia / Hippocampus`) to verify whether independent studies consistently report up-regulation ($\blacktriangle$), down-regulation ($\blacktriangledown$), or conflicting directions ($\triangle$ warning badge).

### Step 4: Similarity (Jaccard Clustering)
1. Switch to the **Similarity** tab to compute pairwise Jaccard indices ($J(A,B) = |A \cap B| / |A \cup B|$) between your query gene set and top enriched reference lists, or across pooled AD facets.

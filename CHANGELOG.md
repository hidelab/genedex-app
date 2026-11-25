# Changelog

All notable changes to **Genedex** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-11-25

### Added
- Similarity can use the overlap coefficient as well as the Jaccard index. 
- Use cases for each functionality.
- Documentation, added screenshots of the functionalities and use cases. 
- Resizable side panels.
- Tree views to Gene Search results, beside the Table view. 
- Genedex functionalities are grouped in the tab analysis
- Added brief description in each function page

### Removed
- Similarity: removed the "Top 15 by # lists" button under Facets (AD facet mode). 
- Removed the "Filter facet…" box from the right of the Gene Search results ba.
- Removed the "About the curation" link from the "Genedex content" section on the home page. "Download the collection" and "Facet legend" stay, and the About page can still be reached from the navigation bar and the footer.
- Removed the Context Matrix module.
- Removed the "Gene-list type" filter from the GenePrint side panel. 

### Changed
- Every PNG export now defaults to 600 DPI.  
- Similarity: the Order choice "Input" is now "As queried", as in GenePrint.
- The browser tab title is now just "Genedex".
- Similarity: the "Colour scale" choice (0 – max / 0 – 1) removed.
- GenePrint's side panel uses radio buttons instead of the grey option boxes for Facet class, Order, Direction and Counting unit. 
- GenePrint's Export heading has a ? that explains each output.
- The GenePrint side panel is simpler: three parts with headings instead of one long column with five always-open tick-lists.
- "Gene Print" is now written "GenePrint" everywhere in the app.
- GenePrint no longer has a "Scale" choice (Presence / # Lists / Up / Down) in its side panel: it always uses Up / Down.
- Gene Search shows its results on one page: Table, then Tree. 
- The About page now shows "How to cite Genedex". 
- Home page: the link under the search bar is now "How to cite Genedex".
- The Documentation page shows all its sections on one page, one under the other (The data model, Use cases, Gene Search, GenePrint, Similarity). 
- The Similarity heatmap shows only its lower triangle.
- Similarity marks the current query in burgundy instead of black.
- Metadata adds a `contrast` field.
- GenePrint's Contrast filter now offers curated contrasts with their list counts. 
- Restyled the top bar.
- Restyled the home page: white page; a centred hero on plain white with the logo.
- Documentation page: the four sections (The data model, Gene Search, GenePrint, Similarity) are now vertical tabs down the left side.
- Gene Search table: renamed columns.
- Gene Search's FDR cutoff is now a number box instead of a slider.


## [1.1.0] - 2026-10-26

### Added
- Added pairwise Jaccard similarity matrix module (`Similarity` tab) supporting comparison by individual gene lists and pooled AD facets (#2).
- Added AD Knowledge Explorer homepage layout and updated navigation bar (`Gene Search`, `Gene Print`, `Context Matrix`, `Similarity`).

## [1.0.1] - 2026-10-16

### Changed
- Updated curated GeneDeX metadata (`genedex-meta.json`) and gene memberships (`genedex-members.json`).

## [1.0.0] - 2026-09-16

### Added
- Initial release of GeneDeX web application with Gene Search, Gene Print, and Context Matrix views.
- Bundled static JSON corpus (`genedex-meta.json`, `genedex-members.json`, `facet-definitions.json`, `gene-aliases.json`).

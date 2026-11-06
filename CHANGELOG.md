# Changelog

All notable changes to **GeneDeX** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Restructured repository to follow the Hide Lab Web-Tool GitHub Repository Standard (`web/` deployment root, `data/outputs/`, `tests/`, `scripts/audits/`, `docs/`, standard `Makefile`, and GitHub Actions CI/CD).
- Extracted inline CSS from `web/index.html` into `web/css/genedex.css`.
- Removed legacy HTML prototype snapshots from the root working tree.

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

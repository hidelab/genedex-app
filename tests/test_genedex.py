"""
Automated quality, schema, and repository layout tests for GeneDeX.
Compatible with both pytest and python -m unittest.
"""

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = ROOT / "web"
DATA_OUT_DIR = ROOT / "data" / "outputs"


def test_standard_root_files_exist():
    """Verify required governance and configuration files exist at the root."""
    expected = [
        "README.md",
        "LICENSE",
        "CITATION.cff",
        "CHANGELOG.md",
        "DATA_SOURCES.md",
        "Makefile",
        "pyproject.toml",
        "requirements.txt",
        "requirements-dev.txt",
        ".env.example",
        ".gitignore",
        ".gitattributes",
        ".nojekyll",
    ]
    for name in expected:
        assert (ROOT / name).is_file(), f"Missing standard root file: {name}"


def test_web_deployment_root_assets():
    """Verify web/ contains all assets needed for standalone production deployment."""
    expected_web = [
        "index.html",
        "genedex-data.js",
        "support.js",
        "css/genedex.css",
        "js/genedex-data.js",
        "js/support.js",
        "images/banner.png",
        "robots.txt",
        "sitemap.xml",
        ".nojekyll",
        "data/genedex-meta.json",
        "data/genedex-members.json",
        "data/facet-definitions.json",
        "data/gene-aliases.json",
    ]
    for rel in expected_web:
        assert (WEB_DIR / rel).exists(), f"Missing web deployment asset: web/{rel}"


def test_canonical_data_outputs_exist_and_under_size_limit():
    """Verify canonical <tool>_<content>.json outputs exist and respect the <10MB direct Git limit."""
    canonical_files = [
        "genedex_meta.json",
        "genedex_members.json",
        "genedex_facets.json",
        "genedex_aliases.json",
    ]
    max_bytes = 10 * 1024 * 1024  # 10 MB
    for name in canonical_files:
        p = DATA_OUT_DIR / name
        assert p.exists(), f"Missing canonical output artifact: data/outputs/{name}"
        size = p.stat().st_size
        assert 0 < size < max_bytes, f"File {name} size ({size} B) exceeds 10 MB direct commit threshold"


def test_genedex_dataset_schema_and_referential_integrity():
    """Verify metadata and gene membership records match 1-to-1 and follow expected schema."""
    with open(WEB_DIR / "data" / "genedex-meta.json", encoding="utf-8") as f:
        meta = json.load(f)
    with open(WEB_DIR / "data" / "genedex-members.json", encoding="utf-8") as f:
        members = json.load(f)
    with open(WEB_DIR / "data" / "facet-definitions.json", encoding="utf-8") as f:
        facets = json.load(f)
    with open(WEB_DIR / "data" / "gene-aliases.json", encoding="utf-8") as f:
        aliases = json.load(f)

    assert isinstance(meta, list) and len(meta) >= 1500
    assert isinstance(members, dict) and len(members) == len(meta)
    assert isinstance(facets, dict) and len(facets) > 0
    assert isinstance(aliases, dict) and len(aliases) > 0

    required_meta_keys = {"gl", "name", "ff", "cf", "tissue"}
    meta_ids = set()
    for item in meta:
        assert required_meta_keys.issubset(item.keys()), f"Missing keys in {item.get('gl')}"
        gl_id = item["gl"]
        meta_ids.add(gl_id)
        assert gl_id in members, f"List {gl_id} missing from genedex-members.json"
        assert isinstance(members[gl_id], list) and len(members[gl_id]) > 0, f"Empty gene list for {gl_id}"

    assert meta_ids == set(members.keys())


class TestGeneDeXRepositoryStandard(unittest.TestCase):
    """Unittest wrapper so `make test` works with or without pytest installed."""

    def test_root_files(self):
        test_standard_root_files_exist()

    def test_web_assets(self):
        test_web_deployment_root_assets()

    def test_canonical_outputs(self):
        test_canonical_data_outputs_exist_and_under_size_limit()

    def test_dataset_schema(self):
        test_genedex_dataset_schema_and_referential_integrity()


if __name__ == "__main__":
    unittest.main()

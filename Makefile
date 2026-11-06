.PHONY: setup smoke test build serve

PYTHON ?= python3
PORT ?= 8080

# Install developer and test dependencies
setup:
	$(PYTHON) -m pip install -r requirements.txt -r requirements-dev.txt

# Fast offline sanity check on bundled data artifacts (zero network required)
smoke:
	$(PYTHON) scripts/audits/audit_data.py

# Run full automated test suite
test:
	@if $(PYTHON) -c "import pytest" >/dev/null 2>&1; then \
		$(PYTHON) -m pytest tests/ -v; \
	else \
		$(PYTHON) -m unittest discover -s tests -p "test_*.py" -v; \
	fi

# Verify and synchronize canonical data/outputs/ links and web/data/ assets
build:
	@mkdir -p data/outputs
	@ln -sf ../../web/data/genedex-meta.json data/outputs/genedex_meta.json
	@ln -sf ../../web/data/genedex-members.json data/outputs/genedex_members.json
	@ln -sf ../../web/data/facet-definitions.json data/outputs/genedex_facets.json
	@ln -sf ../../web/data/gene-aliases.json data/outputs/genedex_aliases.json
	@$(PYTHON) scripts/audits/audit_data.py

# Serve the production web root locally for manual inspection
serve:
	$(PYTHON) -m http.server $(PORT) --directory web

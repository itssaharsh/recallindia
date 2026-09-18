# SAM custom build for the CommonLayer (template.yaml: Metadata.BuildMethod = makefile).
# `sam build` runs `make build-CommonLayer` in this directory with ARTIFACTS_DIR set.
# Result: $(ARTIFACTS_DIR)/python/common  (Lambda resolves `common` from /opt/python)
#         $(ARTIFACTS_DIR)/python/<deps>   (backend/common/requirements.txt: pydantic>=2)
#         $(ARTIFACTS_DIR)/fixtures        (/opt/fixtures: FIXTURES_DIR for DemoMode=1 stacks)
# Wheels are pinned to the Lambda runtime (CPython 3.12, manylinux2014 x86_64) so the layer does
# not silently follow the host interpreter (macOS arm64 / 3.13 would break pydantic_core).

ARTIFACTS_DIR ?= .aws-sam/build/CommonLayer
PYTHON ?= python3
PIP_TARGET_FLAGS := --platform manylinux2014_x86_64 --only-binary=:all: \
	--python-version 3.12 --implementation cp

.PHONY: build-CommonLayer

build-CommonLayer:
	mkdir -p "$(ARTIFACTS_DIR)/python"
	$(PYTHON) -m pip install -r common/requirements.txt $(PIP_TARGET_FLAGS) \
		-t "$(ARTIFACTS_DIR)/python"
	rm -rf "$(ARTIFACTS_DIR)/python/common"
	cp -r common "$(ARTIFACTS_DIR)/python/common"
	rm -rf "$(ARTIFACTS_DIR)/python/common/tests"
	rm -rf "$(ARTIFACTS_DIR)/fixtures"
	cp -r ../fixtures "$(ARTIFACTS_DIR)/fixtures"
	find "$(ARTIFACTS_DIR)" -type d -name __pycache__ -prune -exec rm -rf {} +

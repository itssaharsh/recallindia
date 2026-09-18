# RecallIndia — developer entry points. `make` (no target) prints this help.
# Every aws/sam command uses the firstcommit profile: the `default` profile's key is
# invalid (docs/P00-REPORT.md). Override with `make deploy AWS_PROFILE=other` if needed.

# Local overrides: a .env (gitignored, template in .env.example; KEY=value lines, no quotes,
# comments on their own lines) is loaded and exported to every recipe when present.
ifneq (,$(wildcard .env))
include .env
ENV_KEYS := $(shell sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' .env)
ifneq (,$(ENV_KEYS))
export $(ENV_KEYS)
endif
endif

AWS_PROFILE ?= firstcommit
export AWS_PROFILE
AWS_REGION ?= ap-south-1
export AWS_DEFAULT_REGION=$(AWS_REGION)
export AWS_REGION

STACK_NAME ?= recallindia
VENV := .venv
PY := $(VENV)/bin/python

.DEFAULT_GOAL := help
.PHONY: help install lint fmt test validate-template build deploy deploy-guided seed validate \
	backfill backfill-mock poll-live clean

help: ## Show this help
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  AWS_PROFILE=$(AWS_PROFILE)  AWS_REGION=$(AWS_REGION)  (every aws/sam call uses these)"

install: ## Create .venv, install dev deps, npm ci (when app/package-lock.json exists), pre-commit hooks
	@test -d $(VENV) || python3 -m venv $(VENV)
	$(PY) -m pip install -q -U pip
	$(PY) -m pip install -q -r requirements-dev.txt
	@if [ -f app/package-lock.json ]; then cd app && npm ci; \
		else echo "app/package-lock.json not present yet (P06) - skipping npm ci"; fi
	@if [ -d .git ]; then $(VENV)/bin/pre-commit install; fi

lint: ## ruff check + ruff format --check
	$(VENV)/bin/ruff check .
	$(VENV)/bin/ruff format --check .

fmt: ## ruff format + ruff check --fix (rewrites files)
	$(VENV)/bin/ruff format .
	$(VENV)/bin/ruff check --fix .

test: ## pytest in demo mode (fixtures only, no AWS credentials needed)
	DEMO_MODE=1 $(PY) -m pytest

validate-template: ## sam validate --lint + cfn-lint on template.yaml
	sam validate --lint --profile $(AWS_PROFILE) --region $(AWS_REGION)
	$(VENV)/bin/cfn-lint template.yaml

build: ## sam build
	sam build --profile $(AWS_PROFILE)

deploy: ## sam build && sam deploy (first time: make deploy-guided)
	@test -f samconfig.toml || { echo "no samconfig.toml yet - run: make deploy-guided"; exit 1; }
	sam build --profile $(AWS_PROFILE)
	sam deploy --profile $(AWS_PROFILE)

deploy-guided: ## First deploy: sam deploy --guided (writes samconfig.toml)
	sam build --profile $(AWS_PROFILE)
	sam deploy --guided --profile $(AWS_PROFILE) --region $(AWS_REGION) --stack-name $(STACK_NAME)

seed: ## Seed the 15-item demo world into the local store (DEMO_MODE)
	DEMO_MODE=1 $(PY) scripts/seed_demo.py --mock

validate: ## Check all seeded items in mock mode and print PASS/FAIL
	DEMO_MODE=1 $(PY) scripts/validate.py --mock

SOURCE ?= cpsc
YEARS ?= 5
ACCOUNT_ID = $(shell aws sts get-caller-identity --query Account --output text --profile $(AWS_PROFILE))

backfill: ## Live backfill: make backfill SOURCE=cpsc|nhtsa|openfda|cdsco_portal YEARS=5 (resumable cursor in .backfill/)
	DEMO_MODE=0 $(PY) scripts/backfill.py --source $(SOURCE) --years $(YEARS) --profile $(AWS_PROFILE)

backfill-mock: ## Same backfill against fixtures and the local demo store (DEMO_MODE=1, no sleep)
	$(PY) scripts/backfill.py --source $(SOURCE) --years $(YEARS) --mock --sleep 0

poll-live: ## Invoke one deployed poller Lambda once: make poll-live SOURCE=cpsc|nhtsa|openfda|cdsco-portal
	aws lambda invoke --profile $(AWS_PROFILE) --region $(AWS_REGION) \
		--function-name recallindia-poller-$(SOURCE)-$(ACCOUNT_ID) \
		--cli-binary-format raw-in-base64-out --payload '{}' /dev/stdout

clean: ## Remove venv, SAM build output, caches and the local demo store
	rm -rf $(VENV) .aws-sam .demo_store .pytest_cache .ruff_cache
	find . -name __pycache__ -type d -prune -exec rm -rf {} +

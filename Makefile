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
	backfill backfill-mock poll-live api-url ingest-run ingest-status notices-page clean

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

.PHONY: seed-live validate-live
seed-live: ## Reset + seed the 15 demo items in the DEPLOYED tables (deletes items/cases/events, never notices)
	DEMO_MODE=0 $(PY) scripts/seed_demo.py --live --reset --profile $(AWS_PROFILE)

validate-live: ## Check the 15 demo items through the deployed API + Step Functions, PASS/FAIL
	DEMO_MODE=0 $(PY) scripts/validate.py --live --profile $(AWS_PROFILE)

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

api-url: ## Print the deployed HTTP API base URL (ApiUrl stack output)
	@aws cloudformation describe-stacks --stack-name $(STACK_NAME) --profile $(AWS_PROFILE) \
		--region $(AWS_REGION) --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text

ingest-run: ## POST /ingest/run on the deployed API (starts the IngestStateMachine, prints the arn)
	curl -sS -X POST "$$(make -s api-url)/ingest/run" -H 'content-type: application/json' \
		-d '{"force": true}'
	@echo ""

ARN ?=
ingest-status: ## GET /ingest/status/{arn}: make ingest-status ARN=arn:aws:states:...:execution:...
	@test -n "$(ARN)" || { echo "usage: make ingest-status ARN=<execution arn or run id>"; exit 2; }
	curl -sS "$$(make -s api-url)/ingest/status/$$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' '$(ARN)')"
	@echo ""

SINCE ?= 2026-07-01
LIMIT ?= 100
CURSOR ?=
notices-page: ## GET one page of /v1/notices: make notices-page SOURCE=cdsco_nsq SINCE=2026-07-01 [LIMIT=100 CURSOR=...]
	curl -sS "$$(make -s api-url)/v1/notices?source=$(SOURCE)&since=$(SINCE)&limit=$(LIMIT)&cursor=$(CURSOR)"
	@echo ""

.PHONY: items-add items-list item-check case-get events
NAME ?=
BRAND ?=
BATCH ?=
KIND ?= medicine
MODEL ?=
VMAKE ?=
YEAR ?=
PURCHASED ?=
ID ?=
items-add: ## POST /items: make items-add NAME="Paracetamol Tablets IP 650mg" BRAND="Forgo Pharmaceuticals" BATCH=FT5427 [KIND= MODEL= VMAKE=<vehicle make> YEAR= PURCHASED=YYYY-MM-DD]
	@test -n "$(NAME)" || { echo 'usage: make items-add NAME="..." [BRAND= BATCH= KIND= MODEL= VMAKE= YEAR= PURCHASED=]'; exit 2; }
	@python3 -c 'import json,sys; k=["kind","name","brand","batch","model","make","year","purchase_date"]; d={a:b for a,b in zip(k,sys.argv[1:]) if b}; d.update(year=int(d["year"])) if d.get("year") else None; print(json.dumps({"items":[d]}))' \
		"$(KIND)" "$(NAME)" "$(BRAND)" "$(BATCH)" "$(MODEL)" "$(VMAKE)" "$(YEAR)" "$(PURCHASED)" \
		| curl -sS -X POST "$$(make -s api-url)/items" -H 'content-type: application/json' -d @-
	@echo ""

items-list: ## GET /items on the deployed API
	curl -sS "$$(make -s api-url)/items"
	@echo ""

item-check: ## POST /items/{id}/check (starts the MatchStateMachine): make item-check ID=item-...
	@test -n "$(ID)" || { echo "usage: make item-check ID=<item id>"; exit 2; }
	curl -sS -X POST "$$(make -s api-url)/items/$(ID)/check"
	@echo ""

case-get: ## GET /cases/{id}: make case-get ID=case-...
	@test -n "$(ID)" || { echo "usage: make case-get ID=<case id>"; exit 2; }
	curl -sS "$$(make -s api-url)/cases/$(ID)"
	@echo ""

events: ## GET /events?limit=20 (newest first)
	curl -sS "$$(make -s api-url)/events?limit=20"
	@echo ""

clean: ## Remove venv, SAM build output, caches and the local demo store
	rm -rf $(VENV) .aws-sam .demo_store .pytest_cache .ruff_cache
	find . -name __pycache__ -type d -prune -exec rm -rf {} +

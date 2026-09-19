"""scripts/seed_demo.py + scripts/validate.py: the 15-item demo world, mock mode, no credentials."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

from common import dynamo

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"


def _load(name: str):
    if str(SCRIPTS) not in sys.path:
        sys.path.insert(0, str(SCRIPTS))
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def scripts(monkeypatch: pytest.MonkeyPatch):
    # mock mode must never need AWS: make any credential lookup fail loudly
    for var in ("AWS_PROFILE", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("AWS_SHARED_CREDENTIALS_FILE", "/nonexistent")
    monkeypatch.setenv("AWS_CONFIG_FILE", "/nonexistent")
    monkeypatch.setenv("BEDROCK_ENABLED", "false")  # the product default: no LLM in the path
    return _load("demo_world"), _load("seed_demo"), _load("validate")


def test_the_world_is_15_items_with_fixed_ids(scripts):
    world, _, _ = scripts
    ids = [e["item_id"] for e in world.DEMO_ITEMS]
    assert len(ids) == 15 == len(set(ids))
    assert [e["expected"] for e in world.DEMO_ITEMS].count("clear") == 12
    assert world.NEAR_MISS["batch"] == "FT5428" and world.ALERT["batch"] == "FT5427"
    assert "expected" not in world.item_fields(world.ALERT)


def test_seed_pins_the_alert_to_the_real_row_and_dates_the_purchase(scripts, capsys):
    world, seed_demo, _ = scripts
    assert seed_demo.main(["--mock", "--reset"]) == 0
    alert = dynamo.get("items", "user#demo-alert")
    assert alert["batch"] == "FT5427" and alert["brand"] == "Forgo Pharmaceuticals"
    assert alert["purchase_date"] == "2026-07-12"  # notice published 2026-07-01 + 11 days
    assert len(dynamo.scan_all("items", limit=100)) == 15
    out = capsys.readouterr().out
    assert "demo-nearmiss" in out and "alert or hold" in out


def test_seed_is_idempotent_and_reset_never_touches_notices(scripts):
    _, seed_demo, _ = scripts
    assert seed_demo.main(["--mock"]) == 0
    notices_before = len(dynamo.scan_all("notices", limit=5000))
    assert notices_before > 200  # the fixture portal rows were loaded
    dynamo.put("cases", {"pk": "case-old", "rk": "case", "ts": "2026-01-01T00:00:00Z"})
    assert seed_demo.main(["--mock", "--reset"]) == 0
    assert len(dynamo.scan_all("items", limit=100)) == 15
    assert dynamo.get("cases", "case-old") is None  # cases + events are cleared
    assert len(dynamo.scan_all("notices", limit=5000)) == notices_before
    assert seed_demo.RESETTABLE == ("items", "cases")


def test_validate_mock_passes_from_an_empty_store(scripts, capsys):
    _, _, validate = scripts
    assert validate.main(["--mock"]) == 0
    out = capsys.readouterr().out
    assert out.rstrip().endswith("PASS")
    assert "batch FT5428 not in listed batches [FT5427]" in out
    assert "'alert': 2" in out and "'dismiss': 1" in out and "'clear': 12" in out


def test_validate_fails_when_the_world_is_wrong(scripts, capsys):
    """A validator that cannot fail proves nothing: tamper with the near-miss and expect FAIL."""
    _, seed_demo, validate = scripts
    assert seed_demo.main(["--mock"]) == 0
    item = dynamo.get("items", "user#demo-nearmiss")
    item["batch"] = "FT5427"  # now it is a second real alert, and no dismiss remains
    dynamo.put("items", item)
    assert validate.main(["--mock"]) == 1
    out = capsys.readouterr().out
    assert "FAIL" in out and "expected exactly 1 dismiss" in out


def test_assess_names_each_problem(scripts):
    world, _, validate = scripts
    rows = [
        {
            "item_id": e["item_id"],
            "name": e["name"],
            "expected": e["expected"],
            "decision": "clear",
            "has_case": False,
            "execution": "SUCCEEDED",
        }
        for e in world.DEMO_ITEMS
    ]
    problems = validate.assess(rows)
    joined = " | ".join(problems)
    assert "expected exactly 1 alert" in joined and "expected exactly 1 dismiss" in joined
    assert "vehicle decision is 'clear'" in joined and "expected 12 clear" in joined

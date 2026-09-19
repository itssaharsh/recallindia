"""scripts/migrate_brand_key.py: re-key brand_lc in place, touching nothing else."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest
from botocore.exceptions import ClientError

from common import dynamo

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"


@pytest.fixture
def migrate():
    if str(SCRIPTS) not in sys.path:
        sys.path.insert(0, str(SCRIPTS))
    spec = importlib.util.spec_from_file_location(
        "migrate_brand_key", SCRIPTS / "migrate_brand_key.py"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules["migrate_brand_key"] = module
    spec.loader.exec_module(module)
    return module


def _stale(pk: str, brand: str, **extra) -> dict:
    """A row as it was written BEFORE P05b: brand_lc is the raw lower-cased display brand."""
    return {"pk": pk, "source": "cdsco_nsq", "brand": brand, "brand_lc": brand.lower().strip(),
            "product": "Pantoprazole Tablets IP", "batches": ["PEP5001"],
            "published_at": "2026-07-01", **extra}  # fmt: skip


@pytest.fixture
def stale_store():
    rows = [
        _stale("cdsco_nsq#1", "Finecure Pharmaceuticals Ltd.", raw_excerpt="keep me"),
        _stale("cdsco_nsq#2", "M/s. Tam-Bran Pharmaceuticals Pvt. Ltd."),
        _stale("cdsco_nsq#3", "Forgo Pharmaceuticals"),  # already equals its key
        {"pk": "meta#cpsc", "source": "cpsc", "degraded": False},
        {"pk": "ingest#run-1", "step": "publish"},
        {"pk": "cdsco_nsq#4", "source": "cdsco_nsq", "brand": "  ", "brand_lc": "unknown"},
    ]
    for row in rows:
        dynamo.put("notices", row)
    return rows


def test_classify(migrate) -> None:
    assert migrate.classify({"pk": "meta#cpsc"}) == ("skipped_internal", None)
    assert migrate.classify({"pk": "ingest#r"}) == ("skipped_internal", None)
    assert migrate.classify({"pk": "x#1", "brand": ""}) == ("skipped_no_brand", None)
    assert migrate.classify(_stale("x#1", "Forgo Pharmaceuticals")) == ("already_ok", None)
    assert migrate.classify(_stale("x#1", "Finecure Pharmaceuticals Ltd.")) == (
        "update",
        "finecure pharmaceuticals",
    )
    assert migrate.classify(_stale("x#1", "Pvt. Ltd.")) == ("update", "unknown")


def test_mock_migration_rekeys_and_touches_nothing_else(migrate, stale_store, capsys) -> None:
    before = {r["pk"]: dict(r) for r in dynamo.scan_all("notices", limit=100)}
    assert migrate.main(["--mock"]) == 0
    after = {r["pk"]: r for r in dynamo.scan_all("notices", limit=100)}
    assert after["cdsco_nsq#1"]["brand_lc"] == "finecure pharmaceuticals"
    assert after["cdsco_nsq#2"]["brand_lc"] == "tam-bran pharmaceuticals"
    for pk, row in after.items():  # every other attribute, the display brand included, unchanged
        assert {k: v for k, v in row.items() if k != "brand_lc"} == {
            k: v for k, v in before[pk].items() if k != "brand_lc"
        }, pk
    assert after["meta#cpsc"] == before["meta#cpsc"] and "brand_lc" not in after["ingest#run-1"]
    out = capsys.readouterr().out
    assert "scanned=6" in out and "updated=2" in out and "already_ok=1" in out
    assert "skipped_internal=2" in out and "skipped_no_brand=1" in out and "failed=0" in out
    assert dynamo.query_brand("finecure pharmaceuticals")  # now findable by its key


def test_mock_migration_is_idempotent(migrate, stale_store, capsys) -> None:
    assert migrate.main(["--mock"]) == 0
    capsys.readouterr()
    assert migrate.main(["--mock"]) == 0
    assert "updated=0" in capsys.readouterr().out


def test_dry_run_writes_nothing(migrate, stale_store, capsys) -> None:
    assert migrate.main(["--mock", "--dry-run"]) == 0
    assert "would update=2" in capsys.readouterr().out
    assert dynamo.get("notices", "cdsco_nsq#1")["brand_lc"] == "finecure pharmaceuticals ltd."


class _FakeTable:
    def __init__(self, pages: list[list[dict]], fail_pk: str | None = None) -> None:
        self.pages, self.updates, self.scans, self.fail_pk = pages, [], [], fail_pk

    def scan(self, **kwargs):
        self.scans.append(kwargs)
        index = len(self.scans) - 1
        page = {"Items": self.pages[index]}
        if index < len(self.pages) - 1:
            page["LastEvaluatedKey"] = {"pk": self.pages[index][-1]["pk"]}
        return page

    def update_item(self, **kwargs):
        if kwargs["Key"]["pk"] == self.fail_pk:
            raise ClientError({"Error": {"Code": "ConditionalCheckFailedException"}}, "UpdateItem")
        self.updates.append(kwargs)


def test_live_update_sets_brand_lc_only_under_a_condition(migrate) -> None:
    table = _FakeTable([[_stale("a#1", "Finecure Pharmaceuticals Ltd.")],
                        [_stale("a#2", "Forgo Pharmaceuticals"), {"pk": "meta#cpsc"}]])  # fmt: skip
    state = {k: 0 for k in migrate.COUNT_KEYS} | {"last_key": None}
    saved: list[dict] = []
    migrate.migrate_live(
        table, dry_run=False, page_size=1, state=state, save=lambda s: saved.append(dict(s))
    )
    assert len(table.updates) == 1
    call = table.updates[0]
    assert call["Key"] == {"pk": "a#1"}
    assert call["UpdateExpression"] == "SET #bl = :key"  # one attribute, nothing else
    assert call["ExpressionAttributeNames"]["#bl"] == "brand_lc"
    assert call["ExpressionAttributeValues"][":key"] == "finecure pharmaceuticals"
    assert (
        "attribute_exists" in call["ConditionExpression"]
        and "#b = :brand" in call["ConditionExpression"]
    )
    assert state["updated"] == 1 and state["already_ok"] == 1 and state["skipped_internal"] == 1
    assert (
        len(saved) == 2 and saved[0]["last_key"] == {"pk": "a#1"} and saved[1]["last_key"] is None
    )
    assert table.scans[1]["ExclusiveStartKey"] == {"pk": "a#1"}  # it resumes page by page


def test_live_dry_run_never_calls_update_and_conflicts_are_counted(migrate) -> None:
    rows = [
        _stale("a#1", "Finecure Pharmaceuticals Ltd."),
        _stale("a#2", "Cotec Healthcare Pvt. Ltd"),
    ]
    dry = _FakeTable([rows])
    state = {k: 0 for k in migrate.COUNT_KEYS} | {"last_key": None}
    migrate.migrate_live(dry, dry_run=True, page_size=50, state=state, save=lambda s: None)
    assert dry.updates == [] and state["updated"] == 2

    racing = _FakeTable([rows], fail_pk="a#2")  # a poller rewrote a#2 between scan and update
    state = {k: 0 for k in migrate.COUNT_KEYS} | {"last_key": None}
    migrate.migrate_live(racing, dry_run=False, page_size=50, state=state, save=lambda s: None)
    assert state["updated"] == 1 and state["conflicts"] == 1 and state["failed"] == 0

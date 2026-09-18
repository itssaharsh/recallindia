"""common.notices: idempotent upserts, vehicle merging, meta#<source> bookkeeping."""

from __future__ import annotations

import pytest

from common import dynamo, notices
from common.notices import (
    add,
    is_meta,
    new_counts,
    read_meta,
    upsert_notice,
    write_meta,
)


def _notice(**over) -> dict:
    base = {
        "pk": "cpsc#26-001",
        "source": "cpsc",
        "notice_id": "26-001",
        "title": "Acme Kettle",
        "product": "Kettle",
        "brand": "Acme",
        "batches": ["B1"],
        "hazard_or_failed_test": "burn",
        "published_at": "2026-09-01",
        "url": "https://example.test/26-001",
    }
    base.update(over)
    return base


def test_created_then_unchanged_then_updated(monkeypatch: pytest.MonkeyPatch) -> None:
    writes: list[dict] = []
    real_put = dynamo.put
    monkeypatch.setattr(
        dynamo, "put", lambda kind, item: writes.append(item) or real_put(kind, item)
    )

    assert upsert_notice(_notice()) == "created"
    stored = dynamo.get("notices", "cpsc#26-001")
    assert stored["brand_lc"] == "acme"
    assert stored["first_seen_at"] and stored["updated_at"] == stored["first_seen_at"]
    assert len(writes) == 1

    assert upsert_notice(_notice()) == "unchanged"
    assert len(writes) == 1  # no write on unchanged

    monkeypatch.setattr(notices, "now_iso", lambda: "2030-01-01T00:00:00Z")
    assert upsert_notice(_notice(remedy="Refund")) == "updated"
    assert len(writes) == 2
    after = dynamo.get("notices", "cpsc#26-001")
    assert after["remedy"] == "Refund"
    assert after["first_seen_at"] == stored["first_seen_at"]  # preserved
    assert after["updated_at"] == "2030-01-01T00:00:00Z"


def test_invalid_notice_raises_before_any_write() -> None:
    with pytest.raises(ValueError):
        upsert_notice(_notice(published_at="1 Sep 2026"))
    assert dynamo.get("notices", "cpsc#26-001") is None


def test_merge_vehicles_unions_and_dedupes() -> None:
    v1 = {"make": "hyundai", "model": "venue", "year_from": 2022, "year_to": 2022}
    v2 = {"make": "hyundai", "model": "venue", "year_from": 2023, "year_to": 2023}
    campaign = _notice(pk="nhtsa#22V001", source="nhtsa", notice_id="22V001", batches=[])

    assert upsert_notice({**campaign, "vehicles": [v1]}, merge_vehicles=True) == "created"
    assert upsert_notice({**campaign, "vehicles": [v2]}, merge_vehicles=True) == "updated"
    assert dynamo.get("notices", "nhtsa#22V001")["vehicles"] == [v1, v2]
    # same tuple again, in any order: nothing to add, nothing written
    assert upsert_notice({**campaign, "vehicles": [v2, v1]}, merge_vehicles=True) == "unchanged"
    assert upsert_notice({**campaign, "vehicles": [dict(v1)]}, merge_vehicles=True) == "unchanged"
    assert dynamo.get("notices", "nhtsa#22V001")["vehicles"] == [v1, v2]
    # without merge_vehicles the incoming list replaces the stored one
    assert upsert_notice({**campaign, "vehicles": [v2]}, merge_vehicles=False) == "updated"
    assert dynamo.get("notices", "nhtsa#22V001")["vehicles"] == [v2]


def test_counts_helpers() -> None:
    counts = new_counts()
    assert counts == {"fetched": 0, "created": 0, "updated": 0, "unchanged": 0, "upserted": 0}
    for result in ("created", "updated", "unchanged", "created"):
        add(counts, result)
    assert counts == {"fetched": 0, "created": 2, "updated": 1, "unchanged": 1, "upserted": 3}


def test_meta_ok_then_failure_keeps_last_success(monkeypatch: pytest.MonkeyPatch) -> None:
    assert read_meta("cpsc") is None
    monkeypatch.setattr(notices, "now_iso", lambda: "2026-09-18T10:00:00Z")
    ok = write_meta("cpsc", ok=True, counts={"fetched": 3, "upserted": 1}, extra={"window": 30})
    assert ok["pk"] == "meta#cpsc" and ok["source"] == "cpsc"
    assert ok["last_run_at"] == ok["last_success_at"] == "2026-09-18T10:00:00Z"
    assert ok["last_error"] is None and ok["degraded"] is False
    assert ok["last_counts"] == {"fetched": 3, "upserted": 1} and ok["window"] == 30
    assert read_meta("cpsc") == ok

    monkeypatch.setattr(notices, "now_iso", lambda: "2026-09-18T10:15:00Z")
    bad = write_meta("cpsc", ok=False, error="UpstreamError: HTTP 503")
    assert bad["last_run_at"] == "2026-09-18T10:15:00Z"
    assert bad["last_success_at"] == "2026-09-18T10:00:00Z"  # retained on failure
    assert bad["last_error"] == "UpstreamError: HTTP 503" and bad["degraded"] is True
    assert bad["last_counts"] is None
    assert read_meta("cpsc")["degraded"] is True

    monkeypatch.setattr(notices, "now_iso", lambda: "2026-09-18T10:30:00Z")
    again = write_meta("cpsc", ok=True, counts=new_counts())
    assert again["last_success_at"] == "2026-09-18T10:30:00Z" and again["last_error"] is None


def test_first_failure_has_no_last_success() -> None:
    meta = write_meta("nhtsa", ok=False)
    assert meta["last_success_at"] is None and meta["last_error"] == "unknown error"


def test_is_meta_and_api_exclusion() -> None:
    assert is_meta({"pk": "meta#openfda"})
    assert not is_meta({"pk": "openfda#D-1"})
    assert not is_meta({})
    upsert_notice(_notice())
    write_meta("cpsc", ok=True)
    assert len(dynamo.scan_all("notices")) == 2
    assert [n["pk"] for n in dynamo.scan_all("notices") if not is_meta(n)] == ["cpsc#26-001"]

    import json

    from api import app

    event = {
        "version": "2.0",
        "rawPath": "/v1/notices",
        "queryStringParameters": {},
        "requestContext": {"http": {"method": "GET", "path": "/v1/notices"}},
    }
    body = json.loads(app.handler(event, None)["body"])
    assert body["count"] == 1 and body["notices"][0]["pk"] == "cpsc#26-001"

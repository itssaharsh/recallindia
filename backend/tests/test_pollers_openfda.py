"""pollers.openfda: URL rules, skip pagination, fixture mapping, handler + meta (DEMO_MODE=1)."""

from __future__ import annotations

import datetime as dt
import json
import re

import pytest

from common import notices
from common.demo_mode import UpstreamError, fixture_path
from common.schemas import Notice
from pollers import openfda

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
START, END = dt.date(2026, 8, 19), dt.date(2026, 9, 18)


def _load(name: str) -> list[dict]:
    with fixture_path("openfda", name).open(encoding="utf-8") as fh:
        return json.load(fh)["results"]


def test_build_url_is_newest_first_with_encoded_window() -> None:
    url = openfda.build_url("drug", START, END)
    assert url.startswith("https://api.fda.gov/drug/enforcement.json?")
    assert "sort=report_date:desc" in url
    assert "search=report_date:%5B20260819+TO+20260918%5D" in url
    assert "limit=100" in url and "skip=0" in url
    assert "/device/enforcement.json" in openfda.build_url("device", START, END, limit=5, skip=10)
    assert "limit=5&skip=10" in openfda.build_url("device", START, END, limit=5, skip=10)
    assert "limit=1000" in openfda.build_url("drug", START, END, limit=5000)  # capped
    with pytest.raises(ValueError):
        openfda.build_url("food", START, END)


def test_fetch_window_stops_on_a_short_page(monkeypatch) -> None:
    drug = _load("drug_enforcement_recent.json")
    calls: list[str] = []

    def fake(url, **kw):
        calls.append(url)
        return {"meta": {"results": {"skip": 0, "limit": 100, "total": 89}}, "results": drug}

    monkeypatch.setattr(openfda, "fetch_json", fake)
    records = openfda.fetch_window("drug", START, END, limit=100)
    assert len(records) == 89 and len(calls) == 1


def test_fetch_window_pages_with_skip_until_total(monkeypatch) -> None:
    calls: list[str] = []

    def fake(url, **kw):
        calls.append(url)
        skip = int(re.search(r"skip=(\d+)", url).group(1))
        page = [{"recall_number": f"R-{skip + i}"} for i in range(10)]
        return {"meta": {"results": {"skip": skip, "limit": 10, "total": 25}}, "results": page}

    monkeypatch.setattr(openfda, "fetch_json", fake)
    records = openfda.fetch_window("device", START, END, limit=10)
    assert len(records) == 30 and len(calls) == 3  # skip 0, 10, 20 -> 30 >= total 25
    assert [re.search(r"skip=(\d+)", u).group(1) for u in calls] == ["0", "10", "20"]


def test_fetch_window_stops_at_max_records(monkeypatch) -> None:
    calls: list[str] = []

    def fake(url, **kw):
        calls.append(url)
        skip = int(re.search(r"skip=(\d+)", url).group(1))
        page = [{"recall_number": f"R-{skip + i}"} for i in range(100)]
        return {"meta": {"results": {"skip": skip, "limit": 100, "total": 5000}}, "results": page}

    monkeypatch.setattr(openfda, "fetch_json", fake)
    records = openfda.fetch_window("drug", START, END, limit=100, max_records=250)
    assert len(records) == 250 and len(calls) == 3


def test_fetch_window_pauses_between_pages_live_only(monkeypatch) -> None:
    pauses: list[float] = []
    monkeypatch.setattr(openfda, "_sleep", pauses.append)

    def fake(url, **kw):
        skip = int(re.search(r"skip=(\d+)", url).group(1))
        page = [{"recall_number": f"R-{skip + i}"} for i in range(10)]
        return {"meta": {"results": {"skip": skip, "limit": 10, "total": 25}}, "results": page}

    monkeypatch.setattr(openfda, "fetch_json", fake)
    assert len(openfda.fetch_window("drug", START, END, limit=10, pause=1.0)) == 30
    assert pauses == []  # demo mode never sleeps
    monkeypatch.setenv("DEMO_MODE", "0")
    assert len(openfda.fetch_window("drug", START, END, limit=10, pause=1.0)) == 30
    assert pauses == [1.0, 1.0]  # between the three pages, not before the first
    pauses.clear()
    openfda.fetch_window("drug", START, END, limit=10)  # default: no pause
    assert pauses == []


def test_fetch_window_treats_404_error_body_as_empty(monkeypatch) -> None:
    body = {"error": {"code": "NOT_FOUND", "message": "No matches found!"}}
    monkeypatch.setattr(openfda, "fetch_json", lambda url, **kw: body)
    assert openfda.fetch_window("drug", START, END) == []


def test_map_drug_records_from_fixture() -> None:
    drug = _load("drug_enforcement_recent.json")
    assert len(drug) == 89
    mapped = [openfda.map_record(r, "drug") for r in drug]
    for r, n in zip(drug, mapped, strict=True):
        Notice.model_validate(n)
        assert n["source"] == "openfda" and n["pk"] == f"openfda#{r['recall_number']}"
        assert n["notice_id"] == r["recall_number"]
        assert n["title"].startswith("drug recall: ")
        assert n["product"] == " ".join(r["product_description"].split())[:300]
        assert n["product"] and len(n["product"]) <= 300
        assert n["brand"] and n["brand_lc"] == n["brand"].lower().strip()
        assert n["model"] is None and n["remedy"] is None
        assert n["hazard_or_failed_test"] == " ".join(r["reason_for_recall"].split())
        assert ISO_DATE.match(n["published_at"])
        assert n["published_at"].replace("-", "") == r["report_date"]
        assert n["url"] == (
            "https://api.fda.gov/drug/enforcement.json?search=recall_number:%22"
            + r["recall_number"]
            + "%22"
        )
        assert len(n["raw_excerpt"]) <= 4096 and r["code_info"][:40] in n["raw_excerpt"]
        if r.get("openfda", {}).get("brand_name"):
            assert n["brand"] == r["openfda"]["brand_name"][0]
    with_batches = [n for n in mapped if n["batches"]]
    assert len(with_batches) >= 60
    first = mapped[0]
    assert first["notice_id"] == "D-0815-2026" and first["brand"] == "CLINDAMYCIN PHOSPHATE"
    assert first["batches"] == ["NC185424", "NC185479", "NC193948"]
    assert first["published_at"] == "2026-09-09"
    assert sorted({n["published_at"] for n in mapped})[0] == "2026-08-19"


def test_map_device_records_from_fixture() -> None:
    device = _load("device_enforcement.json")
    assert len(device) == 25
    mapped = [openfda.map_record(r, "device") for r in device]
    for r, n in zip(device, mapped, strict=True):
        Notice.model_validate(n)
        assert n["pk"] == f"openfda#{r['recall_number']}" and n["title"].startswith(
            "device recall: "
        )
        assert n["product"] == " ".join(r["product_description"].split())[:300]
        assert n["brand"] and ISO_DATE.match(n["published_at"])
        assert n["published_at"].replace("-", "") == r["report_date"]
        assert "/device/enforcement.json?search=recall_number:%22" in n["url"]
    # device records have an empty ``openfda`` block -> brand from recalling_firm
    assert mapped[0]["brand"] == "Medline Industries, LP"
    assert mapped[0]["batches"][0] == "24ABA808"
    assert any(n["batches"] for n in mapped)
    all_serials = [n for r, n in zip(device, mapped, strict=True) if "all serial" in r["code_info"]]
    assert all_serials and all(n["batches"] == [] for n in all_serials)


def test_map_record_brand_fallbacks_and_errors() -> None:
    base = {"recall_number": "X-1", "product_description": "P", "report_date": "20260102"}
    assert openfda.map_record(base, "drug")["brand"] == "unknown"
    rec = {**base, "recalling_firm": "Firm Inc"}
    assert openfda.map_record(rec, "drug")["brand"] == "Firm Inc"
    rec["openfda"] = {"manufacturer_name": ["Maker"], "brand_name": [""]}
    assert openfda.map_record(rec, "drug")["brand"] == "Maker"
    rec["openfda"]["brand_name"] = ["BRAND"]
    assert openfda.map_record(rec, "device")["brand"] == "BRAND"
    assert openfda.map_record({**base, "code_info": "All lots."}, "drug")["batches"] == []
    with pytest.raises(ValueError):
        openfda.map_record({**base, "recall_number": ""}, "drug")
    with pytest.raises(ValueError):
        openfda.map_record({**base, "report_date": "2026-01-02"}, "drug")
    with pytest.raises(ValueError):
        openfda.map_record(base, "food")


def test_ingest_counts_skipped_records() -> None:
    counts = openfda.ingest(
        [{"recall_number": "OK-1", "product_description": "P", "report_date": "20260102"}, {}],
        "drug",
    )
    assert counts["created"] == 1 and counts["skipped"] == 1 and counts["upserted"] == 1


def test_handler_polls_both_kinds_and_writes_meta() -> None:
    out = openfda.handler({}, None)
    assert out["source"] == "openfda" and out["degraded"] is False and "error" not in out
    assert out["fetched"] == 114 and out["upserted"] == 114 and out["created"] == 114
    assert out["kinds"]["drug"]["fetched"] == 89 and out["kinds"]["drug"]["created"] == 89
    assert out["kinds"]["device"]["fetched"] == 25 and out["kinds"]["device"]["upserted"] == 25
    assert out["took_ms"] >= 0

    again = openfda.handler({}, None)
    assert again["fetched"] == 114 and again["unchanged"] == 114 and again["upserted"] == 0

    meta = notices.read_meta("openfda")
    assert meta["pk"] == "meta#openfda" and meta["degraded"] is False
    assert meta["last_success_at"] and meta["last_error"] is None
    assert meta["last_counts"]["fetched"] == 114
    assert set(meta["kinds"]) == {"drug", "device"} and meta["kinds"]["drug"]["fetched"] == 89


def test_one_kind_failing_marks_the_run_degraded(monkeypatch) -> None:
    real = openfda.fetch_json

    def flaky(url, **kw):
        if "/device/" in url:
            raise UpstreamError("HTTP 500 for device")
        return real(url, **kw)

    monkeypatch.setattr(openfda, "fetch_json", flaky)
    out = openfda.handler({}, None)
    assert out["degraded"] is True and "device: UpstreamError" in out["error"]
    assert out["fetched"] == 89 and out["kinds"]["device"]["degraded"] is True
    meta = notices.read_meta("openfda")
    assert meta["degraded"] is True and meta["last_success_at"] is None
    assert "HTTP 500" in meta["last_error"]

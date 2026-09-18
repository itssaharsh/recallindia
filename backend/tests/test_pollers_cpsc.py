"""pollers.cpsc: fixture mapping, idempotent handler, meta#cpsc, degraded path (DEMO_MODE=1)."""

from __future__ import annotations

import datetime as dt
import json
import re

import pytest

from common import notices
from common.demo_mode import UpstreamError, fixture_path
from common.schemas import Notice
from pollers import cpsc

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@pytest.fixture(scope="module")
def recalls() -> list[dict]:
    with fixture_path("cpsc", "recent.json").open(encoding="utf-8") as fh:
        data = json.load(fh)
    assert len(data) == 451
    return data


@pytest.fixture(scope="module")
def mapped(recalls: list[dict]) -> list[dict]:
    return [cpsc.map_recall(r) for r in recalls]


def test_build_url_windows_the_query() -> None:
    url = cpsc.build_url(dt.date(2026, 8, 19), dt.date(2026, 9, 18))
    assert url.startswith("https://www.saferproducts.gov/RestWebServices/Recall?format=json")
    assert "RecallDateStart=2026-08-19" in url and "RecallDateEnd=2026-09-18" in url
    assert "RecallDateEnd" not in cpsc.build_url(dt.date(2026, 1, 1))


def test_fetch_window_returns_the_fixture_in_demo() -> None:
    assert len(cpsc.fetch_window(dt.date(2026, 1, 1))) == 451


def test_every_fixture_record_maps_to_a_valid_notice(mapped: list[dict]) -> None:
    assert len(mapped) == 451
    pks = set()
    for n in mapped:
        Notice.model_validate(n)  # extra="forbid": a stray key fails here
        assert n["source"] == "cpsc" and n["pk"] == f"cpsc#{n['notice_id']}"
        assert n["brand"] and n["brand_lc"] == n["brand"].lower().strip()
        assert n["product"] and n["title"] and n["url"].startswith("https://")
        assert ISO_DATE.match(n["published_at"])
        assert len(n["raw_excerpt"]) <= 4096 and n["title"] in n["raw_excerpt"]
        pks.add(n["pk"])
    assert len(pks) == 451  # RecallID is unique even where RecallNumber repeats


def test_record_zero_maps_the_fixture_as_is(recalls: list[dict], mapped: list[dict]) -> None:
    """CPSC data quirk: recall 10986 pairs the Char-Broil grill title/description with a
    ``Products[0].Name`` of "LANCHEZ Pressure Washers" and a LANCHEZ importer. The mapping
    records what the source says (raw text kept) instead of guessing; brand only loses the
    " of China" tail so brand_lc is a usable GSI key."""
    rec, n = recalls[0], mapped[0]
    assert rec["RecallID"] == 10986 and rec["Products"][0]["Name"] == "LANCHEZ Pressure Washers"
    assert n["notice_id"] == "10986" and n["pk"] == "cpsc#10986"
    assert (
        n["title"] == "Char-Broil Recalls Bistro Pro Electric Grills Due to Risk of Electric Shock"
    )
    assert n["product"] == "LANCHEZ Pressure Washers"
    assert rec["Manufacturers"] == [] and rec["Importers"][0]["Name"].endswith(" of China")
    assert n["brand"] == "Ningbo Lanchez E-Commerce Co., Ltd."
    assert n["brand_lc"] == "ningbo lanchez e-commerce co., ltd."
    assert n["published_at"] == "2026-09-17" and rec["RecallDate"].startswith("2026-09-17")
    assert n["batches"] == ["2510", "2511", "2512"]  # "date codes of 2510 (Oct-2025), ..."
    assert n["hazard_or_failed_test"].startswith("The grounding wire")
    assert n["remedy"].endswith("; Refund")
    assert n["url"] == rec["URL"]


def test_hayward_heater_model_is_extracted(recalls: list[dict], mapped: list[dict]) -> None:
    """Two fixture rows carry the Hayward description (10990 is the real one; 10987 pairs the
    same title/description with a Sauna360 product -- the same CPSC quirk as record 0)."""
    hits = [(r, n) for r, n in zip(recalls, mapped, strict=True) if "HDFS400" in r["Description"]]
    assert hits, "fixture should contain the Hayward HDFS400 recall"
    for _, n in hits:
        assert n["model"] == "HDFS400" or "HDFS400" in n["batches"]
    hayward = [n for r, n in hits if r["RecallID"] == 10990]
    assert len(hayward) == 1
    assert hayward[0]["brand"] == "Hayward Industries, Inc."
    assert hayward[0]["product"] == "400,000 BTU Universal-HC Series Pool Heaters"


def test_at_least_thirty_records_carry_identifiers(mapped: list[dict]) -> None:
    with_ids = [n for n in mapped if n["serial_ranges"] or n["batches"] or n["model"]]
    assert len(with_ids) >= 30
    assert any(n["serial_ranges"] for n in mapped)
    assert any(n["batches"] for n in mapped)


def test_brand_fallbacks() -> None:
    assert cpsc.clean_company("Char-Broil LLC, of Columbus, Georgia") == "Char-Broil LLC"
    assert cpsc.clean_company("SFactor, of China") == "SFactor"
    assert cpsc.clean_company("Hayward Industries, Inc., of Charlotte, North Carolina") == (
        "Hayward Industries, Inc."
    )
    assert cpsc.brand_from_product_name("Jerify Magnetic Humanoid Toy Sets") == "Jerify Magnetic"
    assert cpsc.brand_from_product_name("JKMAX Heated Blankets") == "JKMAX Heated"
    assert cpsc.brand_from_product_name("Generac portable generators") == "Generac"
    base = {
        "RecallID": 1,
        "Title": "T",
        "Description": "",
        "URL": "https://cpsc.gov/x",
        "RecallDate": "2026-01-02T00:00:00",
        "Products": [{"Name": "Acme Widgets", "Model": "W-1"}, {"Name": "", "Model": "W-2"}],
    }
    n = cpsc.map_recall(base)
    assert n["brand"] == "Acme Widgets" and n["model"] == "W-1; W-2"
    assert n["remedy"] is None and n["hazard_or_failed_test"] == ""
    n = cpsc.map_recall({**base, "Distributors": [{"Name": "Dist Co, of Ohio"}]})
    assert n["brand"] == "Dist Co"
    n = cpsc.map_recall({**base, "Products": []})
    assert n["brand"] == "unknown" and n["product"] == "T"


def test_ingest_skips_bad_records_without_raising() -> None:
    good = {
        "RecallID": 7,
        "Title": "Good",
        "Description": "batch code 0925",
        "URL": "https://cpsc.gov/g",
        "RecallDate": "2026-03-04T00:00:00",
        "Products": [{"Name": "Acme Kettle"}],
    }
    counts = cpsc.ingest([good, {"RecallID": 8, "Title": "no date"}, "not a dict"])
    assert counts["created"] == 1 and counts["upserted"] == 1 and counts["skipped"] == 2
    assert notices.read_meta("cpsc") is None  # ingest() does not touch meta; poll() does


def test_handler_is_idempotent_and_writes_meta() -> None:
    first = cpsc.handler({}, None)
    assert first["source"] == "cpsc" and first["degraded"] is False
    assert first["fetched"] == 451 and first["upserted"] == 451 and first["created"] == 451
    assert first["skipped"] == 0 and "error" not in first and first["took_ms"] >= 0

    second = cpsc.handler({}, None)
    assert second["fetched"] == 451 and second["unchanged"] == 451 and second["upserted"] == 0

    meta = notices.read_meta("cpsc")
    assert meta["pk"] == "meta#cpsc" and meta["degraded"] is False
    assert meta["last_success_at"] and meta["last_error"] is None
    assert meta["last_counts"]["fetched"] == 451 and meta["window"]["end"]


def test_upstream_failure_is_degraded_and_keeps_last_success(monkeypatch) -> None:
    monkeypatch.setattr(cpsc, "fetch_json", lambda url, **kw: [])
    ok = cpsc.poll(today=dt.date(2026, 9, 18))
    assert ok["degraded"] is False and ok["fetched"] == 0
    earlier = notices.read_meta("cpsc")["last_success_at"]

    def boom(url, **kw):
        raise UpstreamError(f"{url}: HTTP 503 after retries")

    monkeypatch.setattr(cpsc, "fetch_json", boom)
    monkeypatch.setattr(notices, "now_iso", lambda: "2030-01-01T00:00:00Z")
    out = cpsc.handler({}, None)
    assert out["degraded"] is True and out["fetched"] == 0 and out["upserted"] == 0
    assert "UpstreamError" in out["error"] and "503" in out["error"]

    meta = notices.read_meta("cpsc")
    assert meta["degraded"] is True and "503" in meta["last_error"]
    assert meta["last_success_at"] == earlier
    assert meta["last_run_at"] == "2030-01-01T00:00:00Z"


def test_handler_never_raises(monkeypatch) -> None:
    def crash(**kw):
        raise RuntimeError("boom")

    monkeypatch.setattr(cpsc, "poll", crash)
    out = cpsc.handler({"days": "nope"}, None)
    assert out["degraded"] is True and "RuntimeError" in out["error"]

"""pollers.cdsco_portal: newest-month poll, explicit months, idempotency, meta, failures."""

from __future__ import annotations

import pytest

from common import cdsco, dynamo
from common.brands import brand_key
from common.demo_mode import UpstreamError
from common.notices import is_meta, read_meta
from pollers import cdsco_portal


def _stored_notices() -> list[dict]:
    return [n for n in dynamo.scan_all("notices", limit=10_000) if not is_meta(n)]


def test_constants() -> None:
    assert cdsco_portal.SOURCE == "cdsco_nsq" == cdsco.SOURCE
    assert cdsco_portal.ADAPTER == "cdsco_portal"
    assert cdsco_portal.META_SOURCE == "cdsco_portal"


def test_fetch_month_uses_the_portal_fixture() -> None:
    assert len(cdsco_portal.fetch_month("mar-2026")) == 190
    assert len(cdsco_portal.fetch_month("JUL-2026")) == 239


def test_handler_default_polls_newest_month() -> None:
    out = cdsco_portal.handler({}, None)
    assert out["source"] == "cdsco_nsq" and out["adapter"] == "cdsco_portal"
    assert out["months"] == ["JUL-2026"]
    assert out["rows"] == {"JUL-2026": 239}
    assert out["fetched"] == 239 and out["upserted"] == 239 and out["created"] == 239
    assert out["unchanged"] == 0 and out["skipped"] == 0
    assert out["degraded"] is False and "error" not in out and "took_ms" in out

    stored = _stored_notices()
    assert len(stored) == 239
    for n in stored:
        assert n["source"] == "cdsco_nsq" and n["adapter"] == "cdsco_portal"
        assert n["batches"] and n["batches"][0]
        assert n["product"] and n["title"].startswith(n["product"])
        assert "failed CDSCO quality test" in n["title"]
        assert ("recall" + "ed") not in n["title"].lower()
        assert n["published_at"] == "2026-07-01"
        assert n["brand_lc"] == (
            brand_key(n["brand"]) or "unknown"
        )  # P05b: key, not raw lower-case
        assert n["row_ref"]["month"] == "JUL-2026"
        assert n["first_seen_at"] and n["updated_at"]


def test_handler_explicit_months_then_unchanged() -> None:
    out = cdsco_portal.handler({"months": ["MAR-2026", "JUL-2026"]}, None)
    assert out["months"] == ["MAR-2026", "JUL-2026"]
    assert out["rows"] == {"MAR-2026": 190, "JUL-2026": 239}
    assert out["fetched"] == 429 and out["created"] == 429 and out["upserted"] == 429
    assert out["degraded"] is False
    assert len(_stored_notices()) == 429

    again = cdsco_portal.handler({"months": ["mar-2026", " jul-2026 "]}, None)
    assert again["months"] == ["MAR-2026", "JUL-2026"]
    assert again["fetched"] == 429 and again["unchanged"] == 429 and again["upserted"] == 0
    assert len(_stored_notices()) == 429

    single = cdsco_portal.handler({"months": "MAR-2026"}, None)
    assert single["months"] == ["MAR-2026"] and single["unchanged"] == 190


def test_meta_records_months_and_rows() -> None:
    cdsco_portal.handler({"months": ["MAR-2026"]}, None)
    meta = read_meta("cdsco_portal")
    assert meta is not None and meta["pk"] == "meta#cdsco_portal"
    assert meta["degraded"] is False and meta["last_error"] is None
    assert meta["last_success_at"] == meta["last_run_at"]
    assert meta["months"] == ["MAR-2026"] and meta["rows"] == {"MAR-2026": 190}
    assert meta["adapter"] == "cdsco_portal"
    assert meta["last_counts"]["fetched"] == 190 and meta["last_counts"]["upserted"] == 190
    # meta rows never show up as notices
    assert not any(n["pk"].startswith("meta#") for n in _stored_notices())


def test_upstream_failure_is_degraded_with_meta_error(monkeypatch: pytest.MonkeyPatch) -> None:
    ok = cdsco_portal.handler({"months": ["MAR-2026"]}, None)
    assert ok["degraded"] is False
    last_success = read_meta("cdsco_portal")["last_success_at"]

    def boom(url, **kwargs):
        raise UpstreamError(f"{url}: HTTP 503")

    monkeypatch.setattr(cdsco, "fetch_json", boom)
    out = cdsco_portal.handler({}, None)  # newest_month() itself fails
    assert out["degraded"] is True and "HTTP 503" in out["error"]
    assert out["fetched"] == 0 and out["months"] == []
    meta = read_meta("cdsco_portal")
    assert meta["degraded"] is True and "HTTP 503" in meta["last_error"]
    assert meta["last_success_at"] == last_success  # kept from the good run

    out = cdsco_portal.handler({"months": ["MAR-2026", "JUL-2026"]}, None)
    assert out["degraded"] is True and len(out["errors"]) == 2
    assert out["errors"][0]["month"] == "MAR-2026" and "UpstreamError" in out["errors"][0]["error"]
    assert out["months"] == [] and out["fetched"] == 0
    assert len(_stored_notices()) == 190  # earlier notices untouched


def test_one_bad_month_does_not_sink_the_others(monkeypatch: pytest.MonkeyPatch) -> None:
    real = cdsco.fetch_json

    def flaky(url, **kwargs):
        if "month=MAR-2026" in url:
            raise UpstreamError("HTTP 502")
        return real(url, **kwargs)

    monkeypatch.setattr(cdsco, "fetch_json", flaky)
    out = cdsco_portal.poll(["MAR-2026", "JUL-2026"])
    assert out["degraded"] is True
    assert out["errors"] == [{"month": "MAR-2026", "error": "UpstreamError: HTTP 502"}]
    assert out["months"] == ["JUL-2026"] and out["rows"] == {"JUL-2026": 239}
    assert out["fetched"] == 239 and out["upserted"] == 239


def test_ingest_month_skips_a_bad_row(monkeypatch: pytest.MonkeyPatch) -> None:
    from common import notices as notices_mod

    real = cdsco_portal.upsert_notice
    calls = {"n": 0}

    def flaky_upsert(notice, **kwargs):
        calls["n"] += 1
        if calls["n"] == 3:
            raise RuntimeError("table hiccup")
        return real(notice, **kwargs)

    monkeypatch.setattr(cdsco_portal, "upsert_notice", flaky_upsert)
    counts = cdsco_portal.ingest_month("MAR-2026")
    assert counts["fetched"] == 190 and counts["skipped"] == 1 and counts["created"] == 189
    assert notices_mod.read_meta("cdsco_portal") is None  # ingest_month does no bookkeeping

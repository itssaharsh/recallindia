"""pollers.nhtsa: the 400-with-JSON rule, fixture mapping, watchlist poll, merge, failures."""

from __future__ import annotations

import json

import pytest

from common import demo_mode, dynamo
from common.demo_mode import UpstreamError, fixture_path
from common.notices import is_meta, read_meta
from pollers import nhtsa, watchlist


def _fixture(name: str) -> dict:
    return json.loads(fixture_path("nhtsa", name).read_bytes().decode("utf-8", errors="replace"))


def _stored_notices() -> list[dict]:
    return [n for n in dynamo.scan_all("notices") if not is_meta(n)]


def test_build_url_lower_cases_make_and_model() -> None:
    url = nhtsa.build_url("Jeep", "COMPASS", 2022)
    assert url.startswith(nhtsa.BASE_URL + "?")
    assert "make=jeep" in url and "model=compass" in url and "modelYear=2022" in url


def test_fetch_vehicle_400_with_json_is_zero_results() -> None:
    """Honda City 2024 is the saved HTTP-400 body with ``Count: 0``: an empty list, no error."""
    fixture = _fixture("honda_city_2024.json")
    assert fixture["Count"] == 0 and fixture["results"] == []
    assert nhtsa.fetch_vehicle("honda", "city", 2024) == []
    # any other unrouted tuple gets the same empty literal
    assert nhtsa.fetch_vehicle("maruti", "swift", 2023) == []
    assert nhtsa.count_records(demo_mode.NHTSA_EMPTY) == 0


def test_fetch_vehicle_keeps_only_the_queried_model_year() -> None:
    assert len(nhtsa.fetch_vehicle("jeep", "compass", 2022)) == 4
    assert nhtsa.fetch_vehicle("jeep", "compass", 2023) == []


def test_parse_date_guards_both_formats() -> None:
    assert nhtsa.parse_date("14/04/2022") == "2022-04-14"
    assert nhtsa.parse_date("2022-04-14") == "2022-04-14"
    assert nhtsa.parse_date("2022-04-14T00:00:00") == "2022-04-14"
    with pytest.raises(ValueError):
        nhtsa.parse_date("April 14, 2022")


def test_map_result_jeep_compass_2022() -> None:
    results = _fixture("jeep_compass_2022.json")["results"]
    assert len(results) == 4
    notices = [nhtsa.map_result(r, "jeep", "compass", 2022) for r in results]
    assert len(notices) == 4
    for rec, n in zip(results, notices, strict=True):
        assert n["source"] == "nhtsa"
        assert n["notice_id"] == rec["NHTSACampaignNumber"]
        assert n["pk"] == f"nhtsa#{rec['NHTSACampaignNumber']}"
        assert n["brand"] == "Jeep" and n["brand_lc"] == "jeep"
        assert n["product"] == "Jeep Compass" and n["model"] == "Compass"
        assert n["vehicles"] == [
            {"make": "jeep", "model": "compass", "year_from": 2022, "year_to": 2022}
        ]
        assert n["published_at"] == nhtsa.parse_date(rec["ReportReceivedDate"])
        assert len(n["published_at"]) == 10 and n["published_at"][4] == "-"
        assert n["url"] == f"https://www.nhtsa.gov/recalls?nhtsaId={rec['NHTSACampaignNumber']}"
        assert n["title"].startswith("Jeep Compass: ") and "2022" not in n["title"]
        assert n["hazard_or_failed_test"].startswith(rec["Component"])
        assert len(n["hazard_or_failed_test"]) <= 1000
        assert n["remedy"] == " ".join(rec["Remedy"].split())
        assert rec["Summary"].split()[0] in n["raw_excerpt"] and len(n["raw_excerpt"]) <= 4096
    first = notices[0]
    assert first["notice_id"] == "22V248000" and first["published_at"] == "2022-04-14"
    assert first["title"] == "Jeep Compass: SEATS:FRONT ASSEMBLY:HEAD RESTRAINT"


def test_map_result_is_independent_of_the_queried_year() -> None:
    """Only vehicles[] may differ between years, or every multi-year campaign flaps."""
    rec = _fixture("kia_seltos_2023.json")["results"][0]
    a = nhtsa.map_result({**rec, "ModelYear": "2022"}, "kia", "seltos", 2022)
    b = nhtsa.map_result({**rec, "ModelYear": "2023"}, "kia", "seltos", 2023)
    assert a["vehicles"] != b["vehicles"]
    assert {k: v for k, v in a.items() if k != "vehicles"} == {
        k: v for k, v in b.items() if k != "vehicles"
    }


def test_multi_year_campaign_is_unchanged_on_the_second_pass() -> None:
    results = _fixture("kia_seltos_2023.json")["results"]
    by_year = {y: [{**r, "ModelYear": str(y)} for r in results] for y in (2022, 2023)}
    first = nhtsa.poll(tuples=[])  # nothing yet
    assert first["fetched"] == 0
    p1 = {y: nhtsa.ingest(by_year[y], "kia", "seltos", y) for y in (2022, 2023)}
    assert p1[2022]["created"] == 2 and p1[2023]["updated"] == 2  # second year merges vehicles
    p2 = {y: nhtsa.ingest(by_year[y], "kia", "seltos", y) for y in (2022, 2023)}
    assert all(c["unchanged"] == 2 and c["upserted"] == 0 for c in p2.values())
    stored = dynamo.get("notices", f"nhtsa#{results[0]['NHTSACampaignNumber']}")
    assert [v["year_from"] for v in stored["vehicles"]] == [2022, 2023]
    assert "2022" not in stored["title"] and "2023" not in stored["title"]


def test_map_result_requires_campaign_number() -> None:
    with pytest.raises(ValueError):
        nhtsa.map_result({"Make": "JEEP", "Model": "COMPASS"}, "jeep", "compass", 2022)


def test_poll_default_watchlist_in_demo() -> None:
    out = nhtsa.poll()
    assert out["source"] == "nhtsa"
    assert out["queried"] == 30
    assert out["skipped_no_us_match"] == 14
    assert out["fetched"] == 7  # 4 compass + 2 seltos + 1 venue
    assert out["created"] == 7 and out["upserted"] == 7 and out["unchanged"] == 0
    assert out["skipped"] == 0 and out["errors"] == [] and out["degraded"] is False
    stored = _stored_notices()
    assert len(stored) == 7
    assert {n["brand_lc"] for n in stored} == {"jeep", "kia", "hyundai"}
    assert all(n["vehicles"] for n in stored)

    again = nhtsa.poll()
    assert again["fetched"] == 7 and again["unchanged"] == 7 and again["upserted"] == 0


def test_poll_includes_vehicle_items() -> None:
    dynamo.put(
        "items",
        {
            "pk": "user#v1",
            "item_id": "v1",
            "kind": "vehicle",
            "name": "My Accord",
            "make": "Honda",
            "model": "Accord",
            "year": 2024,
        },
    )
    dynamo.put(
        "items",
        {
            "pk": "user#v2",
            "item_id": "v2",
            "kind": "vehicle",
            "name": "Venue",
            "make": "Hyundai",
            "model": "Venue",
            "year": 2022,
        },  # already in the watchlist -> deduped
    )
    out = nhtsa.poll()
    assert out["queried"] == 31
    assert out["fetched"] == 10  # 7 + 3 accord
    assert any(n["brand_lc"] == "honda" for n in _stored_notices())


def test_handler_writes_meta_and_never_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    out = nhtsa.handler({}, None)
    assert out["source"] == "nhtsa" and out["degraded"] is False
    assert out["fetched"] == 7 and out["queried"] == 30 and "took_ms" in out
    meta = read_meta("nhtsa")
    assert meta is not None and meta["degraded"] is False and meta["last_error"] is None
    assert meta["last_success_at"] and meta["last_counts"]["upserted"] == 7
    assert meta["queried"] == 30 and meta["skipped_no_us_match"] == 14

    def boom(*args, **kwargs):
        raise RuntimeError("scan exploded")

    monkeypatch.setattr(nhtsa, "poll", boom)
    out = nhtsa.handler({}, None)
    assert out["degraded"] is True and "scan exploded" in out["error"]
    assert read_meta("nhtsa")["degraded"] is True
    assert read_meta("nhtsa")["last_success_at"] == meta["last_success_at"]


def test_handler_honours_explicit_vehicles() -> None:
    out = nhtsa.handler({"vehicles": [{"make": "Kia", "model": "Seltos", "year": 2023}]}, None)
    assert out["queried"] == 1 and out["fetched"] == 2 and out["degraded"] is False


def test_ingest_merges_vehicle_years_for_the_same_campaign() -> None:
    results = _fixture("jeep_compass_2022.json")["results"]
    first = nhtsa.ingest(results, "jeep", "compass", 2022)
    assert first["created"] == 4 and first["fetched"] == 4
    second = nhtsa.ingest(results, "jeep", "compass", 2023)
    assert second["updated"] == 4 and second["created"] == 0
    stored = dynamo.get("notices", "nhtsa#22V248000")
    assert stored["vehicles"] == [
        {"make": "jeep", "model": "compass", "year_from": 2022, "year_to": 2022},
        {"make": "jeep", "model": "compass", "year_from": 2023, "year_to": 2023},
    ]
    assert stored["first_seen_at"] and stored["updated_at"] >= stored["first_seen_at"]
    third = nhtsa.ingest(results, "jeep", "compass", 2022)
    assert third["unchanged"] == 4
    assert len(_stored_notices()) == 4


def test_ingest_skips_bad_records() -> None:
    results = _fixture("kia_seltos_2023.json")["results"]
    bad = {**results[0], "NHTSACampaignNumber": "", "ReportReceivedDate": "nope"}
    counts = nhtsa.ingest([bad, results[1]], "kia", "seltos", 2023)
    assert counts["fetched"] == 2 and counts["skipped"] == 1 and counts["created"] == 1


def test_failing_tuple_is_recorded_and_poll_continues(monkeypatch: pytest.MonkeyPatch) -> None:
    real = nhtsa.fetch_json

    def flaky(url, **kwargs):
        if "make=kia" in url and "modelYear=2023" in url:
            raise UpstreamError(f"{url}: HTTP 503")
        return real(url, **kwargs)

    monkeypatch.setattr(nhtsa, "fetch_json", flaky)
    out = nhtsa.poll()
    assert out["degraded"] is True
    assert len(out["errors"]) == 1
    assert out["errors"][0]["make"] == "kia" and out["errors"][0]["year"] == 2023
    assert "UpstreamError" in out["errors"][0]["error"]
    assert out["fetched"] == 5 and out["upserted"] == 5  # compass + venue still landed
    assert out["queried"] == 30
    assert len(_stored_notices()) == 5

    handled = nhtsa.handler({}, None)
    assert handled["degraded"] is True and "HTTP 503" in handled["error"]
    assert handled["unchanged"] == 5
    meta = read_meta("nhtsa")
    assert meta["degraded"] is True and "HTTP 503" in meta["last_error"]
    assert meta["error_count"] == 1


def test_pause_is_skipped_in_demo_and_used_live(monkeypatch: pytest.MonkeyPatch) -> None:
    pauses: list[float] = []
    monkeypatch.setattr(nhtsa, "_sleep", pauses.append)
    monkeypatch.setattr(nhtsa, "fetch_vehicle", lambda make, model, year: [])
    tuples = [("kia", "seltos", 2023), ("kia", "seltos", 2024), ("kia", "seltos", 2024)]
    out = nhtsa.poll(tuples=tuples, pause=0.25)
    assert out["queried"] == 2 and pauses == []  # demo: no sleeping, tuples deduped

    monkeypatch.setenv("DEMO_MODE", "0")
    out = nhtsa.poll(tuples=tuples, pause=0.25)
    assert out["queried"] == 2 and pauses == [0.25]  # between requests only


def test_watchlist_module_is_the_one_the_poller_uses() -> None:
    assert nhtsa.watchlist is watchlist


def test_fetch_vehicle_uses_the_short_request_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict = {}

    def fake(url, **kwargs):
        seen.update(kwargs)
        return demo_mode.NHTSA_EMPTY

    monkeypatch.setattr(nhtsa, "fetch_json", fake)
    assert nhtsa.fetch_vehicle("kia", "seltos", 2023) == []
    assert seen == {"timeout": nhtsa.REQUEST_TIMEOUT, "retries": nhtsa.REQUEST_RETRIES}
    assert nhtsa.TUPLE_BUDGET_MS >= nhtsa.REQUEST_TIMEOUT * nhtsa.REQUEST_RETRIES * 1000


class _Context:
    """Lambda context stand-in: the clock runs down by ``step`` ms per call."""

    def __init__(self, start_ms: int, step: int) -> None:
        self.left = start_ms
        self.step = step

    def get_remaining_time_in_millis(self) -> int:
        self.left -= self.step
        return self.left


def test_poll_stops_before_the_lambda_deadline() -> None:
    tuples = [("kia", "seltos", 2023), ("jeep", "compass", 2022), ("hyundai", "venue", 2022)]
    ctx = _Context(start_ms=nhtsa.TUPLE_BUDGET_MS * 2 + 1000, step=nhtsa.TUPLE_BUDGET_MS)
    out = nhtsa.poll(tuples=tuples, remaining_ms=ctx.get_remaining_time_in_millis)
    assert out["queried"] == 1 and out["deadline_skipped"] == 2
    assert out["fetched"] == 2 and out["created"] == 2  # seltos landed
    assert out["degraded"] is True and len(out["errors"]) == 2
    assert out["errors"][0]["make"] == "jeep" and nhtsa.DEADLINE_ERROR in out["errors"][0]["error"]
    assert len(_stored_notices()) == 2

    plenty = nhtsa.poll(tuples=tuples, remaining_ms=lambda: 10**9)
    assert plenty["queried"] == 3 and plenty["deadline_skipped"] == 0 and not plenty["degraded"]


def test_handler_reads_the_deadline_from_the_context() -> None:
    ctx = _Context(start_ms=nhtsa.TUPLE_BUDGET_MS - 1, step=0)
    out = nhtsa.handler({}, ctx)
    assert out["queried"] == 0 and out["deadline_skipped"] == 30 and out["degraded"] is True
    assert "Lambda deadline" in out["error"]
    meta = read_meta("nhtsa")
    assert meta["degraded"] is True and meta["deadline_skipped"] == 30
    assert nhtsa.handler({}, object())["degraded"] is False  # no context method -> no deadline

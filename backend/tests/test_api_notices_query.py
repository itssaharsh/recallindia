"""GET /v1/notices, /v1/notices/{id}, /v1/diff: source-index query, newest-first, cursor paging.

Seeds the demo store with 239 July + 30 June cdsco_nsq rows, 120 cpsc rows spread over
2026, and 5 internal rows, then pages through the API exactly the way the app will.
"""

from __future__ import annotations

import base64
import json

import pytest

from api import app, notices_query
from common import dynamo

JULY = 239
JUNE = 30
CPSC = 120
ALL_VISIBLE = JULY + JUNE + CPSC


def _event(method: str, path: str, qs: dict | None = None) -> dict:
    return {
        "version": "2.0",
        "routeKey": f"{method} {path}",
        "rawPath": path,
        "queryStringParameters": {k: str(v) for k, v in (qs or {}).items()},
        "requestContext": {"http": {"method": method, "path": path}},
    }


def _get(path: str, qs: dict | None = None) -> tuple[int, dict]:
    out = app.handler(_event("GET", path, qs), None)
    return out["statusCode"], json.loads(out["body"])


def _notice(source: str, nid: str, published: str, **extra) -> dict:
    return {
        "pk": f"{source}#{nid}",
        "source": source,
        "notice_id": nid,
        "title": f"{source} notice {nid}",
        "product": f"Product {nid}",
        "brand": f"Brand {nid[:3]}",
        "brand_lc": f"brand {nid[:3]}",
        "published_at": published,
        "url": "https://example.test/" + nid,
        **extra,
    }


@pytest.fixture
def seeded() -> dict[str, list[dict]]:
    """Write the fixture rows straight into the demo store (one file write at the end)."""
    rows: dict[str, list[dict]] = {"cdsco_nsq": [], "cpsc": []}
    for i in range(JULY):
        rows["cdsco_nsq"].append(_notice("cdsco_nsq", f"JUL-2026-{i:03d}", "2026-07-01"))
    for i in range(JUNE):
        rows["cdsco_nsq"].append(_notice("cdsco_nsq", f"JUN-2026-{i:03d}", "2026-06-01"))
    for i in range(CPSC):
        month = 1 + (i % 9)  # 2026-01 .. 2026-09
        day = 1 + (i % 27)
        rows["cpsc"].append(_notice("cpsc", f"R{i:04d}", f"2026-{month:02d}-{day:02d}"))
    internal = [
        {"pk": "meta#cpsc", "source": "cpsc", "degraded": False},
        {"pk": "meta#cdsco_nsq", "source": "cdsco_nsq", "degraded": False},
        {"pk": "meta#cdsco_pdf", "source": "cdsco_nsq", "degraded": False},
        {"pk": "ingest#run-1", "source": "cdsco_nsq", "step": "extract"},
        {"pk": "ingest#run-2", "source": "cdsco_nsq", "step": "publish"},
    ]
    data = {r["pk"]: r for r in rows["cdsco_nsq"] + rows["cpsc"] + internal}
    dynamo._save("notices", data)
    return rows


def _page_through(qs: dict, *, max_pages: int = 50) -> list[list[dict]]:
    pages, cursor = [], None
    while True:
        params = dict(qs)
        if cursor:
            params["cursor"] = cursor
        status, body = _get("/v1/notices", params)
        assert status == 200, body
        pages.append(body["notices"])
        cursor = body["next_cursor"]
        if cursor is None:
            return pages
        assert len(pages) < max_pages


def _non_increasing(dates: list[str]) -> bool:
    return all(a >= b for a, b in zip(dates, dates[1:], strict=False))


# --- /v1/notices -------------------------------------------------------------------


def test_source_since_pages_100_100_39(seeded):
    pages = _page_through({"source": "cdsco_nsq", "since": "2026-07-01", "limit": 100})
    assert [len(p) for p in pages] == [100, 100, 39]
    pks = [n["pk"] for page in pages for n in page]
    assert len(pks) == len(set(pks)) == JULY
    assert set(pks) == {n["pk"] for n in seeded["cdsco_nsq"] if n["published_at"] >= "2026-07-01"}
    assert all(n["source"] == "cdsco_nsq" for page in pages for n in page)


def test_first_page_shape_and_cursor_is_opaque_base64url(seeded):
    status, body = _get("/v1/notices", {"source": "cdsco_nsq", "since": "2026-07-01"})
    assert status == 200
    assert body["count"] == len(body["notices"]) == 50
    assert body["source"] == "cdsco_nsq" and body["since"] == "2026-07-01"
    cursor = body["next_cursor"]
    assert isinstance(cursor, str) and cursor
    padded = cursor + "=" * (-len(cursor) % 4)
    state = json.loads(base64.urlsafe_b64decode(padded))
    assert state["v"] == 1 and set(state["src"]) == {"cdsco_nsq"}
    assert state["since"] == "2026-07-01" and state["limit"] == 50


def test_newest_first_across_a_mixed_page(seeded):
    status, body = _get("/v1/notices", {"source": "cdsco_nsq", "limit": 100})
    assert status == 200
    dates = [n["published_at"] for n in body["notices"]]
    assert _non_increasing(dates) and dates[0] == "2026-07-01"
    pages = _page_through({"source": "cdsco_nsq", "limit": 100})
    assert [len(p) for p in pages] == [100, 100, 69]
    dates = [n["published_at"] for page in pages for n in page]
    assert _non_increasing(dates) and dates[-1] == "2026-06-01"
    assert dates.count("2026-06-01") == JUNE


def test_limit_default_and_clamp(seeded):
    _, body = _get("/v1/notices", {"source": "cdsco_nsq"})
    assert body["count"] == 50 and body["limit"] == 50
    _, body = _get("/v1/notices", {"source": "cdsco_nsq", "limit": 5000})
    assert body["count"] == 100 and body["limit"] == 100
    _, body = _get("/v1/notices", {"source": "cdsco_nsq", "limit": 7})
    assert body["count"] == 7 and body["next_cursor"]
    status, body = _get("/v1/notices", {"limit": "ten"})
    assert status == 400 and "limit" in body["error"]
    status, body = _get("/v1/notices", {"limit": "0"})
    assert status == 400


def test_bad_cursor_and_bad_since_are_400(seeded):
    status, body = _get("/v1/notices", {"cursor": "not-a-cursor"})
    assert status == 400 and body == {"error": "bad cursor"}
    # a well-formed cursor for a different query (other since) is foreign too
    _, first = _get("/v1/notices", {"source": "cdsco_nsq", "since": "2026-07-01"})
    other_since = {"source": "cdsco_nsq", "since": "2026-06-01", "cursor": first["next_cursor"]}
    status, body = _get("/v1/notices", other_since)
    assert status == 400 and body == {"error": "bad cursor"}
    status, body = _get("/v1/notices", {"source": "cpsc", "cursor": first["next_cursor"]})
    assert status == 400 and body == {"error": "bad cursor"}
    status, body = _get("/v1/notices", {"since": "July 2026"})
    assert status == 400 and "since" in body["error"]
    status, body = _get("/v1/notices", {"since": "2026-7-1"})
    assert status == 400


def test_q_filters_the_page_after_pagination(seeded):
    # 39 of the 239 July rows match (JUL-2026-200..238); all share one published_at, and
    # DynamoDB does not order ties, so only the contract is asserted: every returned row
    # matches, the page is at most `limit`, and the cursor still advances by a full page.
    status, body = _get("/v1/notices", {"source": "cdsco_nsq", "q": "product jul-2026-2"})
    assert status == 200
    assert body["q"] == "product jul-2026-2"
    assert body["count"] == len(body["notices"]) <= 39 < body["limit"] == 50
    assert all("JUL-2026-2" in n["product"] for n in body["notices"])
    assert body["next_cursor"]  # the cursor still advances by a full page
    # following the cursor to the end finds every match exactly once
    seen = [n["pk"] for n in body["notices"]]
    cursor = body["next_cursor"]
    while cursor:
        _, nxt = _get("/v1/notices", {"source": "cdsco_nsq", "q": "jul-2026-2", "cursor": cursor})
        seen.extend(n["pk"] for n in nxt["notices"])
        cursor = nxt["next_cursor"]
    assert len(seen) == len(set(seen)) == 39
    status, body = _get("/v1/notices", {"q": "NOTHING-MATCHES-THIS"})
    assert status == 200 and body["count"] == 0 and body["next_cursor"]


def test_cursor_page_size_wins_and_is_echoed(seeded):
    """A cursor carries the page size it was issued with (its skip arithmetic re-reads the
    same page); a different ?limit is ignored and the response says which size was used."""
    _, first = _get("/v1/notices", {"source": "cdsco_nsq", "limit": 20})
    assert first["count"] == 20 and first["limit"] == 20
    _, second = _get(
        "/v1/notices", {"source": "cdsco_nsq", "limit": 100, "cursor": first["next_cursor"]}
    )
    assert second["count"] == 20 and second["limit"] == 20
    assert not {n["pk"] for n in first["notices"]} & {n["pk"] for n in second["notices"]}
    _, third = _get("/v1/notices", {"source": "cdsco_nsq", "cursor": first["next_cursor"]})
    assert third["notices"] == second["notices"] and third["limit"] == 20


def test_edited_cursor_key_is_400_not_500(seeded):
    _, first = _get("/v1/notices", {"source": "cdsco_nsq", "limit": 10})
    padded = first["next_cursor"] + "=" * (-len(first["next_cursor"]) % 4)
    state = json.loads(base64.urlsafe_b64decode(padded))
    assert set(state["src"]["cdsco_nsq"]["esk"]) == {"pk", "source", "published_at"}
    for esk in (
        {"pk": "x"},
        {"pk": "cdsco_nsq#a", "source": "cpsc", "published_at": "2026-07-01"},
        {"pk": "cpsc#a", "source": "cdsco_nsq", "published_at": "2026-07-01"},
        {"pk": "cdsco_nsq#a", "source": "cdsco_nsq", "published_at": 7},
        {"pk": "cdsco_nsq#a", "source": "cdsco_nsq", "published_at": "2026-07-01", "x": 1},
        [],
    ):
        tampered = json.loads(json.dumps(state))
        tampered["src"]["cdsco_nsq"]["esk"] = esk
        cursor = notices_query.encode_cursor(tampered)
        status, body = _get("/v1/notices", {"source": "cdsco_nsq", "cursor": cursor})
        assert (status, body) == (400, {"error": "bad cursor"}), esk
    tampered = json.loads(json.dumps(state))
    tampered["src"]["cdsco_nsq"]["skip"] = "many"
    status, _ = _get(
        "/v1/notices", {"source": "cdsco_nsq", "cursor": notices_query.encode_cursor(tampered)}
    )
    assert status == 400
    # the untampered cursor still pages
    status, body = _get("/v1/notices", {"source": "cdsco_nsq", "cursor": first["next_cursor"]})
    assert status == 200 and body["count"] == 10


def test_no_source_merges_every_source_newest_first_exactly_once(seeded):
    pages = _page_through({"limit": 50})
    dates = [n["published_at"] for page in pages for n in page]
    assert _non_increasing(dates)
    for page in pages:
        assert _non_increasing([n["published_at"] for n in page])
    pks = [n["pk"] for page in pages for n in page]
    assert len(pks) == len(set(pks)) == ALL_VISIBLE
    expected = {n["pk"] for rows in seeded.values() for n in rows}
    assert set(pks) == expected
    assert not [pk for pk in pks if pk.startswith(("meta#", "ingest#"))]
    # every page but the last is full
    assert all(len(p) == 50 for p in pages[:-1]) and 0 < len(pages[-1]) <= 50


def test_merged_since_across_sources(seeded):
    pages = _page_through({"since": "2026-07-01", "limit": 100})
    rows = [n for page in pages for n in page]
    assert all(n["published_at"] >= "2026-07-01" for n in rows)
    cpsc_expected = [n for n in seeded["cpsc"] if n["published_at"] >= "2026-07-01"]
    assert sum(1 for n in rows if n["source"] == "cpsc") == len(cpsc_expected)
    assert sum(1 for n in rows if n["source"] == "cdsco_nsq") == JULY
    assert _non_increasing([n["published_at"] for n in rows])


def test_list_notices_never_scans(seeded, monkeypatch):
    def boom(*_a, **_k):
        raise AssertionError("list_notices must use the source index, not scan_all")

    monkeypatch.setattr(dynamo, "scan_all", boom)
    status, body = _get("/v1/notices", {"source": "cdsco_nsq", "since": "2026-07-01"})
    assert status == 200 and body["count"] == 50
    status, body = _get("/v1/notices")
    assert status == 200 and body["count"] == 50
    status, body = _get("/v1/diff", {"date": "2026-07-01"})
    assert status == 200
    assert "scan_all" not in app.list_notices.__code__.co_names


def test_empty_store_is_an_empty_page():
    status, body = _get("/v1/notices", {"source": "cdsco_nsq"})
    assert status == 200 and body == {
        "notices": [],
        "count": 0,
        "next_cursor": None,
        "source": "cdsco_nsq",
        "since": None,
        "q": None,
        "limit": 50,
    }


def test_row_count_multiple_of_limit_ends_with_an_empty_page_and_null_cursor():
    """As on DynamoDB a full page always carries a key, so 100 rows / limit 50 answers
    [50, 50, 0]: the third page is empty with ``next_cursor: null`` (README documents it)."""
    data = {}
    for i in range(100):
        n = _notice("cdsco_nsq", f"JUL-2026-{i:03d}", "2026-07-01")
        data[n["pk"]] = n
    dynamo._save("notices", data)
    pages = _page_through({"source": "cdsco_nsq", "limit": 50})
    assert [len(p) for p in pages] == [50, 50, 0]
    pks = [n["pk"] for page in pages for n in page]
    assert len(pks) == len(set(pks)) == 100
    # the merged (no-source) listing has the same shape: the source's key is only known to
    # be exhausted once its empty page is read, so the trailing page is empty as well
    pages = _page_through({"limit": 50})
    assert [len(p) for p in pages] == [50, 50, 0]
    assert len({n["pk"] for page in pages for n in page}) == 100


# --- /v1/notices/{id} -------------------------------------------------------------


def test_get_notice_by_pk_and_by_source_slash_id(seeded):
    status, body = _get("/v1/notices/cdsco_nsq%23JUL-2026-007")
    assert status == 200 and body["pk"] == "cdsco_nsq#JUL-2026-007"
    status, body = _get("/v1/notices/cdsco_nsq/JUL-2026-007")
    assert status == 200 and body["notice_id"] == "JUL-2026-007"
    status, body = _get("/v1/notices/cdsco_nsq%2FJUL-2026-007")
    assert status == 200 and body["notice_id"] == "JUL-2026-007"
    status, body = _get("/v1/notices/cdsco_nsq%23nope")
    assert status == 404 and body["id"] == "cdsco_nsq#nope"
    status, body = _get("/v1/notices/meta%23cpsc")
    assert status == 404
    status, body = _get("/v1/notices/ingest%23run-1")
    assert status == 404


# --- /v1/diff --------------------------------------------------------------------------


def test_diff_counts_and_pagination(seeded):
    status, body = _get("/v1/diff", {"date": "2026-07-01"})
    assert status == 200
    cpsc_expected = sum(1 for n in seeded["cpsc"] if n["published_at"] >= "2026-07-01")
    assert body["counts"]["cdsco_nsq"] == JULY
    assert body["counts"]["cpsc"] == cpsc_expected
    assert body["counts"]["nhtsa"] == 0 and body["counts"]["openfda"] == 0
    assert body["counts"]["total"] == JULY + cpsc_expected
    assert body["date"] == "2026-07-01" and body["count"] == len(body["notices"]) == 50
    assert _non_increasing([n["published_at"] for n in body["notices"]])
    # page through the diff with the same cursor semantics
    seen, cursor, pages = [], body["next_cursor"], 1
    while cursor:
        status, nxt = _get("/v1/diff", {"date": "2026-07-01", "cursor": cursor})
        assert status == 200
        seen.extend(n["pk"] for n in nxt["notices"])
        cursor, pages = nxt["next_cursor"], pages + 1
        assert pages < 20
    pks = [n["pk"] for n in body["notices"]] + seen
    assert len(pks) == len(set(pks)) == body["counts"]["total"]

    status, body = _get("/v1/diff", {"date": "2026-07-01", "source": "cdsco_nsq", "limit": 100})
    assert status == 200 and body["counts"] == {"cdsco_nsq": JULY, "total": JULY}
    assert body["count"] == 100 and body["source"] == "cdsco_nsq"


def test_diff_requires_a_valid_date(seeded):
    status, body = _get("/v1/diff")
    assert status == 400 and "date" in body["error"]
    status, body = _get("/v1/diff", {"date": "yesterday"})
    assert status == 400


# --- cursor helpers ---------------------------------------------------------------------


def test_cursor_roundtrip_and_validation():
    state = notices_query.new_state(["cdsco_nsq"], since="2026-07-01", limit=100)
    state["src"]["cdsco_nsq"]["esk"] = {
        "pk": "cdsco_nsq#x",
        "source": "cdsco_nsq",
        "published_at": "2026-07-01",
    }
    text = notices_query.encode_cursor(state)
    assert "=" not in text
    back = notices_query.decode_cursor(text, sources=["cdsco_nsq"], since="2026-07-01")
    assert back == state
    with pytest.raises(notices_query.BadCursor):
        notices_query.decode_cursor(text, sources=["cpsc"], since="2026-07-01")
    with pytest.raises(notices_query.BadCursor):
        notices_query.decode_cursor(text, sources=["cdsco_nsq"], since=None)
    with pytest.raises(notices_query.BadCursor):
        notices_query.decode_cursor("////", sources=["cdsco_nsq"], since="2026-07-01")
    v2 = notices_query.encode_cursor({**state, "v": 2})
    with pytest.raises(notices_query.BadCursor):
        notices_query.decode_cursor(v2, sources=["cdsco_nsq"], since="2026-07-01")
    assert notices_query.parse_limit(None) == 50
    assert notices_query.parse_limit("100000") == 100
    with pytest.raises(ValueError):
        notices_query.parse_limit("abc")

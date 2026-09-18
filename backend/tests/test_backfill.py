"""scripts/backfill.py: windows per source, cursor resumability, counts and the log format.

The script is imported from its path (it is not a package); every run is ``--mock`` so the
fixtures under ``fixtures/`` and the per-test demo store are the only I/O.
"""

from __future__ import annotations

import datetime as dt
import importlib.util
import json
import logging
import os
import re
import time
from pathlib import Path

import pytest

from common import cdsco, dynamo
from common.notices import read_meta
from pollers import cdsco_portal, cpsc, nhtsa, openfda, watchlist

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "backfill.py"
TODAY = dt.date(2026, 9, 18)
WINDOW_RE = re.compile(
    r"^(?P<source>\S+) (?P<id>\S+): fetched=(?P<fetched>\d+) created=(?P<created>\d+) "
    r"updated=(?P<updated>\d+) unchanged=(?P<unchanged>\d+) skipped=(?P<skipped>\d+)$"
)
SUMMARY_RE = re.compile(
    r"^backfill (?P<source>\S+): windows=(?P<windows>\d+) done=(?P<done>\d+) fetched=\d+ "
    r"created=\d+ updated=\d+ unchanged=\d+ skipped=\d+ took=\d+\.\ds$"
)


@pytest.fixture(scope="module")
def backfill():
    spec = importlib.util.spec_from_file_location("backfill_script", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


@pytest.fixture(autouse=True)
def memory_store(monkeypatch: pytest.MonkeyPatch) -> dict[str, dict]:
    """Swap the demo store's per-call JSON file round-trip for an in-memory dict.

    A one-year backfill upserts thousands of notices; ``common.dynamo`` rewrites the whole
    table file on every put, which is fine for the product but O(n^2) here. The upsert logic
    (``get`` -> compare -> ``put``) is exercised unchanged.
    """
    tables: dict[str, dict] = {}
    monkeypatch.setattr(dynamo, "_load", lambda kind: tables.setdefault(kind, {}))
    monkeypatch.setattr(dynamo, "_save", lambda kind, data: tables.__setitem__(kind, data))
    return tables


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch: pytest.MonkeyPatch) -> list[float]:
    """``--mock`` must never sleep between windows."""
    calls: list[float] = []
    monkeypatch.setattr(time, "sleep", lambda s: calls.append(s))
    return calls


def _run(backfill, caplog, *argv: str, cursor: Path) -> tuple[int, list[str], list[str]]:
    caplog.clear()
    with caplog.at_level(logging.INFO, logger="backfill"):
        rc = backfill.main([*argv, "--mock", "--cursor-file", str(cursor), "--today", "2026-09-18"])
    lines = [r.getMessage() for r in caplog.records]
    windows = [ln for ln in lines if WINDOW_RE.match(ln)]
    return rc, lines, windows


def _month_ids(start: dt.date, end: dt.date) -> list[str]:
    ids = []
    cur = start.replace(day=1)
    while cur <= end:
        ids.append(cur.strftime("%Y-%m"))
        cur = (cur.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    return ids


# --- helpers ---------------------------------------------------------------------------


def test_month_windows_and_years_ago(backfill) -> None:
    assert backfill.years_ago(dt.date(2028, 2, 29), 1) == dt.date(2027, 2, 28)
    windows = backfill.month_windows(dt.date(2025, 9, 18), TODAY)
    assert [w[0] for w in windows] == _month_ids(dt.date(2025, 9, 1), TODAY)
    assert windows[0][1:] == (dt.date(2025, 9, 1), dt.date(2025, 9, 30))
    assert windows[-1][1:] == (dt.date(2026, 9, 1), TODAY)  # last window ends today
    assert len(windows) in (12, 13)


# --- cpsc --------------------------------------------------------------------------------


def test_cpsc_one_year_mock(backfill, caplog, tmp_path: Path, no_sleep) -> None:
    cursor = tmp_path / "cpsc.json"
    rc, lines, windows = _run(backfill, caplog, "--source", "cpsc", "--years", "1", cursor=cursor)
    assert rc == 0
    assert len(windows) in (12, 13)
    first = WINDOW_RE.match(windows[0])
    assert first["source"] == "cpsc" and first["id"] == "2025-09"
    assert int(first["fetched"]) == 451 and int(first["created"]) == 451
    for line in windows[1:]:  # the fixture repeats for every window: idempotent, no writes
        m = WINDOW_RE.match(line)
        assert int(m["fetched"]) == 451 and int(m["unchanged"]) == 451
        assert int(m["created"]) == 0 and int(m["updated"]) == 0
    summary = [ln for ln in lines if SUMMARY_RE.match(ln)]
    assert len(summary) == 1
    s = SUMMARY_RE.match(summary[0])
    assert s["source"] == "cpsc" and s["windows"] == s["done"] == str(len(windows))
    assert no_sleep == []

    data = json.loads(cursor.read_text())
    assert data["source"] == "cpsc" and data["years"] == 1
    assert data["done"] == _month_ids(dt.date(2025, 9, 1), TODAY)
    assert data["counts"]["created"] == 451 and data["started_at"] and data["updated_at"]

    notices = [n for n in dynamo.scan_all("notices", limit=10_000) if n["pk"].startswith("cpsc#")]
    assert len(notices) == 451
    meta = read_meta("cpsc")
    assert meta and meta["degraded"] is False and meta["backfill"]["done"] == len(windows)
    assert meta["backfill"]["created"] == 451 and meta["last_counts"]["fetched"] == 451 * len(
        windows
    )


def test_cpsc_resumes_after_failed_window(
    backfill, caplog, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    cursor = tmp_path / "cpsc.json"
    calls = {"n": 0}
    real_fetch = cpsc.fetch_window

    def flaky(start, end=None):
        calls["n"] += 1
        if calls["n"] == 3:
            raise RuntimeError("upstream 503 after retries")
        return real_fetch(start, end)

    monkeypatch.setattr(cpsc, "fetch_window", flaky)
    rc, lines, windows = _run(backfill, caplog, "--source", "cpsc", "--years", "1", cursor=cursor)
    assert rc == 1
    expected = _month_ids(dt.date(2025, 9, 1), TODAY)
    assert len(windows) == len(expected) - 1  # the run continued past the failure
    assert any("2025-11: failed RuntimeError" in ln for ln in lines)
    data = json.loads(cursor.read_text())
    assert data["done"][:2] == expected[:2] and "2025-11" not in data["done"]
    assert len(data["done"]) == len(expected) - 1
    meta = read_meta("cpsc")
    assert meta["degraded"] is True and "2025-11" in meta["last_error"]

    # rerun without --reset: only the failed window runs
    monkeypatch.setattr(cpsc, "fetch_window", real_fetch)
    rc, lines, windows = _run(backfill, caplog, "--source", "cpsc", "--years", "1", cursor=cursor)
    assert rc == 0
    assert [WINDOW_RE.match(w)["id"] for w in windows] == ["2025-11"]
    assert int(WINDOW_RE.match(windows[0])["unchanged"]) == 451
    data = json.loads(cursor.read_text())
    assert sorted(data["done"]) == expected
    assert read_meta("cpsc")["degraded"] is False

    # --reset ignores the cursor: every window runs again
    rc, lines, windows = _run(
        backfill, caplog, "--source", "cpsc", "--years", "1", "--reset", cursor=cursor
    )
    assert rc == 0 and len(windows) == len(expected)
    assert json.loads(cursor.read_text())["done"] == expected


def test_cursor_for_other_source_is_ignored(backfill, tmp_path: Path) -> None:
    path = tmp_path / "c.json"
    path.write_text(json.dumps({"source": "nhtsa", "done": ["x"], "counts": {}}))
    cur = backfill.load_cursor(path, "cpsc", 1, reset=False)
    assert cur["source"] == "cpsc" and cur["done"] == []
    path.write_text("{not json")
    assert backfill.load_cursor(path, "cpsc", 1, reset=False)["done"] == []


# --- cdsco_portal ------------------------------------------------------------------------


def test_cdsco_portal_one_year_mock(backfill, caplog, tmp_path: Path, no_sleep) -> None:
    cursor = tmp_path / "cdsco.json"
    rc, lines, windows = _run(
        backfill, caplog, "--source", "cdsco_portal", "--years", "1", cursor=cursor
    )
    assert rc == 0
    expected = cdsco.months_since(dt.date(2025, 9, 18), today=TODAY)
    assert expected == ["SEP-2025", "OCT-2025", "NOV-2025", "DEC-2025"] + [
        f"{m}-2026" for m in ("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL")
    ]
    ids = [WINDOW_RE.match(w)["id"] for w in windows]
    assert ids == expected
    for line in windows:
        m = WINDOW_RE.match(line)
        assert m["source"] == "cdsco_portal"
        assert int(m["fetched"]) == (190 if m["id"] == "MAR-2026" else 239)
        assert int(m["created"]) == int(m["fetched"])  # distinct notice ids per month
    assert json.loads(cursor.read_text())["done"] == expected
    assert no_sleep == []
    meta = read_meta(cdsco_portal.META_SOURCE)
    assert meta and meta["pk"] == "meta#cdsco_portal" and meta["degraded"] is False
    assert meta["backfill"]["windows"] == len(expected)
    stored = [n for n in dynamo.scan_all("notices", limit=10_000) if n["pk"].startswith("cdsco")]
    assert len(stored) == 239 * 10 + 190
    assert all(n["adapter"] == "cdsco_portal" for n in stored)
    assert not any("recalled" in n["title"].lower() for n in stored)


# --- nhtsa ------------------------------------------------------------------------------


def test_nhtsa_two_years_mock(backfill, caplog, tmp_path: Path, no_sleep) -> None:
    cursor = tmp_path / "nhtsa.json"
    rc, lines, windows = _run(backfill, caplog, "--source", "nhtsa", "--years", "2", cursor=cursor)
    assert rc == 0
    tuples = watchlist.expand(years=range(2025, 2027))
    assert len(tuples) == 6 * 2
    ids = [WINDOW_RE.match(w)["id"] for w in windows]
    assert ids == [f"{m}/{mo}/{y}" for m, mo, y in tuples]
    assert all(WINDOW_RE.match(w)["source"] == "nhtsa" for w in windows)
    # the fixtures hold 2022/2023 model years and fetch_vehicle keeps only the queried year,
    # so a 2025-2026 backfill sees the documented empty answers everywhere: zero, not an error
    assert all(int(WINDOW_RE.match(w)["fetched"]) == 0 for w in windows)
    assert json.loads(cursor.read_text())["done"] == ids
    assert read_meta(nhtsa.SOURCE)["degraded"] is False
    assert no_sleep == []


def test_nhtsa_five_years_reaches_fixture_years(backfill, caplog, tmp_path: Path) -> None:
    cursor = tmp_path / "nhtsa.json"
    rc, _, windows = _run(backfill, caplog, "--source", "nhtsa", "--years", "5", cursor=cursor)
    assert rc == 0 and len(windows) == 6 * 5  # 2022..2026
    fetched = {WINDOW_RE.match(w)["id"]: int(WINDOW_RE.match(w)["fetched"]) for w in windows}
    assert fetched["hyundai/venue/2022"] == 1 and fetched["kia/seltos/2023"] == 2
    assert fetched["jeep/compass/2022"] == 4 and fetched["toyota/camry/2022"] == 0
    assert fetched["hyundai/venue/2023"] == 0  # other years of a routed pair: filtered out
    stored = [n for n in dynamo.scan_all("notices", limit=10_000) if n["pk"].startswith("nhtsa#")]
    assert len(stored) == 1 + 2 + 4
    assert {v["year_from"] for n in stored for v in n["vehicles"]} == {2022, 2023}
    assert read_meta(nhtsa.SOURCE)["backfill"]["created"] == 7


# --- openfda ----------------------------------------------------------------------------


def test_openfda_one_year_mock(backfill, caplog, tmp_path: Path, no_sleep) -> None:
    cursor = tmp_path / "openfda.json"
    rc, lines, windows = _run(
        backfill, caplog, "--source", "openfda", "--years", "1", cursor=cursor
    )
    assert rc == 0
    months = _month_ids(dt.date(2025, 9, 1), TODAY)
    expected = [f"{kind}:{m}" for m in months for kind in openfda.KINDS]
    ids = [WINDOW_RE.match(w)["id"] for w in windows]
    assert ids == expected and len(ids) == 2 * len(months)
    first_drug = WINDOW_RE.match(windows[0])
    assert first_drug["id"] == f"drug:{months[0]}" and int(first_drug["fetched"]) == 89
    first_device = WINDOW_RE.match(windows[1])
    assert first_device["id"] == f"device:{months[0]}" and int(first_device["fetched"]) == 25
    for line in windows[2:]:
        m = WINDOW_RE.match(line)
        assert int(m["created"]) == 0 and int(m["unchanged"]) == int(m["fetched"])
    assert json.loads(cursor.read_text())["done"] == expected
    assert read_meta(openfda.SOURCE)["backfill"]["windows"] == len(expected)
    assert no_sleep == []


# --- sleep / misc ------------------------------------------------------------------------


def test_sleep_between_windows_when_requested(backfill, caplog, tmp_path: Path, no_sleep) -> None:
    cursor = tmp_path / "cpsc.json"
    rc, _, windows = _run(
        backfill, caplog, "--source", "cpsc", "--years", "1", "--sleep", "0.5", cursor=cursor
    )
    assert rc == 0
    assert no_sleep == [0.5] * (len(windows) - 1)  # between windows, never after the last


def test_parser_defaults(backfill, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("STACK_NAME", raising=False)
    monkeypatch.delenv("AWS_PROFILE", raising=False)
    args = backfill.build_parser().parse_args(["--source", "cpsc"])
    assert args.years == 5 and args.sleep is None and args.stack == "recallindia"
    assert args.profile == "firstcommit"
    assert args.cursor_file is None and not args.mock and not args.reset
    monkeypatch.setenv("AWS_PROFILE", "other")
    assert backfill.build_parser().parse_args(["--source", "cpsc"]).profile == "other"
    assert backfill.default_cursor_path("cpsc").as_posix().endswith(".backfill/cpsc.json")
    with pytest.raises(SystemExit):
        backfill.build_parser().parse_args(["--source", "cdsco_nsq"])


# --- failure modes that must not look like success ---------------------------------------


def test_window_with_every_record_skipped_is_failed(
    backfill, caplog, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A dead table makes every upsert raise; the pollers count that as skipped, not an error."""
    cursor = tmp_path / "cpsc.json"

    def dead_get(kind, pk):
        raise RuntimeError("ResourceNotFoundException: table recallindia-notices not found")

    monkeypatch.setattr(dynamo, "get", dead_get)
    rc, lines, windows = _run(backfill, caplog, "--source", "cpsc", "--years", "1", cursor=cursor)
    assert rc == 1 and windows == []  # no window line: none succeeded
    failed = [ln for ln in lines if "every record was skipped" in ln]
    assert len(failed) in (12, 13) and "skipped=451" in failed[0]
    assert not cursor.exists() or json.loads(cursor.read_text())["done"] == []
    assert any("window(s) failed, rerun to retry" in ln for ln in lines)


def test_live_run_without_tables_stops_before_any_window(
    backfill, caplog, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import sys
    import types

    class _Client:
        def describe_stacks(self, **kw):
            raise RuntimeError("Unable to locate credentials")

    fake_boto3 = types.SimpleNamespace(client=lambda *a, **kw: _Client())
    monkeypatch.setitem(sys.modules, "boto3", fake_boto3)
    monkeypatch.delenv("NOTICES_TABLE", raising=False)
    monkeypatch.setenv("DEMO_MODE", "1")  # inherited from .env: must not turn the run into mock
    cursor = tmp_path / "cpsc.json"
    caplog.clear()
    with caplog.at_level(logging.INFO, logger="backfill"):
        rc = backfill.main(
            ["--source", "cpsc", "--years", "1", "--cursor-file", str(cursor), "--profile", "p1"]
        )
    assert rc == 2 and not cursor.exists()
    assert os.environ["DEMO_MODE"] == "0" and os.environ["AWS_PROFILE"] == "p1"
    messages = [r.getMessage() for r in caplog.records]
    assert any("could not read the outputs of stack" in m and "firstcommit" in m for m in messages)
    assert not any(WINDOW_RE.match(m) for m in messages)

    monkeypatch.setenv("NOTICES_TABLE", "recallindia-notices-123")
    assert backfill.resolve_tables("recallindia") == "recallindia-notices-123"


def test_openfda_windows_pass_the_sleep_to_the_pager(
    backfill, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: list[float] = []
    real = openfda.fetch_window

    def spy(kind, start, end, **kw):
        seen.append(kw.get("pause"))
        return real(kind, start, end, **kw)

    monkeypatch.setattr(openfda, "fetch_window", spy)
    windows = backfill.openfda_windows(1, TODAY, sleep_s=0.7)
    windows[0].run()
    assert seen == [0.7]

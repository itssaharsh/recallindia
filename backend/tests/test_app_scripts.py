"""scripts/gen_ui_fixtures.py + scripts/amplify_deploy.py: no network, no credentials.

The demo manifest only works if its keys are byte-identical to the paths the app requests, so
the query order and ``encodeURIComponent`` encoding are pinned against app/src/lib/api.ts.
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
import zipfile
from io import BytesIO
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


fixtures = _load("gen_ui_fixtures")
amplify = _load("amplify_deploy")


# --- gen_ui_fixtures: keys match the client ----------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (
            "cdsco_nsq#JUL-2026-cdsco_portal-b75cfffe3713",
            "cdsco_nsq%23JUL-2026-cdsco_portal-b75cfffe3713",
        ),
        ("eyJwayI6ICJ4In0=", "eyJwayI6ICJ4In0%3D"),
        ("a+b/c", "a%2Bb%2Fc"),
        ("keep!~*'()._-", "keep!~*'()._-"),  # encodeURIComponent leaves these alone
        ("two words", "two%20words"),
        ("डोलो", "%E0%A4%A1%E0%A5%8B%E0%A4%B2%E0%A5%8B"),
    ],
)
def test_enc_matches_encode_uri_component(value: str, expected: str) -> None:
    assert fixtures.enc(value) == expected


def test_query_uses_the_client_key_order_and_skips_empty_values() -> None:
    assert fixtures.query(limit=50) == "?limit=50"
    assert fixtures.query(source="cdsco_nsq", limit=50) == "?source=cdsco_nsq&limit=50"
    assert (
        fixtures.query(cursor="c=", limit=50, source="cpsc") == "?source=cpsc&limit=50&cursor=c%3D"
    )
    assert fixtures.query(source=None, q="", limit=50, cursor=None) == "?limit=50"
    assert fixtures.query() == ""


class FakeRecorder(fixtures.Recorder):
    """Serves canned pages instead of the network."""

    def __init__(self, pages: dict[str, dict]) -> None:
        super().__init__("https://api.example")
        self.pages = pages
        self.asked: list[str] = []

    def get(self, path: str) -> dict:
        self.asked.append(path)
        body = self.pages[path]
        self.record(path, body)
        return body


def test_notices_follow_the_cursor_and_end_load_more_where_the_recording_ends() -> None:
    rec = FakeRecorder(
        {
            "/v1/notices?limit=50": {"notices": [1], "next_cursor": "p2"},
            "/v1/notices?limit=50&cursor=p2": {"notices": [2], "next_cursor": "p3"},
        }
    )
    rec.notices(None, 2)
    assert rec.asked == ["/v1/notices?limit=50", "/v1/notices?limit=50&cursor=p2"]
    assert rec.bodies["GET /v1/notices?limit=50"]["next_cursor"] == "p2"
    assert rec.bodies["GET /v1/notices?limit=50&cursor=p2"] == {"notices": [2], "next_cursor": None}


def test_notices_stop_early_when_the_api_runs_out() -> None:
    rec = FakeRecorder({"/v1/notices?source=nhtsa&limit=50": {"notices": [], "next_cursor": None}})
    rec.notices("nhtsa", 3)
    assert rec.asked == ["/v1/notices?source=nhtsa&limit=50"]


def test_record_all_fetches_each_case_and_its_notice_once() -> None:
    notice_pk = "cdsco_nsq#JUL-2026-cdsco_portal-b75cfffe3713"
    case = {"case_id": "c1", "notice_id": notice_pk, "decision": "alert"}
    pages = {
        "/v1/stats": {"sources": [{"source": "cpsc"}]},
        "/v1/notices?limit=50": {"notices": [], "next_cursor": None},
        "/v1/notices?source=cpsc&limit=50": {"notices": [], "next_cursor": None},
        "/items": {
            "items": [
                {"item_id": "demo-alert", "case_id": "c1"},
                {"item_id": "demo-twin", "case_id": "c2"},
                {"item_id": "demo-clear-01", "case_id": None},
            ]
        },
        "/items/demo-alert": {"item_id": "demo-alert", "case": case},
        "/items/demo-twin": {"item_id": "demo-twin", "case": {**case, "case_id": "c2"}},
        "/v1/notices/cdsco_nsq%23JUL-2026-cdsco_portal-b75cfffe3713": {"pk": notice_pk},
    }
    fixtures_recorder = FakeRecorder(pages)
    original = fixtures.Recorder
    fixtures.Recorder = lambda _url: fixtures_recorder  # type: ignore[assignment]
    try:
        rec = fixtures.record_all("https://api.example", 1)
    finally:
        fixtures.Recorder = original
    assert rec.asked.count("/v1/notices/cdsco_nsq%23JUL-2026-cdsco_portal-b75cfffe3713") == 1
    assert "/items/demo-clear-01" not in rec.asked  # no case: the wall never asks for it


def test_write_replaces_stale_files_and_indexes_every_response(tmp_path: Path) -> None:
    (tmp_path / "stale.json").write_text("{}")
    rec = fixtures.Recorder("https://api.example/")
    rec.record("/v1/stats", {"total": 1})
    rec.record("/v1/notices?limit=50", {"notices": [], "next_cursor": None})
    fixtures.write(rec, tmp_path)
    manifest = json.loads((tmp_path / "manifest.json").read_text())
    assert not (tmp_path / "stale.json").exists()
    assert manifest["_api"] == "https://api.example"
    for key in ("GET /v1/stats", "GET /v1/notices?limit=50"):
        assert json.loads((tmp_path / manifest[key]).read_text()) == rec.bodies[key]


# --- amplify_deploy -----------------------------------------------------------------------------


def test_case_rewrite_comes_first_and_serves_only_ids() -> None:
    case_rule, not_found = amplify.RULES
    assert (case_rule["status"], case_rule["target"]) == ("200", "/case/index.html")
    assert (not_found["source"], not_found["status"]) == ("/<*>", "404-200")
    pattern = re.compile(case_rule["source"][2:-2])  # Amplify writes a regex as </.../>
    assert pattern.match("/case/case-20260919161649-501606")
    assert pattern.match("/case/case-20260919161649-501606/")
    for path in ("/case/", "/case/index.txt", "/case/index.html", "/mine/"):
        assert not pattern.match(path), path


def test_zip_dir_puts_the_export_at_the_zip_root(tmp_path: Path) -> None:
    (tmp_path / "mine").mkdir()
    (tmp_path / "index.html").write_text("<html></html>")
    (tmp_path / "mine" / "index.html").write_text("<html></html>")
    names = zipfile.ZipFile(BytesIO(amplify.zip_dir(tmp_path))).namelist()
    assert sorted(names) == ["index.html", "mine/index.html"]


def test_zip_dir_refuses_a_folder_without_a_build(tmp_path: Path) -> None:
    with pytest.raises(SystemExit, match="app-build"):
        amplify.zip_dir(tmp_path)

"""Fixture routing in demo mode and the live urllib path (with the network monkeypatched)."""

import io
import json
import urllib.error
import urllib.request
from email.message import Message

import pytest

from common import demo_mode
from common.demo_mode import FixtureMissing, UpstreamError, fetch_bytes, fetch_json

PORTAL = "https://cdscoonline.gov.in/CDSCO"


@pytest.mark.parametrize(
    ("url", "check"),
    [
        (
            "https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallDateStart=2026-01-01",
            lambda d: isinstance(d, list) and len(d) == 451,
        ),
        (
            "https://api.nhtsa.gov/recalls/recallsByVehicle?make=honda&model=city&modelYear=2024",
            lambda d: d["Count"] == 0 and d["results"] == [],
        ),
        (
            "https://api.nhtsa.gov/recalls/recallsByVehicle?make=honda&model=accord&modelYear=2024",
            lambda d: len(d["results"]) == 3,
        ),
        (
            "https://api.fda.gov/drug/enforcement.json?sort=report_date:desc&limit=25",
            lambda d: len(d["results"]) == 25,
        ),
        (f"{PORTAL}/publicNsqDrugTable", lambda d: len(d["aaData"]) == 239),
        (
            f"{PORTAL}/filteredNsqDrugTable?month=JUL-2026&source=All&tab=nsq",
            lambda d: len(d["aaData"]) == 239,
        ),
        (
            f"{PORTAL}/filteredNsqDrugTable?month=JUL-2026&source=CDL&tab=nsq",
            lambda d: len(d["aaData"]) == 40,
        ),
        (
            f"{PORTAL}/publicReportingMonths?year=2026&tab=nsq",
            lambda d: d == ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"],
        ),
        (
            f"{PORTAL}/reportingYears?tab=nsq",
            lambda d: d == ["2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"],
        ),
    ],
)
def test_fetch_json_routes_to_fixture(url: str, check) -> None:
    assert check(fetch_json(url))


def test_fetch_bytes_pdf_fixture() -> None:
    listing = "https://cdsco.gov.in/opencms/opencms/en/download_file_division.jsp?num_id=abc"
    direct = "https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2018/UploadAlertsFiles/x.pdf"
    for url in (listing, direct):
        assert fetch_bytes(url).startswith(b"%PDF")


def test_unknown_url_raises_fixture_missing() -> None:
    with pytest.raises(FixtureMissing):
        fetch_json("https://example.com/nothing.json")
    with pytest.raises(FixtureMissing):
        fetch_bytes("https://example.com/nothing.pdf")


def test_demo_literal_is_a_fresh_copy() -> None:
    first = fetch_json(f"{PORTAL}/reportingYears?tab=nsq")
    first.append("2027")
    assert "2027" not in fetch_json(f"{PORTAL}/reportingYears?tab=nsq")


# --- live path (urllib monkeypatched, no network) -------------------------------


class _Response(io.BytesIO):
    """Minimal stand-in for the object returned by ``urllib.request.urlopen``."""

    def __init__(self, body: bytes, charset: str | None = None) -> None:
        super().__init__(body)
        self.headers = Message()
        ctype = "application/json" + (f"; charset={charset}" if charset else "")
        self.headers["Content-Type"] = ctype


def _http_error(url: str, code: int, body: bytes) -> urllib.error.HTTPError:
    headers = Message()
    headers["Content-Type"] = "application/json"
    return urllib.error.HTTPError(url, code, "err", headers, io.BytesIO(body))


def _patch_urlopen(monkeypatch: pytest.MonkeyPatch, handler) -> None:
    """Replace ``urllib.request.urlopen`` with ``handler(request)`` (no network)."""
    monkeypatch.setattr(urllib.request, "urlopen", lambda request, timeout: handler(request))


@pytest.fixture
def live(monkeypatch: pytest.MonkeyPatch) -> list[float]:
    """Switch to the live path and capture backoff sleeps instead of waiting."""
    monkeypatch.setenv("DEMO_MODE", "0")
    slept: list[float] = []
    monkeypatch.setattr(demo_mode, "_sleep", slept.append)
    return slept


def test_http_400_with_json_body_is_returned(monkeypatch: pytest.MonkeyPatch, live) -> None:
    url = "https://api.nhtsa.gov/recalls/recallsByVehicle?make=honda&model=city&modelYear=2024"
    body = b'{"Count":0,"Message":"Results returned successfully","results":[]}'

    def handler(_request):
        raise _http_error(url, 400, body)

    _patch_urlopen(monkeypatch, handler)
    assert fetch_json(url) == json.loads(body)
    assert live == []  # a 400 is not retried


def test_500_then_200_retries_and_succeeds(monkeypatch: pytest.MonkeyPatch, live) -> None:
    url = "https://api.fda.gov/drug/enforcement.json"
    calls: list[str] = []

    def handler(request: urllib.request.Request):
        calls.append(request.get_header("User-agent", ""))
        if len(calls) == 1:
            raise _http_error(url, 500, b"<html>boom</html>")
        return _Response(b'{"results": [1, 2]}', "utf-8")

    _patch_urlopen(monkeypatch, handler)
    assert fetch_json(url) == {"results": [1, 2]}
    assert len(calls) == 2
    assert live == [1.0]
    assert calls[0].startswith("Mozilla/5.0")


def test_non_json_body_after_retries_raises(monkeypatch: pytest.MonkeyPatch, live) -> None:
    url = "https://api.fda.gov/drug/enforcement.json"

    def handler(_request):
        raise _http_error(url, 503, b"unavailable")

    _patch_urlopen(monkeypatch, handler)
    with pytest.raises(UpstreamError):
        fetch_json(url, retries=3)
    assert live == [1.0, 2.0]


def test_cdsco_portal_defaults_to_latin1(monkeypatch: pytest.MonkeyPatch, live) -> None:
    url = f"{PORTAL}/publicNsqDrugTable"
    body = '{"aaData": [{"str_product_name": "Café syrup"}]}'.encode("latin-1")
    _patch_urlopen(monkeypatch, lambda _request: _Response(body))
    assert fetch_json(url)["aaData"][0]["str_product_name"] == "Café syrup"

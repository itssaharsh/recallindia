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


def test_socket_closed_mid_response_is_retried(monkeypatch: pytest.MonkeyPatch, live) -> None:
    """RemoteDisconnected / IncompleteRead / ConnectionResetError are not URLErrors."""
    import http.client

    url = f"{PORTAL}/reportingYears?tab=nsq"
    failures = [
        http.client.RemoteDisconnected("Remote end closed connection without response"),
        http.client.IncompleteRead(b'["20'),
        ConnectionResetError(104, "Connection reset by peer"),
    ]

    def handler(_request):
        if failures:
            raise failures.pop(0)
        return _Response(b'["2025", "2026"]', "utf-8")

    _patch_urlopen(monkeypatch, handler)
    assert fetch_json(url, retries=4) == ["2025", "2026"]
    assert live == [1.0, 2.0, 4.0]


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


# --- P02 routes ------------------------------------------------------------------

NHTSA = "https://api.nhtsa.gov/recalls/recallsByVehicle"
FDA = "https://api.fda.gov"


@pytest.mark.parametrize(
    ("url", "check"),
    [
        (f"{NHTSA}?make=jeep&model=compass&modelYear=2022", lambda d: len(d["results"]) == 4),
        (f"{NHTSA}?make=kia&model=seltos&modelYear=2023", lambda d: len(d["results"]) == 2),
        (f"{NHTSA}?make=hyundai&model=venue&modelYear=2022", lambda d: len(d["results"]) == 1),
        (f"{NHTSA}?make=hyundai&model=creta&modelYear=2024", lambda d: d == demo_mode.NHTSA_EMPTY),
        (f"{NHTSA}?make=maruti&model=swift&modelYear=2021", lambda d: d["Count"] == 0),
        (
            f"{FDA}/device/enforcement.json?sort=report_date:desc&limit=25",
            lambda d: (
                len(d["results"]) == 25
                and d["results"][0]["report_date"] >= d["results"][-1]["report_date"]
            ),
        ),
        (
            f"{FDA}/drug/enforcement.json?search=report_date:[20260819+TO+20260918]"
            "&sort=report_date:desc&limit=100&skip=0",
            lambda d: len(d["results"]) == 89 and d["results"][0]["report_date"] == "20260909",
        ),
        (
            f"{FDA}/drug/enforcement.json?sort=report_date:desc&limit=25",
            lambda d: len(d["results"]) == 25 and d["results"][0]["report_date"] < "2016",
        ),
        (
            f"{PORTAL}/filteredNsqDrugTable?month=MAR-2026&source=All&tab=nsq",
            lambda d: (
                len(d["aaData"]) == 190 and d["aaData"][0]["dt_reporting_month_year"] == "MAR-2026"
            ),
        ),
        (
            f"{PORTAL}/filteredNsqDrugTable?month=DEC-2025&source=All&tab=nsq",
            lambda d: len(d["aaData"]) == 239,
        ),
        (f"{PORTAL}/publicReportingMonths?year=2025&tab=nsq", lambda d: len(d) == 12),
        (f"{PORTAL}/publicReportingMonths?year=2019&tab=nsq", lambda d: d[0] == "Jan"),
        (
            f"{PORTAL}/publicReportingMonths?year=2026&tab=nsq",
            lambda d: d == ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"],
        ),
        (
            "https://www.saferproducts.gov/RestWebServices/Recall?format=json"
            "&RecallDateStart=2021-09-01&RecallDateEnd=2021-09-30",
            lambda d: len(d) == 451,
        ),
    ],
)
def test_p02_routes(url: str, check) -> None:
    assert check(fetch_json(url))


def test_nhtsa_generic_empty_is_a_fresh_dict_each_call() -> None:
    url = f"{NHTSA}?make=tata&model=nexon&modelYear=2022"
    first = fetch_json(url)
    assert first == {"Count": 0, "Message": "Results returned successfully", "results": []}
    first["results"].append({"NHTSACampaignNumber": "X"})
    first["Count"] = 1
    second = fetch_json(url)
    assert second["Count"] == 0 and second["results"] == []
    assert second is not first
    assert demo_mode.NHTSA_EMPTY["results"] == []


def test_latin1_fixture_decodes() -> None:
    """The MAR-2026 capture is saved as served (ISO-8859-1); utf-8 must not be assumed."""
    rows = fetch_json(f"{PORTAL}/filteredNsqDrugTable?month=MAR-2026&source=All&tab=nsq")["aaData"]
    assert all(isinstance(r["str_product_name"], str) for r in rows)
    assert not any("�" in r["str_manufactured_by"] for r in rows)

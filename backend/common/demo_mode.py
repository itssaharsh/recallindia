"""Demo-mode switch and the two HTTP helpers every poller/ingest function must use.

``DEMO_MODE=1`` routes every URL to a saved fixture under ``fixtures/`` (identical response
shape to the live call) so the whole product runs with no network and no AWS credentials.
Live calls use stdlib ``urllib`` with a browser-like User-Agent and exponential backoff.
"""

from __future__ import annotations

import copy
import http.client
import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

_REPO_ROOT = Path(__file__).resolve().parents[2]
_BACKOFF_SECONDS = (1.0, 2.0, 4.0)
_RETRY_STATUSES = frozenset({429}) | frozenset(range(500, 600))
_LATIN1_HOSTS = frozenset({"cdscoonline.gov.in"})
_DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, application/pdf, */*;q=0.8",
}

# Ordered (regex, target). ``target`` is a fixture path relative to ``fixtures_dir()`` or a
# Python literal (list/dict) returned as a deep copy. First match wins, so specific routes go
# first. Regexes match case-insensitively, so make/model names are written lower-case.
_NHTSA = r"api\.nhtsa\.gov/recalls/recallsByVehicle"
_PORTAL = r"cdscoonline\.gov\.in/CDSCO"
_TWELVE_MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
NHTSA_EMPTY = {"Count": 0, "Message": "Results returned successfully", "results": []}

FIXTURE_ROUTES: list[tuple[str, str | list | dict]] = [
    # CPSC: any RecallDateStart/End window -> the 2026 snapshot (451 recalls)
    (r"saferproducts\.gov/RestWebServices/Recall", "cpsc/recent.json"),
    # NHTSA: real results for the US-market names, the documented 400-with-JSON body otherwise
    (_NHTSA + r"\?(?=.*\bmake=honda\b)(?=.*\bmodel=city\b)", "nhtsa/honda_city_2024.json"),
    (_NHTSA + r"\?(?=.*\bmake=honda\b)(?=.*\bmodel=accord\b)", "nhtsa/honda_accord_2024.json"),
    (_NHTSA + r"\?(?=.*\bmake=jeep\b)(?=.*\bmodel=compass\b)", "nhtsa/jeep_compass_2022.json"),
    (_NHTSA + r"\?(?=.*\bmake=kia\b)(?=.*\bmodel=seltos\b)", "nhtsa/kia_seltos_2023.json"),
    (_NHTSA + r"\?(?=.*\bmake=hyundai\b)(?=.*\bmodel=venue\b)", "nhtsa/hyundai_venue_2022.json"),
    (_NHTSA, NHTSA_EMPTY),
    # NHTSA one campaign (the evidence snapshot of a vehicle notice): 24V436000 as served
    (r"api\.nhtsa\.gov/recalls/campaignNumber", "nhtsa/campaign_24V436000.json"),
    # openFDA: the 30-day windowed poll gets the recent snapshot, anything else the P00 one
    (r"api\.fda\.gov/device/enforcement\.json", "openfda/device_enforcement.json"),
    (
        r"api\.fda\.gov/drug/enforcement\.json\?(?=.*search=report_date)",
        "openfda/drug_enforcement_recent.json",
    ),
    (r"api\.fda\.gov/drug/enforcement\.json", "openfda/drug_enforcement.json"),
    # CDSCO portal (served as text/plain ISO-8859-1 live; fixtures may be latin-1 too)
    (_PORTAL + r"/filteredNsqDrugTable\?(?=.*\bsource=CDL\b)", "cdsco/nsq_jul2026_cdl.json"),
    (_PORTAL + r"/filteredNsqDrugTable\?(?=.*\bmonth=MAR-2026\b)", "cdsco/nsq_mar2026_all.json"),
    (_PORTAL + r"/(publicNsqDrugTable|filteredNsqDrugTable)", "cdsco/nsq_jul2026_all.json"),
    (_PORTAL + r"/publicReportingMonths\?(?=.*\byear=2026\b)", _TWELVE_MONTHS[:7]),
    (_PORTAL + r"/publicReportingMonths", _TWELVE_MONTHS),
    (
        _PORTAL + r"/reportingYears",
        ["2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"],
    ),
    # CDSCO archive (cdsco.gov.in): the Alerts listing page (one HTML page, 301 rows), the
    # download_file_division.jsp wrapper (a one-line iframe whose src is the real PDF path,
    # any num_id -> the June 2025 wrapper) and any .pdf under the site -> the June 2025 PDF.
    (r"cdsco\.gov\.in/opencms/opencms/en/Notifications/Alerts", "cdsco/alerts_listing.html"),
    (r"cdsco\.gov\.in.*download_file_division\.jsp", "cdsco/download_file_division_MTI5Mjc.html"),
    (r"cdsco\.gov\.in.*\.pdf(?:[?#].*)?$", "cdsco/nsq_latest.pdf"),
]

# Monkeypatchable in tests so retry paths do not actually wait.
_sleep = time.sleep


class FixtureMissing(Exception):
    """Raised in demo mode when no FIXTURE_ROUTES entry (or fixture file) matches a URL."""


class UpstreamError(Exception):
    """Raised by a live fetch when the upstream service fails after all retries."""


def is_demo() -> bool:
    """True when ``DEMO_MODE=1``; evaluated on every call so tests can flip it."""
    return os.environ.get("DEMO_MODE", "0") == "1"


def fixtures_dir() -> Path:
    """Directory holding saved raw responses (``FIXTURES_DIR`` or ``<repo>/fixtures``)."""
    return Path(os.environ.get("FIXTURES_DIR") or _REPO_ROOT / "fixtures")


def fixture_path(*parts: str) -> Path:
    """Absolute path of a fixture, e.g. ``fixture_path("cdsco", "nsq_latest.pdf")``."""
    return fixtures_dir().joinpath(*parts)


def demo_store_dir() -> Path:
    """Local store used by ``dynamo``/``s3`` in demo mode (``DEMO_STORE_DIR``, gitignored)."""
    return Path(os.environ.get("DEMO_STORE_DIR") or _REPO_ROOT / ".demo_store")


def _route(url: str) -> str | list | dict:
    """Return the fixture target for ``url`` or raise FixtureMissing."""
    for pattern, target in FIXTURE_ROUTES:
        if re.search(pattern, url, flags=re.IGNORECASE):
            return target
    raise FixtureMissing(url)


def _fixture_file(url: str) -> Path:
    """Resolve ``url`` to an existing fixture file (targets that are literals do not qualify)."""
    target = _route(url)
    if not isinstance(target, str):
        raise FixtureMissing(f"{url} routes to a literal, not a file")
    path = fixture_path(*target.split("/"))
    if not path.is_file():
        raise FixtureMissing(f"{url} -> {path} (file not found)")
    return path


def _decode_fixture(url: str, body: bytes) -> str:
    """Fixtures are UTF-8, except raw portal captures saved as served (ISO-8859-1)."""
    try:
        return body.decode("utf-8")
    except UnicodeDecodeError:
        return body.decode(_charset_for(url, None), errors="replace")


def _charset_for(url: str, headers) -> str:
    """Charset from the response headers, else latin-1 for CDSCO's portal, else utf-8."""
    declared = headers.get_content_charset() if headers is not None else None
    if declared:
        return declared
    host = urlsplit(url).hostname or ""
    return "latin-1" if host in _LATIN1_HOSTS else "utf-8"


def _open(url: str, timeout: float, headers: dict | None):
    """Single urllib request with the browser-like default headers merged in."""
    request = urllib.request.Request(url, headers={**_DEFAULT_HEADERS, **(headers or {})})
    return urllib.request.urlopen(request, timeout=timeout)


def _fetch_live(
    url: str, *, timeout: float, headers: dict | None, retries: int, want_json: bool
) -> tuple[bytes, str]:
    """Fetch with backoff. Returns ``(body, charset)``.

    429/5xx, connection errors and timeouts are retried up to ``retries`` attempts -- including
    a socket closed mid-response (``RemoteDisconnected`` / ``IncompleteRead`` /
    ``ConnectionResetError``), which urllib raises outside ``URLError``. Any other HTTP error
    status is returned as-is when ``want_json`` (the caller decides whether the body parses --
    NHTSA returns HTTP 400 with a valid empty JSON body) and raised otherwise.
    """
    attempts = max(1, retries)
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            with _open(url, timeout, headers) as resp:
                return resp.read(), _charset_for(url, resp.headers)
        except urllib.error.HTTPError as err:
            if err.code in _RETRY_STATUSES:
                last_error = err
            elif want_json:
                return err.read(), _charset_for(url, err.headers)
            else:
                raise UpstreamError(f"HTTP {err.code} for {url}") from err
        except (urllib.error.URLError, TimeoutError, http.client.HTTPException, OSError) as err:
            last_error = err
        if attempt < attempts - 1:
            _sleep(_BACKOFF_SECONDS[min(attempt, len(_BACKOFF_SECONDS) - 1)])
    raise UpstreamError(f"{url}: {last_error}") from last_error


def fetch_json(
    url: str, *, timeout: float = 20, headers: dict | None = None, retries: int = 3
) -> dict | list:
    """GET ``url`` and parse JSON; in demo mode return the routed fixture instead.

    Non-200 responses whose body is JSON are returned (NHTSA's HTTP 400 for "no results").
    Raises ``UpstreamError`` when the body is not JSON after retries, ``FixtureMissing`` in
    demo mode when no route matches.
    """
    if is_demo():
        target = _route(url)
        if isinstance(target, (list, dict)):
            return copy.deepcopy(target)
        return json.loads(_decode_fixture(url, _fixture_file(url).read_bytes()))
    body, charset = _fetch_live(
        url, timeout=timeout, headers=headers, retries=retries, want_json=True
    )
    try:
        return json.loads(body.decode(charset, errors="replace"))
    except ValueError as err:
        raise UpstreamError(f"{url}: body is not JSON ({body[:120]!r})") from err


def fetch_bytes(
    url: str, *, timeout: float = 30, headers: dict | None = None, retries: int = 3
) -> bytes:
    """GET ``url`` and return the raw body (PDFs, HTML); demo mode reads the routed fixture."""
    if is_demo():
        return _fixture_file(url).read_bytes()
    body, _ = _fetch_live(url, timeout=timeout, headers=headers, retries=retries, want_json=False)
    return body

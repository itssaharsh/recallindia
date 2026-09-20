"""Smoke test: every Lambda handler imports and answers a dict in DEMO_MODE.

Per-source poller mapping tests live in their own files (test_poller_*.py, P02).
"""

from __future__ import annotations

import importlib
import json
import os

import pytest

HANDLER_MODULES = [
    "pollers.cpsc",
    "pollers.nhtsa",
    "pollers.openfda",
    "pollers.cdsco_portal",
    "ingest.cdsco_fetch",
    "ingest.cdsco_extract",
    "ingest.cdsco_normalise",
    "matcher.candidates",
    "matcher.verify",
    "matcher.range_check",
    "matcher.decide",
    "matcher.notify",
    "matcher.claim",
    "matcher.evidence",
    "api.app",
]


@pytest.fixture(autouse=True)
def _demo_env(monkeypatch, tmp_path):
    monkeypatch.setenv("DEMO_MODE", "1")
    monkeypatch.setenv("DEMO_STORE_DIR", str(tmp_path / "store"))
    monkeypatch.delenv("RAW_BUCKET", raising=False)


def _api_event(method: str, path: str, qs: dict | None = None) -> dict:
    return {
        "version": "2.0",
        "routeKey": f"{method} {path}",
        "rawPath": path,
        "queryStringParameters": qs or {},
        "headers": {"x-household": "hh_test2345"},
        "requestContext": {"http": {"method": method, "path": path}},
    }


def _import_or_skip(module_name: str):
    """Import a handler module; skip only when that module itself is not built yet."""
    try:
        return importlib.import_module(module_name)
    except ModuleNotFoundError as exc:
        if exc.name == module_name:
            pytest.skip(f"{module_name} not built yet")
        raise


# Handlers that cannot do anything useful without input. Keep this list minimal and explicit: a
# poller or ingest step that degrades on an empty event is a real failure and must stay one.
REQUIRES_INPUT = {
    "matcher.candidates",
    "matcher.decide",
    "matcher.notify",
    "matcher.claim",  # P09: no case_id, no letter
    "matcher.evidence",  # P09: no case_id, nothing to seal
}
# matcher.approval is not listed: it raises by design (a task token that was never stored would
# leave the execution paused for 24 h, so WaitForApproval must fail instead) -- see its tests.


@pytest.mark.parametrize("module_name", HANDLER_MODULES)
def test_every_handler_returns_dict(module_name):
    module = _import_or_skip(module_name)
    assert callable(module.handler)
    out = module.handler({}, None)
    assert isinstance(out, dict), module_name  # the never-raise contract, for every handler
    if module_name in REQUIRES_INPUT:
        # real P04 handlers: an empty event has no item / candidates / decision to work on, so the
        # contract is a degraded result that names the problem -- not an exception, not a guess
        assert out.get("degraded") is True, module_name
        assert isinstance(out.get("error"), str) and out["error"], module_name
    else:
        assert not out.get("degraded"), f"{module_name} degraded: {out.get('error')}"


def test_cdsco_fetch_portal():
    from ingest import cdsco_fetch

    # P03: the archive PDF adapter is the default; the P02 portal branch is opt-in.
    out = cdsco_fetch.handler({"adapter": "portal"}, None)
    assert out["adapter"] == "cdsco_portal"
    assert out["month"] == "JUL-2026"
    assert out["rows_in"] == 239


def test_cdsco_fetch_pdf_adapter_stores_bytes():
    from ingest import cdsco_fetch

    out = cdsco_fetch.handler({"adapter": "pdf"}, None)
    assert out["adapter"] == "cdsco_pdf"
    assert out["pdf_s3_key"].startswith("cdsco/")
    assert out["bytes"] > 100_000


def test_cdsco_normalise_portal_rows_to_notices():
    from ingest import cdsco_normalise

    out = cdsco_normalise.handler({}, None)
    assert out["adapter"] == "cdsco_portal"
    assert out["rows_in"] == 239
    assert out["notices_out"] == 239
    assert out["fallback_used"] == {"extract": False, "normalise": True}

    rows = [
        {
            "str_product_name": "Paracetamol Tablets IP 650mg",
            "str_batch_no": "FT5427",
            "dt_manufacturing_date": "Mar-2025",
            "dt_expiry_date": "Feb-2027",
            "str_manufactured_by": "Forgo Pharmaceuticals",
            "str_nsq_result": "Dissolution",
            "str_reporting_source": "CDSCO Lab",
            "str_reported_by_lab_or_state": "CDL, Kolkata",
            "dt_reporting_month_year": "JUL-2026",
        }
    ]
    notices = cdsco_normalise.rows_to_notices(rows, adapter="portal", month="JUL-2026")
    n = notices[0]
    assert n["source"] == "cdsco_nsq" and n["adapter"] == "cdsco_portal"
    key = cdsco_normalise.portal_row_key(
        "Paracetamol Tablets IP 650mg", "FT5427", "Forgo Pharmaceuticals"
    )
    assert n["pk"] == f"cdsco_nsq#JUL-2026-cdsco_portal-{key}" == "cdsco_nsq#" + n["notice_id"]
    assert n["product"] == "Paracetamol Tablets IP 650mg"
    assert n["batches"] == ["FT5427"] and n["brand_lc"] == "forgo pharmaceuticals"
    assert n["published_at"] == "2026-07-01"
    assert n["row_ref"] == {"page": None, "row": 1, "month": "JUL-2026"}
    assert "failed CDSCO quality test" in n["title"] and ("recall" + "ed") not in n["title"]


def test_cdsco_normalise_pdf_rows_header_mapping():
    from ingest import cdsco_normalise

    rows = [
        [
            "S.No",
            "Product/Drug Name",
            "Batch No.",
            "Manufacturing Date",
            "Expiry Date",
            "Manufactured By",
            "NSQ Result",
            "Reported by CDSCO Laboratory",
        ],
        [
            "9.",
            "Calcium Gluconate Injection I.P. 10 ml.",
            "MV24B36",
            "02/2024",
            "01/2026",
            "M/s. Martin & Brown Bio-Sciences Pvt.Ltd., Baddi, HP",
            "Particulate Matter, Extractable Volume and Description",
            "CDL, Kolkata",
        ],
    ]
    notices = cdsco_normalise.rows_to_notices(
        rows,
        adapter="pdf",
        month="JUN-2025",
        pdf_s3_key="cdsco/nsq_latest.pdf",
        url="https://x/y.pdf",
    )
    assert len(notices) == 1
    n = notices[0]
    assert n["adapter"] == "cdsco_pdf" and n["pdf_s3_key"] == "cdsco/nsq_latest.pdf"
    assert n["product"].startswith("Calcium Gluconate") and n["batches"] == ["MV24B36"]
    assert n["brand"] == "Martin & Brown Bio-Sciences Pvt.Ltd." and n["lab"] == "CDL, Kolkata"
    assert n["brand_lc"] == "martin and brown bio-sciences"  # P05b key; display brand intact
    assert "M/s. Martin & Brown Bio-Sciences Pvt.Ltd., Baddi, HP" in n["raw_excerpt"]
    assert n["row_ref"] == {"page": None, "row": 1, "month": None}
    assert n["mfg_date"] == "02/2024" and n["exp_date"] == "01/2026"
    assert n["published_at"] == "2025-06-01"


def test_cdsco_normalise_split_header_and_continuation_rows():
    from ingest import cdsco_normalise

    header = [
        "S.No",
        "Product/Drug Name",
        "Batch No.",
        "Manufact uring Date",
        "Expiry Date",
        "Manufactured By",
        "NSQ Result",
        "Reported by CDSCO Laboratory",
    ]
    assert cdsco_normalise.header_map(header)["mfg_date"] == 3
    rows = [
        header,
        [
            "41.",
            "Ondansetron Injection IP",
            "OI2401",
            "01/2024",
            "12/2025",
            "M/s. Example Pharma, Plot 4,",
            "Assay",
            "RDTL, Guwahati",
        ],
        ["", "", "", "", "", "Ghopa, Amingaon, North Guwahati, Assam-781031", "", ""],
        [
            "42.",
            "Dextrose Injection I.P. 5%w/v",
            "DX99",
            "02/2024",
            "01/2026",
            "M/s. Other Labs",
            "Sterility",
            "CDL, Kolkata",
        ],
    ]
    notices = cdsco_normalise.rows_to_notices(rows, adapter="pdf", month="JUN-2025")
    assert [n["row_ref"]["row"] for n in notices] == [1, 2]
    assert notices[0]["brand"] == "Example Pharma"
    assert "Plot 4, Ghopa, Amingaon, North Guwahati, Assam-781031" in notices[0]["raw_excerpt"]
    assert notices[0]["mfg_date"] == "01/2024"
    assert "Assam-781031" in notices[0]["raw_excerpt"]
    assert notices[1]["batches"] == ["DX99"]


def test_api_health_and_notices():
    from api import app

    health = app.handler(_api_event("GET", "/health"), None)
    assert health["statusCode"] == 200
    assert health["headers"]["access-control-allow-origin"] == "*"
    body = json.loads(health["body"])
    assert body["ok"] is True and body["demo"] is True
    assert isinstance(body["search_rows"], int)  # /health also warms the search index

    notices = app.handler(_api_event("GET", "/v1/notices"), None)
    assert notices["statusCode"] == 200
    assert json.loads(notices["body"])["count"] == 0

    missing = app.handler(_api_event("GET", "/v1/notices/cdsco_nsq%23nope"), None)
    assert missing["statusCode"] == 404

    # POST /items is real since P04: an empty body is a client error, not "not implemented"
    empty = app.handler(_api_event("POST", "/items"), None)
    assert empty["statusCode"] == 400
    assert "error" in json.loads(empty["body"])

    # the case actions are real since P08/P09: an unknown case is a 404, not "not implemented"
    unknown = app.handler(_api_event("POST", "/cases/case-x/approve"), None)
    assert unknown["statusCode"] == 404
    assert json.loads(unknown["body"])["case_id"] == "case-x"

    assert app.handler(_api_event("GET", "/nope"), None)["statusCode"] == 404
    assert app.handler({}, None)["statusCode"] == 400


def test_api_notices_after_upsert_filters():
    from api import app
    from common import dynamo
    from ingest import cdsco_normalise

    rows = [
        {
            "str_product_name": "Pantoprazole Tablets IP",
            "str_batch_no": "PEP5001",
            "str_manufactured_by": "Finecure",
            "str_nsq_result": "Dissolution test",
            "dt_reporting_month_year": "JUL-2026",
        }
    ]
    notices = cdsco_normalise.rows_to_notices(rows, adapter="portal", month="JUL-2026")
    for n in notices:
        dynamo.put("notices", n)
    body = json.loads(
        app.handler(_api_event("GET", "/v1/notices", {"source": "cdsco_nsq"}), None)["body"]
    )
    assert body["count"] == 1
    body = json.loads(
        app.handler(_api_event("GET", "/v1/notices", {"since": "2026-08-01"}), None)["body"]
    )
    assert body["count"] == 0
    pk_path = "/v1/notices/" + notices[0]["pk"].replace("#", "%23")
    assert pk_path.startswith("/v1/notices/cdsco_nsq%23JUL-2026-cdsco_portal-")
    one = app.handler(_api_event("GET", pk_path), None)
    assert one["statusCode"] == 200
    assert json.loads(one["body"])["batches"] == ["PEP5001"]


def test_check_batch_rule():
    from matcher.range_check import check_batch

    near_miss = check_batch("DL-4472", ["DL-4471", "DL-4468"])
    assert near_miss == {"inside": False, "listed": ["DL-4471", "DL-4468"], "yours": "DL-4472"}
    assert check_batch("dl-4471", ["DL-4471"])["inside"] is True
    assert check_batch("DL 4471", ["DL-4471"])["inside"] is False  # hyphen is significant
    assert check_batch("DL4471", ["DL 4471"])["inside"] is True  # spaces are not
    assert check_batch("", ["DL-4471"])["inside"] is None
    assert check_batch("DL-4471", [])["inside"] is None


def test_verify_quote_guard():
    from matcher.verify import quote_is_verbatim

    excerpt = "Paracetamol Tablets IP 650mg | FT5427 | Dissolution test"
    assert quote_is_verbatim("FT5427 | Dissolution test", excerpt)
    assert quote_is_verbatim("FT5427  |  Dissolution\ntest", excerpt)
    assert not quote_is_verbatim("FT5428", excerpt)
    assert not quote_is_verbatim("", excerpt)


def test_demo_mode_is_on():
    assert os.environ["DEMO_MODE"] == "1"


def test_api_encodes_dynamodb_decimals_as_numbers():
    """Live DynamoDB returns Decimal for every number; the API must not stringify them."""
    import json
    from decimal import Decimal

    from api import app

    body = json.loads(app.respond(200, {"row": Decimal("45"), "score": Decimal("0.5")})["body"])
    assert body == {"row": 45, "score": 0.5}
